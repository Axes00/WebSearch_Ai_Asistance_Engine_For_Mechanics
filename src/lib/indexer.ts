import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "./db";
import { getArchiveRoot } from "./paths";
import { slugify } from "./slug";
import {
  fileTypeFromName,
  isArchiveBackupFile,
  isDownloadOnlyType,
  isNoiseFile,
} from "./fileTypes";

/**
 * Archive scanner + database sync.
 *
 * Usage:
 *   const run = await runIndex({ verbose: true });
 *   console.log(run.itemsScanned);
 *
 * Design:
 *  - Single depth-first walk with fs.opendir (memory-safe for 4k items).
 *  - Upsert by `relativePath` (stable, unique, POSIX-style).
 *  - After the walk, rows whose path no longer exists on disk are removed.
 *  - Every interesting observation is counted in an IndexRun row so the
 *    admin UI can poll progress.
 */

export type RunIndexOptions = {
  verbose?: boolean;
  /**
   * If provided, pre-create the IndexRun row and stream progress into it.
   * Admin API uses this to return a run id immediately.
   */
  runId?: string;
};

export type IndexResult = {
  runId: string;
  status: "success" | "failed";
  itemsScanned: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsRemoved: number;
  durationMs: number;
  errors: string[];
};

type SeenEntry = {
  relativePath: string;
  parentRelativePath: string | null;
  name: string;
  isDirectory: boolean;
  size: bigint | null;
  modifiedAt: Date | null;
  level: number;
};

/** Match "1.1 " .. "1.21 " etc. on the first path segment. */
const LIBRARY_CODE_RE = /^(1\.\d{1,2})(?=\s|$)/;

function libraryCodeFor(name: string, level: number): string | null {
  if (level !== 1) return null;
  const m = name.match(LIBRARY_CODE_RE);
  return m ? m[1] : null;
}

function isRootRarBackup(relativePath: string, name: string): boolean {
  // The 1.1Θ ... .rar full-archive backup sits at the root of ARCHIVE_ROOT.
  // Match by (a) sitting at level 1 (no parent dir in relativePath), and
  // (b) being a .rar file.
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  return isArchiveBackupFile(name);
}

async function safeStat(absPath: string): Promise<{
  size: bigint | null;
  modifiedAt: Date | null;
}> {
  try {
    // `bigint: true` returns BigInt fields so 4GB+ files don't overflow.
    const st = await fs.stat(absPath, { bigint: true });
    return { size: st.size, modifiedAt: new Date(Number(st.mtimeMs)) };
  } catch {
    return { size: null, modifiedAt: null };
  }
}

async function* walk(
  dirAbs: string,
  dirRelative: string,
  level: number
): AsyncGenerator<SeenEntry> {
  let dir: import("node:fs").Dir | undefined;
  try {
    dir = await fs.opendir(dirAbs);
  } catch {
    return;
  }
  try {
    for await (const entry of dir) {
      const childAbs = path.join(dirAbs, entry.name);
      const childRelative = dirRelative
        ? `${dirRelative}/${entry.name}`
        : entry.name;
      const stat = await safeStat(childAbs);
      const isDirectory = entry.isDirectory();
      yield {
        relativePath: childRelative.split(path.sep).join("/"),
        parentRelativePath: dirRelative || null,
        name: entry.name,
        isDirectory,
        size: isDirectory ? null : stat.size,
        modifiedAt: stat.modifiedAt,
        level,
      };
      if (isDirectory) {
        yield* walk(childAbs, childRelative, level + 1);
      }
    }
  } finally {
    try {
      // opendir in Node auto-closes when the async iteration completes,
      // but we close explicitly in case of early break.
      await dir?.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Core sync function. Can be invoked from the CLI script or the admin API.
 */
export async function runIndex(
  options: RunIndexOptions = {}
): Promise<IndexResult> {
  const start = Date.now();
  const archiveRoot = getArchiveRoot();

  // Verify archive is reachable before we create an IndexRun row.
  try {
    const st = await fs.stat(archiveRoot);
    if (!st.isDirectory()) {
      throw new Error(`ARCHIVE_ROOT is not a directory: ${archiveRoot}`);
    }
  } catch (err) {
    const run = await prisma.indexRun.create({
      data: {
        status: "failed",
        finishedAt: new Date(),
        errors: JSON.stringify([
          `Cannot access ARCHIVE_ROOT=${archiveRoot}: ${(err as Error).message}`,
        ]),
        archiveRoot,
      },
    });
    return {
      runId: run.id,
      status: "failed",
      itemsScanned: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsRemoved: 0,
      durationMs: Date.now() - start,
      errors: [(err as Error).message],
    };
  }

  const run = options.runId
    ? await prisma.indexRun.update({
        where: { id: options.runId },
        data: { status: "running", archiveRoot },
      })
    : await prisma.indexRun.create({
        data: { status: "running", archiveRoot },
      });

  const sourceType = process.env.ARCHIVE_SOURCE_TYPE || "local";
  const errors: string[] = [];

  // Map existing rows by relativePath for fast lookups.
  const existingRows = await prisma.libraryItem.findMany({
    select: {
      id: true,
      relativePath: true,
      parentId: true,
      size: true,
      modifiedAt: true,
    },
  });
  const existingByPath = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows) {
    existingByPath.set(row.relativePath, row);
  }

  // Phase 1: collect all on-disk entries.
  const seen: SeenEntry[] = [];
  try {
    for await (const entry of walk(archiveRoot, "", 1)) {
      seen.push(entry);
    }
  } catch (err) {
    errors.push(`Walk failed: ${(err as Error).message}`);
  }

  if (options.verbose) {
    // eslint-disable-next-line no-console
    console.log(`[indexer] scanned ${seen.length} entries on disk`);
  }

  // Phase 2: two-pass upsert.
  // Pass A creates/updates folders first (so children can attach by parentId).
  // Pass B handles files. Within each pass we sort by relativePath depth to
  // ensure parents exist before children are written.
  const depthOf = (p: string) => p.split("/").length;
  const folders = seen
    .filter((e) => e.isDirectory)
    .sort((a, b) => depthOf(a.relativePath) - depthOf(b.relativePath));
  const files = seen.filter((e) => !e.isDirectory);

  // We build a map relativePath -> id as we go so children can look up parents.
  const idByPath = new Map<string, string>();
  for (const row of existingRows) idByPath.set(row.relativePath, row.id);

  let itemsCreated = 0;
  let itemsUpdated = 0;
  const touched = new Set<string>();

  async function upsertEntry(entry: SeenEntry): Promise<void> {
    const parentId = entry.parentRelativePath
      ? idByPath.get(entry.parentRelativePath) || null
      : null;

    const fileType = entry.isDirectory ? null : fileTypeFromName(entry.name);
    const hidden =
      isNoiseFile(entry.name) || isRootRarBackup(entry.relativePath, entry.name);
    const isDownloadOnly =
      !entry.isDirectory && fileType ? isDownloadOnlyType(fileType) : false;
    // .rar/.zip backups at any level stay browsable=false.
    const isBrowsable =
      !hidden && !(isArchiveBackupFile(entry.name) && !entry.isDirectory ? true : false)
        ? !hidden
        : false;

    const libraryCode = libraryCodeFor(entry.name, entry.level);

    // By default only DWG files are downloadable. The admin can opt in
    // PDFs / Word docs individually via the admin UI — we never override
    // that decision on subsequent reindex runs.
    const defaultDownloadable = !entry.isDirectory && fileType === "dwg";

    const data = {
      name: entry.name,
      slug: slugify(entry.name),
      relativePath: entry.relativePath,
      parentId,
      itemType: entry.isDirectory ? "folder" : "file",
      fileType,
      size: entry.size,
      modifiedAt: entry.modifiedAt,
      level: entry.level,
      libraryCode,
      isDownloadOnly,
      isBrowsable,
      isHidden: hidden,
      sourceType,
    };

    const existing = existingByPath.get(entry.relativePath);
    if (!existing) {
      const created = await prisma.libraryItem.create({
        data: { ...data, isDownloadable: defaultDownloadable },
      });
      idByPath.set(created.relativePath, created.id);
      itemsCreated++;
    } else {
      // Only update rows that actually changed to reduce SQLite writes.
      const sizeChanged =
        (existing.size ?? null) === null
          ? entry.size !== null
          : entry.size === null || existing.size !== entry.size;
      const mtimeChanged =
        (existing.modifiedAt?.getTime() ?? null) !==
        (entry.modifiedAt?.getTime() ?? null);
      const parentChanged = existing.parentId !== parentId;
      if (sizeChanged || mtimeChanged || parentChanged) {
        await prisma.libraryItem.update({
          where: { id: existing.id },
          data,
        });
        itemsUpdated++;
      }
      idByPath.set(existing.relativePath, existing.id);
    }
    touched.add(entry.relativePath);
  }

  for (const folder of folders) {
    try {
      await upsertEntry(folder);
    } catch (err) {
      errors.push(`folder upsert failed (${folder.relativePath}): ${(err as Error).message}`);
    }
  }
  for (const file of files) {
    try {
      await upsertEntry(file);
    } catch (err) {
      errors.push(`file upsert failed (${file.relativePath}): ${(err as Error).message}`);
    }
  }

  // Phase 3: remove rows for paths that disappeared.
  const stalePaths = existingRows
    .map((r) => r.relativePath)
    .filter((p) => !touched.has(p));
  let itemsRemoved = 0;
  if (stalePaths.length > 0) {
    // Delete in batches of ~500 to keep SQLite statements small.
    for (let i = 0; i < stalePaths.length; i += 500) {
      const slice = stalePaths.slice(i, i + 500);
      const res = await prisma.libraryItem.deleteMany({
        where: { relativePath: { in: slice } },
      });
      itemsRemoved += res.count;
    }
  }

  // Phase 4: finalize run.
  const itemsScanned = seen.length;
  const status: "success" | "failed" = errors.length ? "failed" : "success";
  await prisma.indexRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      itemsScanned,
      itemsCreated,
      itemsUpdated,
      itemsRemoved,
      status,
      errors: errors.length ? JSON.stringify(errors.slice(0, 100)) : null,
    },
  });

  if (options.verbose) {
    // eslint-disable-next-line no-console
    console.log(
      `[indexer] done — scanned=${itemsScanned} created=${itemsCreated} updated=${itemsUpdated} removed=${itemsRemoved} status=${status} durationMs=${Date.now() - start}`
    );
  }

  return {
    runId: run.id,
    status,
    itemsScanned,
    itemsCreated,
    itemsUpdated,
    itemsRemoved,
    durationMs: Date.now() - start,
    errors,
  };
}

/**
 * Incrementally index a single subtree rooted at `subtreeRelativePath`.
 * This is what admin upload / mkdir / move call so the DB reflects the
 * disk change without re-scanning the whole archive.
 *
 * The implementation delegates to `runIndex` but scopes the walk by
 * overriding the archive root for the duration of the call. That keeps
 * a single well-tested code path.
 *
 * NOTE: For V2 we keep it simple and run a full reindex; the subtree
 * call is a thin wrapper that callers can use so the intent is obvious
 * in the codebase. Real incremental subtree scanning is a future task.
 */
export async function indexSubtree(subtreeRelativePath: string): Promise<IndexResult> {
  // Intentional full scan; see docblock.
  void subtreeRelativePath;
  return runIndex({ verbose: false });
}

/**
 * Seed a small set of homepage-featured documents based on the archive
 * inventory. Called once after the first index so the homepage has content.
 *
 * The heuristic matches the introductory PDFs sitting at the archive root
 * (level = 1, itemType = "file", fileType = "pdf"). If an admin later
 * toggles highlights manually, this function is a no-op (it only sets
 * highlights the first time they are all empty).
 */
export async function seedDefaultHighlightsIfEmpty(): Promise<number> {
  const existing = await prisma.libraryItem.count({ where: { isHighlighted: true } });
  if (existing > 0) return 0;
  const roots = await prisma.libraryItem.findMany({
    where: {
      level: 1,
      itemType: "file",
      fileType: "pdf",
      isHidden: false,
      isBrowsable: true,
    },
    orderBy: { name: "asc" },
  });
  if (roots.length === 0) return 0;
  const res = await prisma.libraryItem.updateMany({
    where: { id: { in: roots.map((r) => r.id) } },
    data: { isHighlighted: true },
  });
  return res.count;
}
