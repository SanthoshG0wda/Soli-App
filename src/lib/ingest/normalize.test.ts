import { describe, expect, it } from "vitest";
import { normalizePageText } from "@/lib/ingest/normalize";

describe("normalizePageText", () => {
  it("returns empty string for empty input", () => {
    expect(normalizePageText("")).toBe("");
  });

  it("collapses runs of spaces and tabs", () => {
    expect(normalizePageText("a   b\t\tc")).toBe("a b c");
  });

  it("converts Windows line endings and non-breaking spaces", () => {
    expect(normalizePageText("line1\r\nline2\u00a0x")).toBe("line1\nline2 x");
  });

  it("strips control characters but keeps structural newlines", () => {
    expect(normalizePageText("a\x00b\x7fc\u0001d\n e")).toBe("abcd\ne");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizePageText("  hello  ")).toBe("hello");
  });

  it("caps runs of blank lines at a single blank line", () => {
    expect(normalizePageText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});