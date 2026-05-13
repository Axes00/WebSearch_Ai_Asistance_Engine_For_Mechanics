import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveItemPath } from "@/lib/paths";
import { mimeFromFileType } from "@/lib/fileTypes";
import { rangedFileResponse } from "@/lib/stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/files/download/:id
 *
 * Same validation as /stream but always sends Content-Disposition: attachment.
 * Used for DWG, DOCX, archives and any "download fallback" flow.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (
    !item ||
    item.itemType !== "file" ||
    item.isHidden ||
    item.isAdminHidden ||
    !item.isBrowsable
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Download policy: only items explicitly flagged by the admin (or DWG by
  // default via the indexer) may be served as attachments.
  if (!item.isDownloadable) {
    return NextResponse.json(
      { error: "Downloads are disabled for this file" },
      { status: 403 }
    );
  }

  let abs: string;
  try {
    abs = resolveItemPath(item.relativePath);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = mimeFromFileType(
    (item.fileType ?? "other") as Parameters<typeof mimeFromFileType>[0]
  );

  try {
    return await rangedFileResponse(abs, {
      contentType,
      filename: item.name,
      inline: false,
      range: req.headers.get("range"),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "File is unreadable on disk", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
