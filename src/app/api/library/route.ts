import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { listChildren, toDTO } from "@/lib/library";

export const dynamic = "force-dynamic";

/**
 * GET /api/library?parentId=<id>
 *
 * Lists the children of a folder. When no parentId is given, returns the
 * direct children of the archive root.
 */
export async function GET(req: NextRequest) {
  const parentIdRaw = req.nextUrl.searchParams.get("parentId");
  const parentId = parentIdRaw && parentIdRaw !== "null" ? parentIdRaw : null;

  if (parentId) {
    const parent = await prisma.libraryItem.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }
    if (parent.isHidden || parent.isAdminHidden || !parent.isBrowsable) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }
    if (parent.itemType !== "folder") {
      return NextResponse.json(
        { error: "Parent is not a folder" },
        { status: 400 }
      );
    }
  }

  const { folders, files } = await listChildren(parentId);
  return NextResponse.json({
    folders: folders.map(toDTO),
    files: files.map(toDTO),
    totalCount: folders.length + files.length,
  });
}
