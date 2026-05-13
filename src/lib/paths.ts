import path from "node:path";

/**
 * Absolute root of the on-disk archive. Configured via ARCHIVE_ROOT.
 *
 * Storage strategy:
 *  - Windows junction: D:\TechnicalLibrary -> the USB / OneDrive folder.
 *  - OneDrive-synced folder: e.g. C:\Users\<you>\OneDrive\TechnicalLibrary.
 *  - External SSD mounted at a stable path.
 *
 * The app does not care which of those is used — it only accesses
 * the configured path through this single helper.
 */
export function getArchiveRoot(): string {
  const root = process.env.ARCHIVE_ROOT;
  if (!root || !root.trim()) {
    throw new Error(
      "ARCHIVE_ROOT is not configured. Set it in .env.local (e.g. D:\\TechnicalLibrary)."
    );
  }
  return path.resolve(root);
}

/**
 * Resolve a relative archive path to a guaranteed-safe absolute path.
 *
 * Rejects:
 *  - paths that escape ARCHIVE_ROOT via `..`
 *  - absolute paths (a row's relativePath should never be absolute)
 *  - null bytes
 *
 * This is the ONE place file-system paths are constructed from DB input.
 */
export function resolveItemPath(relativePath: string): string {
  if (!relativePath || relativePath.includes("\0")) {
    throw new Error("Invalid relative path");
  }
  const root = getArchiveRoot();
  // Always resolve from root, never trust an absolute input.
  const normalized = relativePath.replace(/^[\\/]+/, "");
  const abs = path.resolve(root, normalized);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    throw new Error("Path traversal attempt blocked");
  }
  return abs;
}

/**
 * Convert an absolute path on disk into the POSIX-style relative path we store.
 * "D:\TechnicalLibrary\1.15 …\ΔΙΑΦΟΡΑ\foo.pdf"  =>  "1.15 …/ΔΙΑΦΟΡΑ/foo.pdf"
 */
export function toRelativePath(absolutePath: string): string {
  const root = getArchiveRoot();
  const rel = path.relative(root, absolutePath);
  // Normalize Windows backslashes to forward slashes for URLs/DB keys.
  return rel.split(path.sep).join("/");
}
