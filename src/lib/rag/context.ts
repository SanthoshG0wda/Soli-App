import type { RetrievedChunk } from "@/lib/retrieval/retrieval";

export interface RagContextOptions {
  /** Total character budget for the assembled context block. */
  maxContextChars: number;
  /** Per-chunk content character budget before truncation. */
  maxChunkChars: number;
}

export interface BuiltContext {
  /** The context block text (already delimited, cite-numbered, sanitized). */
  text: string;
  /** The chunks actually included, in citation order (index + 1 == cite number). */
  chunks: RetrievedChunk[];
}

/** Removes control characters and collapses whitespace in untrusted strings. */
export function sanitizeText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Sanitizes and truncates untrusted chunk content for embedding in a prompt.
 * Content is treated as data: control sequences that could spoof formatting
 * or prompt boundaries are removed; length is capped per chunk.
 */
export function sanitizeChunkContent(content: string, maxChars: number): string {
  const sanitized = sanitizeText(content);
  return sanitized.length > maxChars
    ? `${sanitized.slice(0, maxChars)}\u2026`
    : sanitized;
}

function formatBlock(chunk: RetrievedChunk, index: number, maxChunkChars: number): string {
  const location =
    chunk.pageNumber !== undefined ? ` (page ${chunk.pageNumber})` : "";
  const header = `[${index}] Source: ${sanitizeText(chunk.filename)}${location}`;
  return `${header}\n${sanitizeChunkContent(chunk.content, maxChunkChars)}`;
}

/**
 * Assembles retrieved chunks into a single, cite-numbered context block.
 * Chunks are added in retrieval order (highest score first) until the total
 * budget is exhausted; lower-scoring tail chunks are dropped. At least the
 * top chunk always survives.
 */
export function buildRagContext(
  chunks: RetrievedChunk[],
  options: RagContextOptions,
): BuiltContext {
  const blocks: string[] = [];
  const included: RetrievedChunk[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const block = formatBlock(chunk, included.length + 1, options.maxChunkChars);
    const cost = (used > 0 ? 1 : 0) + block.length;
    if (included.length > 0 && used + cost > options.maxContextChars) break;
    blocks.push(block);
    included.push(chunk);
    used += cost;
  }

  return { text: blocks.join("\n\n"), chunks: included };
}