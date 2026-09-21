import { describe, expect, it } from "vitest";
import {
  chunkPage,
  chunkPages,
  findCutPoint,
} from "@/lib/ingest/chunk";

describe("findCutPoint", () => {
  it("prefers a paragraph break near the ideal cut", () => {
    const text = "aaaa bbbb\n\ncccc dddd eeee ffff";
    const cut = findCutPoint(text, 20);
    expect(cut).toBe(text.indexOf("\n\n") + 2);
    expect(cut).toBeLessThan(20);
  });

  it("falls back to a newline when no paragraph break is near", () => {
    const text = "aaaa bbbb cccc\ndddd eeee ffff gggg";
    const cut = findCutPoint(text, 15);
    expect(cut).toBe(text.indexOf("\n") + 1);
  });

  it("falls back to a sentence end", () => {
    const text = "aaaa bbbb cccc. dddd eeee ffff gggg hhhh";
    const cut = findCutPoint(text, 22);
    expect(text.slice(cut - 2, cut)).toBe(". ");
  });

  it("hard-cuts at the ideal point when no boundary is nearby", () => {
    const text = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    expect(findCutPoint(text, 16)).toBe(16);
  });

  it("returns the text length when the ideal cut is beyond the text", () => {
    expect(findCutPoint("short", 1000)).toBe(5);
  });
});

describe("chunkPage", () => {
  it("produces overlapping chunks with a single page number", () => {
    const text = Array.from({ length: 20 }, (_, i) => `unit${i},`).join(" ");
    const units = chunkPage(text, 2, { size: 40, overlap: 10 }, 0);

    expect(units.length).toBeGreaterThan(1);
    expect(units.every((unit) => unit.pageNumber === 2)).toBe(true);
    expect(units[0].text.length).toBeGreaterThan(0);
    expect(units[1]?.start).toBe((units[0]?.end ?? 0) - 10);
    expect(units[0]).toBeDefined();
    expect(units[1]).toBeDefined();
  });

  it("returns a single unit when the text fits in one chunk", () => {
    const units = chunkPage("hello world", 3, { size: 100, overlap: 5 }, 20);
    expect(units).toHaveLength(1);
    expect(units[0]).toEqual({
      text: "hello world",
      pageNumber: 3,
      start: 20,
      end: 31,
    });
  });

  it("never returns empty chunks", () => {
    const text = "a b c d e f g h i j";
    const units = chunkPage(text, 1, { size: 3, overlap: 1 }, 0);
    expect(units.length).toBeGreaterThan(0);
    expect(units.every((unit) => unit.text.length > 0)).toBe(true);
  });
});

describe("chunkPages", () => {
  it("keeps chunks page-aligned with global offsets", () => {
    const pages = [
      { pageNumber: 1, text: "aaa " },
      { pageNumber: 2, text: "bbb " },
    ];
    const units = chunkPages(pages, { size: 100, overlap: 0 });

    expect(units.map((unit) => unit.pageNumber)).toEqual([1, 2]);
    expect(units[0]?.text).toBe("aaa ");
    expect(units[0]?.start).toBe(0);
    expect(units[1]?.text).toBe("bbb ");
    expect(units[1]?.start).toBe(4);
  });

  it("yields consistent global offsets across many chunks", () => {
    const pages = [
      { pageNumber: 1, text: "x".repeat(60) },
      { pageNumber: 2, text: "y".repeat(60) },
    ];
    const units = chunkPages(pages, { size: 20, overlap: 5 });

    expect(units.length).toBeGreaterThan(2);
    for (let index = 1; index < units.length; index++) {
      // Consecutive chunks overlap by `overlap`, except across page
      // boundaries where the offset stream is contiguous.
      expect(units[index]!.start).toBeGreaterThanOrEqual(
        (units[index - 1]!.end ?? 0) - 5,
      );
      expect(units[index]!.start).toBeLessThanOrEqual(units[index - 1]!.end);
    }
  });
});