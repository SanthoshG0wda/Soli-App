/** Extracts [n] cite markers from a model answer, e.g. "[1]", "[2, 3]". */
const CITATION_PATTERN = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/**
 * Parses cite markers from the answer and returns the cited 1-based chunk
 * indices in first-appearance order. Indices outside the valid range
 * (>= 1 and <= validCount) are ignored, so the model can never cite a chunk
 * that was not part of the retrieved context.
 */
export function parseCitedIndices(answer: string, validCount: number): number[] {
  const seen = new Set<number>();
  const indices: number[] = [];

  for (const match of answer.matchAll(CITATION_PATTERN)) {
    const group = match[1] ?? "";
    for (const token of group.split(",")) {
      const index = Number(token.trim());
      if (!Number.isInteger(index) || index < 1 || index > validCount) continue;
      if (seen.has(index)) continue;
      seen.add(index);
      indices.push(index);
    }
  }

  return indices;
}