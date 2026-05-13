"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";

import { prettyDisplayName } from "@/lib/format";
import FileIcon from "./FileIcon";
import type { LibraryItemDTO } from "@/types/library";

const MotionLink = motion(Link);

export default function FolderCard({
  item,
  href,
  index = 0,
}: {
  item: LibraryItemDTO;
  href: string;
  index?: number;
}) {
  const t = useTranslations("fileTypes");

  return (
    <MotionLink
      href={href}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.02, 0.25) }}
      className={clsx(
        "card card-hover group flex items-center gap-4 p-6",
        "relative min-h-[9.25rem] overflow-hidden"
      )}
    >
      <FileIcon variant="folder" size={60} />
      <div className="min-w-0 flex-1">
        {item.libraryCode && (
          <span className="chip border-cyan-accent/30 bg-cyan-accent/10 text-cyan-accent">
            {item.libraryCode}
          </span>
        )}
        <p
          className="mt-1 line-clamp-3 text-sm font-semibold text-ink dark:text-paper group-hover:text-deepblue"
          title={item.name}
        >
          {prettyDisplayName(item.name, "folder")}
        </p>
        <p className="mt-1 text-xs text-steel-500 dark:text-steel-300">
          {t("folder")}
        </p>
      </div>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-5 w-5 shrink-0 text-steel-300 transition group-hover:translate-x-0.5 group-hover:text-deepblue"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M7.72 14.78a.75.75 0 0 1 0-1.06L11.44 10 7.72 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Z"
          clipRule="evenodd"
        />
      </svg>
    </MotionLink>
  );
}
