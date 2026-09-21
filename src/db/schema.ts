import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { Citation } from "@/types";

/**
 * Document lifecycle. The column is plain text with a check constraint (not a
 * Postgres enum) so the set of statuses can evolve without enum gymnastics:
 * uploading -> processing -> ready | failed
 */
export const DocumentStatus = {
  Uploading: "uploading",
  Processing: "processing",
  Ready: "ready",
  Failed: "failed",
} as const;

export type DocumentStatusValue = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const messageRole = pgEnum("message_role", ["user", "assistant"]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    pageCount: integer("page_count"),
    status: text("status").notNull().default(DocumentStatus.Uploading),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "documents_status_check",
      sql`${table.status} IN ('uploading', 'processing', 'ready', 'failed')`,
    ),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    pageNumber: integer("page_number"),
    chunkIndex: integer("chunk_index").notNull(),
    charCount: integer("char_count").notNull(),
    charStart: integer("char_start"),
    charEnd: integer("char_end"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("chunks_document_id_idx").on(table.documentId),
    index("chunks_document_chunk_idx").on(
      table.documentId,
      table.chunkIndex,
    ),
  ],
);

export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default("New chat"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations")
      .$type<Citation[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("messages_chat_id_idx").on(table.chatId)],
);