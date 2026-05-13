import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveItemPath } from "@/lib/paths";
import {
  deconflictFilename,
  isUnsafeFilename,
  joinRelative,
} from "@/lib/adminPaths";
import { indexSubtree } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 200 MB per file, enforced here. Next.js bodySizeLimit enforces the
 * overall request size separately (see next.config.ts). */
const MAX_PER_FILE = 200 * 1024 * 1024;

async function fileExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/admin/upload   multipart/form-data
 *   fields:
 *     parentId?: string   (defaults to archive root)
 *     files: File[]       (one or more)
 *
 * Writes each file under the target folder, suffixing "-N" on collision.
 * After all writes we trigger a (full) reindex so the new rows land in
 * the DB with downloadability defaults applied.
 *
 * TODO (auth): guard with admin middleware.
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: "Malformed form", detail: (err as Error).message },
      { status: 400 }
    );
  }

  const parentIdRaw = form.get("parentId");
  const parentId =
    typeof parentIdRaw === "string" && parentIdRaw !== "" && parentIdRaw !== "root"
      ? parentIdRaw
      : null;

  const parent = parentId
    ? await prisma.libraryItem.findUnique({ where: { id: parentId } })
    : null;
  if (parentId && (!parent || parent.itemType !== "folder")) {
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
  await fs.mkdir(parentAbs, { recursive: true });

  const rawFiles = form.getAll("files");
  const files = rawFiles.filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const written: { name: string; size: number }[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const file of files) {
    const name = file.name;
    if (isUnsafeFilename(name)) {
      errors.push({ name, error: "Unsafe filename" });
      continue;
    }
    if (file.size > MAX_PER_FILE) {
      errors.push({ name, error: "File exceeds 200 MB limit" });
      continue;
    }

    try {
      const finalName = await deconflictFilename({
        parentAbs,
        desiredName: name,
        exists: fileExists,
      });
      const { absolutePath } = joinRelative(parentRelPath, finalName);
      const buf = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(absolutePath, buf);
      written.push({ name: finalName, size: buf.byteLength });
    } catch (err) {
      errors.push({ name, error: (err as Error).message });
    }
  }

  // Kick off a reindex so the new rows appear with correct metadata +
  // default isDownloadable seeded by the indexer.
  await indexSubtree(parentRelPath).catch(() => undefined);

  return NextResponse.json({
    written,
    errors,
    parentId: parent?.id ?? null,
  });
}
