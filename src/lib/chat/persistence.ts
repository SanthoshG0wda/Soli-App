import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chats, messages } from "@/db/schema";
import type { Citation } from "@/types";
import type { RagSource } from "@/lib/rag/rag";
import type { ChatListItem, StoredChatMessage } from "@/lib/chat/types";

/**
 * Persists a user question and (asynchronously) the generated answer with its
 * citations. Kept deliberately small and failure-soft: a persistence error
 * must never kill the streaming response.
 *
 * Every read and write is scoped to the owning user so chats are strictly
 * per-user. Chats created before auth existed have no owner and are
 * invisible to everyone.
 */

export function toCitation(source: RagSource): Citation {
  return {
    chunkId: source.chunkId,
    documentId: source.documentId,
    documentTitle: source.filename,
    pageNumber: source.pageNumber ?? null,
    excerpt: source.excerpt,
    score: source.score,
  };
}

export async function chatBelongsToUser(
  chatId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1);
  return !!row;
}

async function assertChatOwned(chatId: string, userId: string): Promise<void> {
  const owned = await chatBelongsToUser(chatId, userId);
  if (!owned) {
    throw new Error("Chat not found");
  }
}

export async function ensureChat(
  question: string,
  userId: string,
  chatId?: string,
): Promise<string> {
  if (chatId) {
    await assertChatOwned(chatId, userId);
    return chatId;
  }

  const [chat] = await db
    .insert(chats)
    .values({ userId, title: question.slice(0, 80) || "New consultation" })
    .returning({ id: chats.id });
  if (!chat) throw new Error("Failed to create chat");
  return chat.id;
}

async function touchChat(chatId: string, userId: string): Promise<void> {
  await db
    .update(chats)
    .set({ updatedAt: new Date() })
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)));
}

export async function persistUserMessage(
  chatId: string,
  userId: string,
  question: string,
): Promise<void> {
  await assertChatOwned(chatId, userId);
  await db.insert(messages).values({ chatId, role: "user", content: question });
  await touchChat(chatId, userId);
}

export async function persistAssistantMessage(
  chatId: string,
  userId: string,
  answer: string,
  sources: RagSource[],
): Promise<void> {
  await assertChatOwned(chatId, userId);
  await db.insert(messages).values({
    chatId,
    role: "assistant",
    content: answer,
    citations: sources.map(toCitation),
  });
  await touchChat(chatId, userId);
}

export async function deleteChat(
  chatId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .delete(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .returning({ id: chats.id });
  return !!row;
}

export async function listChats(userId: string): Promise<ChatListItem[]> {
  const rows = await db
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt));
  if (rows.length === 0) return [];

  const messageRows = await db
    .select({
      chatId: messages.chatId,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.chatId, rows.map((row) => row.id)))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  const byChat = new Map<string, { content: string; createdAt: Date }[]>();
  for (const row of messageRows) {
    const bucket = byChat.get(row.chatId) ?? [];
    bucket.push({ content: row.content, createdAt: row.createdAt });
    byChat.set(row.chatId, bucket);
  }

  return rows.map((row) => {
    const history = byChat.get(row.id) ?? [];
    const latest = history[history.length - 1];
    return {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      messageCount: history.length,
      preview: latest?.content ?? null,
      lastMessageAt: latest ? latest.createdAt.toISOString() : null,
    };
  });
}

export async function getChatMessages(
  chatId: string,
  userId: string,
): Promise<StoredChatMessage[]> {
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      citations: messages.citations,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(eq(messages.chatId, chatId), eq(chats.userId, userId)))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    citations: row.citations,
    createdAt: row.createdAt.toISOString(),
  }));
}
