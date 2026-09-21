import "server-only";

import OpenAI from "openai";
import { env } from "@/env";
import type { EmbeddingMode, EmbeddingProvider } from "@/providers/embedding";

const BATCH_SIZE = 64;

export class NimEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly client: OpenAI;

  constructor() {
    this.model = env.NIM_EMBEDDING_MODEL;
    this.dimensions = env.EMBEDDING_DIMENSIONS;
    this.client = new OpenAI({
      baseURL: env.NIM_BASE_URL,
      apiKey: env.NVIDIA_API_KEY,
    });
  }

  async embed(texts: string[], mode: EmbeddingMode): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const result = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        input_type: mode,
      } as unknown as OpenAI.Embeddings.EmbeddingCreateParams);

      const sorted = result.data
        .slice()
        .sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        embeddings.push(item.embedding);
      }
    }

    return embeddings;
  }
}