import type { Metadata } from "next";
import { ChatPanel } from "@/components/chat/chat-panel";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Consult",
  description: "Consult Soli about your matter files.",
};

export default async function ChatPage() {
  await requireUser();
  return (
    <main className="flex h-[calc(100dvh-3.5rem)] w-full flex-col bg-soli-bg">
      <ChatPanel />
    </main>
  );
}