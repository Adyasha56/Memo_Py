import { z } from "zod";
import { getChatModel } from "@/lib/agent";
import { createMemoryWithEmbedding, embedText, toVectorLiteral } from "@/lib/embeddings";
import { prisma } from "@/lib/prisma";

// Cosine distance from pgvector's `<=>` operator: 0 = identical, 1 = unrelated, 2 = opposite.
// Only memories at or below this distance are considered relevant enough to inject as context.
// The single place to tune retrieval strictness.
const SIMILARITY_DISTANCE_THRESHOLD = 0.5;

const MEMORY_CATEGORIES = ["preference", "project", "decision", "skill", "goal", "fact"] as const;

const ExtractionSchema = z.object({
  memories: z.array(
    z.object({
      content: z.string().min(1).max(300),
      category: z.enum(MEMORY_CATEGORIES),
      importance: z.number().int().min(1).max(5),
    })
  ),
});

const EXISTING_MEMORIES_LIMIT = 30;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

const EXTRACTION_PROMPT = (existingList: string, userMessage: string, assistantMessage: string) => `You extract durable, long-term facts about the USER from a single conversation turn.

Only extract information worth remembering weeks from now: stated preferences, ongoing projects, technical skills, important decisions, or recurring goals.

Do not extract:
- Greetings or small talk
- Generic factual questions or answers that aren't about the user
- Temporary or one-off details
- Anything already known (see list below)

Already known about the user:
${existingList}

Conversation turn:
User: ${userMessage}
Assistant: ${assistantMessage}

Return only genuinely new, durable information. If there is nothing worth remembering, return an empty memories array.`;

export async function extractAndStoreMemories({
  userMessage,
  assistantMessage,
  sourceMessageId,
}: {
  userMessage: string;
  assistantMessage: string;
  sourceMessageId: string;
}): Promise<void> {
  try {
    const existing = await prisma.memory.findMany({
      orderBy: { createdAt: "desc" },
      take: EXISTING_MEMORIES_LIMIT,
      select: { content: true },
    });

    const existingList = existing.length ? existing.map((m) => `- ${m.content}`).join("\n") : "(none yet)";

    const model = getChatModel().withStructuredOutput(ExtractionSchema);
    const result = await model.invoke(EXTRACTION_PROMPT(existingList, userMessage, assistantMessage));

    if (!result.memories.length) return;

    const existingNormalized = new Set(existing.map((m) => normalize(m.content)));
    const toCreate = result.memories.filter((m) => !existingNormalized.has(normalize(m.content)));

    if (!toCreate.length) return;

    for (const memory of toCreate) {
      try {
        const embedding = await embedText(memory.content);
        await createMemoryWithEmbedding({
          content: memory.content,
          category: memory.category,
          importance: memory.importance,
          sourceMessageId,
          embedding,
        });
      } catch (err) {
        // No embedding means no durable record: skip this memory rather than storing it
        // without one. It simply gets re-extracted on a future turn if still relevant.
        console.error("Failed to embed/store new memory, skipping:", memory.content, err);
      }
    }
  } catch (err) {
    console.error("Memory extraction failed (non-fatal):", err);
  }
}

export type RetrievedMemory = {
  id: string;
  content: string;
  category: string;
  importance: number;
  distance: number;
};

export async function retrieveRelevantMemories(query: string, limit = 5): Promise<RetrievedMemory[]> {
  try {
    const queryEmbedding = await embedText(query);
    const literal = toVectorLiteral(queryEmbedding);

    const rows = await prisma.$queryRaw<RetrievedMemory[]>`
      SELECT id, content, category, importance, (embedding <=> ${literal}::vector) AS distance
      FROM "Memory"
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${literal}::vector
      LIMIT ${limit}
    `;

    return rows.filter((row) => row.distance <= SIMILARITY_DISTANCE_THRESHOLD);
  } catch (err) {
    console.error("Memory retrieval failed (continuing without memory context):", err);
    return [];
  }
}
