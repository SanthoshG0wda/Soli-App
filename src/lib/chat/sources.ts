// Client-safe custom part contract for chat sources. Kept dependency-free so
// the client renderer and the server overlay agree on the wire format.

export const SOURCES_KIND = "soli.sources";

export const ACTIVE_CHAT_KEY = "soli:active-chat-id";

/** One rendered source entry; the `soli.sources` custom-part value. */
export interface ChatSource {
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  chunkIndex: number;
  score: number;
  excerpt: string;
}