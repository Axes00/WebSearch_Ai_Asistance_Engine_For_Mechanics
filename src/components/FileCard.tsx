"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { prettyDisplayName } from "@/lib/format";
import FileIcon from "./FileIcon";
import type { LibraryItemDTO } from "@/types/library";
import type { FileType } from "@/lib/fileTypes";

const MotionLink = motion(Link);

export default function FileCard({
  item,
  locale,
  index = 0,
}: {
  item: LibraryItemDTO;
  locale: string;
  index?: number;
}) {
  const t = useTranslations("fileTypes");

  const href = hrefForFile(item, locale);
  const typeLabel = t(item.fileType ?? "other");

  return (
    <MotionLink
      href={href}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.02, 0.25) }}
      className="card card-hover group flex min-h-[9.25rem] items-start gap-4 p-6"
    >
      <FileIcon variant={(item.fileType ?? "other") as FileType} size={60} />
      <div className="min-w-0 flex-1">
        <p
          className="line-clamp-4 text-sm font-semibold text-ink dark:text-paper group-hover:text-deepblue"
          title={item.name}
        >
          {prettyDisplayName(item.name, "file")}
        </p>
        <p className="mt-1 flex items-center gap-2 text-xs text-steel-500 dark:text-steel-300">
          <span>{typeLabel}</span>
          {item.sizeHuman && (
            <>
              <span className="h-1 w-1 rounded-full bg-steel-300" />
              <span>{item.sizeHuman}</span>
            </>
          )}
        </p>
      </div>
    </MotionLink>
  );
}

export function hrefForFile(item: LibraryItemDTO, locale: string): string {
  // All files open in the viewer. Download availability is gated server-side
  // via the `isDownloadable` flag.
  return `/${locale}/viewer/${item.id}`;
}
