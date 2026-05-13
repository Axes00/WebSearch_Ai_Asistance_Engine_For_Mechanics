import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { toDTO } from "@/lib/library";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
  isDownloadable: z.boolean(),
});

/**
 * POST /api/admin/downloadable  body: { ids: string[], isDownloadable: boolean }
 *
 * Bulk toggles the download flag. Folders are ignored silently — only file
 * rows pick up the change.
 */
export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { ids, isDownloadable } = parsed.data;

  const res = await prisma.libraryItem.updateMany({
    where: { id: { in: ids }, itemType: "file" },
    data: { isDownloadable },
  });
  const updated = await prisma.libraryItem.findMany({
    where: { id: { in: ids } },
  });
  return NextResponse.json({
    updatedCount: res.count,
    items: updated.map(toDTO),
  });
}
