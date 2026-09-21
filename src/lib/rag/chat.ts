import { z } from "zod";
import type { RetrievedChunk } from "@/lib/retrieval/retrieval";
import { resolveSources, type RagSource } from "@/lib/rag/rag";
import { buildRagContext } from "@/lib/rag/context";
import {
  buildGeneralSystemPrompt,
  buildRagSystemPrompt,
} from "@/lib/rag/system-prompt";

export interface ChatRagInput {
  question: string;
  documentIds?: string[];
  limit?: number;
  minScore?: number;
}

export interface ChatRagDeps {
  defaultLimit: number;
  maxContextChars: number;
  maxChunkChars: number;
  retrieve: (input: {
    query: string;
    documentIds?: string[];
    limit?: number;
    minScore?: number;
  }) => Promise<RetrievedChunk[]>;
}

export type ChatRagPlan =
  | {
      kind: "general";
      system: string;
      prompt: string;
    }
  | {
      kind: "proceed";
      system: string;
      prompt: string;
      /** Chunks that made it into the context block, in cite order. */
      contextChunks: RetrievedChunk[];
    };

const inputSchema = z.object({
  question: z.string().trim().min(1, "question must not be empty"),
  documentIds: z.array(z.string().trim().min(1)).min(1).optional(),
  limit: z.number().int().positive().optional(),
  minScore: z.number().min(0).max(1).optional(),
});

/**
 * Retrieval + prompt construction for the streaming chat route. The actual
 * text generation runs in the route via `streamText`, but everything that can
 * be reasoned about deterministically lives here (and is testable without an
 * LLM): input validation, retrieval, context assembly, and the prompt the
 * model receives.
 */
export async function planRagChat(
  input: ChatRagInput,
  deps: ChatRagDeps,
): Promise<ChatRagPlan> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid chat input: ${parsed.error.issues[0]?.message}`);
  }

  const retrieved = await deps.retrieve({
    query: parsed.data.question,
    documentIds: parsed.data.documentIds,
    limit: parsed.data.limit ?? deps.defaultLimit,
    minScore: parsed.data.minScore,
  });

  if (retrieved.length === 0) {
    return {
      kind: "general",
      system: buildGeneralSystemPrompt(),
      prompt: `Question: ${parsed.data.question}`,
    };
  }

  const { text: contextText, chunks } = buildRagContext(retrieved, {
    maxContextChars: deps.maxContextChars,
    maxChunkChars: deps.maxChunkChars,
  });

  const prompt = `<retrieved_context>\n${contextText}\n</retrieved_context>\n\nQuestion: ${parsed.data.question}`;

  return {
    kind: "proceed",
    system: buildRagSystemPrompt(),
    prompt,
    contextChunks: chunks,
  };
}

/** Sources that back a finished chat answer (cite markers in the text). */
export function chatSources(
  answer: string,
  contextChunks: RetrievedChunk[],
): RagSource[] {
  return resolveSources(answer, contextChunks);
}