import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { deleteChat, getChatMessages } from "@/lib/chat/persistence";
import type { StoredChatMessage } from "@/lib/chat/types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ messages: StoredChatMessage[] }>> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ messages: [] });
  }
  const messages = await getChatMessages(id);
  return NextResponse.json({ messages });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing chat id." }, { status: 400 });
  }
  try {
    await deleteChat(id);
  } catch (error) {
    logger.warn("chat deletion failed", {
      chatId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to delete chat." }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}