import "server-only";

import { extractText } from "unpdf";
import {
  normalizePageText,
  type NormalizedPage,
} from "@/lib/ingest/normalize";

export interface ExtractedDocument {
  /** Number of pages reported by the PDF. */
  totalPages: number;
  /** Non-empty, normalized pages with their original 1-based page numbers. */
  pages: NormalizedPage[];
}

/**
 * Extracts and normalizes text from a PDF in memory. Pages that normalize to
 * nothing (scanned/image-only pages) are dropped but still counted in
 * `totalPages`.
 */
export async function extractPdfText(
  buffer: Uint8Array | Buffer,
): Promise<ExtractedDocument> {
  const { totalPages, text } = await extractText(new Uint8Array(buffer), {
    mergePages: false,
  });

  const pages: NormalizedPage[] = [];
  for (let index = 0; index < text.length; index++) {
    const normalized = normalizePageText(text[index] ?? "");
    if (normalized.length > 0) {
      pages.push({ pageNumber: index + 1, text: normalized });
    }
  }

  return { totalPages, pages };
}