import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export function getChatModel() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
    streaming: true,
  });
}
