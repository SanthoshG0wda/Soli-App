import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the whole Qdrant HTTP client so we can assert the exact wire calls the
// vector layer produces, including Qdrant-specific filter shapes. This keeps
// Qdrant-specific parsing out of the retrieval layer and locked behind tests.
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  collectionExists: vi.fn(),
  count: vi.fn(),
  deleteFn: vi.fn(),
  upsert: vi.fn(),
  createCollection: vi.fn(),
  createPayloadIndex: vi.fn(),
}));

vi.mock("@qdrant/js-client-rest", () => ({
  QdrantClient: class {
    query = mocks.query;
    collectionExists = mocks.collectionExists;
    count = mocks.count;
    delete = mocks.deleteFn;
    upsert = mocks.upsert;
    createCollection = mocks.createCollection;
    createPayloadIndex = mocks.createPayloadIndex;
  },
}));

import { QdrantVectorStore } from "@/lib/vector/qdrant";

let store: QdrantVectorStore;

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.collectionExists.mockResolvedValue({ exists: true });
  mocks.count.mockResolvedValue({ count: 1 });
  store = new QdrantVectorStore();
});

const payload = {
  document_id: "doc-marine",
  chunk_id: "chunk-lobster",
  filename: "marine-biology.pdf",
  page_number: 4,
  chunk_index: 1,
  content: "Lobsters live on the seafloor.",
};

describe("QdrantVectorStore.searchSimilarChunks", () => {
  it("searches the configured collection with the query vector and parsed filter", async () => {
    mocks.query.mockResolvedValue({ points: [] });

    await store.searchSimilarChunks([0.1, 0.2, 0.3], {
      limit: 2,
      documentIds: ["doc-marine", "doc-cooking"],
      minScore: 0.5,
    });

    expect(mocks.query).toHaveBeenCalledWith("soli_test", {
      query: [0.1, 0.2, 0.3],
      limit: 2,
      filter: {
        must: [
          { key: "document_id", match: { any: ["doc-marine", "doc-cooking"] } },
        ],
      },
      score_threshold: 0.5,
      with_payload: true,
    });
  });

  it("omits the filter when no document restriction is given", async () => {
    mocks.query.mockResolvedValue({ points: [] });

    await store.searchSimilarChunks([0.1, 0.2, 0.3], { limit: 2 });

    expect(mocks.query).toHaveBeenCalledWith(
      "soli_test",
      expect.objectContaining({ filter: undefined }),
    );
  });

  it("parses stored payloads into normalized metadata and keeps the score", async () => {
    mocks.query.mockResolvedValue({
      points: [
        { id: "chunk-lobster", score: 0.9, payload },
        { id: "chunk-pasta", score: 0.7, payload: { ...payload, chunk_id: "chunk-pasta", page_number: null } },
      ],
    });

    const results = await store.searchSimilarChunks([0.1, 0.2, 0.3], { limit: 5 });

    expect(results).toEqual([
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
        score: 0.9,
      },
      {
        chunkId: "chunk-pasta",
        metadata: {
          chunkId: "chunk-pasta",
          documentId: "doc-marine",
          filename: "marine-biology.pdf",
          pageNumber: null,
          chunkIndex: 1,
          content: "Lobsters live on the seafloor.",
        },
        score: 0.7,
      },
    ]);
  });

  it("drops points with unparseable payloads", async () => {
    mocks.query.mockResolvedValue({
      points: [{ id: "bad", score: 0.5, payload: { document_id: "d" } }],
    });

    const results = await store.searchSimilarChunks([0.1, 0.2, 0.3], { limit: 5 });

    expect(results).toEqual([]);
  });

  it("rejects invalid search options with a typed error", async () => {
    await expect(
      store.searchSimilarChunks([0.1, 0.2, 0.3], { limit: 0 }),
    ).rejects.toMatchObject({ code: "validation", operation: "searchSimilarChunks" });
    await expect(
      store.searchSimilarChunks([0.1, 0.2, 0.3], { limit: 2, documentIds: [] }),
    ).rejects.toMatchObject({ code: "validation" });
  });
});

describe("QdrantVectorStore.upsertChunks", () => {
  it("stores vectors with the full metadata payload and chunk id as point id", async () => {
    await store.upsertChunks([
      {
        chunkId: "chunk-lobster",
        documentId: "doc-marine",
        filename: "marine-biology.pdf",
        pageNumber: 4,
        chunkIndex: 1,
        content: "Lobsters live on the seafloor.",
        vector: [0.1, 0.2, 0.3],
      },
    ]);

    expect(mocks.upsert).toHaveBeenCalledWith("soli_test", {
      points: [
        {
          id: "chunk-lobster",
          vector: [0.1, 0.2, 0.3],
          payload,
        },
      ],
    });
  });

  it("returns the number of upserted chunks", async () => {
    const result = await store.upsertChunks([
      {
        chunkId: "chunk-pasta",
        documentId: "doc-cooking",
        filename: "italian-cooking.pdf",
        pageNumber: null,
        chunkIndex: 0,
        content: "Boil water.",
        vector: [0.3, 0.2, 0.1],
      },
    ]);

    expect(result).toEqual({ upsertedCount: 1 });
  });
});

describe("QdrantVectorStore.ensure", () => {
  it("creates the collection on first use", async () => {
    mocks.collectionExists.mockResolvedValue({ exists: false });

    await store.ensure();

    expect(mocks.createCollection).toHaveBeenCalledWith("soli_test", {
      vectors: { size: 3, distance: "Cosine" },
    });
  });

  it("skips creation when the collection already exists", async () => {
    await store.ensure();

    expect(mocks.createCollection).not.toHaveBeenCalled();
  });
});

describe("QdrantVectorStore.deleteChunks", () => {
  it("deletes by chunk ids and reports the counted total", async () => {
    mocks.count.mockResolvedValue({ count: 2 });

    const result = await store.deleteChunks(["chunk-a", "chunk-b"]);

    expect(mocks.deleteFn).toHaveBeenCalledWith("soli_test", {
      filter: { must: [{ has_id: ["chunk-a", "chunk-b"] }] },
    });
    expect(result).toEqual({ deletedCount: 2 });
  });

  it("no-ops on an empty id list", async () => {
    const result = await store.deleteChunks([]);

    expect(result).toEqual({ deletedCount: 0 });
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });
});

describe("QdrantVectorStore.deleteDocumentChunks", () => {
  it("deletes every chunk of a document", async () => {
    const result = await store.deleteDocumentChunks("doc-marine");

    expect(mocks.deleteFn).toHaveBeenCalledWith("soli_test", {
      filter: { must: [{ key: "document_id", match: { value: "doc-marine" } }] },
    });
    expect(result).toEqual({ deletedCount: 1 });
  });
});