"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";

import FileIcon from "@/components/FileIcon";
import SearchBar from "@/components/SearchBar";
import { prettyDisplayName } from "@/lib/format";
import type { LibraryItemDTO } from "@/types/library";
import type { FileType } from "@/lib/fileTypes";

export default function AdminHighlightsPanel() {
  const t = useTranslations("admin.highlights");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LibraryItemDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const url = new URL("/api/admin/highlights", window.location.origin);
      if (query) url.searchParams.set("q", query);
      const res = await fetch(url.toString());
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(q);
  }, [q, fetchItems]);

  async function toggle(item: LibraryItemDTO) {
    const next = !item.isHighlighted;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isHighlighted: next } : i))
    );
    try {
      await fetch("/api/admin/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, isHighlighted: next }),
      });
    } catch {
      // Revert on failure.
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, isHighlighted: !next } : i
        )
      );
    }
  }

  return (
    <section className="card p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink dark:text-paper">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-steel-500 dark:text-steel-300">
            {t("description")}
          </p>
        </div>
      </div>

      <div className="mt-5 max-w-xl">
        <SearchBar value={q} onChange={setQ} />
      </div>

      <div className="mt-5">
        {loading && items.length === 0 ? (
          <p className="text-sm text-steel-500">…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-steel-500">{t("emptyHint")}</p>
        ) : (
          <ul className="divide-y divide-steel-200 dark:divide-steel-700">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-4 py-3"
                title={item.name}
              >
                <FileIcon
                  variant={(item.fileType ?? "other") as FileType}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium text-ink dark:text-paper">
                    {prettyDisplayName(item.name, item.itemType)}
                  </p>
                  <p className="text-xs text-steel-500">
                    {item.relativePath}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  aria-pressed={item.isHighlighted}
                  className={
                    "inline-flex h-6 w-11 shrink-0 items-center rounded-full transition " +
                    (item.isHighlighted
                      ? "bg-deepblue"
                      : "bg-steel-300 dark:bg-steel-700")
                  }
                >
                  <span
                    className={
                      "inline-block h-5 w-5 transform rounded-full bg-white transition " +
                      (item.isHighlighted ? "translate-x-5" : "translate-x-0.5")
                    }
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
