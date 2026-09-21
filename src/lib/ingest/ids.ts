import { createHash } from "node:crypto";

/**
 * Deterministic chunk row and Qdrant point id derived from (documentId,
 * chunkIndex). Stable across runs: re-ingesting the same document re-writes the
 * same ids, which is what makes ingestion idempotent at the vector level.
 */
export function stableChunkId(documentId: string, chunkIndex: number): string {
  const hex = createHash("sha256")
    .update(`${documentId}:${chunkIndex}`)
    .digest("hex");
  return uuidFromHex(hex);
}

function uuidFromHex(hex: string): string {
  const version = "4";
  const variant = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `${version}${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}