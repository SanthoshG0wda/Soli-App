// Client-safe, dependency-free types shared across the server/client boundary
// for chat history. Do not import server-only modules here.

import type { Citation } from "@/types";

export interface ChatListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string | null;
  lastMessageAt: string | null;
}

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
  createdAt: string;
}