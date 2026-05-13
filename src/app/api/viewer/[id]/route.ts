import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { prettyDisplayName } from "@/lib/format";
import {
  breadcrumbsFor,
  effectiveParentId,
  effectiveParentWhere,
  toDTO,
} from "@/lib/library";
import { isLibreOfficeAvailable } from "@/lib/office";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const locale = new URL(_req.url).searchParams.get("locale") ?? "el";
  const dto = toDTO(item);
  const kind =
    dto.fileType === "pdf"
      ? "pdf"
      : dto.fileType === "docx"
      ? "docx"
      : dto.fileType === "doc"
      ? "doc"
      : dto.fileType === "image"
      ? "image"
      : "other";
  const canOpenInline =
    kind === "pdf" || kind === "image" || kind === "docx" || kind === "doc";

  const siblings = await prisma.libraryItem.findMany({
    where: {
      ...effectiveParentWhere(effectiveParentId(item)),
      itemType: "file",
      isHidden: false,
      isAdminHidden: false,
      isBrowsable: true,
    },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true },
  });
  const idx = siblings.findIndex((s) => s.id === item.id);

  return NextResponse.json({
    item: dto,
    breadcrumbs: await breadcrumbsFor(item, locale),
    kind,
    displayName: prettyDisplayName(dto.name, "file"),
    streamHref: `/api/files/stream/${item.id}`,
    officeHref: `/api/files/office/${item.id}`,
    downloadHref: `/api/files/download/${item.id}`,
    canOpenInline,
    canDownload: dto.isDownloadable === true,
    libreAvailable: kind === "doc" ? await isLibreOfficeAvailable() : true,
    prev:
      idx > 0
        ? {
            id: siblings[idx - 1].id,
            name: siblings[idx - 1].name,
            href: `/${locale}/viewer/${siblings[idx - 1].id}`,
          }
        : null,
    next:
      idx >= 0 && idx < siblings.length - 1
        ? {
            id: siblings[idx + 1].id,
            name: siblings[idx + 1].name,
            href: `/${locale}/viewer/${siblings[idx + 1].id}`,
          }
        : null,
  });
}
