import { describe, expect, it, vi } from "vitest";
import type { UIMessageChunk } from "ai";
import type { RetrievedChunk } from "@/lib/retrieval/retrieval";
import type { ChatRagPlan } from "@/lib/rag/chat";
import {
  fromAsyncIterable,
  simpleAnswerChunks,
  SOURCES_KIND,
  withChatOverlay,
} from "@/lib/chat/overlay";

const chunk: RetrievedChunk = {
  chunkId: "chunk-1",
  documentId: "doc-1",
  filename: "marine-biology.pdf",
  pageNumber: 2,
  chunkIndex: 0,
  score: 0.85,
  content: "Whales are mammals.",
};

const plan: Extract<ChatRagPlan, { kind: "proceed" }> = {
  kind: "proceed",
  system: "system",
  prompt: "prompt",
  contextChunks: [chunk],
};

async function* baseStream(chunks: UIMessageChunk[]): AsyncIterable<UIMessageChunk> {
  for (const chunk of chunks) yield chunk;
}

describe("withChatOverlay", () => {
  it("sends the chat id, appends sources before finish, and reports finished sources", async () => {
    const onFinished = vi.fn().mockResolvedValue(undefined);
    const stream = withChatOverlay(
      baseStream([
        { type: "start" },
        { type: "text-delta", id: "text", delta: "The answer is [1]." },
        { type: "text-end", id: "text" },
        { type: "finish" },
      ]),
      { chatId: "chat-42", plan, onFinished },
    );

    const parts: UIMessageChunk[] = [];
    for await (const part of stream) parts.push(part);

    const types = parts.map((part) => part.type);
    expect(types[0]).toBe("message-metadata");
    expect(types[types.length - 1]).toBe("finish");

    const metadata = parts[0];
    expect(metadata).toMatchObject({
      type: "message-metadata",
      messageMetadata: { chatId: "chat-42" },
    });

    const sourceParts = parts.filter((part) => part.type === "source-document");
    expect(sourceParts).toHaveLength(1);
    expect(sourceParts[0]).toMatchObject({
      type: "source-document",
      sourceId: "chunk-1",
      title: "marine-biology.pdf",
    });

    const custom = parts.find(
      (part) => part.type === "custom" && part.kind === SOURCES_KIND,
    );
    expect(custom).toBeDefined();
    const providerMetadata = (
      (custom as unknown as { providerMetadata: { sources: Record<string, unknown> } })
        .providerMetadata
    );
    const sources = Object.values(providerMetadata.sources);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      chunkId: "chunk-1",
      filename: "marine-biology.pdf",
      pageNumber: 2,
    });

    expect(onFinished).toHaveBeenCalledWith("The answer is [1].", [
      expect.objectContaining({ chunkId: "chunk-1" }),
    ]);
  });

  it("forwards error streams without adding sources", async () => {
    const onFinished = vi.fn().mockResolvedValue(undefined);
    const stream = withChatOverlay(
      baseStream([
        { type: "start" },
        { type: "text-delta", id: "text", delta: "partial" },
        { type: "error", errorText: "boom" },
      ]),
      { chatId: "chat-42", plan, onFinished },
    );

    const parts: UIMessageChunk[] = [];
    for await (const part of stream) parts.push(part);

    expect(parts.some((part) => part.type === "source-document")).toBe(false);
    expect(parts.some((part) => part.type === "custom")).toBe(false);
    expect(onFinished).not.toHaveBeenCalled();
  });
});

describe("simpleAnswerChunks", () => {
  it("streams a fixed answer with the chat id attached", () => {
    const chunks = simpleAnswerChunks("chat-7", "No relevant info.");
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "start",
      "message-metadata",
      "text-start",
      "text-delta",
      "text-end",
      "finish",
    ]);
    expect(chunks[1]).toMatchObject({
      type: "message-metadata",
      messageMetadata: { chatId: "chat-7" },
    });
    expect(chunks.find((chunk) => chunk.type === "text-delta")).toMatchObject({
      delta: "No relevant info.",
    });
  });
});

describe("fromAsyncIterable", () => {
  it("pulls every value into a ReadableStream", async () => {
    async function* values() {
      yield "a";
      yield "b";
    }
    const reader = fromAsyncIterable(values()).getReader();
    const results: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      results.push(value as string);
    }
    expect(results).toEqual(["a", "b"]);
  });
});