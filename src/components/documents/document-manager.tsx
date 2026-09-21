"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ManagedDocument {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  chunkCount: number;
  status: "uploading" | "processing" | "ready" | "failed";
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

const ACTIVE_STATUSES = new Set(["uploading", "processing"]);

const POLL_INTERVAL_MS = 1500;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_STYLES: Record<ManagedDocument["status"], string> = {
  uploading: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_LABELS: Record<ManagedDocument["status"], string> = {
  uploading: "Uploading",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export function DocumentManager() {
  const [documents, setDocuments] = useState<ManagedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const listDocuments = useCallback(async () => {
    try {
      const response = await fetch("/api/documents");
      if (!response.ok) throw new Error(`Failed to load documents (${response.status})`);
      const data = (await response.json()) as { documents: ManagedDocument[] };
      setDocuments(data.documents);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/documents")
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load documents (${response.status})`);
        return response.json() as Promise<{ documents: ManagedDocument[] }>;
      })
      .then((data) => {
        if (!cancelled) setDocuments(data.documents);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Failed to load documents.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!documents.some((doc) => ACTIVE_STATUSES.has(doc.status))) return;
    const timer = setInterval(() => {
      void listDocuments();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [documents, listDocuments]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadName(file.name);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/documents", {
        method: "POST",
        body,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? `Upload failed (${response.status})`);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      await listDocuments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadName(null);
    }
  };

  const deleteDocument = async (doc: ManagedDocument) => {
    if (!confirm(`Strike "${doc.title}" from the record and remove it from the index?`)) return;
    const previous = documents;
    setDocuments((docs) => docs.filter((d) => d.id !== doc.id));
    try {
      const response = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Delete failed (${response.status})`);
      }
    } catch (cause) {
      setDocuments(previous);
      setError(cause instanceof Error ? cause.message : "Delete failed.");
    }
  };

  const hasActive = documents.some((doc) => ACTIVE_STATUSES.has(doc.status));

  return (
    <section className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Case files
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Upload pleadings, contracts, and exhibits to index and query.
        </p>
      </div>

      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white p-12 text-center transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 ${
          uploading ? "cursor-wait opacity-70" : ""
        }`}
      >
        <span className="text-sm font-medium">
          {uploading ? `Filing ${uploadName}…` : "File a matter document (PDF)"}
        </span>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {uploading
            ? "Extracting text and preparing citations."
            : "Click to choose a PDF from the matter file."}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          disabled={uploading}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                File
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Passages
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Filed
              </th>
              <th scope="col" className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400"
                >
                  Loading case files…
                </td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400"
                >
                  No case files yet
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr
                  key={doc.id}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800/60"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{doc.title}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {doc.fileName} · {formatBytes(doc.sizeBytes)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      title={doc.status === "failed" && doc.error ? doc.error : undefined}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[doc.status]}`}
                    >
                      {doc.status === "processing" && (
                        <span
                          aria-hidden
                          className="h-2 w-2 animate-pulse rounded-full bg-current"
                        />
                      )}
                      {STATUS_LABELS[doc.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                    {doc.status === "ready"
                      ? doc.chunkCount
                      : doc.pageCount !== null
                        ? `${doc.pageCount} pages`
                        : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {formatTime(doc.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void deleteDocument(doc)}
                      disabled={ACTIVE_STATUSES.has(doc.status)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasActive && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Indexing in progress — this list refreshes automatically.
        </p>
      )}
    </section>
  );
}