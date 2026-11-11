const PROMPTS = [
  "Explain how pgvector finds similar text",
  "Draft a README outline for a side project",
  "What's a clean way to debounce a search input?",
  "Summarize the tradeoffs of REST vs GraphQL",
];

export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <h1 className="font-serif text-3xl text-charcoal sm:text-4xl">Ask me anything</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-olive">
        Start a conversation below, or try one of these.
      </p>
      <div className="mt-8 flex max-w-xl flex-wrap justify-center gap-2">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="rounded-full border border-olive/20 px-4 py-2 text-sm text-charcoal transition-colors hover:border-sage hover:bg-sage/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
