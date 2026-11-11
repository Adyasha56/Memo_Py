import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { prisma } from "@/lib/prisma";

const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 3072;

function getEmbeddingsModel() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }

  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    model: EMBEDDING_MODEL,
    outputDimensionality: EMBEDDING_DIMENSIONS,
  });
}

export async function embedText(text: string): Promise<number[]> {
  const vector = await getEmbeddingsModel().embedQuery(text);
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected a ${EMBEDDING_DIMENSIONS}-dimension embedding, got ${vector.length}`);
  }
  return vector;
}

export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

// Prisma never exposes an Unsupported("vector") column in its typed create/update inputs,
// nullable or not, so writing a real embedding value has to go through raw SQL.

export async function createMemoryWithEmbedding(params: {
  content: string;
  category: string;
  importance: number;
  sourceMessageId: string | null;
  embedding: number[];
}): Promise<void> {
  const literal = toVectorLiteral(params.embedding);
  await prisma.$executeRaw`
    INSERT INTO "Memory" (id, content, category, importance, "sourceMessageId", "createdAt", embedding)
    VALUES (
      ${crypto.randomUUID()},
      ${params.content},
      ${params.category},
      ${params.importance},
      ${params.sourceMessageId},
      ${new Date()},
      ${literal}::vector
    )
  `;
}

export async function setMemoryEmbedding(memoryId: string, embedding: number[]): Promise<void> {
  const literal = toVectorLiteral(embedding);
  await prisma.$executeRaw`UPDATE "Memory" SET embedding = ${literal}::vector WHERE id = ${memoryId}`;
}

export async function backfillMemoryEmbeddings(): Promise<{ updated: number; failed: number }> {
  const pending = await prisma.$queryRaw<{ id: string; content: string }[]>`
    SELECT id, content FROM "Memory" WHERE embedding IS NULL
  `;

  let updated = 0;
  let failed = 0;

  for (const memory of pending) {
    try {
      const vector = await embedText(memory.content);
      await setMemoryEmbedding(memory.id, vector);
      updated++;
    } catch (err) {
      failed++;
      console.error(`Backfill: failed to embed memory ${memory.id}:`, err);
    }
  }

  return { updated, failed };
}
