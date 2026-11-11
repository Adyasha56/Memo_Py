import { TavilySearch } from "@langchain/tavily";

export const MAX_SEARCH_RESULTS = 5;

export function getWebSearchTool() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not set");
  }

  return new TavilySearch({
    tavilyApiKey: apiKey,
    maxResults: MAX_SEARCH_RESULTS,
    description:
      "Search the live web for current or recent information: news, events, prices, " +
      "product versions, or any fact that may have changed since the model's training " +
      "cutoff. Do not use this for general programming explanations, basic concepts, " +
      "greetings, or anything answerable from the conversation history or remembered " +
      "facts already provided in context.",
  });
}
