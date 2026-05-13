import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { runIndex, seedDefaultHighlightsIfEmpty } from "@/lib/indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reindex
 *
 * Starts a synchronous re-index. The call blocks until the indexer finishes
 * and returns the final run record so the UI can show stats immediately.
 *
 * TODO (auth): wrap this handler with an admin guard before exposing it
 * beyond localhost. The V1 ships without auth per the product decision
 * documented in the plan; see README "Security note".
 */
export async function POST() {
  // Pre-create the IndexRun so the UI can show "running" even if the response
  // is slow to arrive. runIndex below will resume it rather than create new.
  const pending = await prisma.indexRun.create({
    data: { status: "running" },
  });

  try {
    const res = await runIndex({ runId: pending.id });
    await seedDefaultHighlightsIfEmpty();
    return NextResponse.json({ run: res });
  } catch (err) {
    await prisma.indexRun.update({
      where: { id: pending.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errors: JSON.stringify([(err as Error).message]),
      },
    });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/reindex
 *
 * Returns the latest IndexRun so the admin UI can show last-run stats.
 */
export async function GET() {
  const last = await prisma.indexRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json({ run: last });
}
