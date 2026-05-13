import { NextResponse } from "next/server";

import { runAiIngest } from "@/lib/ai/ingest";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reindex-ai
 *
 * Triggers an AI re-index (text extraction + embedding). Accepts an optional
 * `{ force: true }` body to re-embed every eligible file instead of only
 * those modified since the last successful run.
 *
 * As with /api/admin/reindex this ships without auth in V1 per the product
 * decision — see the README "Security note".
 */
export async function POST(req: Request) {
  let force = false;
  try {
    const body = await req.json().catch(() => ({}));
    force = body?.force === true;
  } catch {
    /* empty body is fine */
  }

  try {
    const res = await runAiIngest({ verbose: false, force });
    const run = await prisma.aiIndexRun.findUnique({ where: { id: res.runId } });
    return NextResponse.json({ run });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

/** GET — latest AiIndexRun so the admin panel can poll. */
export async function GET() {
  const run = await prisma.aiIndexRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json({ run });
}
