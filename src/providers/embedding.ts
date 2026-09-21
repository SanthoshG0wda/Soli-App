import "server-only";

/**
 * Embedding mode for NeMo Retriever style models.
 * "passage" must be used when embedding documents at ingestion time,
 * "query" must be used when embedding a user question.
 */
export type EmbeddingMode = "query" | "passage";

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], mode: EmbeddingMode): Promise<number[][]>;
}