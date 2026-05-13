import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { effectiveParentWhere, toDTO } from "@/lib/library";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=<text>&parentId=<id|null>&limit=200
 *
 * Scoped, name-based search.
 *
 *  - When parentId is given, results are restricted to immediate children of
 *    that folder (current-level behaviour, as the plan specifies).
 *  - When parentId is absent, we search across the entire archive (useful
 *    for the future AI-assisted search and for the admin UI).
 *
 * SQLite's default LIKE is case-insensitive only on ASCII. For Greek search
 * we perform a NFD-stripped client-side refinement on the fetched candidate
 * set; this is cheap given our archive size (~4.4k rows).
 */
function strip(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const parentIdRaw = req.nextUrl.searchParams.get("parentId");
  const limit = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10) || 200, 1),
    500
  );

  if (q.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const parentId = parentIdRaw && parentIdRaw !== "null" ? parentIdRaw : undefined;

  const rows = await prisma.libraryItem.findMany({
    where: {
      isHidden: false,
      isAdminHidden: false,
      isBrowsable: true,
      ...(parentId ? effectiveParentWhere(parentId) : {}),
      name: { contains: q },
    },
    orderBy: [{ itemType: "asc" }, { name: "asc" }],
    take: limit * 2,
  });

  const needle = strip(q);
  const refined = rows
    .filter((r) => strip(r.name).includes(needle))
    .slice(0, limit);

  return NextResponse.json({ results: refined.map(toDTO) });
}
