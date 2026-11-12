"use client";

import { useEffect, useRef, useState } from "react";
import { Sidebar, type ConversationSummary } from "@/components/Sidebar";
import { EmptyState } from "@/components/EmptyState";
import { Composer } from "@/components/Composer";
import { Message, TypingDots, type ChatMessageData, type SourceLink } from "@/components/Message";

const FALLBACK_ERROR = "Something went wrong. Please try again.";

type StoredMessage = {
  id: string;
  role: string;
  content: string;
  metadata?: { sources?: SourceLink[] } | null;
};

type SSEFrame = { event: string; data: unknown };

// crypto.randomUUID() throws outside a secure context (https, or exactly "localhost") — e.g.
// when the app is opened via a LAN IP over plain http. These ids are only ever used as local
// React keys, so a simple fallback is fine; it doesn't need to be cryptographically unique.
function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through to the fallback below
    }
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function extractSSEFrames(buffer: string): { frames: SSEFrame[]; rest: string } {
  const frames: SSEFrame[] = [];
  let rest = buffer;
  let separatorIndex: number;

  while ((separatorIndex = rest.indexOf("\n\n")) !== -1) {
    const rawFrame = rest.slice(0, separatorIndex);
    rest = rest.slice(separatorIndex + 2);

    let eventType = "message";
    let dataLine = "";
    for (const line of rawFrame.split("\n")) {
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
    }
    if (!dataLine) continue;

    try {
      frames.push({ event: eventType, data: JSON.parse(dataLine) });
    } catch {
      // Malformed frame; skip it rather than crashing the whole stream.
    }
  }

  return { frames, rest };
}

export default function Home() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  // Lazy initializer (not an effect) so the client's first render already reflects the
  // persisted preference, matching what the blocking <head> script in layout.tsx already
  // applied to the DOM before paint.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "dark" || stored === "light") return stored;
    } catch {
      // localStorage unavailable (private browsing, etc.) — default theme stands.
    }
    return "light";
  });
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshConversations();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // Not persisted this session; no functional impact.
    }
  }, [theme]);

  function handleToggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function refreshConversations() {
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch {
      // Sidebar list is a convenience; a failed refresh isn't worth surfacing an error for.
    }
  }

  async function handleSelectConversation(id: string) {
    if (id === conversationId) return;
    setIsLoadingConversation(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error("Failed to load conversation");
      const data = await res.json();
      const loaded: ChatMessageData[] = (data.conversation.messages as StoredMessage[]).map((m) => ({
        id: m.id,
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
        sources: m.metadata?.sources,
      }));
      setConversationId(id);
      setMessages(loaded);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingConversation(false);
    }
  }

  async function handleSend(text: string) {
    const assistantId = generateId();
    setMessages((prev) => [
      ...prev,
      { id: generateId(), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "", status: "streaming" },
    ]);
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? FALLBACK_ERROR);
      }

      const newConversationId = res.headers.get("X-Conversation-Id");
      const isNewConversation = newConversationId && newConversationId !== conversationId;
      if (isNewConversation) {
        setConversationId(newConversationId);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const { frames, rest } = extractSSEFrames(buffer);
        buffer = rest;

        for (const frame of frames) {
          if (frame.event === "token" && typeof (frame.data as { text?: unknown }).text === "string") {
            const { text } = frame.data as { text: string };
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + text } : m))
            );
          } else if (frame.event === "sources" && Array.isArray((frame.data as { sources?: unknown }).sources)) {
            const { sources } = frame.data as { sources: SourceLink[] };
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, sources } : m)));
          } else if (frame.event === "error" && typeof (frame.data as { message?: unknown }).message === "string") {
            streamError = (frame.data as { message: string }).message;
          }
        }
      }

      if (streamError) {
        const message = streamError;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content ? `${m.content}\n\n${message}` : message, status: "error" }
              : m
          )
        );
      } else {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, status: undefined } : m)));
      }
      refreshConversations();
    } catch (err) {
      const errorText = err instanceof Error ? err.message : FALLBACK_ERROR;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: m.content ? `${m.content}\n\n${errorText}` : errorText, status: "error" }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function handleNewChat() {
    setConversationId(null);
    setMessages([]);
  }

  async function handleDeleteConversation(id: string) {
    const previous = conversations;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) {
      setConversationId(null);
      setMessages([]);
    }

    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete conversation");
    } catch (err) {
      console.error(err);
      setConversations(previous);
    }
  }

  return (
    <div className="flex h-full flex-1 flex-col md:flex-row">
      <Sidebar
        conversations={conversations}
        activeId={conversationId}
        theme={theme}
        onNewChat={handleNewChat}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
        onToggleTheme={handleToggleTheme}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {isLoadingConversation ? (
            <div className="flex h-full items-center justify-center text-sm text-olive">
              Loading conversation…
            </div>
          ) : messages.length === 0 ? (
            <EmptyState onPick={handleSend} />
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-4">
              {messages.map((m) =>
                m.role === "assistant" && m.status === "streaming" && m.content === "" ? (
                  <TypingDots key={m.id} />
                ) : (
                  <Message key={m.id} message={m} />
                )
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-olive/15 px-3 py-3">
          <div className="mx-auto max-w-2xl">
            <Composer disabled={isStreaming} onSend={handleSend} />
          </div>
        </div>
      </div>
    </div>
  );
}
