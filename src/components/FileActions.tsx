"use client";

import { useTranslations } from "next-intl";

export default function FileActions({
  downloadHref,
  canDownload = true,
}: {
  downloadHref: string;
  canDownload?: boolean;
}) {
  const t = useTranslations("viewer");

  return (
    <div className="flex flex-wrap gap-3">
      {canDownload && (
        <a href={downloadHref} className="btn-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M10 3a.75.75 0 0 1 .75.75v7.69l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 1 1 1.06-1.06l2.72 2.72V3.75A.75.75 0 0 1 10 3Zm-6 12a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H4.75A.75.75 0 0 1 4 15Z"
              clipRule="evenodd"
            />
          </svg>
          {t("download")}
        </a>
      )}
    </div>
  );
}
