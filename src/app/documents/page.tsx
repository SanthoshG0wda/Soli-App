import type { Metadata } from "next";
import { DocumentManager } from "@/components/documents/document-manager";

export const metadata: Metadata = {
  title: "Documents",
  description: "Upload and manage the documents Soli indexes.",
};

export default function DocumentsPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-1 flex-col px-4 py-8">
      <DocumentManager />
    </main>
  );
}