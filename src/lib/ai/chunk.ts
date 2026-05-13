/**
 * Simple sliding-window chunker: ~500 chars with 80-char overlap.
 *
 * We prefer character-based chunks over token-based because:
 *  - Greek + English mix makes tokenizer decisions awkward.
 *  - 500 chars ≈ 80-120 tokens for our model's tokenizer; well under the
 *    512-token limit of multilingual-e5-small.
 *  - Overlap preserves context for phrases that straddle boundaries.
 *
 * For PDFs we chunk within each page so chunk → page mapping stays trivial.
 */

export type RawPage = { page: number | null; text: string };
export type Chunk = { page: number | null; text: string; chunkIndex: number };

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 80;

export function chunkPages(pages: RawPage[]): Chunk[] {
  const out: Chunk[] = [];
  let chunkIndex = 0;
  for (const p of pages) {
    const cleaned = normalize(p.text);
    if (!cleaned) continue;
    for (
      let start = 0;
      start < cleaned.length;
      start += CHUNK_SIZE - CHUNK_OVERLAP
    ) {
      // slice() cuts on UTF-16 code units which can split a surrogate pair;
      // stripUnpairedSurrogates() fixes the slice boundaries so JSON.stringify
      // (used by Prisma for SQL params) doesn't throw downstream.
      const slice = stripUnpairedSurrogates(
        cleaned.slice(start, start + CHUNK_SIZE)
      );
      if (slice.trim().length < 40) continue;
      out.push({ page: p.page, text: slice, chunkIndex: chunkIndex++ });
      if (start + CHUNK_SIZE >= cleaned.length) break;
    }
  }
  return out;
}

function normalize(text: string): string {
  return stripUnpairedSurrogates(text)
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .trim();
}

/**
 * Remove orphan UTF-16 surrogate code units. pdfjs and some docx payloads
 * occasionally emit lone surrogates for glyphs with broken CID maps; these
 * crash JSON.stringify (Prisma params, HTTP responses) downstream.
 */
function stripUnpairedSurrogates(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
        continue;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    out += s[i];
  }
  return out;
}
