import "server-only";

export type {
  ChunkVectorInput,
  DeleteResult,
  SearchOptions,
  SimilarChunk,
  StoredChunkMetadata,
  UpsertResult,
} from "@/lib/vector/types";

export { VectorStoreError } from "@/lib/vector/errors";
export type { VectorErrorCode } from "@/lib/vector/errors";

import { QdrantVectorStore } from "@/lib/vector/qdrant";

// Singleton used by services and route handlers. Swapping vector backends
// (e.g. Pinecone, pgvector) only requires a new implementation here.
export const vectorStore = new QdrantVectorStore();