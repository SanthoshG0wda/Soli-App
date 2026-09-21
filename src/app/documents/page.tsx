import type { Metadata } from "next";
import { DocumentManager } from "@/components/documents/document-manager";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Case files",
  description: "Upload and manage the matter files Soli indexes.",
};

export default async function DocumentsPage() {
  await requireUser();
  return (
    <main className="mx-auto flex max-w-4xl flex-1 flex-col px-4 py-8">
      <DocumentManager />
    </main>
  );
}