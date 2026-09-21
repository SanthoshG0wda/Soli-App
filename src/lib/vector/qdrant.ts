import "server-only";

import { QdrantClient } from "@qdrant/js-client-rest";
import { z } from "zod";
import { env } from "@/env";
import { classifyError, VectorStoreError } from "@/lib/vector/errors";
import { logger } from "@/lib/vector/logger";
import type {
  ChunkVectorInput,
  DeleteResult,
  SearchOptions,
  SimilarChunk,
  StoredChunkMetadata,
  UpsertResult,
} from "@/lib/vector/types";

const UPSERT_BATCH_SIZE = 64;

const REQUIRED_INDEXES: ReadonlyArray<{
  fieldName: string;
  schema: "keyword" | "integer";
}> = [
  { fieldName: "document_id", schema: "keyword" },
  { fieldName: "chunk_id", schema: "keyword" },
  { fieldName: "chunk_index", schema: "integer" },
  { fieldName: "page_number", schema: "integer" },
];

const PAYLOAD_KEYS = {
  documentId: "document_id",
  chunkId: "chunk_id",
  filename: "filename",
  pageNumber: "page_number",
  chunkIndex: "chunk_index",
  content: "content",
} as const;

const storedMetadataSchema = z.object({
  [PAYLOAD_KEYS.documentId]: z.string().min(1),
  [PAYLOAD_KEYS.chunkId]: z.string().min(1),
  [PAYLOAD_KEYS.filename]: z.string().min(1),
  [PAYLOAD_KEYS.pageNumber]: z.number().nullable(),
  [PAYLOAD_KEYS.chunkIndex]: z.number().int(),
  [PAYLOAD_KEYS.content]: z.string(),
});

const searchOptionsSchema = z.object({
  limit: z.number().int().positive(),
  documentIds: z.array(z.string().min(1)).min(1).optional(),
  minScore: z.number().min(0).max(1).optional(),
});

function toMetadata(payload: Record<string, unknown>): StoredChunkMetadata {
  const parsed = storedMetadataSchema.parse(payload);
  return {
    documentId: parsed[PAYLOAD_KEYS.documentId],
    chunkId: parsed[PAYLOAD_KEYS.chunkId],
    filename: parsed[PAYLOAD_KEYS.filename],
    pageNumber: parsed[PAYLOAD_KEYS.pageNumber],
    chunkIndex: parsed[PAYLOAD_KEYS.chunkIndex],
    content: parsed[PAYLOAD_KEYS.content],
  };
}

export class QdrantVectorStore {
  private readonly client: QdrantClient;
  private readonly collection: string;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.client = new QdrantClient({
      url: env.QDRANT_URL,
      apiKey: env.QDRANT_API_KEY,
      // Avoid an extra round-trip to the server for a version handshake.
      checkCompatibility: false,
    });
    this.collection = env.QDRANT_COLLECTION;
  }

  async ensure(): Promise<void> {
    this.initPromise ??= this.createCollectionIfMissing();
    await this.initPromise;
  }

  async upsertChunks(input: ChunkVectorInput[]): Promise<UpsertResult> {
    const collection = this.collection;
    const started = Date.now();
    await this.withErrorHandling("upsertChunks", { collection }, async () => {
      await this.ensure();
      for (let i = 0; i < input.length; i += UPSERT_BATCH_SIZE) {
        const batch = input.slice(i, i + UPSERT_BATCH_SIZE);
        await this.client.upsert(collection, {
          points: batch.map((item) => ({
            id: item.chunkId,
            vector: item.vector,
            payload: {
              [PAYLOAD_KEYS.documentId]: item.documentId,
              [PAYLOAD_KEYS.chunkId]: item.chunkId,
              [PAYLOAD_KEYS.filename]: item.filename,
              [PAYLOAD_KEYS.pageNumber]: item.pageNumber,
              [PAYLOAD_KEYS.chunkIndex]: item.chunkIndex,
              [PAYLOAD_KEYS.content]: item.content,
            },
          })),
        });
      }
    });
    logger.info("vectors upserted", {
      collection,
      count: input.length,
      durationMs: Date.now() - started,
    });
    return { upsertedCount: input.length };
  }

  async searchSimilarChunks(
    vector: number[],
    options: SearchOptions,
  ): Promise<SimilarChunk[]> {
    const parsed = searchOptionsSchema.safeParse(options);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new VectorStoreError({
        code: "validation",
        operation: "searchSimilarChunks",
        message: issue ? issue.message : "Invalid search options",
      });
    }

    const collection = this.collection;
    const started = Date.now();
    const searchSome = async () => {
      await this.ensure();
      const response = await this.client.query(collection, {
        query: vector,
        limit: parsed.data.limit,
        filter: parsed.data.documentIds
          ? {
              must: [
                {
                  key: PAYLOAD_KEYS.documentId,
                  match: { any: parsed.data.documentIds },
                },
              ],
            }
          : undefined,
        score_threshold: parsed.data.minScore,
        with_payload: true,
      });
      return response.points as Awaited<
        ReturnType<QdrantClient["query"]>
      >["points"];
    };

    let results: Awaited<ReturnType<typeof searchSome>>;
    try {
      results = await this.withErrorHandling(
        "searchSimilarChunks",
        { collection, ...parsed.data },
        searchSome,
      );
    } catch (error) {
      if (
        error instanceof VectorStoreError &&
        error.code === "collection_not_found"
      ) {
        logger.warn("collection missing during search; returning no matches", {
          collection,
        });
        return [];
      }
      throw error;
    }

    const similar: SimilarChunk[] = [];
    for (const point of results) {
      try {
        similar.push({
          chunkId: String(point.id),
          metadata: toMetadata(point.payload ?? {}),
          score: point.score,
        });
      } catch (error) {
        logger.warn("skipping chunk with unparseable payload", {
          collection,
          pointId: String(point.id),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("similar chunks searched", {
      collection,
      limit: parsed.data.limit,
      documentIds: parsed.data.documentIds ?? undefined,
      resultCount: similar.length,
      durationMs: Date.now() - started,
    });
    return similar;
  }

  async deleteChunks(chunkIds: string[]): Promise<DeleteResult> {
    if (chunkIds.length === 0) return { deletedCount: 0 };

    const collection = this.collection;
    const started = Date.now();
    const deletedCount = await this.withErrorHandling(
      "deleteChunks",
      { collection, count: chunkIds.length },
      async () => {
        await this.ensure();
        const selector = {
          filter: {
            must: [{ has_id: chunkIds }],
          },
        };
        const before = await this.client.count(collection, { filter: selector.filter, exact: true });
        await this.client.delete(collection, { filter: selector.filter });
        return before.count;
      },
    );

    logger.info("chunks deleted", {
      collection,
      count: chunkIds.length,
      deletedCount,
      durationMs: Date.now() - started,
    });
    return { deletedCount };
  }

  async deleteDocumentChunks(documentId: string): Promise<DeleteResult> {
    const collection = this.collection;
    const started = Date.now();
    const filter = {
      must: [
        {
          key: PAYLOAD_KEYS.documentId,
          match: { value: documentId },
        },
      ],
    };
    const deletedCount = await this.withErrorHandling(
      "deleteDocumentChunks",
      { collection, documentId },
      async () => {
        await this.ensure();
        const before = await this.client.count(collection, { filter, exact: true });
        await this.client.delete(collection, { filter });
        return before.count;
      },
    );

    logger.info("document vectors deleted", {
      collection,
      documentId,
      deletedCount,
      durationMs: Date.now() - started,
    });
    return { deletedCount };
  }

  private async createCollectionIfMissing(): Promise<void> {
    const started = Date.now();
    try {
      const existing = await this.client.collectionExists(this.collection);
      if (existing.exists) {
        logger.debug("collection already exists", { collection: this.collection });
      } else {
        await this.client.createCollection(this.collection, {
          vectors: {
            size: env.EMBEDDING_DIMENSIONS,
            distance: "Cosine",
          },
        });
        logger.info("collection created", {
          collection: this.collection,
          dimensions: env.EMBEDDING_DIMENSIONS,
          distance: "Cosine",
          durationMs: Date.now() - started,
        });
      }
      await this.ensureIndexes();
    } catch (error) {
      const wrapped = classifyError("ensure", error);
      logger.error("collection setup failed", {
        collection: this.collection,
        errorCode: wrapped.code,
        error: wrapped.message,
      });
      throw wrapped;
    }
  }

  /** Qdrant rejects filtered ops without a payload index on the key; idempotent. */
  private async ensureIndexes(): Promise<void> {
    for (const index of REQUIRED_INDEXES) {
      try {
        await this.client.createPayloadIndex(this.collection, {
          field_name: index.fieldName,
          field_schema: index.schema,
        });
        logger.debug("payload index ensured", {
          collection: this.collection,
          field: index.fieldName,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        if (
          message.includes("already exists") ||
          message.includes("Index already") ||
          message.includes("already exist")
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  private async withErrorHandling<T>(
    operation: string,
    context: Record<string, unknown>,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof VectorStoreError) throw error;
      const wrapped = classifyError(operation, error);
      logger.error("vector store operation failed", {
        operation,
        ...context,
        errorCode: wrapped.code,
        error: wrapped.message,
      });
      throw wrapped;
    }
  }
}