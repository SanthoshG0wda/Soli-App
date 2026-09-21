import { NextResponse } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chunks, documents } from "@/db/schema";
import {
  IngestError,
  ingestPdfProduction as ingestPdf,
  MAX_PDF_BYTES,
} from "@/lib/ingest";

export interface DocumentListItem {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  chunkCount: number;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function GET(): Promise<NextResponse<{ documents: DocumentListItem[] }>> {
  const rows = await db.select().from(documents).orderBy(desc(documents.createdAt));

  const countRows = await db
    .select({ documentId: chunks.documentId, chunkCount: count() })
    .from(chunks)
    .groupBy(chunks.documentId);

  const counts = new Map(countRows.map((row) => [row.documentId, row.chunkCount]));

  const items: DocumentListItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    chunkCount: counts.get(row.id) ?? 0,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return NextResponse.json({ documents: items });
}

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart/form-data upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' in upload." }, { status: 400 });
  }

  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `File too large: max ${MAX_PDF_BYTES} bytes.` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length < 5 || buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "File is not a PDF." }, { status: 400 });
  }

  try {
    const result = await ingestPdf({
      buffer,
      filename: file.name,
      mimeType: file.type || "application/pdf",
      sizeBytes: file.size || buffer.length,
    });

    const [row] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, result.documentId))
      .limit(1);

    return NextResponse.json(
      {
        document: {
          id: result.documentId,
          status: result.status,
          pageCount: result.pageCount,
          chunkCount: result.chunkCount,
          ...(row
            ? {
                title: row.title,
                fileName: row.fileName,
                mimeType: row.mimeType,
                sizeBytes: row.sizeBytes,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
              }
            : { title: "", fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof IngestError) {
      return NextResponse.json(
        { error: error.message, documentId: error.documentId },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: "Ingestion failed unexpectedly." },
      { status: 500 },
    );
  }
}