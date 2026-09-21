import "server-only";

import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chats, messages } from "@/db/schema";
import type { Citation } from "@/types";
import type { RagSource } from "@/lib/rag/rag";
import type { ChatListItem, StoredChatMessage } from "@/lib/chat/types";

/**
 * Persists a user question and (asynchronously) the generated answer with its
 * citations. Kept deliberately small and failure-soft: a persistence error
 * must never kill the streaming response.
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

export async function ensureChat(
  question: string,
  chatId?: string,
): Promise<string> {
  if (chatId) return chatId;

  const [chat] = await db
    .insert(chats)
    .values({ title: question.slice(0, 80) || "New chat" })
    .returning({ id: chats.id });
  if (!chat) throw new Error("Failed to create chat");
  return chat.id;
}

async function touchChat(chatId: string): Promise<void> {
  await db
    .update(chats)
    .set({ updatedAt: new Date() })
    .where(eq(chats.id, chatId));
}

export async function persistUserMessage(
  chatId: string,
  question: string,
): Promise<void> {
  await db.insert(messages).values({ chatId, role: "user", content: question });
  await touchChat(chatId);
}

export async function persistAssistantMessage(
  chatId: string,
  answer: string,
  sources: RagSource[],
): Promise<void> {
  await db.insert(messages).values({
    chatId,
    role: "assistant",
    content: answer,
    citations: sources.map(toCitation),
  });
  await touchChat(chatId);
}

export async function deleteChat(chatId: string): Promise<void> {
  await db.delete(chats).where(eq(chats.id, chatId));
}

export async function listChats(): Promise<ChatListItem[]> {
  const rows = await db.select().from(chats).orderBy(desc(chats.updatedAt));
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

export async function getChatMessages(chatId: string): Promise<StoredChatMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    citations: row.citations,
    createdAt: row.createdAt.toISOString(),
  }));
}