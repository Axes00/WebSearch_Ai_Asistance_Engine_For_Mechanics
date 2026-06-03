import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { indexSubtree } from "@/lib/indexer";
import { getArchiveRoot, resolveItemPath } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  confirm: z.literal("DELETE"),
});

/**
 * Permanently removes selected files or folders from ARCHIVE_ROOT.
 * This is intentionally separate from /api/admin/delete, which only hides
 * items from customers without changing the source archive.
 */
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Type DELETE to confirm permanent deletion" }, { status: 400 });
  }

  const items = await prisma.libraryItem.findMany({
    where: { id: { in: parsed.data.ids } },
    select: { relativePath: true },
  });
  if (items.length === 0) {
    return NextResponse.json({ error: "No matching items" }, { status: 404 });
  }

  const root = path.resolve(getArchiveRoot());
  const relativePaths = removeNestedPaths(items.map((item) => item.relativePath));
  const deleted: string[] = [];
  const errors: { relativePath: string; error: string }[] = [];

  for (const relativePath of relativePaths) {
    try {
      const absolutePath = resolveItemPath(relativePath);
      assertArchiveChild(root, absolutePath);
      await fs.rm(absolutePath, { recursive: true, force: false });
      deleted.push(relativePath);
    } catch (error) {
      errors.push({ relativePath, error: (error as Error).message });
    }
  }

  await indexSubtree("").catch((error) => {
    errors.push({ relativePath: "", error: `Reindex failed: ${(error as Error).message}` });
  });

  return NextResponse.json(
    { deleted, errors },
    { status: errors.length === 0 ? 200 : deleted.length > 0 ? 207 : 500 }
  );
}

function assertArchiveChild(root: string, absolutePath: string) {
  const relative = path.relative(root, absolutePath);
  if (!relative || relative === "." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Permanent deletion outside ARCHIVE_ROOT is blocked");
  }
}

function removeNestedPaths(relativePaths: string[]) {
  const sorted = [...new Set(relativePaths.map((value) => value.replace(/\\/g, "/")))]
    .filter(Boolean)
    .sort((a, b) => a.length - b.length);
  return sorted.filter(
    (candidate, index) =>
      !sorted.some(
        (possibleParent, parentIndex) =>
          parentIndex < index && candidate.startsWith(`${possibleParent}/`)
      )
  );
}
