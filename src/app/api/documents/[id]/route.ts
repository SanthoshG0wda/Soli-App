import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { vectorStore } from "@/lib/vector";
import { logger } from "@/lib/vector/logger";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/documents/[id]">,
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Deleting case files is restricted to admins." },
      { status: 403 },
    );
  }

  // Remove the document (chunks cascade) regardless of vector-store health.
  const [row] = await db
    .delete(documents)
    .where(eq(documents.id, id))
    .returning({ id: documents.id });

  if (!row) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  try {
    await vectorStore.deleteDocumentChunks(id);
  } catch (error) {
    logger.warn("failed to delete document vectors", {
      documentId: id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return new NextResponse(null, { status: 204 });
}