"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import FileIcon from "@/components/FileIcon";
import SearchBar from "@/components/SearchBar";
import SidebarAi from "@/components/SidebarAi";
import { prettyDisplayName } from "@/lib/format";
import type { FileType } from "@/lib/fileTypes";
import type { LibraryItemDTO, LibraryBreadcrumb } from "@/types/library";

/**
 * Full-featured admin explorer.
 *
 * Features:
 *  - Folder navigation via breadcrumbs + click-to-enter folders.
 *  - Multi-select with per-row checkboxes + "select all".
 *  - Upload zone (drag-and-drop or pick) that targets the current folder.
 *  - Create folder, delete selected, toggle downloadability (bulk), move
 *    selected to a picked destination folder.
 *  - Uses only existing /api/admin/* endpoints - no new server deps here.
 */
export default function AdminExplorer() {
  const locale = useLocale();
  const t = useTranslations("admin.explorer");
  const tc = useTranslations("common.actions");
  const tl = useTranslations("library.items");

  const [parentId, setParentId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<LibraryBreadcrumb[]>([]);
  const [items, setItems] = useState<LibraryItemDTO[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(
    null
  );
  const [movePickerOpen, setMovePickerOpen] = useState(false);

  const fetchFolder = useCallback(async (pId: string | null) => {
    setBusy(true);
    try {
      const url = new URL("/api/admin/browse", window.location.origin);
      url.searchParams.set("parentId", pId ?? "root");
      const res = await fetch(url.toString());
      const data = await res.json();
      setBreadcrumbs(data.breadcrumbs ?? []);
      setItems(data.items ?? []);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void fetchFolder(parentId);
  }, [parentId, fetchFolder]);

  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(tm);
  }, [toast]);

  const filteredItems = useMemo(
    () => filterAdminItems(items, query),
    [items, query]
  );
  const folders = useMemo(
    () => filteredItems.filter((item) => item.itemType === "folder"),
    [filteredItems]
  );
  const files = useMemo(
    () => filteredItems.filter((item) => item.itemType === "file"),
    [filteredItems]
  );
  const allChecked =
    filteredItems.length > 0 && filteredItems.every((i) => selected.has(i.id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        filteredItems.forEach((item) => next.delete(item.id));
      } else {
        filteredItems.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    try {
      const form = new FormData();
      if (parentId) form.append("parentId", parentId);
      for (const f of list) form.append("files", f);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      setToast({ kind: "success", msg: t("uploadDone") });
      await fetchFolder(parentId);
    } catch (err) {
      setToast({ kind: "error", msg: `${t("uploadFailed")}: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function createFolder() {
    const name = window.prompt(t("newFolderPrompt"));
    if (!name || !name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId, name: name.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      setToast({ kind: "success", msg: t("actionSuccess") });
      await fetchFolder(parentId);
    } catch (err) {
      setToast({ kind: "error", msg: `${t("actionFailed")}: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    const ok = window.confirm(adminCopy(locale).hidePrompt(selected.size));
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), confirm: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      setToast({ kind: "success", msg: t("actionSuccess") });
      await fetchFolder(parentId);
    } catch (err) {
      setToast({ kind: "error", msg: `${t("actionFailed")}: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function permanentlyDeleteSelected() {
    if (selected.size === 0) return;
    const confirmation = window.prompt(
      adminCopy(locale).permanentDeletePrompt(selected.size)
    );
    if (confirmation !== "DELETE") return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/permanent-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), confirm: "DELETE" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || JSON.stringify(data.errors));
      setToast({ kind: "success", msg: t("actionSuccess") });
      await fetchFolder(parentId);
    } catch (err) {
      setToast({ kind: "error", msg: `${t("actionFailed")}: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function setVisibleBulk(visible: boolean) {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selected),
          visible,
          recursive: true,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setToast({ kind: "success", msg: t("actionSuccess") });
      await fetchFolder(parentId);
    } catch (err) {
      setToast({ kind: "error", msg: `${t("actionFailed")}: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function setDownloadableBulk(value: boolean) {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/downloadable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selected),
          isDownloadable: value,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setToast({ kind: "success", msg: t("actionSuccess") });
      await fetchFolder(parentId);
    } catch (err) {
      setToast({ kind: "error", msg: `${t("actionFailed")}: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function moveSelectedTo(targetParentId: string | null) {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selected),
          targetParentId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setToast({ kind: "success", msg: t("actionSuccess") });
      setMovePickerOpen(false);
      await fetchFolder(parentId);
    } catch (err) {
      setToast({ kind: "error", msg: `${t("actionFailed")}: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function toggleDownloadableOne(item: LibraryItemDTO) {
    const next = !item.isDownloadable;
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isDownloadable: next } : i))
    );
    try {
      const res = await fetch("/api/admin/downloadable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [item.id], isDownloadable: next }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, isDownloadable: !next } : i
        )
      );
    }
  }

  return (
    <section className="space-y-6">
      <div className="card p-6 md:p-7">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-ink dark:text-paper">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-steel-500 dark:text-steel-300">
            {t("description")}
          </p>
        </div>

        <BreadcrumbBar
          rootLabel={t("rootLabel")}
          breadcrumbs={breadcrumbs}
          onHome={() => setParentId(null)}
          onNavigate={(id) => setParentId(id)}
        />

        <Toolbar
          disabled={busy}
          onUpload={uploadFiles}
          onNewFolder={createFolder}
          onDeleteSelected={deleteSelected}
          onPermanentlyDeleteSelected={permanentlyDeleteSelected}
          onShowSelected={() => setVisibleBulk(true)}
          onMoveSelected={() => setMovePickerOpen(true)}
          onSetDownloadable={setDownloadableBulk}
          selectedCount={selected.size}
          labels={{
            upload: t("uploadHere"),
            newFolder: tc("new_folder"),
            toggleOn: t("toggleDownloadable"),
            toggleOff: t("untoggleDownloadable"),
            move: t("bulkMove"),
            show: adminCopy(locale).show,
            del: adminCopy(locale).hide,
            permanentDelete: adminCopy(locale).permanentDelete,
            selectedCount: (n: number) => t("selectedCount", { count: n }),
          }}
        />

        <DropZone
          onFiles={uploadFiles}
          disabled={busy}
          hint={t("uploadDropHint")}
        />

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholderKey={
              parentId ? "library.searchPlaceholder" : "library.searchPlaceholderRoot"
            }
          />
          <button
            type="button"
            className="btn-secondary justify-center"
            disabled={filteredItems.length === 0}
            onClick={toggleAll}
          >
            {allChecked ? t("clearSelection") : t("selectAll")}
          </button>
        </div>

        {toast && (
          <div
            className={
              "mt-4 rounded-xl border px-4 py-2 text-sm " +
              (toast.kind === "success"
                ? "border-cyan-accent/30 bg-cyan-accent/10 text-deepblue"
                : "border-red-300 bg-red-50 text-red-700")
            }
          >
            {toast.msg}
          </div>
        )}
      </div>

      <div className="space-y-8">
        <SidebarAi locale={locale} layout="inline" />

        <div className="space-y-10">
          <AdminCardSection
            title={tl("folders")}
            count={folders.length}
            items={folders}
            locale={locale}
            selected={selected}
            onToggleOne={toggleOne}
            onEnterFolder={(item) => setParentId(item.id)}
            onToggleDownloadable={toggleDownloadableOne}
            labels={{
              open: tc("open"),
              downloadable: t("columnDownloadable"),
              yes: t("downloadableYes"),
              no: t("downloadableNo"),
              hidden: adminCopy(locale).hidden,
              virtualMove: adminCopy(locale).virtualMove,
            }}
          />
          <AdminCardSection
            title={tl("files")}
            count={files.length}
            items={files}
            locale={locale}
            selected={selected}
            onToggleOne={toggleOne}
            onEnterFolder={(item) => setParentId(item.id)}
            onToggleDownloadable={toggleDownloadableOne}
            labels={{
              open: tc("open"),
              downloadable: t("columnDownloadable"),
              yes: t("downloadableYes"),
              no: t("downloadableNo"),
              hidden: adminCopy(locale).hidden,
              virtualMove: adminCopy(locale).virtualMove,
            }}
          />
          {filteredItems.length === 0 && (
            <div className="rounded-xl border border-steel-200 p-8 text-center text-sm font-semibold text-steel-500 dark:border-steel-700 dark:text-steel-300">
              -
            </div>
          )}
        </div>
      </div>

      {movePickerOpen && (
        <MovePicker
          onCancel={() => setMovePickerOpen(false)}
          onPick={moveSelectedTo}
          excludeIds={selected}
          title={t("movePrompt")}
          pickLabel={t("pickFolder")}
          rootLabel={t("rootLabel")}
        />
      )}
    </section>
  );
}

function filterAdminItems(items: LibraryItemDTO[], query: string) {
  const terms = foldAdminText(query)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (terms.length === 0) return items;

  return items.filter((item) => {
    const haystack = foldAdminText(
      [
        item.name,
        item.relativePath,
        item.itemType,
        item.fileType,
        item.sizeHuman,
        item.isAdminHidden ? "hidden κρυφο" : "",
      ]
        .filter(Boolean)
        .join(" ")
    );
    return terms.every((term) => haystack.includes(term));
  });
}

function adminCopy(locale: string) {
  const isGreek = locale === "el";
  return {
    hide: isGreek ? "Απόκρυψη" : "Hide",
    permanentDelete: isGreek ? "Διαγραφή" : "Delete",
    show: isGreek ? "Εμφάνιση" : "Show",
    hidden: isGreek ? "Κρυφό από guest" : "Hidden from guests",
    virtualMove: isGreek ? "Virtual θέση" : "Virtual location",
    hidePrompt: (count: number) =>
      isGreek
        ? `Να κρυφτούν ${count} επιλεγμένα από τη δημόσια βιβλιοθήκη; Τα αρχεία δεν θα διαγραφούν.`
        : `Hide ${count} selected item(s) from the public library? Files will not be deleted.`,
    permanentDeletePrompt: (count: number) =>
      isGreek
        ? `ΜΟΝΙΜΗ ΔΙΑΓΡΑΦΗ ${count} επιλεγμένων στοιχείων από το archive. Η ενέργεια δεν αναιρείται. Πληκτρολογήστε DELETE για επιβεβαίωση:`
        : `PERMANENTLY DELETE ${count} selected archive item(s). This cannot be undone. Type DELETE to confirm:`,
  };
}

function foldAdminText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ς/g, "σ")
    .toLocaleLowerCase("el-GR");
}

function BreadcrumbBar({
  breadcrumbs,
  onHome,
  onNavigate,
  rootLabel,
}: {
  breadcrumbs: LibraryBreadcrumb[];
  onHome: () => void;
  onNavigate: (id: string) => void;
  rootLabel: string;
}) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        className="rounded-lg border border-cyan-accent/30 bg-cyan-accent/10 px-3 py-1.5 font-semibold text-cyan-accent transition hover:border-cyan-accent/60 hover:bg-cyan-accent/15"
        onClick={onHome}
      >
        {rootLabel}
      </button>
      {breadcrumbs.map((b) => (
        <span key={b.id ?? b.slug} className="flex items-center gap-1">
          <span className="text-steel-400">/</span>
          <button
            type="button"
            onClick={() => b.id && onNavigate(b.id)}
            className="max-w-[18rem] truncate rounded-lg px-2.5 py-1.5 font-semibold text-steel-700 transition hover:bg-cyan-accent/10 hover:text-cyan-accent dark:text-steel-200"
            title={b.name}
          >
            {prettyDisplayName(b.name, "folder")}
          </button>
        </span>
      ))}
    </nav>
  );
}

function AdminCardSection({
  title,
  count,
  items,
  locale,
  selected,
  onToggleOne,
  onEnterFolder,
  onToggleDownloadable,
  labels,
}: {
  title: string;
  count: number;
  items: LibraryItemDTO[];
  locale: string;
  selected: Set<string>;
  onToggleOne: (id: string) => void;
  onEnterFolder: (item: LibraryItemDTO) => void;
  onToggleDownloadable: (item: LibraryItemDTO) => void;
  labels: {
    open: string;
    downloadable: string;
    yes: string;
    no: string;
    hidden: string;
    virtualMove: string;
  };
}) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-ink dark:text-paper">
          {title}
        </h3>
        <span className="rounded-full border border-steel-200 px-3 py-1 text-xs font-semibold text-steel-500 dark:border-steel-700 dark:text-steel-300">
          {count}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((item) => (
          <AdminItemCard
            key={item.id}
            item={item}
            locale={locale}
            selected={selected.has(item.id)}
            onToggleOne={onToggleOne}
            onEnterFolder={onEnterFolder}
            onToggleDownloadable={onToggleDownloadable}
            labels={labels}
          />
        ))}
      </div>
    </section>
  );
}

function AdminItemCard({
  item,
  locale,
  selected,
  onToggleOne,
  onEnterFolder,
  onToggleDownloadable,
  labels,
}: {
  item: LibraryItemDTO;
  locale: string;
  selected: boolean;
  onToggleOne: (id: string) => void;
  onEnterFolder: (item: LibraryItemDTO) => void;
  onToggleDownloadable: (item: LibraryItemDTO) => void;
  labels: {
    open: string;
    downloadable: string;
    yes: string;
    no: string;
    hidden: string;
    virtualMove: string;
  };
}) {
  const isFolder = item.itemType === "folder";
  const variant = isFolder ? "folder" : ((item.fileType ?? "other") as FileType);
  const displayName = prettyDisplayName(item.name, item.itemType);

  return (
    <article
      className={
        "card card-hover relative flex min-h-[9.25rem] flex-col gap-4 p-5 transition " +
        (selected ? "border-cyan-accent/80 ring-1 ring-cyan-accent/40 " : "") +
        (item.isAdminHidden ? "opacity-70" : "")
      }
    >
      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleOne(item.id)}
          aria-label={displayName}
          className="mt-1 h-4 w-4 shrink-0 rounded border-steel-300"
        />
        <button
          type="button"
          onClick={() => {
            if (isFolder) onEnterFolder(item);
            else onToggleOne(item.id);
          }}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-start gap-3">
            <FileIcon variant={variant} size={40} />
            <div className="min-w-0">
              <h4 className="line-clamp-3 text-sm font-semibold leading-snug text-ink dark:text-paper">
                {displayName}
              </h4>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-steel-500 dark:text-steel-300">
                {isFolder
                  ? item.relativePath
                  : `${item.fileType ?? "other"} / ${item.sizeHuman ?? "-"}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.isAdminHidden && (
                  <span className="rounded-full border border-amber-300/70 bg-amber-100/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-300/30 dark:bg-amber-400/10 dark:text-amber-200">
                    {labels.hidden}
                  </span>
                )}
                {item.hasAdminParentOverride && (
                  <span className="rounded-full border border-cyan-accent/30 bg-cyan-accent/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-deepblue dark:text-cyan-accent">
                    {labels.virtualMove}
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-steel-100 pt-3 dark:border-steel-800">
        {isFolder ? (
          <button
            type="button"
            onClick={() => onEnterFolder(item)}
            className="text-xs font-semibold text-deepblue hover:text-cyan-accent"
          >
            {labels.open}
          </button>
        ) : (
          <a
            href={`/${locale}/viewer/${item.id}`}
            className="text-xs font-semibold text-deepblue hover:text-cyan-accent"
            target="_blank"
            rel="noreferrer"
          >
            {labels.open}
          </a>
        )}

        {item.itemType === "file" && (
          <button
            type="button"
            onClick={() => onToggleDownloadable(item)}
            aria-pressed={item.isDownloadable}
            className="inline-flex items-center gap-2 text-xs font-semibold text-steel-500 dark:text-steel-300"
            title={labels.downloadable}
          >
            <span>{item.isDownloadable ? labels.yes : labels.no}</span>
            <span
              className={
                "inline-flex h-6 w-11 shrink-0 items-center rounded-full transition " +
                (item.isDownloadable
                  ? "bg-deepblue"
                  : "bg-steel-300 dark:bg-steel-700")
              }
            >
              <span
                className={
                  "inline-block h-5 w-5 transform rounded-full bg-white transition " +
                  (item.isDownloadable ? "translate-x-5" : "translate-x-0.5")
                }
              />
            </span>
          </button>
        )}
      </div>
    </article>
  );
}

function Toolbar({
  disabled,
  selectedCount,
  onUpload,
  onNewFolder,
  onDeleteSelected,
  onPermanentlyDeleteSelected,
  onShowSelected,
  onMoveSelected,
  onSetDownloadable,
  labels,
}: {
  disabled: boolean;
  selectedCount: number;
  onUpload: (files: FileList) => void;
  onNewFolder: () => void;
  onDeleteSelected: () => void;
  onPermanentlyDeleteSelected: () => void;
  onShowSelected: () => void;
  onMoveSelected: () => void;
  onSetDownloadable: (value: boolean) => void;
  labels: {
    upload: string;
    newFolder: string;
    toggleOn: string;
    toggleOff: string;
    move: string;
    show: string;
    del: string;
    permanentDelete: string;
    selectedCount: (n: number) => string;
  };
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const hasSelection = selectedCount > 0;
  const buttonClass = "btn-secondary min-h-11 min-w-[10.5rem] justify-center";
  const dangerButtonClass =
    "inline-flex min-h-11 min-w-[10.5rem] items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-40";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          {labels.upload}
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onUpload(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          onClick={onNewFolder}
        >
          {labels.newFolder}
        </button>
        <span className="inline-flex min-h-11 items-center rounded-xl border border-steel-200 px-4 py-2 text-xs font-semibold text-steel-500 dark:border-steel-700 dark:text-steel-300">
          {labels.selectedCount(selectedCount)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || !hasSelection}
          onClick={() => onSetDownloadable(true)}
        >
          {labels.toggleOn}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || !hasSelection}
          onClick={() => onSetDownloadable(false)}
        >
          {labels.toggleOff}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || !hasSelection}
          onClick={onMoveSelected}
        >
          {labels.move}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || !hasSelection}
          onClick={onShowSelected}
        >
          {labels.show}
        </button>
        <button
          type="button"
          className={dangerButtonClass}
          disabled={disabled || !hasSelection}
          onClick={onDeleteSelected}
        >
          {labels.del}
        </button>
        <button
          type="button"
          className={dangerButtonClass}
          disabled={disabled || !hasSelection}
          onClick={onPermanentlyDeleteSelected}
        >
          {labels.permanentDelete}
        </button>
      </div>
    </div>
  );
}

function DropZone({
  onFiles,
  disabled,
  hint,
}: {
  onFiles: (files: FileList | File[]) => void;
  disabled: boolean;
  hint: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onFiles(e.dataTransfer.files);
        }
      }}
      className={
        "mb-4 rounded-xl border-2 border-dashed p-5 text-center text-sm transition " +
        (dragOver
          ? "border-cyan-accent bg-cyan-accent/10 text-deepblue"
          : "border-steel-300 text-steel-500 dark:border-steel-700 dark:text-steel-300")
      }
    >
      {hint}
    </div>
  );
}

function ItemsTable({
  items,
  selected,
  allChecked,
  onToggleAll,
  onToggleOne,
  onEnterFolder,
  onToggleDownloadable,
  labels,
}: {
  items: LibraryItemDTO[];
  selected: Set<string>;
  allChecked: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onEnterFolder: (item: LibraryItemDTO) => void;
  onToggleDownloadable: (item: LibraryItemDTO) => void;
  labels: {
    name: string;
    type: string;
    size: string;
    downloadable: string;
    yes: string;
    no: string;
    selectAll: string;
  };
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-steel-200 dark:border-steel-700">
      <table className="min-w-full text-sm">
        <thead className="bg-steel-50 text-xs uppercase tracking-wider text-steel-500 dark:bg-ink-soft dark:text-steel-300">
          <tr>
            <th className="w-10 p-3">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={onToggleAll}
                aria-label={labels.selectAll}
              />
            </th>
            <th className="p-3 text-left">{labels.name}</th>
            <th className="p-3 text-left">{labels.type}</th>
            <th className="p-3 text-left">{labels.size}</th>
            <th className="p-3 text-left">{labels.downloadable}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-steel-100 dark:divide-steel-800">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-paper dark:hover:bg-ink">
              <td className="p-3">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => onToggleOne(item.id)}
                />
              </td>
              <td className="p-3">
                <button
                  type="button"
                  onClick={() => {
                    if (item.itemType === "folder") onEnterFolder(item);
                  }}
                  className="flex items-center gap-3 text-left"
                  title={item.name}
                  disabled={item.itemType !== "folder"}
                >
                  <FileIcon
                    variant={
                      item.itemType === "folder"
                        ? "folder"
                        : ((item.fileType ?? "other") as FileType)
                    }
                    size={32}
                  />
                  <span className="line-clamp-1 font-medium text-ink dark:text-paper">
                    {prettyDisplayName(item.name, item.itemType)}
                  </span>
                </button>
              </td>
              <td className="p-3 text-steel-500">
                {item.itemType === "folder" ? "-" : (item.fileType ?? "other")}
              </td>
              <td className="p-3 text-steel-500">{item.sizeHuman ?? "-"}</td>
              <td className="p-3">
                {item.itemType === "file" ? (
                  <button
                    type="button"
                    onClick={() => onToggleDownloadable(item)}
                    aria-pressed={item.isDownloadable}
                    className={
                      "inline-flex h-6 w-11 shrink-0 items-center rounded-full transition " +
                      (item.isDownloadable
                        ? "bg-deepblue"
                        : "bg-steel-300 dark:bg-steel-700")
                    }
                  >
                    <span
                      className={
                        "inline-block h-5 w-5 transform rounded-full bg-white transition " +
                        (item.isDownloadable
                          ? "translate-x-5"
                          : "translate-x-0.5")
                      }
                    />
                  </button>
                ) : (
                  <span className="text-steel-400">-</span>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td className="p-6 text-center text-steel-500" colSpan={5}>
                -
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Minimal move-picker modal: browses folders via /api/admin/browse,
 *  supporting drill-down into any folder then a "Pick" button. */
function MovePicker({
  onCancel,
  onPick,
  excludeIds,
  title,
  pickLabel,
  rootLabel,
}: {
  onCancel: () => void;
  onPick: (parentId: string | null) => void;
  excludeIds: Set<string>;
  title: string;
  pickLabel: string;
  rootLabel: string;
}) {
  const [parentId, setParentId] = useState<string | null>(null);
  const [items, setItems] = useState<LibraryItemDTO[]>([]);
  const [crumbs, setCrumbs] = useState<LibraryBreadcrumb[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const url = new URL("/api/admin/browse", window.location.origin);
        url.searchParams.set("parentId", parentId ?? "root");
        const res = await fetch(url.toString());
        const data = await res.json();
        if (cancelled) return;
        setItems(data.items ?? []);
        setCrumbs(data.breadcrumbs ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  const folders = items.filter(
    (i) => i.itemType === "folder" && !excludeIds.has(i.id)
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-lg p-6">
        <h3 className="text-base font-semibold text-ink dark:text-paper">
          {title}
        </h3>
        <nav className="mt-3 flex flex-wrap items-center gap-1 text-xs text-steel-500">
          <button
            type="button"
            onClick={() => setParentId(null)}
            className="rounded px-2 py-1 text-deepblue hover:bg-cyan-accent/10"
          >
            {rootLabel}
          </button>
          {crumbs.map((b) => (
            <span key={b.id ?? b.slug} className="flex items-center gap-1">
              <span>/</span>
              <button
                type="button"
                onClick={() => b.id && setParentId(b.id)}
                className="max-w-[12rem] truncate rounded px-2 py-1 text-deepblue hover:bg-cyan-accent/10"
              >
                {prettyDisplayName(b.name, "folder")}
              </button>
            </span>
          ))}
        </nav>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-steel-200 dark:border-steel-700">
          {loading ? (
            <p className="p-4 text-sm text-steel-500">…</p>
          ) : folders.length === 0 ? (
            <p className="p-4 text-sm text-steel-500">-</p>
          ) : (
            <ul>
              {folders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setParentId(f.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-paper dark:hover:bg-ink"
                  >
                    <FileIcon variant="folder" size={28} />
                    <span className="line-clamp-1 text-sm">
                      {prettyDisplayName(f.name, "folder")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onPick(parentId)}
            className="btn-primary"
          >
            {pickLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
