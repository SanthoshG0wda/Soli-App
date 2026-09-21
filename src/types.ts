// Shared, dependency-free types serialized across the server/client boundary.

export interface Citation {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  excerpt: string;
  score: number;
}