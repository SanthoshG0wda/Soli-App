import type { Metadata } from "next";
import { ChatPanel } from "@/components/chat/chat-panel";

export const metadata: Metadata = {
  title: "Chat",
  description: "Ask questions about your uploaded documents.",
};

export default function ChatPage() {
  return (
    <main className="flex h-[calc(100dvh-3.5rem)] w-full flex-col bg-claude-bg">
      <ChatPanel />
    </main>
  );
}