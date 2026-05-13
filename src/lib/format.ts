/**
 * Human-readable byte size. Accepts number or bigint.
 */
export function humanFileSize(
  bytes: number | bigint | null | undefined
): string | null {
  if (bytes === null || bytes === undefined) return null;
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = n / 1024;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[i]}`;
}

/**
 * Strip a trailing sequence of dots from an on-disk name so UI labels look
 * clean. The archive uses long dot-runs as visual filler, e.g.
 *   "1.15 ΝΟΜΟΘΕΣΙΑ ΠΥΡΑΣΦΑΛΕΙΑΣ  ΚΑΙ  ΔΙΑΦΟΡΑ ΚΛΠ  .....2022"
 * becomes "1.15 ΝΟΜΟΘΕΣΙΑ ΠΥΡΑΣΦΑΛΕΙΑΣ ΚΑΙ ΔΙΑΦΟΡΑ ΚΛΠ 2022".
 *
 * The raw on-disk `name` is still kept verbatim in `LibraryItem.name`;
 * this helper only shapes a clean *display* label.
 */
export function prettyDisplayName(name: string, itemType: "folder" | "file"): string {
  // For files, keep the extension intact; only tidy the base.
  if (itemType === "file") {
    const lastDot = name.lastIndexOf(".");
    if (lastDot > 0 && lastDot < name.length - 1) {
      const base = name.slice(0, lastDot);
      const ext = name.slice(lastDot);
      return cleanupText(base) + ext;
    }
  }
  return cleanupText(name);
}

function cleanupText(s: string): string {
  return s
    .replace(/\.{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
