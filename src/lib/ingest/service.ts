import "server-only";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, type Database } from "@/db";
import { chunks, documents, DocumentStatus } from "@/db/schema";
import { extractPdfText, type ExtractedDocument } from "@/lib/ingest/extract";
import { chunkPages, type ChunkOptions, type ChunkUnit } from "@/lib/ingest/chunk";
import { stableChunkId } from "@/lib/ingest/ids";
import { vectorStore } from "@/lib/vector";
import { embeddingProvider } from "@/providers";
import { env } from "@/env";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export class IngestError extends Error {
  readonly documentId?: string;
  constructor(message: string, options: { documentId?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "IngestError";
    this.documentId = options.documentId;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface IngestPdfInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Re-ingest into this document instead of creating a new one. */
  documentId?: string;
}

export interface IngestResult {
  documentId: string;
  filename: string;
  pageCount: number;
  chunkCount: number;
  status: "ready";
}

/** Injected at the seams so the orchestration is testable without services. */
export interface IngestDeps extends ChunkOptions {
  db: Pick<Database, "insert" | "update" | "delete" | "transaction">;
  vectorStore: Pick<
    typeof vectorStore,
    "deleteDocumentChunks" | "upsertChunks"
  >;
  embed: (texts: string[]) => Promise<number[][]>;
  extract: (buffer: Buffer) => Promise<ExtractedDocument>;
}

function titleFromFilename(filename: string): string {
  const name = filename.toLowerCase().endsWith(".pdf")
    ? filename.slice(0, -4)
    : filename;
  return name.trim() || "Untitled document";
}

async function setDocumentStatus(
  database: IngestDeps["db"],
  documentId: string,
  status: (typeof DocumentStatus)[keyof typeof DocumentStatus],
  error?: string | null,
): Promise<void> {
  await database
    .update(documents)
    .set({
      status,
      ...(error !== undefined ? { error } : {}),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));
}

async function bestEffort<T>(operation: () => Promise<T>): Promise<void> {
  try {
    await operation();
  } catch {
    // Cleanup must never mask the original failure.
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function saveDocumentRow(
  database: IngestDeps["db"],
  input: IngestPdfInput,
  documentId: string,
): Promise<void> {
  await database
    .insert(documents)
    .values({
      id: documentId,
      title: titleFromFilename(input.filename),
      fileName: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: DocumentStatus.Uploading,
    })
    .onConflictDoUpdate({
      target: documents.id,
      set: {
        title: titleFromFilename(input.filename),
        fileName: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        status: DocumentStatus.Uploading,
        error: null,
        updatedAt: new Date(),
      },
    });
}

function toVectorInputs(
  documentId: string,
  filename: string,
  units: ChunkUnit[],
  embeddings: number[][],
) {
  return units.map((unit, index) => ({
    chunkId: stableChunkId(documentId, index),
    documentId,
    filename,
    pageNumber: unit.pageNumber,
    chunkIndex: index,
    content: unit.text,
    vector: embeddings[index] ?? [],
  }));
}

async function replaceChunksInSqlTransaction(
  database: IngestDeps["db"],
  documentId: string,
  rows: {
    documentId: string;
    id: string;
    content: string;
    pageNumber: number;
    chunkIndex: number;
    charCount: number;
    charStart: number | null;
    charEnd: number | null;
  }[],
): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.delete(chunks).where(eq(chunks.documentId, documentId));
    await tx.insert(chunks).values(rows);
  });
}

/**
 * Ingestion pipeline:
 * uploading -> processing -> ready | failed
 *
 * Steps: extract text, normalize, chunk, embed (passage mode), upsert vectors
 * to Qdrant with stable ids, then commit chunk rows + a "ready" status to
 * PostgreSQL in one transaction. On any failure, partial artifacts are removed
 * and the document is marked "failed" — never left mid-flight.
 *
 * PostgreSQL stores only chunks/metadata; embeddings live exclusively in
 * Qdrant.
 */
export async function ingestPdf(
  input: IngestPdfInput,
  deps: IngestDeps,
): Promise<IngestResult> {
  if (input.sizeBytes > MAX_PDF_BYTES) {
    throw new IngestError(`File too large: max ${MAX_PDF_BYTES} bytes`);
  }

  const documentId = input.documentId ?? randomUUID();
  await saveDocumentRow(deps.db, input, documentId);

  try {
    await setDocumentStatus(deps.db, documentId, DocumentStatus.Processing);

    const extracted = await deps.extract(input.buffer);
    if (extracted.pages.length === 0) {
      throw new IngestError("The PDF contains no extractable text pages.");
    }

    const units = chunkPages(extracted.pages, {
      size: deps.size,
      overlap: deps.overlap,
    });
    if (units.length === 0) {
      throw new IngestError("The PDF text is empty after normalization.");
    }

    const embeddings = await deps.embed(
      units.map((unit) => unit.text),
    );
    if (embeddings.length !== units.length) {
      throw new IngestError(
        `Embedding count (${embeddings.length}) does not match chunk count (${units.length}).`,
      );
    }

    const vectors = toVectorInputs(documentId, input.filename, units, embeddings);
    await deps.vectorStore.deleteDocumentChunks(documentId);
    await deps.vectorStore.upsertChunks(vectors);

    const chunkRows = vectors.map((vector) => ({
      id: vector.chunkId,
      documentId,
      content: vector.content,
      pageNumber: vector.pageNumber,
      chunkIndex: vector.chunkIndex,
      charCount: vector.content.length,
      charStart: units[vector.chunkIndex]?.start ?? null,
      charEnd: units[vector.chunkIndex]?.end ?? null,
    }));

    await replaceChunksInSqlTransaction(deps.db, documentId, chunkRows);
    await setDocumentStatus(deps.db, documentId, DocumentStatus.Ready, null);

    return {
      documentId,
      filename: input.filename,
      pageCount: extracted.totalPages,
      chunkCount: units.length,
      status: DocumentStatus.Ready,
    };
  } catch (error) {
    const message = toErrorMessage(error);
    // Never leave stray vectors/chunks pointing at a non-ready document.
    await bestEffort(() => deps.vectorStore.deleteDocumentChunks(documentId));
    await bestEffort(() =>
      deps.db.delete(chunks).where(eq(chunks.documentId, documentId)),
    );
    await bestEffort(() =>
      setDocumentStatus(
        deps.db,
        documentId,
        DocumentStatus.Failed,
        message.slice(0, 2000),
      ),
    );
    throw error instanceof IngestError
      ? error
      : new IngestError(message, { documentId, cause: error });
  }
}

/** Production wiring (documented singleton-ish deps). */
const productionDeps: IngestDeps = {
  db,
  vectorStore,
  embed: (texts) => embeddingProvider.embed(texts, "passage"),
  extract: (buffer) => extractPdfText(buffer),
  size: env.CHUNK_SIZE,
  overlap: env.CHUNK_OVERLAP,
};

export function ingestPdfProduction(
  input: IngestPdfInput,
): Promise<IngestResult> {
  return ingestPdf(input, productionDeps);
}

export { MAX_PDF_BYTES };