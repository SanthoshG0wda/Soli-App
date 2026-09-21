import "dotenv/config";

import { vectorStore } from "../src/lib/vector/index";
import type {
  ChunkVectorInput,
  SimilarChunk,
  StoredChunkMetadata,
} from "../src/lib/vector/types";

// Smoke test for the vector integration layer.
// Runs against whatever QDRANT_URL/QDRANT_API_KEY/QDRANT_COLLECTION env
// points at; uses throwaway embeddings so no provider credentials are needed.

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`ok: ${message}`);
}

function expect(actual: unknown, expected: unknown, label: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} = ${JSON.stringify(expected)}`);
}

function v3(x = 0, y = 0, z = 0): number[] {
  return [x, y, z];
}

function input(overrides: Partial<ChunkVectorInput> & Pick<ChunkVectorInput, "chunkId">): ChunkVectorInput {
  return {
    documentId: "doc-lobster",
    filename: "marine-biology.pdf",
    pageNumber: 4,
    chunkIndex: 0,
    content: "Lobsters are marine crustaceans that live on the seafloor.",
    vector: v3(1, 0.1, 0),
    ...overrides,
  };
}

async function main(): Promise<void> {
  const vectors: ChunkVectorInput[] = [
    input({
      chunkId: "chunk-lobster",
      pageNumber: 4,
      chunkIndex: 0,
      content: "Lobsters are marine crustaceans that live on the seafloor.",
    }),
    input({
      chunkId: "chunk-pasta",
      documentId: "doc-cooking",
      filename: "italian-cooking.pdf",
      pageNumber: 1,
      chunkIndex: 2,
      content: "Boil water, add salt, and cook pasta until al dente.",
      vector: v3(0, 0.1, 1),
    }),
    input({
      chunkId: "chunk-physics",
      documentId: "doc-physics",
      filename: "quantum-notes.pdf",
      pageNumber: 7,
      chunkIndex: 1,
      content: "Superposition is the ability of a quantum system to be in multiple states at once.",
      vector: v3(0.05, 0, 0.05),
    }),
  ];

  console.log("== ensure + upsert ==");
  await vectorStore.ensure();
  const upserted = await vectorStore.upsertChunks(vectors);
  expect(upserted.upsertedCount, 3, "upsertedCount");

  console.log("== searchSimilarChunks ==");
  const lobsterLike = v3(0.95, 0.05, 0);
  const results = await vectorStore.searchSimilarChunks(lobsterLike, { limit: 3 });
  assert(results.length === 3, `3 results, got ${results.length}`);
  expect(results[0].chunkId, "chunk-lobster", "top hit");

  const top: SimilarChunk = results[0];
  assert(top.score > 0.95, `top score ~1.0 (got ${top.score.toFixed(3)})`);
  assert(top.metadata.documentId === "doc-lobster", "metadata documentId");
  assert(top.metadata.filename === "marine-biology.pdf", "metadata filename");
  expect(top.metadata.pageNumber, 4, "metadata pageNumber");
  expect(top.metadata.chunkIndex, 0, "metadata chunkIndex");
  assert(
    top.metadata.content.includes("Lobsters"),
    "metadata content preserved",
  );
  expect(top.chunkId, top.metadata.chunkId, "metadata chunkId round-trips point id");

  console.log("== filtered search ==");
  const pastaOnly = await vectorStore.searchSimilarChunks(v3(0, 0.1, 1), {
    limit: 10,
    documentIds: ["doc-cooking"],
  });
  assert(pastaOnly.length === 1, "filtered search returns 1");
  expect(pastaOnly[0].chunkId, "chunk-pasta", "filting hit");

  console.log("== minScore ==");
  const thresholded = await vectorStore.searchSimilarChunks(lobsterLike, { limit: 3, minScore: 0.9 });
  assert(thresholded.length === 1, "minScore 0.9 keeps only the lobster hit");

  console.log("== deleteChunks ==");
  const deleted = await vectorStore.deleteChunks(["chunk-physics"]);
  expect(deleted.deletedCount, 1, "deleteChunks count");
  const afterDelete = await vectorStore.searchSimilarChunks(lobsterLike, { limit: 10 });
  const ids = afterDelete.map((r) => r.chunkId);
  assert(!ids.includes("chunk-physics"), "physics chunk gone");

  console.log("== deleteDocumentChunks ==");
  const cleared = await vectorStore.deleteDocumentChunks("doc-lobster");
  expect(cleared.deletedCount, 1, "deleteDocumentChunks count");
  const remainder = await vectorStore.searchSimilarChunks(lobsterLike, { limit: 10 });
  const remainingIds = remainder.map((r) => r.chunkId);
  assert(!remainingIds.includes("chunk-lobster"), "lobster chunk gone");
  assert(remainingIds.includes("chunk-pasta"), "pasta chunk still present");

  console.log("== verify metadata payload persisted (via stored metadata type) ==");
  const pastaResult = await vectorStore.searchSimilarChunks(v3(0, 0.1, 1), { limit: 1 });
  const metadata: StoredChunkMetadata = pastaResult[0].metadata;
  assert(metadata.chunkId.length > 0 && metadata.content.startsWith("Boil water"), "payload metadata complete");

  if (process.exitCode === undefined) {
    console.log("\nALL CHECKS PASSED");
  } else {
    console.log("\nCHECKS FAILED");
  }
}

main().catch((error) => {
  console.error("smoke test crashed:", error);
  process.exit(1);
});