import { describe, expect, it } from "vitest";
import { storedMessagesToUi } from "@/lib/chat/history";
import type { StoredChatMessage } from "@/lib/chat/types";

const stored: StoredChatMessage[] = [
  {
    id: "user-1",
    role: "user",
    content: "Who discovered the theory of gravity?",
    citations: null,
    createdAt: "2026-09-20T10:00:00.000Z",
  },
  {
    id: "assistant-1",
    role: "assistant",
    content: "Isaac Newton was credited in 1687 [1].",
    citations: [
      {
        chunkId: "chunk-9",
        documentId: "doc-9",
        documentTitle: "physics.pdf",
        pageNumber: 3,
        excerpt: "Newton published Principia in 1687.",
        score: 0.81,
      },
      {
        chunkId: "chunk-12",
        documentId: "doc-9",
        documentTitle: "physics.pdf",
        pageNumber: 4,
        excerpt: "Gravity explained planetary orbits.",
        score: 0.62,
      },
    ],
    createdAt: "2026-09-20T10:00:05.000Z",
  },
];

describe("storedMessagesToUi", () => {
  it("renders user and assistant text parts in order", () => {
    const messages = storedMessagesToUi(stored);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: stored[0].content }],
    });
    expect(messages[1].role).toBe("assistant");
  });

  it("rebuilds the soli.sources custom part from citations as a record keyed by chunkId", () => {
    const [assistant] = storedMessagesToUi(stored).slice(1);
    const custom = assistant.parts.find(
      (part) => part.type === "custom" && part.kind === "soli.sources",
    );
    expect(custom).toBeDefined();
    const providerMetadata = (custom as { providerMetadata?: unknown })
      .providerMetadata as { sources: Record<string, unknown> };
    const sources = Object.values(providerMetadata.sources);
    expect(sources).toHaveLength(2);
    expect(providerMetadata.sources["chunk-9"]).toMatchObject({
      filename: "physics.pdf",
      pageNumber: 3,
      score: 0.81,
    });
  });

  it("does not add a sources part when a message has no citations", () => {
    const [user] = storedMessagesToUi(stored);
    expect(user.parts.some((part) => part.type === "custom")).toBe(false);
  });
});