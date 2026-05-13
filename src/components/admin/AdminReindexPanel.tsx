"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type IndexRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  itemsScanned: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsRemoved: number;
  status: "running" | "success" | "failed";
  errors: string | null;
};

export default function AdminReindexPanel() {
  const t = useTranslations("admin.reindex");
  const [run, setRun] = useState<IndexRun | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/reindex")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setRun(data.run ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function trigger() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reindex", { method: "POST" });
      const data = await res.json();
      if (data?.run) {
        setRun({
          id: data.run.runId ?? data.run.id,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          itemsScanned: data.run.itemsScanned ?? 0,
          itemsCreated: data.run.itemsCreated ?? 0,
          itemsUpdated: data.run.itemsUpdated ?? 0,
          itemsRemoved: data.run.itemsRemoved ?? 0,
          status: data.run.status,
          errors: null,
        });
      }
    } finally {
      setBusy(false);
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
        <button
          type="button"
          onClick={trigger}
          disabled={busy}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? t("running") : t("button")}
        </button>
      </div>

      {run && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label={t("stats.scanned")} value={run.itemsScanned} />
          <Stat label={t("stats.created")} value={run.itemsCreated} />
          <Stat label={t("stats.updated")} value={run.itemsUpdated} />
          <Stat label={t("stats.removed")} value={run.itemsRemoved} />
          <Stat
            label="Status"
            value={t(`status.${run.status}` as "status.running" | "status.success" | "status.failed")}
          />
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-steel-200 bg-white px-4 py-3 dark:border-steel-700 dark:bg-ink-soft">
      <p className="text-xs uppercase tracking-wider text-steel-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink dark:text-paper">
        {value}
      </p>
    </div>
  );
}
