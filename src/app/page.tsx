import Link from "next/link";

const steps = [
  {
    step: "01",
    title: "Upload PDFs",
    description:
      "Documents are parsed, chunked, and embedded into a Qdrant vector index.",
  },
  {
    step: "02",
    title: "Ask questions",
    description:
      "Queries are embedded and matched against your documents with vector search.",
  },
  {
    step: "03",
    title: "Cited answers",
    description:
      "An LLM writes an answer over the retrieved context, with sources included.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col px-4 py-16">
      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <p className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          RAG over your documents
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Ask questions about your PDFs and get answers with sources.
        </h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Soli extracts text from the documents you upload, indexes it for
          semantic search, and answers your questions with streaming responses
          backed by citations.
        </p>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Link
            href="/documents"
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Upload documents
          </Link>
          <Link
            href="/chat"
            className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Start a chat
          </Link>
        </div>
      </section>

      <section aria-label="How it works">
        <div className="grid gap-4 border-t border-zinc-200 pt-10 sm:grid-cols-3 dark:border-zinc-800">
          {steps.map(({ step, title, description }) => (
            <div
              key={step}
              className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="font-mono text-xs font-semibold text-zinc-400">
                {step}
              </p>
              <h2 className="mt-2 font-medium">{title}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}