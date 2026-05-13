import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { indexSubtree } from "@/lib/indexer";
import {
  isUnsafeFilename,
  joinRelative,
  deconflictFilename,
} from "@/lib/adminPaths";
import { resolveItemPath } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1).max(240),
});

async function exists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/admin/mkdir  body: { parentId: string | null, name: string }
 *
 * Creates a folder on disk inside the target parent, de-conflicting the
 * name if needed. Returns the resulting relative path so the UI can
 * refresh its view.
 */
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { parentId, name } = parsed.data;
  if (isUnsafeFilename(name)) {
    return NextResponse.json({ error: "Unsafe name" }, { status: 400 });
  }

  const parent =
    parentId && parentId !== "root"
      ? await prisma.libraryItem.findUnique({ where: { id: parentId } })
      : null;
  if (parentId && parentId !== "root" && (!parent || parent.itemType !== "folder")) {
    return NextResponse.json(
      { error: "Target folder not found" },
      { status: 404 }
    );
  }

  const parentRelPath = parent ? parent.relativePath : "";
  let parentAbs: string;
  try {
    parentAbs = resolveItemPath(parentRelPath || ".");
  } catch {
    return NextResponse.json({ error: "Forbidden target" }, { status: 403 });
  }

  try {
    const finalName = await deconflictFilename({
      parentAbs,
      desiredName: name,
      exists,
    });
    const { absolutePath, relativePath } = joinRelative(parentRelPath, finalName);
    await fs.mkdir(absolutePath, { recursive: true });
    await indexSubtree(parentRelPath).catch(() => undefined);
    return NextResponse.json({ relativePath, name: finalName });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not create folder", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
