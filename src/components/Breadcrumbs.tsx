"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/routing";

import type { LibraryBreadcrumb } from "@/types/library";

export default function Breadcrumbs({
  items,
  localeHref = "/library",
}: {
  items: LibraryBreadcrumb[];
  /** Fallback root href used for the "Library" segment. */
  localeHref?: string;
}) {
  const t = useTranslations("library");

  // Pull the locale-rooted base from any item href like "/el/library/..."
  const libraryBase = items[0]?.href?.match(/^\/(el|en)\/library/)?.[0] ?? localeHref;

  return (
    <nav
      aria-label="breadcrumb"
      className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-steel-500 dark:text-steel-300"
    >
      <Link href="/" className="hover:text-deepblue">
        {t("breadcrumbHome")}
      </Link>
      <Separator />
      <Link
        href="/library"
        className="hover:text-deepblue"
        // When we already have a locale-aware base we let next-intl build the URL.
      >
        {t("breadcrumbLibrary")}
      </Link>
      {items.map((item, i) => (
        <span key={item.id ?? i} className="flex items-center gap-1">
          <Separator />
          {i < items.length - 1 ? (
            <a href={item.href} className="hover:text-deepblue">
              {item.name}
            </a>
          ) : (
            <span
              className="line-clamp-1 max-w-[24rem] text-ink dark:text-paper"
              title={item.name}
            >
              {item.name}
            </span>
          )}
        </span>
      ))}
      <span className="sr-only">{libraryBase}</span>
    </nav>
  );
}

function Separator() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 opacity-60"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.72 14.78a.75.75 0 0 1 0-1.06L11.44 10 7.72 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
