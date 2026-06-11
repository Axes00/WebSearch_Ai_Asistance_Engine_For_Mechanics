"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export default function PdfCanvasViewer({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const t = useTranslations("viewer");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanupCanvases: HTMLCanvasElement[] = [];

    async function renderPdf() {
      setState("loading");
      setErrorMsg(null);
      const container = containerRef.current;
      if (!container) return;
      container.replaceChildren();

      try {
        const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url
        ).toString();

        const sourceUrl = src.split("#")[0];
        const response = await fetch(sourceUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        if (cancelled) return;

        const pdf = await pdfjs.getDocument({ data }).promise;
        const maxWidth = Math.min(container.clientWidth || 900, 980);
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          const scale = Math.max(0.6, Math.min(1.8, maxWidth / viewport.width));
          const scaled = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas rendering is unavailable");
          canvas.width = Math.ceil(scaled.width);
          canvas.height = Math.ceil(scaled.height);
          canvas.className =
            "mx-auto mb-5 block max-w-full rounded-sm bg-white shadow-card";
          canvas.setAttribute("aria-label", `${title} - page ${pageNumber}`);
          canvas.setAttribute("data-page", String(pageNumber));
          canvas.addEventListener("contextmenu", preventDefault);
          container.appendChild(canvas);
          cleanupCanvases.push(canvas);

          await page.render({ canvasContext: context, viewport: scaled }).promise;
        }

        if (!cancelled) setState("ready");
      } catch (err) {
        if (!cancelled) {
          setErrorMsg((err as Error).message);
          setState("error");
        }
      }
    }

    void renderPdf();
    return () => {
      cancelled = true;
      for (const canvas of cleanupCanvases) {
        canvas.removeEventListener("contextmenu", preventDefault);
      }
      cleanupCanvases = [];
    };
  }, [src, title]);

  return (
    <div
      className="card overflow-hidden"
      onContextMenu={preventDefault}
      onDragStart={preventDefault}
    >
      <div className="min-h-[72vh] max-h-[84vh] overflow-y-auto bg-steel-100/70 p-3 dark:bg-ink/70 sm:p-4">
        {state === "loading" && (
          <p className="p-6 text-sm text-steel-500 dark:text-steel-300">
            {t("loadingPreview")}
          </p>
        )}
        {state === "error" && (
          <div className="p-6">
            <p className="text-sm font-semibold text-ink dark:text-paper">
              {t("previewFailed")}
            </p>
            {errorMsg && (
              <p className="mt-1 text-xs text-steel-500 dark:text-steel-300">
                {errorMsg}
              </p>
            )}
          </div>
        )}
        <div
          ref={containerRef}
          aria-label={title}
          className={state === "error" ? "hidden" : ""}
        />
      </div>
    </div>
  );
}

function preventDefault(event: Event | React.SyntheticEvent) {
  event.preventDefault();
}
