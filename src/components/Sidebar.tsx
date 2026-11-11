import { PlusIcon } from "./icons";

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export function Sidebar({
  conversations,
  activeId,
  onNewChat,
  onSelect,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onNewChat: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <aside className="hidden w-60 flex-col border-r border-olive/20 bg-rail px-5 py-6 md:flex">
        <span className="font-serif text-xl text-charcoal">MemoPy</span>
        <button
          type="button"
          onClick={onNewChat}
          className="mt-8 inline-flex items-center gap-2 self-start rounded-full border border-olive/20 px-3.5 py-2 text-sm text-charcoal transition-colors hover:border-sage hover:bg-sage/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        >
          <PlusIcon className="h-3.5 w-3.5 text-olive" />
          New chat
        </button>

        <nav className="mt-6 flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-0.5">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage ${
                    conversation.id === activeId
                      ? "bg-sage/15 text-charcoal"
                      : "text-olive hover:bg-sage/10 hover:text-charcoal"
                  }`}
                  title={conversation.title}
                >
                  {conversation.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <header className="flex items-center justify-between border-b border-olive/20 bg-rail px-4 py-3 md:hidden">
        <span className="font-serif text-lg text-charcoal">MemoPy</span>
        <button
          type="button"
          onClick={onNewChat}
          aria-label="New chat"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-olive/20 text-olive transition-colors hover:border-sage hover:text-sage focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </header>
    </>
  );
}
