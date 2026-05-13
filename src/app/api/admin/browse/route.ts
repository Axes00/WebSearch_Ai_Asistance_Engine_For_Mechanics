import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { breadcrumbsFor, effectiveParentWhere, toDTO } from "@/lib/library";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/browse?parentId=...
 *
 * Admin-focused listing that INCLUDES hidden rows (the admin can still
 * see noise / archive backups and choose to delete them). Returns the
 * current folder metadata, its breadcrumbs, and children.
 */
export async function GET(req: NextRequest) {
  const parentIdRaw = req.nextUrl.searchParams.get("parentId");
  const parentId = parentIdRaw && parentIdRaw !== "root" ? parentIdRaw : null;

  const parent = parentId
    ? await prisma.libraryItem.findUnique({ where: { id: parentId } })
    : null;

  if (parentId && !parent) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  if (parent && parent.itemType !== "folder") {
    return NextResponse.json(
      { error: "Parent is not a folder" },
      { status: 400 }
    );
  }

  const rows = await prisma.libraryItem.findMany({
    where: effectiveParentWhere(parentId),
    orderBy: [{ itemType: "asc" }, { name: "asc" }],
  });

  // Locale is used only to build href strings; admin UI handles navigation
  // via state so we pass an empty string and let the UI ignore hrefs.
  const crumbs = parent ? await breadcrumbsFor(parent, "") : [];

  return NextResponse.json({
    current: parent ? toDTO(parent) : null,
    breadcrumbs: crumbs,
    items: rows.map(toDTO),
  });
}
