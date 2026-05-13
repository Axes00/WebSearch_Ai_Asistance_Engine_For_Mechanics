import type { LibraryItem } from "@prisma/client";

import type { LibraryItemDTO, LibraryBreadcrumb } from "@/types/library";
import type { FileType } from "@/lib/fileTypes";
import { humanFileSize } from "@/lib/format";
import { prisma } from "@/lib/db";

/**
 * Serialize a DB row to a UI-safe DTO (no absolute paths, BigInt -> string).
 */
export function toDTO(item: LibraryItem): LibraryItemDTO {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    relativePath: item.relativePath,
    parentId: item.parentId,
    adminParentId: item.adminParentId,
    hasAdminParentOverride: item.hasAdminParentOverride,
    itemType: item.itemType as "folder" | "file",
    fileType: (item.fileType ?? null) as FileType | null,
    size: item.size !== null ? item.size.toString() : null,
    sizeHuman: humanFileSize(item.size),
    modifiedAt: item.modifiedAt ? item.modifiedAt.toISOString() : null,
    level: item.level,
    libraryCode: item.libraryCode,
    displayOrder: item.displayOrder,
    isDownloadOnly: item.isDownloadOnly,
    isDownloadable: item.isDownloadable,
    isHighlighted: item.isHighlighted,
    isAdminHidden: item.isAdminHidden,
    sourceType: item.sourceType,
  };
}

export function effectiveParentId(item: Pick<LibraryItem, "parentId" | "adminParentId" | "hasAdminParentOverride">): string | null {
  return item.hasAdminParentOverride ? item.adminParentId : item.parentId;
}

export function effectiveParentWhere(parentId: string | null) {
  return {
    OR: [
      { hasAdminParentOverride: true, adminParentId: parentId },
      { hasAdminParentOverride: false, parentId },
    ],
  };
}

/**
 * Rebuild an ancestor chain from a single item. Cheap for our 3-5 depth tree.
 */
export async function breadcrumbsFor(
  item: LibraryItem | null,
  locale: string
): Promise<LibraryBreadcrumb[]> {
  const chain: LibraryItem[] = [];
  let cursor = item;
  while (cursor) {
    const parentId = effectiveParentId(cursor);
    if (!parentId) break;
    const parent = await prisma.libraryItem.findUnique({
      where: { id: parentId },
    });
    if (!parent) break;
    chain.unshift(parent);
    cursor = parent;
  }
  if (item) chain.push(item);

  const pathAccum: string[] = [];
  return chain.map((c) => {
    pathAccum.push(c.slug);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      href: `/${locale}/library/${pathAccum.join("/")}`,
    };
  });
}

/**
 * Resolve a list of slug segments (from /library/[...slug]) to a LibraryItem.
 * Matches by walking the parent chain using each slug in order so we can
 * disambiguate folders that happen to share a slug at different levels.
 */
export async function resolveBySlugPath(
  segments: string[]
): Promise<LibraryItem | null> {
  if (!segments.length) return null;
  let parentId: string | null = null;
  let current: LibraryItem | null = null;
  for (const segment of segments) {
    const decoded = decodeURIComponent(segment);
    const next: LibraryItem | null = await prisma.libraryItem.findFirst({
      where: {
        slug: decoded,
        isHidden: false,
        isAdminHidden: false,
        ...effectiveParentWhere(parentId),
      },
      orderBy: [{ itemType: "asc" }, { name: "asc" }],
    });
    if (!next) return null;
    current = next;
    parentId = next.id;
  }
  return current;
}

/**
 * Children of a folder (or of the archive root when parentId is null),
 * filtered to only browsable, non-hidden items.
 */
export async function listChildren(parentId: string | null): Promise<{
  folders: LibraryItem[];
  files: LibraryItem[];
}> {
  const rows = await prisma.libraryItem.findMany({
    where: {
      ...effectiveParentWhere(parentId),
      isHidden: false,
      isAdminHidden: false,
      isBrowsable: true,
    },
    orderBy: [{ itemType: "asc" }, { name: "asc" }],
  });
  return {
    folders: rows.filter((r) => r.itemType === "folder"),
    files: rows.filter((r) => r.itemType === "file"),
  };
}
