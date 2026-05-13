import { NextResponse } from "next/server";
import { z } from "zod";

import { runAiSearch } from "@/lib/ai/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  q: z.string().min(1).max(500),
  limit: z.number().int().positive().max(30).optional(),
  itemId: z.string().min(1).max(100).optional(),
});

/**
 * POST /api/ai/search
 *
 * Body: { q: string, limit?: number, itemId?: string }
 * Returns: { hits: AiSearchHit[] }
 *
 * - `itemId` scopes results to chunks of a single document (used by the
 *   viewer sidebar for in-document highlighting).
 * - Without `itemId` this is a cross-archive semantic search.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }

  try {
    const hits = await runAiSearch({
      query: parsed.data.q,
      limit: parsed.data.limit,
      itemId: parsed.data.itemId ?? null,
    });
    return NextResponse.json({ hits });
  } catch (err) {
    const msg = (err as Error).message;
    if (process.env.NODE_ENV === "development") {
      console.error("[api/ai/search]", err);
    }
    // Common case: user hasn't indexed yet. Return a typed hint so the UI
    // can show a helpful call-to-action.
    if (/vec_ai_chunks|no such table/i.test(msg)) {
      return NextResponse.json(
        { error: "AI index is empty. Run `npm run index:ai`." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
