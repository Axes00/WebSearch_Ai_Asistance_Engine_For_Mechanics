"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type SidebarAiHit = {
  chunkId: string;
  itemId: string;
  itemName: string;
  relativePath: string;
  fileType: string | null;
  page: number | null;
  chunkIndex: number;
  text: string;
  distance: number;
  relatedCount?: number;
  relatedPages?: number[];
  matchKind?: "filename" | "text" | "semantic";
  intent?:
    | "legislation"
    | "standard"
    | "form"
    | "publicWorks"
    | "energy"
    | "electrical"
    | "fireSafety";
  topic?: string;
  topicMatched?: boolean;
  whyMatched?: string;
  highlightTerms: string[];
};

const QUICK_SEARCHES = [
  { label: "Νομοθεσία", query: "νομοθεσία νόμος ΦΕΚ κανονισμός" },
  { label: "Πρότυπα", query: "πρότυπα ΕΛΟΤ τεχνικές προδιαγραφές" },
  {
    label: "Έντυπα / Πρωτόκολλα",
    query: "έντυπα πρωτόκολλο έλεγχος υπεύθυνη δήλωση",
  },
  {
    label: "Δημόσια Έργα",
    query: "δημόσια έργα Ν 4412 συμβάσεις τεχνικά έργα",
  },
  { label: "ΚΕΝΑΚ / Ενέργεια", query: "ΚΕΝΑΚ ενεργειακή απόδοση κτιρίων" },
  { label: "Ηλεκτρολογικά", query: "ΕΛΟΤ HD 384 ΚΕΗΕ ηλεκτρική εγκατάσταση" },
  {
    label: "Πυρασφάλεια",
    query: "πυρασφάλεια πυροπροστασία πυροσβεστική διάταξη",
  },
];

const STORAGE_KEY = "mechanica.aiSidebarState.v1";

/**
 * Active AI sidebar — semantic search over the local embedding store.
 *
 * Two modes:
 *  - `contextItemId` set → results are scoped to the open document and
 *    clicking a hit activates in-document highlighting via `onHitSelected`.
 *  - `contextItemId` null → global library search. Hits become links to the
 *    matching document's viewer page.
 *
 * Keyboard: Ctrl/Cmd + K focuses the input, Esc clears results.
 * URL: The current query is kept in sync with `?ai=...` for shareable links.
 */
export default function SidebarAi({
  locale,
  contextItemId,
  onHitSelected,
  onHitOpened,
  initialQuery,
  layout = "sidebar",
}: {
  locale: string;
  contextItemId?: string | null;
  onHitSelected?: (hit: SidebarAiHit) => void;
  onHitOpened?: (hit: SidebarAiHit) => void;
  initialQuery?: string;
  layout?: "sidebar" | "inline";
}) {
  const t = useTranslations("sidebar");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [scopeToDoc, setScopeToDoc] = useState(false);
  const [hits, setHits] = useState<SidebarAiHit[]>([]);
  const [selectedHitKey, setSelectedHitKey] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "searching" | "ok" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastAutoRef = useRef<string>("");
  const restoredRef = useRef(false);

  const doSearch = useCallback(
    async (q: string, searchScopeToDoc = scopeToDoc) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setHits([]);
        setState("idle");
        return;
      }
      setState("searching");
      setSelectedHitKey(null);
      setErrorMsg(null);
      try {
        const res = await fetch("/api/ai/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: trimmed,
            itemId:
              searchScopeToDoc && contextItemId ? contextItemId : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState("error");
          setErrorMsg(
            res.status === 503
              ? t("aiIndexingNotice")
              : data?.error || `HTTP ${res.status}`
          );
          setHits([]);
          return;
        }
        setHits(data.hits ?? []);
        setState("ok");
      } catch (err) {
        setState("error");
        setErrorMsg((err as Error).message);
        setHits([]);
      }
    },
    [contextItemId, scopeToDoc, t]
  );

  // Keep URL in sync for shareable AI links (?ai=<query>).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (query.trim()) {
      url.searchParams.set("ai", query.trim());
    } else {
      url.searchParams.delete("ai");
    }
    window.history.replaceState({}, "", url.toString());
  }, [query]);

  // Keep the last AI result set alive across client navigations to a viewer.
  useEffect(() => {
    if (typeof window === "undefined" || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        query?: string;
        hits?: SidebarAiHit[];
        selectedHitKey?: string | null;
      };
      const savedQuery = saved.query?.trim();
      if (!savedQuery || !Array.isArray(saved.hits)) return;
      if (initialQuery && initialQuery.trim() !== savedQuery) return;
      setQuery(savedQuery);
      setHits(saved.hits);
      setSelectedHitKey(saved.selectedHitKey ?? null);
      setState("ok");
      lastAutoRef.current = savedQuery;
    } catch {
      // Ignore corrupted browser state.
    }
  }, [initialQuery]);

  useEffect(() => {
    if (typeof window === "undefined" || hits.length === 0) return;
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ query, hits, selectedHitKey })
    );
  }, [hits, query, selectedHitKey]);

  // Auto-run search when arriving with ?ai=… in the URL.
  useEffect(() => {
    if (initialQuery && initialQuery !== lastAutoRef.current) {
      lastAutoRef.current = initialQuery;
      void doSearch(initialQuery);
    }
  }, [initialQuery, doSearch]);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        setHits([]);
        setState("idle");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void doSearch(query);
  }

  function runQuickSearch(q: string) {
    setScopeToDoc(false);
    setQuery(q);
    setSelectedHitKey(null);
    void doSearch(q, false);
  }

  return (
    <aside
      className={
        layout === "sidebar" ? "card p-5 lg:sticky lg:top-24" : "card p-5"
      }
      aria-describedby="ai-sidebar-desc"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-deepblue/10 text-deepblue">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden
            >
              <path d="M12 2a1 1 0 0 1 1 1v1.05a7 7 0 0 1 5.95 5.95H20a1 1 0 0 1 0 2h-1.05A7 7 0 0 1 13 17.95V19a1 1 0 0 1-2 0v-1.05A7 7 0 0 1 5.05 12H4a1 1 0 0 1 0-2h1.05A7 7 0 0 1 11 4.05V3a1 1 0 0 1 1-1Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-ink dark:text-paper">
              {t("aiTitle")}
            </p>
            <p className="text-xs uppercase tracking-wider text-cyan-accent">
              {t("aiSubtitle")}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <textarea
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void doSearch(query);
            }
          }}
          placeholder={t("aiPlaceholder")}
          rows={2}
          className="input-field min-h-20 max-h-40 resize-y py-4 text-sm font-semibold leading-relaxed sm:min-h-24 sm:text-base lg:min-h-24"
        />
        {contextItemId && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-steel-500 dark:text-steel-300">
            <input
              type="checkbox"
              checked={scopeToDoc}
              onChange={(e) => setScopeToDoc(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-steel-300"
            />
            {t("aiInDocumentToggle")}
          </label>
        )}
      </form>

      <p
        id="ai-sidebar-desc"
        className="mt-3 text-xs font-semibold leading-relaxed text-steel-600 dark:text-steel-200"
      >
        {t("aiDescription")}
      </p>

      <p className="mt-3 text-xs font-semibold leading-relaxed text-steel-600 dark:text-steel-200">
        Δοκιμάστε θέμα, νόμο, πρότυπο ή χρήση: π.χ. ΚΕΝΑΚ, Ν.4412, ΕΛΟΤ HD
        384.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_SEARCHES.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => runQuickSearch(chip.query)}
            className="rounded-full border border-steel-200/80 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-steel-700 transition hover:border-cyan-accent/60 hover:text-deepblue dark:border-white/10 dark:bg-white/5 dark:text-steel-200 dark:hover:bg-white/10"
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {state === "searching" && (
          <p className="text-xs text-steel-500 dark:text-steel-300">
            {t("aiSearching")}
          </p>
        )}
        {state === "error" && errorMsg && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMsg}
          </p>
        )}
        {state === "ok" && hits.length === 0 && (
          <p className="text-xs font-semibold text-steel-500 dark:text-steel-300">
            {scopeToDoc && contextItemId
              ? "Δεν βρέθηκε στο τρέχον έγγραφο."
              : t("aiNoResults")}
          </p>
        )}
        {hits.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-steel-400">
              {t("aiResultsHint")}
            </p>
            <ul className="space-y-2">
              {hits.map((hit) => (
                <li key={hit.chunkId}>
                  <HitCard
                    hit={hit}
                    query={query}
                    locale={locale}
                    isInContext={
                      scopeToDoc && contextItemId
                        ? hit.itemId === contextItemId
                        : false
                    }
                    isSelected={hitKey(hit) === selectedHitKey}
                    onPendingSelect={() => setSelectedHitKey(hitKey(hit))}
                    onSelect={onHitSelected}
                    onOpen={onHitOpened}
                    pageBadge={
                      hit.page !== null
                        ? t("aiPageBadge", { page: hit.page })
                        : null
                    }
                    openLabel={t("aiOpen")}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

function hitKey(hit: SidebarAiHit): string {
  return `${hit.itemId}:${hit.chunkId}:${hit.page ?? ""}`;
}

function HitCard({
  hit,
  query,
  locale,
  isInContext,
  isSelected,
  onPendingSelect,
  onSelect,
  onOpen,
  pageBadge,
  openLabel,
}: {
  hit: SidebarAiHit;
  query: string;
  locale: string;
  isInContext: boolean;
  isSelected: boolean;
  onPendingSelect: () => void;
  onSelect?: (hit: SidebarAiHit) => void;
  onOpen?: (hit: SidebarAiHit) => void;
  pageBadge: string | null;
  openLabel: string;
}) {
  const cleanText = hit.text.replace(/\s+/g, " ").trim();
  const snippet =
    cleanText.length > 280 ? cleanText.slice(0, 280) + "..." : cleanText;
  const title = isInContext
    ? pageBadge ??
      (hit.chunkIndex >= 0 ? `Απόσπασμα ${hit.chunkIndex + 1}` : hit.itemName)
    : hit.itemName;
  const resultBadge =
    !isInContext && (hit.relatedCount ?? 1) > 1
      ? `${hit.relatedCount} σχετικά σημεία`
      : pageBadge;
  const pages =
    !isInContext && hit.relatedPages && hit.relatedPages.length > 0
      ? `Σελίδες: ${hit.relatedPages.join(", ")}`
      : null;

  const body = (
    <div
      className={`group min-h-[7.5rem] rounded-lg border p-4 text-left transition hover:border-cyan-accent/60 hover:bg-white dark:hover:bg-white/10 ${
        isSelected
          ? "border-cyan-accent/80 bg-cyan-accent/10 ring-1 ring-cyan-accent/40 dark:bg-cyan-accent/10"
          : "border-steel-200/80 bg-white/60 dark:border-white/10 dark:bg-white/5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-ink dark:text-paper">
          {title}
        </p>
        {resultBadge && (
          <span className="shrink-0 rounded-full bg-deepblue/10 px-2 py-0.5 text-[10px] font-semibold text-deepblue">
            {resultBadge}
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-steel-600 dark:text-steel-300">
        {snippet}
      </p>
      {pages && (
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-cyan-accent">
          {pages}
        </p>
      )}
      {hit.whyMatched && (
        <p className="mt-2 text-[10px] font-semibold text-steel-500 dark:text-steel-300">
          {hit.whyMatched}
        </p>
      )}
    </div>
  );

  if (isInContext && onSelect) {
    return (
      <button
        type="button"
        onClick={() => {
          onPendingSelect();
          onSelect(hit);
        }}
        className="block w-full"
      >
        {body}
      </button>
    );
  }

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          onPendingSelect();
          onOpen(hit);
        }}
        className="block w-full"
      >
        {body}
      </button>
    );
  }

  const aiQuery = query;
  const href =
    hit.page !== null
      ? `/${locale}/viewer/${hit.itemId}?ai=${encodeURIComponent(
          aiQuery
        )}#page=${hit.page}`
      : `/${locale}/viewer/${hit.itemId}?ai=${encodeURIComponent(
          aiQuery
        )}`;
  return (
    <Link
      href={href}
      className="block"
      aria-label={openLabel}
      onClick={onPendingSelect}
    >
      {body}
    </Link>
  );
}
