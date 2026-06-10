"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type AiRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  itemsProcessed: number;
  chunksCreated: number;
  status: "running" | "success" | "failed" | "skipped";
  errors: string | null;
};

export default function AdminAiPanel() {
  const t = useTranslations("admin.ai");
  const [run, setRun] = useState<AiRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reindex-ai");
      if (!res.ok) return;
      const data = await res.json();
      setRun(data.run ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchLatest();
    const tm = setInterval(fetchLatest, 3000);
    return () => clearInterval(tm);
  }, [fetchLatest]);

  async function startRun() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reindex-ai", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRun(data.run);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stopRun() {
    setStopping(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reindex-ai", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRun(data.run);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStopping(false);
    }
  }

  const statusColor =
    run?.status === "success"
      ? "text-green-600"
      : run?.status === "failed"
      ? "text-red-600"
      : "text-steel-500";

  return (
    <section className="card p-6 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink dark:text-paper">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-steel-500 dark:text-steel-300">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {run?.status === "running" && (
            <button
              type="button"
              onClick={stopRun}
              disabled={stopping}
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              {stopping ? t("stopping") : t("stop")}
            </button>
          )}
          <button
            type="button"
            onClick={startRun}
            disabled={busy || run?.status === "running"}
            className="btn-primary"
          >
            {busy ? t("running") : t("button")}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {run && (
        <div className="mt-5 grid gap-4 text-sm md:grid-cols-4">
          <Stat label={t("lastRun")} value={new Date(run.startedAt).toLocaleString()} />
          <Stat
            label="Status"
            value={run.status}
            valueClassName={statusColor}
          />
          <Stat label={t("stats.items")} value={run.itemsProcessed} />
          <Stat label={t("stats.chunks")} value={run.chunksCreated} />
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-steel-500">
        {label}
      </p>
      <p className={"mt-1 font-semibold text-ink dark:text-paper " + (valueClassName ?? "")}>
        {value}
      </p>
    </div>
  );
}
