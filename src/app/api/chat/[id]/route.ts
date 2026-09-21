import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getSessionUser } from "@/lib/auth";
import { deleteChat, getChatMessages } from "@/lib/chat/persistence";
import type { StoredChatMessage } from "@/lib/chat/types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ messages: StoredChatMessage[] } | { error: string }>> {
  const { id } = await context.params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!id) {
    return NextResponse.json({ messages: [] });
  }
  const messages = await getChatMessages(id, user.id);
  return NextResponse.json({ messages });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!id) {
    return NextResponse.json({ error: "Missing chat id." }, { status: 400 });
  }
  try {
    const deleted = await deleteChat(id, user.id);
    if (!deleted) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }
  } catch (error) {
    logger.warn("chat deletion failed", {
      chatId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to delete chat." }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}