import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { resolveItemPath } from "@/lib/paths";
import { rangedFileResponse } from "@/lib/stream";
import { convertToPdfCached, LibreOfficeUnavailableError } from "@/lib/office";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/files/office/:id
 *
 * Converts a `.doc` (or similar LibreOffice-supported format) to PDF on
 * demand and streams it inline. The conversion is cached per source mtime/size.
 *
 * Returns 501 when LibreOffice isn't installed so the UI can surface a
 * "preview unavailable" message.
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
  if (item.fileType !== "doc") {
    return NextResponse.json(
      { error: "Not a convertible Word document" },
      { status: 400 }
    );
  }

  let abs: string;
  try {
    abs = resolveItemPath(item.relativePath);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let pdfAbs: string;
  try {
    pdfAbs = await convertToPdfCached({ itemId: item.id, srcAbs: abs });
  } catch (err) {
    if (err instanceof LibreOfficeUnavailableError) {
      return NextResponse.json(
        { error: "LibreOffice not installed" },
        { status: 501 }
      );
    }
    return NextResponse.json(
      { error: "Conversion failed", detail: (err as Error).message },
      { status: 500 }
    );
  }

  try {
    return await rangedFileResponse(pdfAbs, {
      contentType: "application/pdf",
      filename: `${item.name}.pdf`,
      inline: true,
      range: req.headers.get("range"),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Converted file is unreadable", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
