import "server-only";

import { env } from "@/env";
import { vectorStore } from "@/lib/vector";
import { embeddingProvider } from "@/providers";
import {
  retrieveRelevantChunks as runRetrieval,
  type RetrievedChunk,
  type RetrieveRelevantChunksInput,
  type RetrievalDeps,
} from "@/lib/retrieval/retrieval";

/**
 * Production retrieval pipeline: NIM query embeddings + the Qdrant-backed
 * vector store. Exposed as the app-facing seam — nothing outside this module
 * needs to know which vector backend is used.
 */
const retrievalDeps: RetrievalDeps = {
  defaultLimit: env.TOP_K,
  embedQuery: async (query) => {
    const [vector] = await embeddingProvider.embed([query], "query");
    return vector;
  },
  searchSimilar: (vector, options) => vectorStore.searchSimilarChunks(vector, options),
};

export function retrieveRelevantChunks(
  input: RetrieveRelevantChunksInput,
): Promise<RetrievedChunk[]> {
  return runRetrieval(input, retrievalDeps);
}

export type { RetrievedChunk, RetrieveRelevantChunksInput } from "@/lib/retrieval/retrieval";
export { normalizeRetrievedChunks } from "@/lib/retrieval/retrieval";