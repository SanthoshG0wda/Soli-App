import { z } from "zod";
import type { RetrievedChunk } from "@/lib/retrieval/retrieval";
import { parseCitedIndices } from "@/lib/rag/citations";
import { buildRagContext } from "@/lib/rag/context";
import { buildRagSystemPrompt } from "@/lib/rag/system-prompt";

export interface GenerateRagResponseInput {
  question: string;
  /** Restrict retrieval to these documents (defaults to all). */
  documentIds?: string[];
  /** Number of chunks to retrieve (defaults to the configured TOP_K). */
  limit?: number;
  /** Only consider chunks with similarity score >= minScore. */
  minScore?: number;
}

/** A source that backs (part of) the generated answer, in citation order. */
export interface RagSource {
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber?: number;
  chunkIndex: number;
  score: number;
  excerpt: string;
}

export interface RagResponse {
  answer: string;
  sources: RagSource[];
}

export interface RagDeps {
  /** Default chunk count when the caller omits `limit`. */
  defaultLimit: number;
  /** Character budget for the whole assembled context block. */
  maxContextChars: number;
  /** Per-chunk content character budget. */
  maxChunkChars: number;
  retrieve: (input: {
    query: string;
    documentIds?: string[];
    limit?: number;
    minScore?: number;
  }) => Promise<RetrievedChunk[]>;
  complete: (input: { system: string; prompt: string }) => Promise<string>;
}

const inputSchema = z.object({
  question: z.string().trim().min(1, "question must not be empty"),
  documentIds: z.array(z.string().trim().min(1)).min(1).optional(),
  limit: z.number().int().positive().optional(),
  minScore: z.number().min(0).max(1).optional(),
});

const NO_CONTEXT_ANSWER =
  "I could not find any relevant information in the available documents.";

function toRagSource(chunk: RetrievedChunk): RagSource {
  return {
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    filename: chunk.filename,
    ...(chunk.pageNumber !== undefined ? { pageNumber: chunk.pageNumber } : {}),
    chunkIndex: chunk.chunkIndex,
    score: chunk.score,
    excerpt: chunk.content,
  };
}

/**
 * Resolves which retrieved chunks back an answer by parsing its [n] cite
 * markers. Indices must fall within the retrieved set, so the model can never
 * cite an unretrieved chunk. When no markers are present, every context chunk
 * is attributed (defensive default so the UI always has sources to render).
 */
export function resolveSources(
  answer: string,
  chunks: RetrievedChunk[],
): RagSource[] {
  const citedIndices = parseCitedIndices(answer, chunks.length);
  if (citedIndices.length === 0) {
    return chunks.map(toRagSource);
  }
  return citedIndices.map((index) => toRagSource(chunks[index - 1]!));
}

/**
 * Complete RAG generation pipeline:
 * question -> query embedding -> vector search -> top-K chunks ->
 * context construction -> LLM -> answer + sources.
 *
 * All document content is treated as untrusted data: it is placed inside
 * explicit boundary markers in the user message (never in the system prompt),
 * sanitized, length-capped, and gated by anti-instruction rules.
 *
 * `deps` are injected so the pipeline is testable and backend-agnostic.
 */
export async function generateRagResponse(
  input: GenerateRagResponseInput,
  deps: RagDeps,
): Promise<RagResponse> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid RAG input: ${parsed.error.issues[0]?.message}`);
  }

  const retrieved = await deps.retrieve({
    query: parsed.data.question,
    documentIds: parsed.data.documentIds,
    limit: parsed.data.limit ?? deps.defaultLimit,
    minScore: parsed.data.minScore,
  });

  if (retrieved.length === 0) {
    return { answer: NO_CONTEXT_ANSWER, sources: [] };
  }

  const { text: contextText, chunks } = buildRagContext(retrieved, {
    maxContextChars: deps.maxContextChars,
    maxChunkChars: deps.maxChunkChars,
  });

  const prompt = `<retrieved_context>\n${contextText}\n</retrieved_context>\n\nQuestion: ${parsed.data.question}`;

  const answer = await deps.complete({
    system: buildRagSystemPrompt(),
    prompt,
  });

  return { answer, sources: resolveSources(answer, chunks) };
}