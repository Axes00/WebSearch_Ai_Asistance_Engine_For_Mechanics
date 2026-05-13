import type { FileType } from "@/lib/fileTypes";

/**
 * Shape of a LibraryItem as it leaves the API / reaches the UI.
 *
 * Notes:
 *  - `absolutePath` NEVER appears here. Only `id`, `relativePath` and
 *    display metadata are shipped to the client.
 *  - `size` is serialized as a string because BigInt is not JSON-safe.
 */
export type LibraryItemDTO = {
  id: string;
  name: string;
  slug: string;
  relativePath: string;
  parentId: string | null;
  adminParentId: string | null;
  hasAdminParentOverride: boolean;
  itemType: "folder" | "file";
  fileType: FileType | null;
  size: string | null;
  sizeHuman: string | null;
  modifiedAt: string | null;
  level: number;
  libraryCode: string | null;
  displayOrder: number;
  isDownloadOnly: boolean;
  isDownloadable: boolean;
  isHighlighted: boolean;
  isAdminHidden: boolean;
  sourceType: string;
  breadcrumbs?: LibraryBreadcrumb[];
  hasChildren?: boolean;
};

export type LibraryBreadcrumb = {
  id: string | null;
  name: string;
  slug: string;
  href: string;
};

export type LibraryListing = {
  current: LibraryItemDTO | null;
  breadcrumbs: LibraryBreadcrumb[];
  folders: LibraryItemDTO[];
  files: LibraryItemDTO[];
  totalCount: number;
};
