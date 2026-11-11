import type { BaseMessageLike } from "@langchain/core/messages";
import { runChatStream, type ChatStreamEvent, type SearchSource } from "@/lib/chatStream";
import { extractAndStoreMemories, retrieveRelevantMemories } from "@/lib/memory";
import { prisma } from "@/lib/prisma";
import { getTemporalContext } from "@/lib/temporal";

// Multi-round tool-calling (Gemini + up to 2 Tavily searches) can legitimately take 15-20+
// seconds; raise the serverless function's timeout above Vercel's default so a genuine
// in-progress response isn't killed mid-stream. 60s is the max allowed on the Hobby tier.
export const maxDuration = 60;

const TITLE_MAX_LENGTH = 60;

function deriveTitle(message: string): string {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (normalized.length <= TITLE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    return Response.json(
      { error: '"message" is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  const conversationIdInput = (body as { conversationId?: unknown } | null)?.conversationId;
  // The frontend always sends this field; it's `null` (not omitted) for a brand-new
  // conversation, since that's what JSON.stringify produces for a null-valued key.
  if (
    conversationIdInput !== undefined &&
    conversationIdInput !== null &&
    typeof conversationIdInput !== "string"
  ) {
    return Response.json({ error: '"conversationId" must be a string' }, { status: 400 });
  }

  let conversationId: string;
  let userMessageId: string;
  try {
    if (conversationIdInput) {
      const existing = await prisma.conversation.findUnique({
        where: { id: conversationIdInput },
        select: { id: true },
      });
      if (!existing) {
        return Response.json({ error: "Conversation not found" }, { status: 404 });
      }
      conversationId = existing.id;
      const updated = await prisma.conversation.update({
        where: { id: conversationId },
        // A nested relation create alone doesn't trigger @updatedAt; set it explicitly.
        data: { updatedAt: new Date(), messages: { create: { role: "user", content: message } } },
        select: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } } },
      });
      userMessageId = updated.messages[0].id;
    } else {
      const conversation = await prisma.conversation.create({
        data: {
          title: deriveTitle(message),
          messages: { create: { role: "user", content: message } },
        },
        select: { id: true, messages: { select: { id: true } } },
      });
      conversationId = conversation.id;
      userMessageId = conversation.messages[0].id;
    }
  } catch (err) {
    console.error("Failed to save user message:", err);
    return Response.json({ error: "Failed to save your message" }, { status: 500 });
  }

  const relevantMemories = await retrieveRelevantMemories(message, 5);
  const temporalContext = await getTemporalContext(message);

  const systemBlocks: string[] = [];
  if (relevantMemories.length) {
    systemBlocks.push(
      `Relevant information remembered about the user:\n${relevantMemories
        .map((m) => `- ${m.content}`)
        .join("\n")}\n\nUse this information only if it's relevant to the user's current message. Never invent facts beyond what's listed here or stated in the conversation.`
    );
  }
  if (temporalContext) {
    systemBlocks.push(
      `${temporalContext}\n\nThis is historical conversation content, separate from the user's current message below. Use it only to answer questions about past conversations or time references. If nothing relevant is found in this history, say so clearly rather than guessing.`
    );
  }

  // Gemini only accepts a single system message, so multiple context blocks are joined into one
  // rather than passed as separate system-role turns.
  const input: BaseMessageLike[] | string = systemBlocks.length
    ? [["system", systemBlocks.join("\n\n---\n\n")], ["human", message]]
    : message;

  let generator: AsyncGenerator<ChatStreamEvent>;
  let firstEvent: ChatStreamEvent | undefined;
  try {
    generator = runChatStream(input);
    const first = await generator.next();
    if (!first.done) {
      firstEvent = first.value;
    }
  } catch (err) {
    console.error("Gemini request failed:", err);
    const configError = err instanceof Error && err.message === "GOOGLE_API_KEY is not set";
    return Response.json(
      { error: configError ? "Server is not configured correctly" : "Failed to get a response from Gemini" },
      { status: configError ? 500 : 502 }
    );
  }

  const encoder = new TextEncoder();
  let fullText = "";
  let sources: SearchSource[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        let event: ChatStreamEvent | undefined;
        if (firstEvent !== undefined) {
          event = firstEvent;
          firstEvent = undefined;
        } else {
          const next = await generator.next();
          if (next.done) {
            if (fullText) {
              try {
                await prisma.conversation.update({
                  where: { id: conversationId },
                  data: {
                    updatedAt: new Date(),
                    messages: {
                      create: {
                        role: "assistant",
                        content: fullText,
                        metadata: sources.length ? { sources } : undefined,
                      },
                    },
                  },
                });
              } catch (err) {
                console.error("Failed to save assistant message:", err);
              }

              await extractAndStoreMemories({
                userMessage: message,
                assistantMessage: fullText,
                sourceMessageId: userMessageId,
              });
            }
            controller.enqueue(encoder.encode(sseEvent("done", {})));
            controller.close();
            return;
          }
          event = next.value;
        }

        if (event.type === "token") {
          fullText += event.text;
          controller.enqueue(encoder.encode(sseEvent("token", { text: event.text })));
        } else if (event.type === "sources") {
          sources = event.sources;
          controller.enqueue(encoder.encode(sseEvent("sources", { sources: event.sources })));
        }
      } catch (err) {
        console.error("Gemini streaming error:", err);
        // Emit a structured error event and close normally rather than controller.error(),
        // so the client gets a clean SSE event instead of an abrupt transport-level failure.
        // The incomplete response is never persisted (the save only happens in the done branch).
        controller.enqueue(
          encoder.encode(sseEvent("error", { message: "The response was interrupted. Please try again." }))
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Conversation-Id": conversationId,
    },
  });
}
