import type { NormalizedPage } from "@/lib/ingest/normalize";

export interface ChunkUnit {
  text: string;
  /** 1-based page the chunk starts on. */
  pageNumber: number;
  /** Global character offset within the whole document. */
  start: number;
  end: number;
}

export interface ChunkOptions {
  /** Target chunk size in characters. */
  size: number;
  /** Characters of overlap between consecutive chunks. */
  overlap: number;
}

const MAX_LOOKBACK = 80;

/**
 * Finds a clean cut point near `ideal`: prefers a blank line, then a line
 * break, then a sentence end. Falls back to a hard cut when none is nearby.
 */
export function findCutPoint(text: string, ideal: number): number {
  if (ideal >= text.length) return text.length;

  const start = Math.max(0, ideal - MAX_LOOKBACK);
  const window = text.slice(start, ideal);

  const para = window.lastIndexOf("\n\n");
  if (para >= 0) return start + para + 2;

  const newline = window.lastIndexOf("\n");
  if (newline >= 0) return start + newline + 1;

  for (const delimiter of [". ", "! ", "? "]) {
    const at = window.lastIndexOf(delimiter);
    if (at >= 0) return start + at + delimiter.length;
  }

  return ideal;
}

/** Chunks a single page's text with overlap and sentence-boundary snapping. */
export function chunkPage(
  text: string,
  pageNumber: number,
  options: ChunkOptions,
  baseOffset: number,
): ChunkUnit[] {
  const units: ChunkUnit[] = [];
  const { size, overlap } = options;
  const length = text.length;
  let start = 0;

  while (start < length) {
    const ideal = start + size;
    let cut = findCutPoint(text, ideal);
    if (cut <= start) cut = Math.min(ideal, length);
    if (cut > length) cut = length;

    units.push({
      text: text.slice(start, cut),
      pageNumber,
      start: baseOffset + start,
      end: baseOffset + cut,
    });

    if (cut >= length) break;

    const next = cut - overlap;
    start = next > start ? next : cut;
  }

  return units;
}

/**
 * Chunks a list of normalized pages into a single stream of units with global
 * offsets. Chunks stay within a single page; page number is preserved per
 * unit.
 */
export function chunkPages(
  pages: NormalizedPage[],
  options: ChunkOptions,
): ChunkUnit[] {
  let offset = 0;
  const units: ChunkUnit[] = [];

  for (const page of pages) {
    units.push(...chunkPage(page.text, page.pageNumber, options, offset));
    offset += page.text.length;
  }

  return units;
}