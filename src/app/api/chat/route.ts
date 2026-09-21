import { NextResponse } from "next/server";
import { createUIMessageStreamResponse, streamText, type UIMessage } from "ai";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import type { ChatListItem } from "@/lib/chat/types";
import {
  ensureChat,
  listChats,
  persistAssistantMessage,
  persistUserMessage,
} from "@/lib/chat/persistence";
import { fromAsyncIterable, withChatOverlay } from "@/lib/chat/overlay";
import { planRagChat, type ChatRagPlan, type ChatRagDeps } from "@/lib/rag/chat";
import { retrieveRelevantChunks } from "@/lib/retrieval";
import { llmProvider } from "@/providers";

const chatRagDeps: ChatRagDeps = {
  defaultLimit: env.TOP_K,
  maxContextChars: env.RAG_CONTEXT_MAX_CHARS,
  maxChunkChars: env.RAG_CHUNK_MAX_CHARS,
  retrieve: (input) => retrieveRelevantChunks(input),
};

interface ChatRequestBody {
  messages?: UIMessage[];
  chatId?: string;
  documentIds?: string[];
}

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const textPart = (message.parts ?? []).find(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> =>
        part.type === "text",
    );
    const text = textPart?.text ?? (message as { content?: string }).content ?? "";
    if (text.trim()) return text;
  }
  return "";
}

async function bestEffort(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    logger.warn("chat persistence step failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const model = llmProvider.model();

export async function GET(): Promise<NextResponse<{ chats: ChatListItem[] }>> {
  const chats = await listChats();
  return NextResponse.json({ chats });
}

export async function POST(request: Request): Promise<Response> {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "Request must include the message history." },
      { status: 400 },
    );
  }

  const question = lastUserText(body.messages);
  if (!question) {
    return NextResponse.json(
      { error: "The latest user message must contain text." },
      { status: 400 },
    );
  }

  const documentIds =
    Array.isArray(body.documentIds) && body.documentIds.length > 0
      ? body.documentIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : undefined;

  let plan;
  try {
    plan = await planRagChat({ question, documentIds }, chatRagDeps);
  } catch (error) {
    logger.error("chat planning failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to prepare an answer." },
      { status: 500 },
    );
  }

  let chatId: string;
  try {
    chatId = await ensureChat(question, body.chatId);
  } catch (error) {
    logger.error("failed to create chat", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to create chat." }, { status: 500 });
  }

  // User message is persisted up front (non-fatal if it fails).
  await bestEffort(() => persistUserMessage(chatId, question));

  // When nothing relevant was retrieved, still answer from general knowledge —
  // the model stream, just without context chunks or source citations.
  const proceedPlan: Extract<ChatRagPlan, { kind: "proceed" }> =
    plan.kind === "general"
      ? {
          kind: "proceed",
          system: plan.system,
          prompt: plan.prompt,
          contextChunks: [],
        }
      : plan;

  const result = streamText({
    model,
    system: proceedPlan.system,
    prompt: proceedPlan.prompt,
    temperature: env.RAG_TEMPERATURE,
    abortSignal: request.signal,
  });

  const stream = fromAsyncIterable(
    withChatOverlay(result.toUIMessageStream(), {
      chatId,
      plan: proceedPlan,
      onFinished: async (text, sources) => {
        await bestEffort(() => persistAssistantMessage(chatId, text, sources));
      },
    }),
  );

  return createUIMessageStreamResponse({ stream });
}