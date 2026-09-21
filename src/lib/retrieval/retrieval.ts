import { z } from "zod";
import type { SearchOptions, SimilarChunk } from "@/lib/vector/types";

/**
 * Provider-independent retrieval result. Callers never see Qdrant types —
 * everything Qdrant-specific is parsed inside `src/lib/vector`.
 */
export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  content: string;
  filename: string;
  pageNumber?: number;
  chunkIndex: number;
  /** Similarity score in [0, 1]; higher is more relevant. */
  score: number;
}

export interface RetrieveRelevantChunksInput {
  query: string;
  /** Restrict search to these documents only (defaults to all documents). */
  documentIds?: string[];
  /** Number of chunks to return (defaults to the configured TOP_K). */
  limit?: number;
  /** Only return chunks with score >= minScore. */
  minScore?: number;
}

export interface RetrievalDefaults {
  /** Default value for `limit` when the caller does not provide one. */
  defaultLimit: number;
}

/** Injected dependencies, so retrieval is testable and backend-agnostic. */
export interface RetrievalDeps extends RetrievalDefaults {
  embedQuery: (query: string) => Promise<number[]>;
  searchSimilar: (vector: number[], options: SearchOptions) => Promise<SimilarChunk[]>;
}

const inputSchema = z.object({
  query: z.string().trim().min(1, "query must not be empty"),
  documentIds: z.array(z.string().trim().min(1)).min(1).optional(),
  limit: z.number().int().positive().optional(),
  minScore: z.number().min(0).max(1).optional(),
});

/** Maps vector-store hits into the provider-independent retrieval shape. */
export function normalizeRetrievedChunks(results: SimilarChunk[]): RetrievedChunk[] {
  return results.map((hit) => ({
    chunkId: hit.chunkId,
    documentId: hit.metadata.documentId,
    content: hit.metadata.content,
    filename: hit.metadata.filename,
    ...(hit.metadata.pageNumber !== null ? { pageNumber: hit.metadata.pageNumber } : {}),
    chunkIndex: hit.metadata.chunkIndex,
    score: hit.score,
  }));
}

/**
 * Core RAG retrieval pipeline:
 * query -> query embedding -> top-K similarity search -> optional document
 * filter -> normalized results.
 *
 * The production wiring in `src/lib/retrieval/index.ts` supplies the real
 * embedder and vector store; tests inject fakes.
 */
export async function retrieveRelevantChunks(
  input: RetrieveRelevantChunksInput,
  deps: RetrievalDeps,
): Promise<RetrievedChunk[]> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid retrieval input: ${parsed.error.issues[0]?.message}`);
  }

  const limit = parsed.data.limit ?? deps.defaultLimit;
  const queryVector: number[] = await deps.embedQuery(parsed.data.query);

  const similar = await deps.searchSimilar(queryVector, {
    limit,
    documentIds: parsed.data.documentIds,
    minScore: parsed.data.minScore,
  });

  return normalizeRetrievedChunks(similar);
}