import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getPdfPreviewInfo } from "@/lib/pdfPreview";
import { resolveItemPath } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
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
  if (item.fileType !== "pdf" && item.fileType !== "doc") {
    return NextResponse.json(
      { error: "Preview images are only available for PDF/DOC files" },
      { status: 400 }
    );
  }

  let abs: string;
  try {
    abs = resolveItemPath(item.relativePath);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const info = await getPdfPreviewInfo({
      itemId: item.id,
      abs,
      fileType: item.fileType,
    });
    return NextResponse.json({
      pageCount: info.pageCount,
      pages: Array.from({ length: info.pageCount }, (_, index) => ({
        page: index + 1,
        href: `/api/files/preview/${item.id}/${index + 1}`,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Preview failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}
