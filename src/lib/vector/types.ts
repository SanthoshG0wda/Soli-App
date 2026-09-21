// Shared types for the vector layer. These mirror the Qdrant point payload
// schema and the operations we expose through the public API.

export interface ChunkVectorInput {
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  chunkIndex: number;
  content: string;
  vector: number[];
}

export interface StoredChunkMetadata {
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  chunkIndex: number;
  content: string;
}

export interface SimilarChunk {
  chunkId: string;
  metadata: StoredChunkMetadata;
  /** Similarity score in [0, 1] (cosine); higher is more similar. */
  score: number;
}

export interface SearchOptions {
  limit: number;
  /** Restrict the search to chunks of the given documents. */
  documentIds?: string[];
  /** Only return results with score >= minScore. */
  minScore?: number;
}

export interface UpsertResult {
  upsertedCount: number;
}

export interface DeleteResult {
  deletedCount: number;
}