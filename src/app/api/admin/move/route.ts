import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { effectiveParentId } from "@/lib/library";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  targetParentId: z.string().nullable().optional(),
});

/**
 * POST /api/admin/move  body: { ids: string[], targetParentId: string | null }
 *
 * Virtually moves one or more items into the target folder. The source files
 * stay in ARCHIVE_ROOT; only admin display parent metadata changes.
 */
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { ids, targetParentId } = parsed.data;

  const target =
    targetParentId && targetParentId !== "root"
      ? await prisma.libraryItem.findUnique({ where: { id: targetParentId } })
      : null;
  if (
    targetParentId &&
    targetParentId !== "root" &&
    (!target || target.itemType !== "folder")
  ) {
    return NextResponse.json(
      { error: "Target folder not found" },
      { status: 404 }
    );
  }

  const items = await prisma.libraryItem.findMany({
    where: { id: { in: ids } },
  });
  if (items.length === 0) {
    return NextResponse.json({ error: "No matching items" }, { status: 404 });
  }

  const results: { id: string; ok: boolean; error?: string; newPath?: string }[] =
    [];

  for (const item of items) {
    try {
      if (
        target &&
        item.itemType === "folder" &&
        (target.id === item.id || (await wouldCreateCycle(item.id, target.id)))
      ) {
        throw new Error("Cannot move a folder into itself or its descendant");
      }
      await prisma.libraryItem.update({
        where: { id: item.id },
        data: {
          hasAdminParentOverride: true,
          adminParentId: target ? target.id : null,
        },
      });
      results.push({ id: item.id, ok: true, newPath: item.relativePath });
    } catch (err) {
      results.push({
        id: item.id,
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  return NextResponse.json({ results });
}

async function wouldCreateCycle(itemId: string, targetId: string): Promise<boolean> {
  let cursor: string | null = targetId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === itemId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const parent = await prisma.libraryItem.findUnique({ where: { id: cursor } });
    if (!parent) return false;
    cursor = effectiveParentId(parent);
  }
  return false;
}
