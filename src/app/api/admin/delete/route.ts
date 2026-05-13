import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { effectiveParentWhere } from "@/lib/library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  confirm: z.literal(true),
});

/**
 * POST /api/admin/delete  body: { ids: string[], confirm: true }
 *
 * Soft-hides items from the public website. Files stay on disk/cloud and
 * database rows remain available to the admin explorer.
 *
 * TODO (auth): guard with admin middleware.
 */
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { ids } = parsed.data;

  const items = await prisma.libraryItem.findMany({
    where: { id: { in: ids } },
  });
  if (items.length === 0) {
    return NextResponse.json({ error: "No matching items" }, { status: 404 });
  }

  const idsToHide = await collectEffectiveSubtreeIds(items.map((item) => item.id));
  await prisma.libraryItem.updateMany({
    where: { id: { in: idsToHide } },
    data: { isAdminHidden: true },
  });

  const results = idsToHide.map((id) => ({ id, ok: true }));

  return NextResponse.json({ results });
}

async function collectEffectiveSubtreeIds(rootIds: string[]): Promise<string[]> {
  const out = new Set(rootIds);
  const queue = [...rootIds];
  while (queue.length > 0) {
    const parentId = queue.shift() ?? null;
    if (!parentId) continue;
    const children = await prisma.libraryItem.findMany({
      where: effectiveParentWhere(parentId),
      select: { id: true },
    });
    for (const child of children) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      queue.push(child.id);
    }
  }
  return [...out];
}
