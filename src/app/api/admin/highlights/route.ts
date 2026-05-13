import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { toDTO } from "@/lib/library";

export const dynamic = "force-dynamic";

/**
 * Body schema for POST: { id: string, isHighlighted: boolean }
 */
const PatchSchema = z.object({
  id: z.string().min(1),
  isHighlighted: z.boolean(),
});

/**
 * GET  /api/admin/highlights  -> candidates (files, paginated by search query)
 * POST /api/admin/highlights  -> toggles the isHighlighted flag on a single item
 *
 * TODO (auth): protect under the admin guard. See README.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const highlightedOnly =
    req.nextUrl.searchParams.get("highlighted") === "1";

  const rows = await prisma.libraryItem.findMany({
    where: {
      itemType: "file",
      isHidden: false,
      isAdminHidden: false,
      isBrowsable: true,
      ...(highlightedOnly ? { isHighlighted: true } : {}),
      ...(q ? { name: { contains: q } } : {}),
    },
    orderBy: [
      { isHighlighted: "desc" },
      { level: "asc" },
      { name: "asc" },
    ],
    take: 200,
  });

  return NextResponse.json({ items: rows.map(toDTO) });
}

export async function POST(req: NextRequest) {
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { id, isHighlighted } = parsed.data;
  try {
    const updated = await prisma.libraryItem.update({
      where: { id },
      data: { isHighlighted },
    });
    return NextResponse.json({ item: toDTO(updated) });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
