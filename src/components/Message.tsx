"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckIcon, CopyIcon } from "./icons";

export type SourceLink = { title: string; url: string };

export type ChatMessageData = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "streaming" | "error";
  sources?: SourceLink[];
};

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
  h1: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold text-charcoal first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold text-charcoal first:mt-0">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold text-charcoal first:mt-0">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-charcoal">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 marker:text-olive">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 marker:text-olive">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  hr: () => <hr className="my-4 border-olive/20" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-sage underline-offset-2 hover:underline">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-olive/10 px-1 py-0.5 font-mono text-[13px]">{children}</code>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-olive/30 pl-3 text-olive">{children}</blockquote>
  ),
};

export function Message({ message }: { message: ChatMessageData }) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-leaf/25 px-4 py-2.5 text-[15px] leading-relaxed text-charcoal">
          {message.content}
        </p>
      </div>
    );
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access denied by the browser; nothing further to do.
    }
  }

  const isComplete = !message.status && message.content.length > 0;

  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[80%] text-[15px] text-charcoal">
        {message.status === "error" ? (
          <p className="whitespace-pre-wrap leading-relaxed text-olive">{message.content}</p>
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        )}
        {message.status === "streaming" && message.content && (
          <span className="stream-cursor ml-0.5 inline-block h-4 w-[2px] translate-y-[2px] bg-sage" />
        )}
      </div>

      {message.sources && message.sources.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          <span className="text-xs text-olive">Sources</span>
          <ul className="flex flex-wrap gap-2">
            {message.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  title={source.url}
                  className="inline-block max-w-60 truncate rounded-full border border-olive/20 px-3 py-1 text-xs text-charcoal transition-colors hover:border-sage hover:text-sage focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isComplete && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy response"}
          className="mt-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-olive transition-colors hover:text-sage focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        >
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

export function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1" role="status" aria-label="MemoPy is thinking">
      <span className="typing-dot" />
      <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
      <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
    </div>
  );
}
