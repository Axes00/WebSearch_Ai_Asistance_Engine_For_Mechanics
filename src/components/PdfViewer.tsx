"use client";

import { useTranslations } from "next-intl";

/**
 * V1 PDF viewer.
 *
 * We intentionally rely on the browser's built-in PDF renderer via an
 * <object> tag streaming from our own /api/files/stream/[id] endpoint.
 * This keeps the bundle light, avoids PDF.js worker/SSR headaches, and
 * handles 99 % of modern desktop + tablet browsers cleanly.
 *
 * The plan anticipates swapping this out for react-pdf (PDF.js) once we
 * need per-page thumbnails, inline annotations or AI-backed highlights.
 */
export default function PdfViewer({
  src,
  downloadHref,
  title,
}: {
  src: string;
  downloadHref?: string;
  title: string;
}) {
  const t = useTranslations("viewer");

  // `#toolbar=0&navpanes=0` hides Chromium's save/print buttons; defence-in-depth
  // alongside the server-side isDownloadable flag.
  const safeSrc = src.includes("#") ? src : `${src}#toolbar=0&navpanes=0`;
  return (
    <div className="card overflow-hidden">
      <div className="relative min-h-[72vh] w-full lg:min-h-[84vh]">
        <object
          data={safeSrc}
          type="application/pdf"
          aria-label={title}
          className="absolute inset-0 h-full w-full"
        >
          {/* Fallback for browsers without inline PDF rendering. */}
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-semibold text-ink dark:text-paper">
              {t("pdfFallbackTitle")}
            </p>
            <p className="max-w-md text-sm text-steel-500 dark:text-steel-300">
              {t("pdfFallbackDescription")}
            </p>
            {downloadHref ? (
              <a href={downloadHref} className="btn-primary">
                {t("download")}
              </a>
            ) : null}
          </div>
        </object>
      </div>
    </div>
  );
}
