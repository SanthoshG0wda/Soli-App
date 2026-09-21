// Client-safe conversion from persisted message rows back into UIMessage
// objects so restored conversations render identically to live ones.

import type { ProviderMetadata, UIMessage } from "ai";
import { ChatSource, SOURCES_KIND } from "@/lib/chat/sources";
import type { StoredChatMessage } from "@/lib/chat/types";

function toChatSource(
  citation: NonNullable<StoredChatMessage["citations"]>[number],
  index: number,
): ChatSource {
  return {
    chunkId: citation.chunkId,
    documentId: citation.documentId,
    filename: citation.documentTitle,
    pageNumber: citation.pageNumber ?? null,
    chunkIndex: index,
    score: citation.score,
    excerpt: citation.excerpt,
  };
}

export function storedMessagesToUi(
  stored: StoredChatMessage[],
): UIMessage[] {
  return stored.map((message) => {
    const parts: UIMessage["parts"] = [
      { type: "text", text: message.content },
    ];

    if (message.role === "assistant" && message.citations?.length) {
      const sources = Object.fromEntries(
        message.citations.map((citation, index) => [
          citation.chunkId,
          toChatSource(citation, index),
        ]),
      );
      parts.push({
        type: "custom",
        kind: SOURCES_KIND,
        providerMetadata: { sources } as unknown as ProviderMetadata,
      } as UIMessage["parts"][number]);
    }

    return {
      id: message.id,
      role: message.role,
      metadata: { createdAt: message.createdAt },
      parts,
    };
  });
}