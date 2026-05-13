import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { breadcrumbsFor, toDTO } from "@/lib/library";

export const dynamic = "force-dynamic";

/**
 * GET /api/library/:id
 *
 * Metadata for a single LibraryItem plus its breadcrumb chain. Never
 * exposes absolute filesystem paths.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (!item || item.isHidden || item.isAdminHidden || !item.isBrowsable) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Locale isn't used by toDTO but breadcrumbs need something for href.
  // API callers can ignore the href or use it as /library/... internally.
  const url = new URL(_req.url);
  const localeMatch = url.pathname.match(/^\/(el|en)\//);
  const locale = localeMatch?.[1] ?? "el";

  const crumbs = await breadcrumbsFor(item, locale);
  return NextResponse.json({ item: toDTO(item), breadcrumbs: crumbs });
}
