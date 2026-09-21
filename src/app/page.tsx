import Link from "next/link";

const practices = [
  {
    step: "01",
    title: "Legal research",
    description:
      "Ask across pleadings, contracts, and exhibits. Soli retrieves the exact passages that answer the question.",
  },
  {
    step: "02",
    title: "Cited answers",
    description:
      "Every answer carries its sources — chunk, page, and file — so you can verify before you rely.",
  },
  {
    step: "03",
    title: "Matter diligence",
    description:
      "Build chronologies, summarize long filings, and pressure-test arguments against your own record.",
  },
];

const assurances = [
  {
    title: "Confidential by design",
    description:
      "Each lawyer gets a private account. Your chats and sessions are stored separately and never shared.",
  },
  {
    title: "Verifiable, not magic",
    description:
      "Soli shows its work with citations to your files. If it cannot ground an answer, it says so.",
  },
  {
    title: "Research aid, not counsel",
    description:
      "Soli accelerates paralegal work. It does not provide legal advice and never replaces your judgment.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col px-4 py-16">
      <section className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <p className="rounded-full border border-soli-accent/40 bg-soli-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-soli-accent">
          AI paralegal assistant
        </p>
        <h1 className="max-w-3xl font-serif text-4xl font-semibold tracking-tight text-zinc-100 sm:text-6xl">
          Counsel, meet your tireless paralegal.
        </h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Soli indexes your matter files — pleadings, contracts, exhibits —
          and answers your questions with streaming responses backed by
          pinpoint citations.
        </p>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Link
            href="/chat"
            className="rounded-lg bg-soli-accent px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-soli-accent/85"
          >
            Open a consultation
          </Link>
          <Link
            href="/documents"
            className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            File case documents
          </Link>
        </div>
      </section>

      <section aria-label="What Soli does">
        <div className="grid gap-4 border-t border-zinc-200 pt-10 sm:grid-cols-3 dark:border-zinc-800">
          {practices.map(({ step, title, description }) => (
            <div
              key={step}
              className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="font-mono text-xs font-semibold text-soli-accent">
                {step}
              </p>
              <h2 className="mt-2 font-serif text-lg font-semibold">
                {title}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Assurances" className="mt-12">
        <div className="rounded-xl border border-soli-accent/25 bg-soli-accent/[0.04] p-6 sm:p-8">
          <h2 className="font-serif text-xl font-semibold">
            Built for the profession
          </h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-3">
            {assurances.map(({ title, description }) => (
              <div key={title}>
                <h3 className="text-sm font-semibold text-zinc-100">
                  {title}
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
