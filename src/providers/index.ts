import "server-only";

import type { EmbeddingProvider } from "@/providers/embedding";
import type { LLMProvider } from "@/providers/llm";
import { NimEmbeddingProvider } from "@/providers/embedding-nim";
import { NimLLMProvider } from "@/providers/llm-nim";

// Swap providers here (e.g. for OpenAI/Ollama) without touching callers.
export const embeddingProvider: EmbeddingProvider = new NimEmbeddingProvider();

export const llmProvider: LLMProvider = new NimLLMProvider();