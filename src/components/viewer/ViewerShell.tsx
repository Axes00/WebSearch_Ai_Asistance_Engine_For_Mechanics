"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import Breadcrumbs from "@/components/Breadcrumbs";
import DocxViewer from "@/components/DocxViewer";
import FileActions from "@/components/FileActions";
import FileIcon from "@/components/FileIcon";
import PdfCanvasViewer from "@/components/PdfCanvasViewer";
import PdfViewer from "@/components/PdfViewer";
import SidebarAi, { type SidebarAiHit } from "@/components/SidebarAi";
import ViewerNav, { type ViewerSibling } from "@/components/ViewerNav";
import type { FileType } from "@/lib/fileTypes";
import type { LibraryBreadcrumb, LibraryItemDTO } from "@/types/library";

type Kind = "pdf" | "docx" | "doc" | "image" | "other";

export type ViewerPayload = {
  item: LibraryItemDTO;
  breadcrumbs: LibraryBreadcrumb[];
  kind: Kind;
  displayName: string;
  streamHref: string;
  officeHref: string;
  downloadHref: string;
  canOpenInline: boolean;
  canDownload: boolean;
  libreAvailable: boolean;
  prev: ViewerSibling | null;
  next: ViewerSibling | null;
};

/**
 * Client wrapper around the viewer + AI sidebar for a single document.
 *
 * Responsibilities:
 *  - Owns the in-document highlight state (terms for docx, page number for
 *    pdf/doc) and threads it into the appropriate viewer.
 *  - Reads `?ai=` on mount and forwards it as the initial search query.
 *  - When the user clicks a hit from the sidebar, we highlight in-document
 *    rather than navigating away.
 */
export default function ViewerShell(props: {
  locale: string;
  initial: ViewerPayload;
  initialQuery?: string;
  fallbackNode: React.ReactNode;
  unavailableDocNode: React.ReactNode;
}) {
  const {
    locale,
    initial,
    initialQuery,
    fallbackNode,
    unavailableDocNode,
  } = props;

  const t = useTranslations("viewer");
  const ft = useTranslations("fileTypes");
  const [current, setCurrent] = useState(initial);
  const [highlightTerms, setHighlightTerms] = useState<string[]>([]);
  const [pdfPage, setPdfPage] = useState<number | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const {
    item,
    kind,
    displayName,
    streamHref,
    officeHref,
    downloadHref,
    canDownload,
    libreAvailable,
    breadcrumbs,
    prev,
    next,
    canOpenInline,
  } = current;

  // If the URL contains #page=N, respect that on first paint so deep-links
  // from the global AI search land on the right page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const match = /#page=(\d+)/.exec(window.location.hash);
    if (match) setPdfPage(Number(match[1]));
  }, []);

  useEffect(() => {
    function blockSaveAndPrint(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === "s" || key === "p")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("keydown", blockSaveAndPrint, { capture: true });
    return () => {
      window.removeEventListener("keydown", blockSaveAndPrint, { capture: true });
    };
  }, []);

  function handleHit(hit: SidebarAiHit) {
    if (hit.itemId !== item.id) return;
    if (kind === "docx") {
      setHighlightTerms(hit.highlightTerms);
    }
    if ((kind === "pdf" || kind === "doc") && hit.page !== null) {
      setPdfPage(hit.page);
    }
  }

  async function openHit(hit: SidebarAiHit) {
    if (hit.itemId === item.id) {
      handleHit(hit);
      return;
    }
    setLoadingItemId(hit.itemId);
    try {
      const res = await fetch(
        `/api/viewer/${hit.itemId}?locale=${encodeURIComponent(locale)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const nextPayload = (await res.json()) as ViewerPayload;
      setCurrent(nextPayload);
      setHighlightTerms([]);
      setPdfPage(hit.page ?? null);
      const aiQuery = new URL(window.location.href).searchParams.get("ai") ?? initialQuery ?? "";
      const href = `/${locale}/viewer/${hit.itemId}${
        aiQuery ? `?ai=${encodeURIComponent(aiQuery)}` : ""
      }${hit.page !== null ? `#page=${hit.page}` : ""}`;
      window.history.pushState({}, "", href);
    } finally {
      setLoadingItemId(null);
    }
  }

  const pdfSrc = useMemo(() => {
    const base = kind === "doc" ? officeHref : streamHref;
    const page = pdfPage ?? undefined;
    const hash = `toolbar=0&navpanes=0${page ? `&page=${page}` : ""}`;
    // A cache-busting key in the src forces the <object> to remount when the
    // page changes, which is the only reliable way to re-trigger the browser
    // PDF viewer's "go to page" behaviour on Chromium.
    const key = page ? `&_p=${page}` : "";
    return `${base}#${hash}${key}`;
  }, [kind, officeHref, streamHref, pdfPage]);

  return (
    <div
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="mb-6 flex flex-col gap-3">
        <Breadcrumbs items={breadcrumbs} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <FileIcon variant={(item.fileType ?? "other") as FileType} size={56} />
            <div className="min-w-0">
              <h1 className="section-heading line-clamp-3" title={item.name}>
                {displayName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-500 dark:text-steel-300">
                <span>
                  <span className="uppercase tracking-wider">
                    {t("typeLabel")}:
                  </span>{" "}
                  {ft(item.fileType ?? "other")}
                </span>
                {item.sizeHuman && (
                  <span>
                    <span className="uppercase tracking-wider">
                      {t("sizeLabel")}:
                    </span>{" "}
                    {item.sizeHuman}
                  </span>
                )}
                {item.modifiedAt && (
                  <span>
                    <span className="uppercase tracking-wider">
                      {t("modifiedLabel")}:
                    </span>{" "}
                    {new Date(item.modifiedAt).toLocaleDateString(locale)}
                  </span>
                )}
                {loadingItemId && <span>Loading...</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ViewerNav prev={prev} next={next} />
            <FileActions
              downloadHref={downloadHref}
              canDownload={canDownload}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_320px]">
        <div>
          {!canOpenInline && fallbackNode}
          {canOpenInline && kind === "pdf" && (
            canDownload ? (
              <PdfViewer
                key={pdfSrc}
                src={pdfSrc}
                downloadHref={downloadHref}
                title={displayName}
              />
            ) : (
              <PdfCanvasViewer
                key={pdfSrc}
                src={pdfSrc}
                title={displayName}
              />
            )
          )}
          {canOpenInline && kind === "image" && (
            <div className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={streamHref}
                alt={displayName}
                draggable={false}
                className="mx-auto max-h-[84vh] w-full max-w-full object-contain"
              />
            </div>
          )}
          {canOpenInline && kind === "docx" && (
            <DocxViewer
              key={item.id}
              streamHref={streamHref}
              title={displayName}
              highlightTerms={highlightTerms}
            />
          )}
          {canOpenInline && kind === "doc" && libreAvailable && (
            canDownload ? (
              <PdfViewer
                key={pdfSrc}
                src={pdfSrc}
                downloadHref={downloadHref}
                title={displayName}
              />
            ) : (
              <PdfCanvasViewer
                key={pdfSrc}
                src={pdfSrc}
                title={displayName}
              />
            )
          )}
          {canOpenInline && kind === "doc" && !libreAvailable && unavailableDocNode}
          {canOpenInline && kind === "other" && fallbackNode}
        </div>

        <div className="hidden xl:block">
          <SidebarAi
            locale={locale}
            contextItemId={item.id}
            onHitSelected={handleHit}
            onHitOpened={openHit}
            initialQuery={initialQuery}
          />
        </div>
      </div>
    </div>
  );
}
