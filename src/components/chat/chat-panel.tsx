"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ACTIVE_CHAT_KEY } from "@/lib/chat/sources";
import type { ChatListItem, StoredChatMessage } from "@/lib/chat/types";
import { storedMessagesToUi } from "@/lib/chat/history";

interface ReadyDocument {
  id: string;
  title: string;
}

const SUGGESTIONS = [
  "Summarize the key holdings in these filings",
  "Build a chronology of events from the exhibits",
  "What limitation periods could apply here?",
];

function messageTextText(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

// Older answers may contain "[n]" citation markers; strip them so the UI is
// always clean even for previously saved conversations.
function cleanAnswerText(text: string): string {
  return text.replace(/\s*\[\s*\d+\s*\]\s*/g, "");
}

function formatChatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const THINKING_PHRASES = [
  "Reviewing the exhibits…",
  "Checking the authorities…",
  "Consulting the record…",
  "Verifying citations…",
  "Preparing the brief…",
  "Weighing the arguments…",
];

function ThinkingIndicator() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setPhraseIndex((index) => (index + 1) % THINKING_PHRASES.length);
    }, 2200);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-soli-accent" />
        {THINKING_PHRASES[phraseIndex] ?? "Thinking…"}
      </div>
      <p className="text-xs text-zinc-600">
        Soli is a research aid, not legal advice. Verify before you rely.
      </p>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path d="M8 0l1.8 5.2L15 7l-5.2 1.8L8 14l-1.8-5.2L1 7l5.2-1.8L8 0z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M8 3v10M3.5 7.5L8 3l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="8" height="8" rx="1" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.5h11M6 2.5h4M5.5 4.5L6 13h4l.5-8.5M6.5 7v3.5M9.5 7v3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M10 3.5L5.5 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="M6 3.5L10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SIDEBAR_COLLAPSED_KEY = "soli:sidebar-collapsed";
const SIDEBAR_WIDTH_KEY = "soli:sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 288;
const MIN_SIDEBAR_WIDTH = 208;
const MAX_SIDEBAR_WIDTH = 480;

function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
}

function ChatSidebar({
  chats,
  activeChatId,
  busy,
  loading,
  deleteError,
  collapsed,
  onNew,
  onSelect,
  onDelete,
  onToggle,
}: {
  chats: ChatListItem[];
  activeChatId: string | undefined;
  busy: boolean;
  loading: boolean;
  deleteError: string | null;
  collapsed: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onToggle: () => void;
}) {
  // Two-step delete: first click arms the button ("Sure?"), second click
  // within 3s actually deletes. No blocking confirm() dialog, which can be
  // suppressed in embedded browsers and then silently does nothing.
  const [armedId, setArmedId] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, []);

  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  // Load the persisted width after mount (post-hydration) to avoid a
  // server/client HTML mismatch. Intentional one-time sync setState.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarWidth(
      clampSidebarWidth(Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))),
    );
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (clientX: number) => {
      const start = resizeStart.current;
      if (!start) return;
      setSidebarWidth(clampSidebarWidth(start.width + (clientX - start.x)));
    };
    const onMouseMove = (event: MouseEvent) => onMove(event.clientX);
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (touch) onMove(touch.clientX);
    };
    const onStop = () => {
      resizeStart.current = null;
      setResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setSidebarWidth((current) => {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(current));
        return current;
      });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onStop);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onStop);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onStop);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onStop);
    };
  }, [resizing]);

  const startResize = (clientX: number) => {
    resizeStart.current = { x: clientX, width: sidebarWidth };
    setResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const resetSidebarWidth = () => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(DEFAULT_SIDEBAR_WIDTH));
  };

  const handleDeleteClick = (id: string) => {
    if (armTimer.current) clearTimeout(armTimer.current);
    if (armedId === id) {
      setArmedId(null);
      onDelete(id);
      return;
    }
    setArmedId(id);
    armTimer.current = setTimeout(() => setArmedId(null), 3000);
  };

  // Collapsed: a 4px sliver that stays visible and expands on click.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label="Expand sidebar"
        title="Expand sidebar"
        className="hidden w-1 shrink-0 cursor-pointer flex-col items-stretch border-r border-zinc-800/70 bg-soli-nav transition-colors hover:bg-zinc-700/60 md:flex"
      />
    );
  }

  return (
    <aside
      style={{ width: sidebarWidth }}
      className="relative hidden shrink-0 flex-col overflow-hidden border-r border-zinc-800/70 bg-soli-nav md:flex"
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={onNew}
          disabled={busy}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-700/60 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusIcon />
          <span className="truncate">New consultation</span>
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
        >
          <CollapseIcon />
        </button>
      </div>
      {deleteError && (
        <p role="alert" className="px-6 pb-2 text-xs text-red-400">
          {deleteError}
        </p>
      )}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading && chats.length === 0 ? (
          <p className="px-3 py-6 text-sm text-zinc-500">Loading chats…</p>
        ) : chats.length === 0 ? (
          <p className="px-3 py-6 text-sm text-zinc-500">
            No matters yet. Open a consultation to begin.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {chats.map((chat) => {
              const active = chat.id === activeChatId;
              const armed = armedId === chat.id;
              return (
                <li key={chat.id}>
                  <div
                    className={`group flex items-center gap-2 rounded-lg px-3 py-2 ${
                      active
                        ? "bg-zinc-800"
                        : "hover:bg-zinc-800/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(chat.id)}
                      disabled={busy}
                      title={chat.title}
                      className={`min-w-0 flex-1 truncate text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        active
                          ? "text-zinc-100"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {chat.title}
                    </button>
                    <span className="shrink-0 text-[11px] text-zinc-600">
                      {formatChatTime(chat.lastMessageAt ?? chat.updatedAt)}
                    </span>
                    <button
                      type="button"
                      aria-label={
                        armed ? `Confirm delete ${chat.title}` : `Delete ${chat.title}`
                      }
                      title={armed ? "Click again to confirm" : `Delete ${chat.title}`}
                      onClick={() => handleDeleteClick(chat.id)}
                      className={`flex h-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                        armed
                          ? "bg-red-500/20 px-1.5 text-[11px] font-medium text-red-300 hover:bg-red-500/30"
                          : "w-6 text-zinc-600 hover:bg-red-500/15 hover:text-red-400"
                      }`}
                    >
                      {armed ? "Sure?" : <TrashIcon />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        title="Drag to resize · double-click to reset"
        onMouseDown={(event) => {
          event.preventDefault();
          startResize(event.clientX);
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (touch) startResize(touch.clientX);
        }}
        onDoubleClick={resetSidebarWidth}
        className={`absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none ${
          resizing
            ? "bg-soli-accent/70"
            : "bg-transparent hover:bg-soli-accent/50"
        }`}
      />
    </aside>
  );
}

export function ChatPanel() {
  const [input, setInput] = useState("");
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [readyDocs, setReadyDocs] = useState<ReadyDocument[]>([]);
  const [docFilter, setDocFilter] = useState<string>("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chat = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({
        chatId,
        documentIds: docFilter ? [docFilter] : undefined,
      }),
    }),
    onFinish: ({ message }) => {
      const metadata = (message.metadata ?? {}) as { chatId?: string };
      if (typeof metadata.chatId === "string" && metadata.chatId) {
        setChatId(metadata.chatId);
        localStorage.setItem(ACTIVE_CHAT_KEY, metadata.chatId);
        void refreshChats();
      }
    },
  });

  // useChat re-creates its returned object every render, but chat.setMessages is
  // referentially stable (memoized by useChat on the chat key). Keep one stable
  // handle so effects and callbacks never depend on the mutable `chat` object.
  const setMessagesRef = useRef(chat.setMessages);

  const refreshChats = useCallback(async () => {
    try {
      const response = await fetch("/api/chat");
      const data = (await response.json()) as { chats?: ChatListItem[] };
      setChats(data.chats ?? []);
    } catch {
      // Sidebar refresh is best-effort.
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "0" : "1");
      return !collapsed;
    });
  }, []);

  const streaming = chat.status === "submitted" || chat.status === "streaming";

  const scopedDocTitle = docFilter
    ? (readyDocs.find((doc) => doc.id === docFilter)?.title ?? "Selected document")
    : null;

  const activateChat = useCallback(
    async (id: string) => {
      if (streaming) return;
      setChatsLoading(true);
      try {
        const response = await fetch(`/api/chat/${id}`);
        const data = (await response.json()) as { messages?: StoredChatMessage[] };
        setMessagesRef.current(storedMessagesToUi(data.messages ?? []));
        setChatId(id);
        localStorage.setItem(ACTIVE_CHAT_KEY, id);
        setDocFilter("");
      } finally {
        setChatsLoading(false);
      }
    },
    [streaming],
  );

  const startNewChat = useCallback(() => {
    if (streaming) return;
    setMessagesRef.current([]);
    setChatId(undefined);
    localStorage.removeItem(ACTIVE_CHAT_KEY);
    setDocFilter("");
  }, [streaming]);

  const deleteChatById = useCallback(
    async (id: string) => {
      setDeleteError(null);
      try {
        const response = await fetch(`/api/chat/${id}`, { method: "DELETE" });
        if (!response.ok) {
          throw new Error(`delete failed with status ${response.status}`);
        }
      } catch {
        setDeleteError("Could not delete that chat. Please try again.");
        return;
      }
      void refreshChats();
      if (chatId === id) startNewChat();
    },
    [chatId, refreshChats, startNewChat],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let docs: { id: string; title: string }[] = [];
      let list: ChatListItem[] = [];
      try {
        const docResponse = await fetch("/api/documents");
        const docData = (await docResponse.json()) as {
          documents?: { id: string; title: string; status: string }[];
        };
        docs = (docData.documents ?? [])
          .filter((doc) => doc.status === "ready")
          .map((doc) => ({ id: doc.id, title: doc.title }));
      } catch {
        // Documents are optional context; ignore failures here.
      }
      try {
        const chatResponse = await fetch("/api/chat");
        const chatData = (await chatResponse.json()) as { chats?: ChatListItem[] };
        list = chatData.chats ?? [];
      } catch {
        // Chat list failure leaves the sidebar empty.
      }
      if (cancelled) return;
      setReadyDocs(docs);
      setChats(list);
      setChatsLoading(false);
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");

      const storedId = localStorage.getItem(ACTIVE_CHAT_KEY);
      const hasStored = storedId && list.some((item) => item.id === storedId);
      if (!hasStored) return;
      try {
        const response = await fetch(`/api/chat/${storedId}`);
        const data = (await response.json()) as { messages?: StoredChatMessage[] };
        if (!cancelled) {
          setMessagesRef.current(storedMessagesToUi(data.messages ?? []));
          setChatId(storedId as string);
        }
      } catch {
        // Fall back to a fresh chat when history cannot be loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.messages, chat.status]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    void chat.sendMessage({ text });
  };

  const sendSuggestion = (text: string) => {
    if (streaming) return;
    setInput("");
    void chat.sendMessage({ text });
  };

  return (
    <section className="flex min-h-0 w-full flex-1">
      <ChatSidebar
        chats={chats}
        activeChatId={chatId}
        busy={streaming}
        loading={chatsLoading}
        deleteError={deleteError}
        collapsed={sidebarCollapsed}
        onNew={startNewChat}
        onSelect={(id) => void activateChat(id)}
        onDelete={(id) => void deleteChatById(id)}
        onToggle={toggleSidebar}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800/70 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {sidebarCollapsed && (
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Expand sidebar"
                title="Expand sidebar"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
              >
                <ExpandIcon />
              </button>
            )}
            {scopedDocTitle ? (
            <span className="truncate text-sm font-medium text-zinc-300">
              Scoped to “{scopedDocTitle}”
            </span>
          ) : (
            <span className="truncate text-sm font-medium text-zinc-300">
              Consultation
            </span>
          )}
          </div>
          </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
            {chat.messages.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <span className="mb-3 text-soli-accent">
                  <SparkIcon />
                </span>
                <h2 className="font-serif text-xl font-semibold text-zinc-100">
                  Good day — I&apos;m Soli
                </h2>
                <p className="mt-1 max-w-sm text-sm text-zinc-500">
                  Your AI paralegal. Ask about your matter files, or start
                  with an example below.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => sendSuggestion(suggestion)}
                      disabled={streaming}
                      className="rounded-full border border-zinc-700/70 px-3.5 py-1.5 text-sm text-zinc-300 transition-colors hover:border-soli-accent/60 hover:bg-zinc-800/50 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.messages.map((message, index) => {
                const isUser = message.role === "user";
                if (isUser) {
                  return (
                    <div key={message.id ?? index} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-soli-muted px-4 py-2.5 text-sm text-zinc-100">
                        {messageTextText(message)}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={message.id ?? index}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-soli-accent">
                        <SparkIcon />
                      </span>
                      <span className="text-xs font-medium text-zinc-400">
                        Soli
                      </span>
                    </div>
                    <div className="markdown-body text-[15px] leading-7 text-zinc-200">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => (
                            <p className="my-3 first:mt-0 last:mb-0">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="my-3 list-disc space-y-1 pl-6">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="my-3 list-decimal space-y-1 pl-6">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => <li>{children}</li>,
                          strong: ({ children }) => (
                            <strong className="font-semibold text-zinc-100">
                              {children}
                            </strong>
                          ),
                          em: ({ children }) => (
                            <em className="italic">{children}</em>
                          ),
                          h1: ({ children }) => (
                            <h1 className="mt-6 mb-3 text-xl font-semibold text-zinc-100 first:mt-0">
                              {children}
                            </h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="mt-6 mb-3 text-lg font-semibold text-zinc-100 first:mt-0">
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="mt-5 mb-2 text-base font-semibold text-zinc-100 first:mt-0">
                              {children}
                            </h3>
                          ),
                          code: ({ children }) => (
                            <code className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[13px] text-zinc-100">
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre className="my-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 text-[13px] leading-6">
                              {children}
                            </pre>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="my-3 border-l-2 border-zinc-700 pl-4 text-zinc-400">
                              {children}
                            </blockquote>
                          ),
                          a: ({ children, href }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-soli-accent underline"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {cleanAnswerText(messageTextText(message))}
                      </ReactMarkdown>
                    </div>
                  </div>
                );
              })
            )}

            {streaming && <ThinkingIndicator />}

            {chat.error && (
              <p
                role="alert"
                className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300"
              >
                {chat.error.message}
              </p>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <div className="px-4 pb-4 md:px-6">
          <div className="mx-auto w-full max-w-2xl">
            <form onSubmit={submit}>
              <div className="flex flex-col rounded-2xl border border-zinc-700/70 bg-soli-panel shadow-lg shadow-black/30 transition-colors focus-within:border-zinc-500">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      (
                        event.currentTarget.form as HTMLFormElement | null
                      )?.requestSubmit();
                    }
                  }}
                  rows={1}
                  placeholder="Ask about your matter files…"
                  disabled={streaming}
                  className="w-full resize-none bg-transparent px-4 pt-3.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="flex items-center justify-end px-3 pb-2.5">
                  {streaming ? (
                    <button
                      type="button"
                      onClick={chat.stop}
                      aria-label="Stop generating"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-soli-accent text-white transition-colors hover:bg-soli-accent/85"
                    >
                      <StopIcon />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      aria-label="Send message"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-zinc-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <SendIcon />
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}