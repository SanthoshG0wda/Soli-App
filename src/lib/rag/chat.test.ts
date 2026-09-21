import { describe, expect, it, vi } from "vitest";
import type { RetrievedChunk } from "@/lib/retrieval/retrieval";
import {
  chatSources,
  planRagChat,
  type ChatRagDeps,
} from "@/lib/rag/chat";

const chunks: RetrievedChunk[] = [
  {
    chunkId: "chunk-1",
    documentId: "doc-1",
    filename: "marine-biology.pdf",
    pageNumber: 1,
    chunkIndex: 0,
    score: 0.9,
    content: "Octopuses have three hearts.",
  },
  {
    chunkId: "chunk-2",
    documentId: "doc-2",
    filename: "cooking.pdf",
    pageNumber: 4,
    chunkIndex: 1,
    score: 0.7,
    content: "Water boils at 100 C.",
  },
];

function makeDeps(retrieve?: (input: {
  query: string;
  documentIds?: string[];
  limit?: number;
  minScore?: number;
}) => Promise<RetrievedChunk[]>): ChatRagDeps {
  return {
    defaultLimit: 5,
    maxContextChars: 12_000,
    maxChunkChars: 4000,
    retrieve: retrieve ?? vi.fn().mockResolvedValue(chunks),
  };
}

describe("planRagChat", () => {
  it("throws on an empty question", async () => {
    await expect(
      planRagChat({ question: "   " }, makeDeps()),
    ).rejects.toThrow(/question must not be empty/);
  });

  it("returns a general-knowledge plan (no context) when nothing matches", async () => {
    const plan = await planRagChat(
      { question: "What is the capital of Mars?" },
      makeDeps(vi.fn().mockResolvedValue([])),
    );
    expect(plan.kind).toBe("general");
    if (plan.kind === "general") {
      expect(plan.prompt).toContain("What is the capital of Mars?");
      expect(plan.prompt).not.toContain("<retrieved_context>");
    }
  });

  it("builds a proceed plan with retrieval context and the question", async () => {
    const plan = await planRagChat(
      { question: "How many hearts do octopuses have?" },
      makeDeps(),
    );

    expect(plan.kind).toBe("proceed");
    if (plan.kind === "proceed") {
      expect(plan.prompt).toContain("<retrieved_context>");
      expect(plan.prompt).toContain(
        "How many hearts do octopuses have?",
      );
      expect(plan.contextChunks.map((chunk) => chunk.chunkId)).toEqual([
        "chunk-1",
        "chunk-2",
      ]);
      expect(plan.system).toContain("<retrieved_context>");
    }
  });

  it("forwards the configured limit and document filters", async () => {
    const retrieve = vi.fn().mockResolvedValue(chunks);
    await planRagChat(
      { question: "q", documentIds: ["doc-1"], limit: 3 },
      makeDeps(retrieve),
    );
    expect(retrieve).toHaveBeenCalledWith({
      query: "q",
      documentIds: ["doc-1"],
      limit: 3,
      minScore: undefined,
    });
  });

  it("defaults the limit when not provided", async () => {
    const retrieve = vi.fn().mockResolvedValue([]);
    await planRagChat({ question: "q" }, makeDeps(retrieve));
    expect(retrieve).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, documentIds: undefined }),
    );
  });
});

describe("chatSources", () => {
  it("resolves cite markers to the matching context chunks", () => {
    const sources = chatSources(
      "Octopuses have three hearts [1], but water boils [2].",
      chunks,
    );
    expect(sources.map((source) => source.chunkId)).toEqual([
      "chunk-1",
      "chunk-2",
    ]);
  });

  it("ignores out-of-range cite markers", () => {
    const sources = chatSources("Only one source [9].", chunks);
    expect(sources.map((source) => source.chunkId)).toEqual([
      "chunk-1",
      "chunk-2",
    ]);
  });

  it("attributes every context chunk when no markers are present", () => {
    const sources = chatSources("No citations here.", chunks);
    expect(sources.map((source) => source.chunkId)).toEqual([
      "chunk-1",
      "chunk-2",
    ]);
  });
});