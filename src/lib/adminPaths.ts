import path from "node:path";

import { getArchiveRoot, resolveItemPath } from "./paths";

/**
 * Helpers shared by the admin API routes.
 *
 * The write paths take untrusted names/paths and must pass them through
 * the same traversal-safe resolver that `resolveItemPath` uses for reads.
 */

/** Names we refuse to write to disk. Covers path separators, nulls, and
 *  reserved Windows device names. */
const RESERVED_WINDOWS = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

export function isUnsafeFilename(name: string): boolean {
  if (!name || name.length > 240) return true;
  if (name.includes("\0")) return true;
  if (name.includes("/") || name.includes("\\")) return true;
  if (name.startsWith(".")) return true; // hidden files, dotdots
  if (name.endsWith(" ") || name.endsWith(".")) return true; // trailing space/dot (Windows issue)
  const base = name.split(".")[0]?.toLowerCase() ?? "";
  if (RESERVED_WINDOWS.has(base)) return true;
  return false;
}

/**
 * Given a parent's POSIX relative path and a target file name, returns:
 * - `relativePath`: POSIX relative path for DB storage
 * - `absolutePath`: absolute path on disk, safe to write to
 * - `name`: possibly suffixed variant if `tryAvoidCollisionWith` collides
 */
export function joinRelative(
  parentRelativePath: string | null,
  name: string
): { relativePath: string; absolutePath: string } {
  const rel =
    parentRelativePath && parentRelativePath.trim().length > 0
      ? `${parentRelativePath.replace(/^\/+|\/+$/g, "")}/${name}`
      : name;
  const abs = resolveItemPath(rel); // traversal guard
  return { relativePath: rel, absolutePath: abs };
}

/**
 * Produce a collision-free filename inside `parentAbs` by suffixing
 * "-1", "-2" etc. right before the extension until no file / folder
 * at that name exists on disk.
 */
export async function deconflictFilename(params: {
  parentAbs: string;
  desiredName: string;
  exists: (abs: string) => Promise<boolean>;
}): Promise<string> {
  const { parentAbs, desiredName, exists } = params;
  const ext = path.extname(desiredName);
  const base = desiredName.slice(0, desiredName.length - ext.length);
  let candidate = desiredName;
  let i = 0;
  // Try up to 999 suffixes to cover accidental bulk re-uploads.
  while (await exists(path.join(parentAbs, candidate))) {
    i += 1;
    candidate = `${base}-${i}${ext}`;
    if (i > 999) {
      throw new Error("Too many filename collisions");
    }
  }
  return candidate;
}

/**
 * Safe wrapper for getArchiveRoot that returns null instead of throwing
 * (useful when the admin API needs to short-circuit with a clean error).
 */
export function safeArchiveRoot(): string | null {
  try {
    return getArchiveRoot();
  } catch {
    return null;
  }
}
