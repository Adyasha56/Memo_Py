import { backfillMemoryEmbeddings } from "@/lib/embeddings";

// Maintenance endpoint: free to call in local development, but a deployed (production)
// instance requires a matching secret so it can't be triggered by anyone who finds the URL.
// This is intentionally not a full auth system — just enough to stop open abuse of an
// embedding-generating endpoint.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const expected = process.env.MAINTENANCE_SECRET;
    const provided = request.headers.get("x-maintenance-secret");
    if (!expected || provided !== expected) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  }

  try {
    const result = await backfillMemoryEmbeddings();
    return Response.json(result);
  } catch (err) {
    console.error("Backfill failed:", err);
    return Response.json({ error: "Backfill failed" }, { status: 500 });
  }
}
