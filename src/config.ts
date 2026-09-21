// Non-secret configuration defaults shared by server code.
// Values mirror the .env.example defaults. Secrets are validated in src/env.ts.

export const DEFAULT_EMBEDDING_DIMENSIONS = 1024;

export const DEFAULT_CHUNK_SIZE = 1200;

export const DEFAULT_CHUNK_OVERLAP = 200;

export const DEFAULT_TOP_K = 5;

export const DEFAULT_RAG_CONTEXT_MAX_CHARS = 12000;

export const DEFAULT_RAG_CHUNK_MAX_CHARS = 4000;

export const DEFAULT_RAG_TEMPERATURE = 0.2;