import { AIMessage, AIMessageChunk, type BaseMessageLike, ToolMessage } from "@langchain/core/messages";
import { concat } from "@langchain/core/utils/stream";
import { getChatModel } from "@/lib/agent";
import { getWebSearchTool } from "@/lib/tools/webSearch";

const MAX_TOOL_CALLS = 2;

export type SearchSource = { title: string; url: string };

export type ChatStreamEvent = { type: "token"; text: string } | { type: "sources"; sources: SearchSource[] };

function dedupeSources(sources: SearchSource[]): SearchSource[] {
  const seen = new Set<string>();
  const result: SearchSource[] = [];
  for (const source of sources) {
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    result.push(source);
  }
  return result;
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function* runChatStream(input: BaseMessageLike[] | string): AsyncGenerator<ChatStreamEvent> {
  let tool: ReturnType<typeof getWebSearchTool> | null = null;
  try {
    tool = getWebSearchTool();
  } catch (err) {
    console.error("Web search tool unavailable, continuing without it:", err);
  }

  const baseModel = getChatModel();
  const modelWithTools = tool ? baseModel.bindTools([tool]) : null;

  let messages: BaseMessageLike[] = typeof input === "string" ? [["human", input]] : [...input];
  let toolCallsUsed = 0;
  const allSources: SearchSource[] = [];

  while (true) {
    const canUseTools = Boolean(modelWithTools) && toolCallsUsed < MAX_TOOL_CALLS;
    const model = canUseTools ? modelWithTools! : baseModel;
    const stream = await model.stream(messages);
    let aggregated: AIMessageChunk | undefined;
    const textChunks: string[] = [];

    for await (const chunk of stream) {
      aggregated = aggregated ? concat(aggregated, chunk) : chunk;
      if (chunk.text) {
        textChunks.push(chunk.text);
      }
    }

    const toolCalls = canUseTools ? aggregated?.tool_calls ?? [] : [];
    if (!toolCalls.length) {
      // Final round: only now do we know this text is the real answer, so it's safe to stream.
      for (const text of textChunks) {
        yield { type: "token", text };
      }
      break;
    }

    // Tool-calling round: any narrative text Gemini emitted alongside the tool call (e.g. "Let
    // me check that...") is discarded rather than shown, so it never gets mistaken for the
    // final answer once the grounded response from the next round is appended.
    messages = [...messages, new AIMessage({ content: aggregated!.content, tool_calls: toolCalls })];

    for (const call of toolCalls) {
      if (toolCallsUsed >= MAX_TOOL_CALLS) {
        messages = [...messages, new ToolMessage("Search limit reached for this turn.", call.id ?? "")];
        continue;
      }
      toolCallsUsed++;
      try {
        const result = await tool!.invoke(call.args as { query: string });
        if (result && typeof result === "object" && "error" in result) {
          console.error("Tavily returned an error:", (result as { error: string }).error);
          messages = [...messages, new ToolMessage(`Search failed: ${(result as { error: string }).error}`, call.id ?? "")];
        } else {
          const results = Array.isArray((result as { results?: unknown[] })?.results)
            ? (result as { results: { title?: string; url?: string }[] }).results
            : [];
          for (const r of results) {
            if (r.title && r.url && isSafeHttpUrl(r.url)) allSources.push({ title: r.title, url: r.url });
          }
          messages = [...messages, new ToolMessage(JSON.stringify(result), call.id ?? "")];
        }
      } catch (err) {
        console.error("Tavily search failed:", err);
        messages = [...messages, new ToolMessage("Search failed.", call.id ?? "")];
      }
    }
  }

  if (allSources.length) {
    yield { type: "sources", sources: dedupeSources(allSources) };
  }
}
