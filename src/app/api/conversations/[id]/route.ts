import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    return Response.json({ conversation });
  } catch (err) {
    console.error("Failed to load conversation:", err);
    return Response.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;

  try {
    await prisma.conversation.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    const notFound = typeof err === "object" && err !== null && (err as { code?: string }).code === "P2025";
    if (notFound) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    console.error("Failed to delete conversation:", err);
    return Response.json({ error: "Failed to delete conversation" }, { status: 500 });
  }
}
