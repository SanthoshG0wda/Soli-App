/**
 * Text normalization for extracted PDF text (untrusted input).
 * PDFs often contain unusual spacing, soft line breaks, and control
 * characters; we collapse those before chunking.
 */

/** Removes control characters and collapses whitespace in extracted text. */
export function normalizePageText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface NormalizedPage {
  /** 1-based page number in the original PDF. */
  pageNumber: number;
  text: string;
}