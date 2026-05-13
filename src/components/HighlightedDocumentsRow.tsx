"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/routing";

import FileIcon from "./FileIcon";
import { prettyDisplayName } from "@/lib/format";
import type { LibraryItemDTO } from "@/types/library";
import type { FileType } from "@/lib/fileTypes";

/**
 * Horizontal row of highlighted (introductory) documents surfaced on the
 * homepage. The dataset is fetched on the server and passed in as a prop.
 */
export default function HighlightedDocumentsRow({
  items,
  locale,
}: {
  items: LibraryItemDTO[];
  locale: string;
}) {
  const t = useTranslations("home.highlights");
  const c = useTranslations("common");

  if (items.length === 0) return null;

  return (
    <section className="relative border-t border-steel-200/60 bg-paper py-14 dark:border-steel-700 dark:bg-ink-soft md:py-20">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="section-heading">{t("title")}</h2>
            <p className="section-subtle mt-2">{t("subtitle")}</p>
          </div>
          <Link
            href="/library"
            className="btn-secondary"
          >
            {c("actions.browse")}
          </Link>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item, index) => {
            const url = linkForFile(item, locale);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.35) }}
              >
                <a
                  href={url}
                  className="group card card-hover flex h-full min-h-[9rem] items-start gap-4 p-6"
                >
                  <FileIcon variant={(item.fileType ?? "other") as FileType} size={56} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-3 text-sm font-semibold text-ink dark:text-paper group-hover:text-deepblue">
                      {prettyDisplayName(item.name, item.itemType)}
                    </p>
                    <p className="mt-1 text-xs text-steel-500 dark:text-steel-300">
                      {[item.fileType?.toUpperCase(), item.sizeHuman]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </a>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function linkForFile(item: LibraryItemDTO, locale: string): string {
  // Always route highlights through the viewer — inline preview + any admin-
  // allowed download action happens there.
  return `/${locale}/viewer/${item.id}`;
}
