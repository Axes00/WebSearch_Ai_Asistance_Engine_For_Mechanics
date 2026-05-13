"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import AdminExplorer from "./AdminExplorer";
import AdminHighlightsPanel from "./AdminHighlightsPanel";
import AdminReindexPanel from "./AdminReindexPanel";
import AdminAiPanel from "./AdminAiPanel";

type TabKey = "explorer" | "highlights" | "reindex" | "ai";

export default function AdminTabs() {
  const t = useTranslations("admin.tabs");
  const tc = useTranslations("common.actions");
  const [tab, setTab] = useState<TabKey>("explorer");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "explorer", label: t("explorer") },
    { key: "highlights", label: tc("search") },
    { key: "reindex", label: t("reindex") },
    { key: "ai", label: t("ai") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-steel-200 pb-3 dark:border-steel-700">
        {tabs.map((tb) => {
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={
                "rounded-t-lg px-4 py-2 text-sm font-semibold transition " +
                (active
                  ? "bg-deepblue text-white"
                  : "text-steel-600 hover:bg-paper dark:text-steel-300 dark:hover:bg-ink-soft")
              }
              aria-pressed={active}
            >
              {tb.label}
            </button>
          );
        })}
      </div>

      {tab === "explorer" && <AdminExplorer />}
      {tab === "highlights" && <AdminHighlightsPanel />}
      {tab === "reindex" && <AdminReindexPanel />}
      {tab === "ai" && <AdminAiPanel />}
    </div>
  );
}
