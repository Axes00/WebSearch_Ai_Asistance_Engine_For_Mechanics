import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { toDTO } from "@/lib/library";

export const dynamic = "force-dynamic";

/**
 * GET /api/highlights
 *
 * Returns the homepage "Introductory Documents" list. Toggled by admins
 * via /api/admin/highlights.
 */
export async function GET() {
  const rows = await prisma.libraryItem.findMany({
    where: {
      isHighlighted: true,
      isHidden: false,
      isAdminHidden: false,
      isBrowsable: true,
      itemType: "file",
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    take: 48,
  });
  return NextResponse.json({ items: rows.map(toDTO) });
}
