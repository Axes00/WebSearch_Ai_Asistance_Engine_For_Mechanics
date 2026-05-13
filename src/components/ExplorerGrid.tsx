"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import SearchBar from "./SearchBar";
import FolderCard from "./FolderCard";
import FileCard from "./FileCard";
import EmptyState from "./EmptyState";
import SidebarAi from "./SidebarAi";
import Breadcrumbs from "./Breadcrumbs";
import type { LibraryBreadcrumb, LibraryItemDTO } from "@/types/library";

export type FolderWithHref = LibraryItemDTO & { href: string };

function foldMatch(haystack: string, needle: string): boolean {
  const strip = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  return strip(haystack).includes(strip(needle));
}

/**
 * The single explorer layout, reused by:
 *  - /[locale]/library (top-level groups, no breadcrumbs beyond "Library")
 *  - /[locale]/library/[...slug] (any depth, full breadcrumbs)
 *
 * Server components upstream fetch folders/files already filtered and
 * pass them down — this stays purely presentational + local search.
 */
export default function ExplorerGrid({
  locale,
  title,
  subtitle,
  breadcrumbs,
  folders,
  files,
  searchPlaceholderKey,
}: {
  locale: string;
  title: string;
  subtitle?: string;
  breadcrumbs: LibraryBreadcrumb[];
  /** Folders must have a precomputed `href` so we don't pass functions
   *  from the server component to this client component. */
  folders: FolderWithHref[];
  files: LibraryItemDTO[];
  searchPlaceholderKey?: string;
}) {
  const t = useTranslations("library");
  const [query, setQuery] = useState("");

  const filteredFolders = useMemo(
    () => (query ? folders.filter((f) => foldMatch(f.name, query)) : folders),
    [folders, query]
  );
  const filteredFiles = useMemo(
    () => (query ? files.filter((f) => foldMatch(f.name, query)) : files),
    [files, query]
  );

  const totalVisible = filteredFolders.length + filteredFiles.length;

  return (
    <div className="explorer-bg min-h-[calc(100vh-4rem)] pb-20">
      <div className="mx-auto max-w-7xl px-5 pt-10 md:px-8 md:pt-14">
        {/* Heading */}
        <div className="flex flex-col gap-3">
          <Breadcrumbs items={breadcrumbs} />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="section-heading line-clamp-2">{title}</h1>
              {subtitle && <p className="section-subtle mt-1">{subtitle}</p>}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="mt-6 max-w-2xl">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholderKey={searchPlaceholderKey ?? "library.searchPlaceholder"}
          />
        </div>

        <div className="mt-6">
          <SidebarAi locale={locale} layout="inline" />
        </div>

        {/* Content */}
        <div className="mt-8">
          {filteredFolders.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-steel-500">
                {t("items.folders")}
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredFolders.map((f, i) => (
                  <FolderCard key={f.id} item={f} href={f.href} index={i} />
                ))}
              </div>
            </section>
          )}

          {filteredFiles.length > 0 && (
            <section>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-steel-500">
                {t("items.files")}
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredFiles.map((f, i) => (
                  <FileCard key={f.id} item={f} locale={locale} index={i} />
                ))}
              </div>
            </section>
          )}

          {totalVisible === 0 && (
            <EmptyState
              title={t("empty.title")}
              subtitle={t("empty.subtitle")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
