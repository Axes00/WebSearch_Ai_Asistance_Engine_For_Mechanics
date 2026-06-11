"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type PreviewPage = {
  page: number;
  href: string;
};

export default function PdfImagePreview({
  manifestHref,
  title,
}: {
  manifestHref: string;
  title: string;
}) {
  const t = useTranslations("viewer");
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadManifest() {
      setState("loading");
      setErrorMsg(null);
      try {
        const res = await fetch(manifestHref, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { pages?: PreviewPage[] };
        if (cancelled) return;
        setPages(data.pages ?? []);
        setState("ready");
      } catch (err) {
        if (!cancelled) {
          setErrorMsg((err as Error).message);
          setState("error");
        }
      }
    }
    void loadManifest();
    return () => {
      cancelled = true;
    };
  }, [manifestHref]);

  return (
    <div
      className="card overflow-hidden"
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
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
        {state === "ready" && (
          <div className="space-y-5">
            {pages.map((page) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={page.page}
                src={page.href}
                alt={`${title} - page ${page.page}`}
                draggable={false}
                className="mx-auto block max-w-full rounded-sm bg-white shadow-card"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
