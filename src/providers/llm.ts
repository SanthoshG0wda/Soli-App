import "server-only";

import type { LanguageModel } from "ai";

export interface LLMProvider {
  readonly modelId: string;
  /** Returns an AI SDK language model bound to this provider. */
  model(): LanguageModel;
}