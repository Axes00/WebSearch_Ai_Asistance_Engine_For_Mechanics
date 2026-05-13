import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";

import FileActions from "@/components/FileActions";
import ViewerNav, { type ViewerSibling } from "@/components/ViewerNav";
import ViewerShell from "@/components/viewer/ViewerShell";
import { prisma } from "@/lib/db";
import {
  breadcrumbsFor,
  effectiveParentId,
  effectiveParentWhere,
  toDTO,
} from "@/lib/library";
import { prettyDisplayName } from "@/lib/format";
import { isLibreOfficeAvailable } from "@/lib/office";

export default async function ViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ ai?: string }>;
}) {
  const { locale, id } = await params;
  const { ai: aiParam } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("viewer");

  const item = await prisma.libraryItem.findUnique({ where: { id } });
  if (
    !item ||
    item.itemType !== "file" ||
    item.isHidden ||
    item.isAdminHidden ||
    !item.isBrowsable
  ) {
    notFound();
  }

  const dto = toDTO(item);
  const crumbs = await breadcrumbsFor(item, locale);

  const streamHref = `/api/files/stream/${item.id}`;
  const officeHref = `/api/files/office/${item.id}`;
  const downloadHref = `/api/files/download/${item.id}`;

  const isPdf = dto.fileType === "pdf";
  const isDocx = dto.fileType === "docx";
  const isDoc = dto.fileType === "doc";
  const isImage = dto.fileType === "image";
  const canOpenInline = isPdf || isImage || isDocx || isDoc;
  const canDownload = dto.isDownloadable === true;
  // .doc files need LibreOffice on the server to preview. We check once per
  // render so the UI can show a helpful message when it's missing.
  const libreAvailable = isDoc ? await isLibreOfficeAvailable() : true;

  const displayName = prettyDisplayName(dto.name, "file");
  const kind = isPdf
    ? "pdf"
    : isDocx
    ? "docx"
    : isDoc
    ? "doc"
    : isImage
    ? "image"
    : "other";

  // Sibling navigation: find prev/next files in the same parent folder.
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
  const prevSibling: ViewerSibling | null =
    idx > 0
      ? {
          id: siblings[idx - 1].id,
          name: siblings[idx - 1].name,
          href: `/${locale}/viewer/${siblings[idx - 1].id}`,
        }
      : null;
  const nextSibling: ViewerSibling | null =
    idx >= 0 && idx < siblings.length - 1
      ? {
          id: siblings[idx + 1].id,
          name: siblings[idx + 1].name,
          href: `/${locale}/viewer/${siblings[idx + 1].id}`,
        }
      : null;

  return (
    <div className="explorer-bg min-h-[calc(100vh-4rem)] pb-20">
      <div className="mx-auto max-w-[110rem] px-5 pt-10 md:px-8 md:pt-14">
        <ViewerShell
          locale={locale}
          initial={{
            item: dto,
            breadcrumbs: crumbs,
            kind,
            displayName,
            streamHref,
            officeHref,
            downloadHref,
            canOpenInline,
            canDownload,
            libreAvailable,
            prev: prevSibling,
            next: nextSibling,
          }}
          initialQuery={aiParam}
          unavailableDocNode={
            <div className="card p-8">
              <h2 className="text-lg font-semibold text-ink dark:text-paper">
                {t("docUnavailableTitle")}
              </h2>
              <p className="mt-2 max-w-xl text-sm text-steel-500 dark:text-steel-300">
                {t("docUnavailableDescription")}
              </p>
              {canDownload && (
                <div className="mt-6">
                  <FileActions
                    downloadHref={downloadHref}
                    canOpenInline={false}
                    canDownload={canDownload}
                  />
                </div>
              )}
            </div>
          }
          fallbackNode={
            <div className="card p-8">
              <h2 className="text-lg font-semibold text-ink dark:text-paper">
                {canDownload
                  ? t("downloadOnlyTitle")
                  : t("downloadDisabledTitle")}
              </h2>
              <p className="mt-2 max-w-xl text-sm text-steel-500 dark:text-steel-300">
                {canDownload
                  ? t("downloadOnlyDescription")
                  : t("downloadDisabledDescription")}
              </p>
              {canDownload && (
                <div className="mt-6">
                  <FileActions
                    downloadHref={downloadHref}
                    canOpenInline={false}
                    canDownload={canDownload}
                  />
                </div>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
