import { AIMessageChunk } from "@langchain/core/messages";
import { getChatModel } from "@/lib/agent";

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

  let iterator: AsyncIterator<AIMessageChunk>;
  let firstChunk: AIMessageChunk | undefined;
  try {
    const model = getChatModel();
    const stream = await model.stream(message);
    iterator = stream[Symbol.asyncIterator]();

    const first = await iterator.next();
    if (!first.done) {
      firstChunk = first.value;
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
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (firstChunk !== undefined) {
          const chunk = firstChunk;
          firstChunk = undefined;
          if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
          return;
        }

        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        if (value.text) controller.enqueue(encoder.encode(value.text));
      } catch (err) {
        console.error("Gemini streaming error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
