import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { effectiveParentWhere } from "@/lib/library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  visible: z.boolean(),
  recursive: z.boolean().optional().default(true),
});

/**
 * POST /api/admin/visibility
 *
 * Toggles the admin soft-hide flag. This never deletes or moves source files.
 */
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { ids, visible, recursive } = parsed.data;
  const existing = await prisma.libraryItem.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (existing.length === 0) {
    return NextResponse.json({ error: "No matching items" }, { status: 404 });
  }

  const targetIds = recursive
    ? await collectEffectiveSubtreeIds(existing.map((item) => item.id))
    : existing.map((item) => item.id);

  const res = await prisma.libraryItem.updateMany({
    where: { id: { in: targetIds } },
    data: { isAdminHidden: !visible },
  });

  return NextResponse.json({ updatedCount: res.count, ids: targetIds });
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
