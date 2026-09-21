import { describe, expect, it, vi } from "vitest";
import {
  normalizeRetrievedChunks,
  retrieveRelevantChunks,
} from "@/lib/retrieval/retrieval";
import type {
  RetrievalDeps,
  RetrievedChunk,
  RetrieveRelevantChunksInput,
} from "@/lib/retrieval/retrieval";
import type { SimilarChunk } from "@/lib/vector/types";

function makeDeps(overrides?: Partial<RetrievalDeps>): RetrievalDeps {
  return {
    defaultLimit: 5,
    embedQuery: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    searchSimilar: vi.fn().mockResolvedValue([] as SimilarChunk[]),
    ...overrides,
  };
}

const sampleHits: SimilarChunk[] = [
  {
    chunkId: "chunk-lobster",
    metadata: {
      chunkId: "chunk-lobster",
      documentId: "doc-marine",
      filename: "marine-biology.pdf",
      pageNumber: 4,
      chunkIndex: 1,
      content: "Lobsters live on the seafloor.",
    },
    score: 0.92,
  },
  {
    chunkId: "chunk-pasta",
    metadata: {
      chunkId: "chunk-pasta",
      documentId: "doc-cooking",
      filename: "italian-cooking.pdf",
      pageNumber: null,
      chunkIndex: 0,
      content: "Cook pasta until al dente.",
    },
    score: 0.75,
  },
];

describe("retrieveRelevantChunks", () => {
  it("embeds the user query and (by default) searches all documents", async () => {
    const deps = makeDeps();
    await retrieveRelevantChunks({ query: "How do lobsters molt?" }, deps);

    expect(deps.embedQuery).toHaveBeenCalledWith("How do lobsters molt?");
    expect(deps.searchSimilar).toHaveBeenCalledWith([0.1, 0.2, 0.3], {
      limit: 5,
      documentIds: undefined,
      minScore: undefined,
    });
  });

  it("forwards document filters and a custom limit", async () => {
    const deps = makeDeps();
    await retrieveRelevantChunks(
      { query: "pasta", documentIds: ["doc-cooking", "doc-yeast"], limit: 2 },
      deps,
    );

    expect(deps.searchSimilar).toHaveBeenCalledWith([0.1, 0.2, 0.3], {
      limit: 2,
      documentIds: ["doc-cooking", "doc-yeast"],
      minScore: undefined,
    });
  });

  it("uses the configured default limit when the caller omits it", async () => {
    const deps = makeDeps({ defaultLimit: 3 });
    await retrieveRelevantChunks({ query: "x" }, deps);

    expect(deps.searchSimilar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 3 }),
    );
  });

  it("forwards a minimum score threshold", async () => {
    const deps = makeDeps();
    await retrieveRelevantChunks({ query: "x", minScore: 0.8 }, deps);

    expect(deps.searchSimilar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ minScore: 0.8 }),
    );
  });

  it("normalizes hits into the provider-independent chunk shape", async () => {
    const deps = makeDeps({ searchSimilar: vi.fn().mockResolvedValue(sampleHits) });
    const results: RetrievedChunk[] = await retrieveRelevantChunks({ query: "x" }, deps);

    expect(results).toEqual([
      {
        chunkId: "chunk-lobster",
        documentId: "doc-marine",
        content: "Lobsters live on the seafloor.",
        filename: "marine-biology.pdf",
        pageNumber: 4,
        chunkIndex: 1,
        score: 0.92,
      },
      {
        chunkId: "chunk-pasta",
        documentId: "doc-cooking",
        content: "Cook pasta until al dente.",
        filename: "italian-cooking.pdf",
        chunkIndex: 0,
        score: 0.75,
      },
    ]);
    // null page numbers are dropped, not serialized as null
    expect(results[1]).not.toHaveProperty("pageNumber");
  });

  it("does not call the store when the query is invalid", async () => {
    const deps = makeDeps();
    await expect(retrieveRelevantChunks({ query: "   " }, deps)).rejects.toThrow();
    expect(deps.embedQuery).not.toHaveBeenCalled();
    expect(deps.searchSimilar).not.toHaveBeenCalled();
  });

  it.each<RetrieveRelevantChunksInput>([
    { query: "" },
    { query: "x", limit: 0 },
    { query: "x", limit: -1 },
    { query: "x", minScore: 1.5 },
    { query: "x", documentIds: [] },
    { query: "x", documentIds: [""] },
  ])("rejects invalid input %#", async (input) => {
    const deps = makeDeps();
    await expect(retrieveRelevantChunks(input, deps)).rejects.toThrow("Invalid retrieval input");
  });

  it("propagates embedder failures", async () => {
    const deps = makeDeps({
      embedQuery: vi.fn().mockRejectedValue(new Error("embedding failed")),
    });
    await expect(retrieveRelevantChunks({ query: "x" }, deps)).rejects.toThrow(
      "embedding failed",
    );
  });
});

describe("normalizeRetrievedChunks", () => {
  it("maps vector-store hits to retrieval results without mutating scores", () => {
    const normalized = normalizeRetrievedChunks(sampleHits);
    expect(normalized[0].score).toBe(0.92);
    expect(normalized[0].pageNumber).toBe(4);
    expect(normalized[1].pageNumber).toBeUndefined();
  });
});