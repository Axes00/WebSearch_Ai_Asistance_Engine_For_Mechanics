/**
 * Greek-aware slug generator.
 *
 * Requirements from the archive's real folder names:
 *  - Greek UTF-8 with accents: "ΝΟΜΟΘΕΣΙΑ ΠΥΡΑΣΦΑΛΕΙΑΣ"
 *  - Runs of dots used as visual separators: "Κ400-2022........."
 *  - Mixed case + Latin: "SCIENTIFIC_BROCHURE_EN_....2022.pdf"
 *
 * We want a slug that is:
 *  - URL-safe but keeps Greek letters (browsers handle them fine; they
 *    are percent-encoded on the wire and displayed correctly).
 *  - Stable across re-indexings (idempotent).
 *  - Short-ish (collapse whitespace/dots).
 */

// Strip Greek + Latin combining marks (tonos, dialytika).
// Keeps base letter shape for matching/searching purposes.
function removeDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Turn a raw on-disk name into a slug segment.
 * Keeps the extension so ".pdf" etc. stay visible in URLs.
 */
export function slugify(name: string): string {
  if (!name) return "";

  // Split extension so the dots collapse inside the base name without
  // swallowing the file extension dot.
  const lastDot = name.lastIndexOf(".");
  const hasExt =
    lastDot > 0 && lastDot < name.length - 1 && !name.slice(lastDot + 1).includes(" ");
  const base = hasExt ? name.slice(0, lastDot) : name;
  const ext = hasExt ? name.slice(lastDot).toLowerCase() : "";

  const cleanedBase = removeDiacritics(base.normalize("NFC"))
    .toLowerCase()
    // collapse long runs of dots (used as separators in the archive) to one dash
    .replace(/\.{2,}/g, "-")
    // whitespace -> dash
    .replace(/\s+/g, "-")
    // keep greek letters, latin letters, digits, dash, underscore; drop the rest
    .replace(/[^a-z0-9\u0370-\u03ff\u1f00-\u1fff\-_.]/g, "")
    // collapse repeated dashes / underscores
    .replace(/-{2,}/g, "-")
    .replace(/_{2,}/g, "_")
    // trim leading/trailing separators
    .replace(/^[-_\.]+|[-_\.]+$/g, "");

  return (cleanedBase || "item") + ext;
}

/**
 * Build a `/library/<slug>/<slug>/…` URL path from a list of on-disk names.
 * The indexer uses this to produce stable URLs without ever exposing
 * absolute disk paths.
 */
export function slugPath(names: string[]): string {
  return names.map(slugify).join("/");
}
