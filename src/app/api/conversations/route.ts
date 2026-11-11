import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    });
    return Response.json({ conversations });
  } catch (err) {
    console.error("Failed to list conversations:", err);
    return Response.json({ error: "Failed to load conversations" }, { status: 500 });
  }
}
