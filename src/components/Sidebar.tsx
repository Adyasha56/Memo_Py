"use client";

import { useState } from "react";
import { MoonIcon, PanelToggleIcon, PlusIcon, SunIcon, TrashIcon } from "./icons";

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export function Sidebar({
  conversations,
  activeId,
  theme,
  onNewChat,
  onSelect,
  onDelete,
  onToggleTheme,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  theme: "light" | "dark";
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleTheme: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  function handleDelete(e: React.MouseEvent, id: string, title: string) {
    e.stopPropagation();
    setPendingDelete({ id, title });
  }

  function confirmDelete() {
    if (pendingDelete) onDelete(pendingDelete.id);
    setPendingDelete(null);
  }

  return (
    <>
      <aside
        className={`hidden flex-col border-r border-olive/20 bg-rail py-5 transition-[width] duration-150 md:flex ${
          collapsed ? "w-16 px-2" : "w-60 px-5"
        }`}
      >
        <div className={`flex items-center ${collapsed ? "flex-col gap-3" : "justify-between"}`}>
          {!collapsed && <span className="font-serif text-xl text-charcoal">MemoPy</span>}
          <div className={`flex items-center ${collapsed ? "flex-col gap-3" : "gap-1"}`}>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              suppressHydrationWarning
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-olive transition-colors hover:bg-sage/10 hover:text-sage focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
            >
              {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-olive transition-colors hover:bg-sage/10 hover:text-sage focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
            >
              <PanelToggleIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewChat}
          title="New chat"
          className={`mt-6 inline-flex items-center gap-2 rounded-full border border-olive/20 text-sm text-charcoal transition-colors hover:border-sage hover:bg-sage/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage ${
            collapsed ? "h-8 w-8 justify-center self-center" : "self-start px-3.5 py-2"
          }`}
        >
          <PlusIcon className="h-3.5 w-3.5 flex-shrink-0 text-olive" />
          {!collapsed && "New chat"}
        </button>

        {!collapsed && (
          <nav className="mt-6 flex-1 overflow-y-auto">
            <ul className="flex flex-col gap-0.5">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={`block w-full truncate rounded-lg py-2 pl-3 pr-8 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage ${
                      conversation.id === activeId
                        ? "bg-sage/15 text-charcoal"
                        : "text-olive hover:bg-sage/10 hover:text-charcoal"
                    }`}
                    title={conversation.title}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, conversation.id, conversation.title)}
                    aria-label={`Delete "${conversation.title}"`}
                    className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-olive opacity-0 transition-opacity hover:text-sage focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage group-hover:opacity-100"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </aside>

      <header className="flex items-center justify-between border-b border-olive/20 bg-rail px-4 py-3 md:hidden">
        <span className="font-serif text-lg text-charcoal">MemoPy</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            suppressHydrationWarning
            className="flex h-8 w-8 items-center justify-center rounded-full border border-olive/20 text-olive transition-colors hover:border-sage hover:text-sage focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
          >
            {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onNewChat}
            aria-label="New chat"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-olive/20 text-olive transition-colors hover:border-sage hover:text-sage focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
            className="w-full max-w-sm rounded-2xl border border-olive/20 bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-chat-title" className="font-serif text-lg text-charcoal">
              Delete this chat?
            </h2>
            <p className="mt-2 truncate text-sm text-olive" title={pendingDelete.title}>
              {pendingDelete.title}
            </p>
            <p className="mt-1 text-sm text-olive">This can&rsquo;t be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                autoFocus
                className="rounded-full px-4 py-2 text-sm text-charcoal transition-colors hover:bg-olive/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-full bg-sage px-4 py-2 text-sm text-mist transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
