import type { ProviderMetadata, UIMessageChunk } from "ai";
import { chatSources, type ChatRagPlan } from "@/lib/rag/chat";
import type { RagSource } from "@/lib/rag/rag";

export const SOURCES_KIND = "soli.sources";

/** Lifts an async iterable (or array) of ui message chunks into a stream. */
export function fromAsyncIterable<T>(
  iterable: Iterable<T> | AsyncIterable<T>,
): ReadableStream<T> {
  return new ReadableStream<T>({
    async start(controller) {
      try {
        for await (const value of iterable) controller.enqueue(value);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/** Satisfies the `soli.sources` custom part contract; see ChatOverlayOptions. */
export interface SourceJson {
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  chunkIndex: number;
  score: number;
  excerpt: string;
}

export function toSourceJson(source: RagSource): SourceJson {
  return {
    chunkId: source.chunkId,
    documentId: source.documentId,
    filename: source.filename,
    pageNumber: source.pageNumber ?? null,
    chunkIndex: source.chunkIndex,
    score: source.score,
    excerpt: source.excerpt,
  };
}

export interface ChatOverlayOptions {
  /** Server-assigned or client-provided chat id to persist under. */
  chatId: string;
  plan: Extract<ChatRagPlan, { kind: "proceed" }>;
  /** Runs after the model text completes, before the stream ends. */
  onFinished: (text: string, sources: RagSource[]) => Promise<void>;
}

/**
 * Augments the model's UI-message stream with:
 *  - the server chat id (message metadata, so the client can persist it),
 *  - one `source-document` part per cited source,
 *  - one `custom` part carrying the full structured sources JSON.
 * Sources are derived from the completed answer text (cite markers), so the
 * client keeps the text and the sources in sync.
 *
 * `providerMetadata` must be plain JSON for transport, hence the boundary
 * cast: `RagSource` is already JSON-only, we just reassert it as the SDK's
 * metadata shape.
 */
export async function* withChatOverlay(
  base: AsyncIterable<UIMessageChunk>,
  options: ChatOverlayOptions,
): AsyncGenerator<UIMessageChunk> {
  let metadataSent = false;
  let pending: UIMessageChunk | null = null;
  let text = "";

  for await (const chunk of base) {
    if (chunk.type === "text-delta") text += chunk.delta;

    if (!metadataSent && chunk.type === "start") {
      yield {
        type: "message-metadata",
        messageMetadata: { chatId: options.chatId },
      };
      metadataSent = true;
    }

    if (pending) yield pending;
    pending = chunk;
  }

  if (pending?.type === "finish") {
    const sources = chatSources(text, options.plan.contextChunks);
    await options.onFinished(text, sources);

    for (const source of sources) {
      yield {
        type: "source-document",
        sourceId: source.chunkId,
        mediaType: "text/plain",
        title: source.filename,
        filename: source.filename,
      };
    }
    yield {
      type: "custom",
      kind: SOURCES_KIND,
      providerMetadata: {
        sources: Object.fromEntries(
          sources.map((source) => [source.chunkId, toSourceJson(source)]),
        ),
      } as unknown as ProviderMetadata,
    };
    yield pending;
  } else if (pending) {
    // error / abort: forward without source parts.
    yield pending;
  }
}

/**
 * Builds the chunks for the "no relevant context" path, where no model call
 * happens (a fixed, honest answer is streamed immediately).
 */
export function simpleAnswerChunks(
  chatId: string,
  answer: string,
): UIMessageChunk[] {
  const textId = "text";
  return [
    { type: "start" },
    { type: "message-metadata", messageMetadata: { chatId } },
    { type: "text-start", id: textId },
    { type: "text-delta", id: textId, delta: answer },
    { type: "text-end", id: textId },
    { type: "finish" },
  ];
}