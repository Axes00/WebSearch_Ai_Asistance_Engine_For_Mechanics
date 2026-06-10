import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveItemPath } from "@/lib/paths";
import { mimeFromFileType } from "@/lib/fileTypes";
import { rangedFileResponse } from "@/lib/stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // fs / createReadStream are Node-only.

/**
 * GET /api/files/stream/:id
 *
 * Streams a LibraryItem's file for inline rendering (Content-Disposition: inline).
 * Used by the PDF viewer, image preview, and "Open in new tab" flows.
 *
 * Security:
 *  - Row must exist and be a file (not a folder).
 *  - Hidden / non-browsable rows are rejected.
 *  - Path is resolved via resolveItemPath which blocks traversal.
 *  - Absolute filesystem paths are never returned in the response body.
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
  if (!item.isDownloadable) {
    return NextResponse.json(
      { error: "Preview and downloads are disabled for this file" },
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
      inline: true,
      range: req.headers.get("range"),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "File is unreadable on disk", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
