import { describe, expect, it, vi, type Mock } from "vitest";
import type { Database } from "@/db";
import { chunks, DocumentStatus } from "@/db/schema";
import type { ExtractedDocument } from "@/lib/ingest/extract";
import {
  ingestPdf,
  IngestError,
  type IngestDeps,
} from "@/lib/ingest/service";
import { stableChunkId } from "@/lib/ingest/ids";

interface InsertEvent {
  table: unknown;
  rows: unknown;
  onConflict?: boolean;
}

/**
 * Minimal in-memory stand-in for the parts of the database the ingestion
 * pipeline touches, so we can drive `ingestPdf` with zero I/O.
 */
class FakeDatabase {
  insertEvents: InsertEvent[] = [];
  updateValues: Record<string, unknown>[] = [];
  deleteEvents: { table: string; where: unknown }[] = [];
  transactions = 0;

  insert = (table: unknown) => {
    return {
      values: (rows: unknown) => {
        const promise: Promise<void> & {
          onConflictDoUpdate?: (options: unknown) => Promise<void>;
        } = (async () => {
          this.pushInsert(table, rows, false);
        })();
        promise.onConflictDoUpdate = async () => {
          this.pushInsert(table, rows, true);
        };
        return promise;
      },
    } as unknown as ReturnType<Database["insert"]>;
  };

  private pushInsert(table: unknown, rows: unknown, onConflict: boolean) {
    this.insertEvents.push({ table, rows, onConflict });
  }

  update = () => {
    return {
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          this.updateValues.push(values);
        },
      }),
    } as unknown as ReturnType<Database["update"]>;
  };

  delete = () => {
    return {
      where: async (condition: unknown) => {
        this.deleteEvents.push({ table: "chunks", where: condition });
      },
    } as unknown as ReturnType<Database["delete"]>;
  };

  transaction = async <T>(callback: (tx: Database) => Promise<T>): Promise<T> => {
    this.transactions += 1;
    return callback(this as unknown as Database);
  };
}

function pages(size: number): ExtractedDocument {
  return {
    totalPages: size,
    pages: Array.from({ length: size }, (_, index) => ({
      pageNumber: index + 1,
      text: `page ${index + 1} content. `.repeat(30),
    })),
  };
}

function makeDeps(overrides: Partial<{
  db: FakeDatabase;
  extract: Mock;
  embed: Mock;
  deleteDocumentChunks: Mock;
  upsertChunks: Mock;
}>) {
  const db = overrides.db ?? new FakeDatabase();
  const deleteDocumentChunks: Mock =
    overrides.deleteDocumentChunks ?? vi.fn().mockResolvedValue({ deletedCount: 0 });
  const upsertChunks: Mock =
    overrides.upsertChunks ?? vi.fn().mockResolvedValue({ status: "completed" });
  const extract: Mock = overrides.extract ?? vi.fn().mockResolvedValue(pages(2));
  const embed: Mock =
    overrides.embed ??
    vi.fn().mockImplementation((texts: string[]) =>
      texts.map((_, index) => [index, 0, 0]),
    );

  const deps: IngestDeps = {
    db: db as unknown as IngestDeps["db"],
    vectorStore: {
      deleteDocumentChunks:
        deleteDocumentChunks as unknown as IngestDeps["vectorStore"]["deleteDocumentChunks"],
      upsertChunks:
        upsertChunks as unknown as IngestDeps["vectorStore"]["upsertChunks"],
    },
    embed: embed as unknown as IngestDeps["embed"],
    extract: extract as unknown as IngestDeps["extract"],
    size: 1200,
    overlap: 200,
  };

  return { deps, db, deleteDocumentChunks, upsertChunks };
}

describe("ingestPdf", () => {
  it("runs the full pipeline and reports a ready document", async () => {
    const { deps, db, deleteDocumentChunks, upsertChunks } = makeDeps({});

    const result = await ingestPdf(
      { buffer: Buffer.from("pdf"), filename: "guide.pdf", mimeType: "application/pdf", sizeBytes: 100 },
      deps,
    );

    expect(result.status).toBe(DocumentStatus.Ready);
    expect(result.pageCount).toBe(2);
    expect(result.chunkCount).toBeGreaterThan(0);

    const statuses = db.updateValues.map((values) => values.status);
    expect(statuses).toContain(DocumentStatus.Processing);
    expect(statuses).toContain(DocumentStatus.Ready);

    const chunkInsert = db.insertEvents.find(
      (event) => event.table === chunks && !event.onConflict,
    );
    expect(chunkInsert).toBeDefined();
    const rows = chunkInsert!.rows as { documentId: string; id: string }[];
    expect(rows.length).toBe(result.chunkCount);
    expect(rows.every((row) => row.documentId === result.documentId)).toBe(true);

    expect(deleteDocumentChunks).toHaveBeenCalledWith(result.documentId);
    expect(upsertChunks).toHaveBeenCalled();
    expect(db.transactions).toBe(1);
  });

  it("deletes stale chunks before upserting on re-ingest", async () => {
    const { deps, deleteDocumentChunks } = makeDeps({});
    const input = {
      buffer: Buffer.from("pdf"),
      filename: "guide.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      documentId: "doc-1",
    };

    await ingestPdf(input, deps);

    const deleteCall = deleteDocumentChunks.mock.calls[0];
    expect(deleteCall?.[0]).toBe("doc-1");
  });

  it("marks the document failed and cleans up when embedding fails", async () => {
    const { deps, db, deleteDocumentChunks } = makeDeps({
      embed: vi.fn().mockRejectedValue(new Error("embed outage")),
    });

    await expect(
      ingestPdf(
        { buffer: Buffer.from("pdf"), filename: "guide.pdf", mimeType: "application/pdf", sizeBytes: 100 },
        deps,
      ),
    ).rejects.toMatchObject({ message: "embed outage" });

    const statuses = db.updateValues.map((values) => values.status);
    expect(statuses).toContain(DocumentStatus.Failed);

    const failed = db.updateValues[db.updateValues.length - 1];
    expect(failed?.status).toBe(DocumentStatus.Failed);
    expect(failed?.error).toContain("embed outage");

    expect(deleteDocumentChunks).toHaveBeenCalled();
    expect(db.deleteEvents.length).toBeGreaterThan(0);
  });

  it("rejects PDFs with no extractable text", async () => {
    const { deps } = makeDeps({
      extract: vi.fn().mockResolvedValue({ totalPages: 1, pages: [] }),
    });

    await expect(
      ingestPdf(
        { buffer: Buffer.from("pdf"), filename: "empty.pdf", mimeType: "application/pdf", sizeBytes: 5 },
        deps,
      ),
    ).rejects.toBeInstanceOf(IngestError);
  });

  it("rejects oversized uploads before touching the database", async () => {
    const { deps, db } = makeDeps({});

    await expect(
      ingestPdf(
        { buffer: Buffer.from("pdf"), filename: "big.pdf", mimeType: "application/pdf", sizeBytes: 26 * 1024 * 1024 },
        deps,
      ),
    ).rejects.toBeInstanceOf(IngestError);

    expect(db.insertEvents).toHaveLength(0);
  });

  it("uses deterministic chunk ids so re-ingests stay idempotent", async () => {
    const { deps, upsertChunks } = makeDeps({});
    const input = {
      buffer: Buffer.from("pdf"),
      filename: "guide.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      documentId: "doc-stable",
    };

    await ingestPdf(input, deps);
    const first = (upsertChunks.mock.calls[0]?.[0] ?? []) as {
      chunkId: string;
      chunkIndex: number;
    }[];

    await ingestPdf(input, deps);
    const second = (upsertChunks.mock.calls[1]?.[0] ?? []) as {
      chunkId: string;
      chunkIndex: number;
    }[];

    expect(second.map((v) => v.chunkId)).toEqual(
      first.map((v) => v.chunkId),
    );
    expect(first[0]?.chunkId).toBe(stableChunkId("doc-stable", 0));
  });
});