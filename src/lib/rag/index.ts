import "server-only";

import { generateText } from "ai";
import { env } from "@/env";
import { retrieveRelevantChunks } from "@/lib/retrieval";
import {
  generateRagResponse as runGenerateRagResponse,
  type RagDeps,
  type RagResponse,
} from "@/lib/rag/rag";
import { llmProvider } from "@/providers";

const model = llmProvider.model();

/**
 * Production RAG pipeline wiring: retrieval over Qdrant via
 * `retrieveRelevantChunks` and a NIM-hosted language model. This is the
 * app-facing seam — callers only know `generateRagResponse`.
 */
const ragDeps: RagDeps = {
  defaultLimit: env.TOP_K,
  maxContextChars: env.RAG_CONTEXT_MAX_CHARS,
  maxChunkChars: env.RAG_CHUNK_MAX_CHARS,
  retrieve: (input) => retrieveRelevantChunks(input),
  complete: async ({ system, prompt }) => {
    const result = await generateText({
      model,
      system,
      prompt,
      temperature: env.RAG_TEMPERATURE,
    });
    return result.text;
  },
};

export function generateRagResponse(input: {
  question: string;
  documentIds?: string[];
  limit?: number;
  minScore?: number;
}): Promise<RagResponse> {
  return runGenerateRagResponse(input, ragDeps);
}

export type { GenerateRagResponseInput, RagResponse, RagSource } from "@/lib/rag/rag";
export { buildRagSystemPrompt } from "@/lib/rag/system-prompt";