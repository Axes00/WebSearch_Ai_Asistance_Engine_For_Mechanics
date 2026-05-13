import { prisma } from "@/lib/db";

import { embedQuery } from "./embedder";
import { searchNearestChunks } from "./vectorStore";

export type AiSearchHit = {
  chunkId: string;
  itemId: string;
  itemName: string;
  relativePath: string;
  fileType: string | null;
  page: number | null;
  chunkIndex: number;
  text: string;
  distance: number;
  relatedCount: number;
  relatedPages: number[];
  matchKind: "filename" | "text" | "semantic";
  intent?: SearchIntent;
  topic?: SearchTopic;
  topicMatched?: boolean;
  whyMatched?: string;
  /**
   * Short substrings (3-6 words) suitable for client-side text matching.
   * Used by DocxViewer's highlighter and by future PDF text-layer highlighters.
   */
  highlightTerms: string[];
};

export type SearchIntent =
  | "legislation"
  | "standard"
  | "form"
  | "publicWorks"
  | "energy"
  | "electrical"
  | "fireSafety";

export type SearchTopic =
  | "fireSafety"
  | "publicWorks"
  | "energy"
  | "electrical"
  | "standards"
  | "forms";

/**
 * Run an AI semantic search.
 *
 * Pipeline:
 *  1. Embed the user's query with the same e5-small model used at index time.
 *  2. Ask sqlite-vec for the K nearest chunk vectors (optionally pre-
 *     filtered to a single item for in-document highlighting).
 *  3. Hydrate the chunks with item metadata from Prisma.
 *  4. Extract a few short "highlight terms" per chunk so the client can
 *     mark them inside the open document.
 *
 * When `itemId` is provided we over-fetch (K*4) and filter down after the
 * vector search. sqlite-vec 0.1.x doesn't support WHERE on the vec table,
 * so post-filtering is the safest approach for our dataset sizes.
 */
export async function runAiSearch(options: {
  query: string;
  limit?: number;
  itemId?: string | null;
}): Promise<AiSearchHit[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 12, 30));
  const trimmed = options.query.trim();
  if (!trimmed) return [];

  const context = options.itemId ? await getItemContext(options.itemId) : null;
  const profile = detectSearchProfile(trimmed);
  if (options.itemId) {
    return runScopedInDocumentSearch({
      itemId: options.itemId,
      query: trimmed,
      limit,
      profile,
    });
  }

  const searchQuery = expandQuery(trimmed, context);
  const queryTerms = extractQueryTerms(searchQuery);
  const displayTerms = extractQueryTerms(trimmed);
  const highlightQueryTerms = unique([...displayTerms, ...queryTerms]).slice(0, 12);
  const lexicalHits = await findLexicalChunkHits({
    query: searchQuery,
    queryTerms,
    itemId: options.itemId ?? null,
    limit: options.itemId ? limit * 4 : limit * 8,
  });
  const filenameHits = options.itemId
    ? []
    : await findFilenameHits({
        query: searchQuery,
        queryTerms,
        limit: Math.max(8, limit * 2),
      });

  let vectorHits: { chunkId: string; distance: number }[] = [];
  const hasEnoughExactResults =
    filenameHits.length + lexicalHits.length >= Math.min(limit, 8);
  if (!hasEnoughExactResults) {
    try {
      const vec = await embedQuery(searchQuery);
      const overfetch = options.itemId ? Math.max(1000, limit * 80) : limit * 16;
      vectorHits = searchNearestChunks(vec, overfetch);
    } catch {
      // The lexical path still gives usable search when the model/vector store
      // is unavailable or only partially built.
      vectorHits = [];
    }
  }

  const ids = unique([
    ...vectorHits.map((h) => h.chunkId),
    ...lexicalHits.map((h) => h.chunkId),
  ]);
  const chunks = await prisma.aiChunk.findMany({
    where: { id: { in: ids } },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          relativePath: true,
          fileType: true,
          isHidden: true,
          isAdminHidden: true,
          isBrowsable: true,
        },
      },
    },
  });
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const vectorById = new Map(vectorHits.map((h) => [h.chunkId, h.distance]));
  const lexicalById = new Map(lexicalHits.map((h) => [h.chunkId, h.score]));

  const rankedIds = ids.sort((a, b) => scoreFor(b) - scoreFor(a));
  const out: (AiSearchHit & { _score: number })[] = [];
  const grouped = new Map<string, AiSearchHit & { _score: number }>();
  const relatedCounts = new Map<string, number>();

  for (const item of filenameHits) {
    const hit = {
      chunkId: `item:${item.id}`,
      itemId: item.id,
      itemName: item.name,
      relativePath: item.relativePath,
      fileType: item.fileType,
      page: null,
      chunkIndex: -1,
      text: item.relativePath,
      distance: 0.01,
      relatedCount: 1,
      relatedPages: [],
      matchKind: "filename" as const,
      intent: profile.intent,
      topic: profile.topic,
      topicMatched: matchesTopic(`${item.name} ${item.relativePath}`, profile.topic),
      whyMatched: whyMatched(`${item.name} ${item.relativePath}`, profile),
      highlightTerms: displayTerms.length > 0 ? displayTerms : queryTerms,
      _score:
        100 +
        filenameScore(item, queryTerms) +
        profileScore(`${item.name} ${item.relativePath}`, item.fileType, profile),
    };
    const groupKey = resultGroupKey(hit);
    grouped.set(groupKey, hit);
    relatedCounts.set(groupKey, 1);
  }

  for (const chunkId of rankedIds) {
    const chunk = byId.get(chunkId);
    if (!chunk) continue;
    if (chunk.item.isHidden || chunk.item.isAdminHidden || !chunk.item.isBrowsable) continue;
    if (options.itemId && chunk.itemId !== options.itemId) continue;
    if (!isMeaningfulChunk(chunk.text)) continue;
    const groupKey = resultGroupKey({
      itemName: chunk.item.name,
      relativePath: chunk.item.relativePath,
    });
    relatedCounts.set(groupKey, (relatedCounts.get(groupKey) ?? 0) + 1);
    const score = scoreFor(chunk.id);
    const candidate = {
      chunkId: chunk.id,
      itemId: chunk.itemId,
      itemName: chunk.item.name,
      relativePath: chunk.item.relativePath,
      fileType: chunk.item.fileType,
      page: chunk.page,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      distance: vectorById.get(chunk.id) ?? 1 - (lexicalById.get(chunk.id) ?? 0),
      relatedCount: 1,
      relatedPages: chunk.page !== null ? [chunk.page] : [],
      matchKind: lexicalById.has(chunk.id) ? ("text" as const) : ("semantic" as const),
      intent: profile.intent,
      topic: profile.topic,
      topicMatched: matchesTopic(
        `${chunk.item.name} ${chunk.item.relativePath} ${chunk.text}`,
        profile.topic
      ),
      whyMatched: whyMatched(
        `${chunk.item.name} ${chunk.item.relativePath} ${chunk.text}`,
        profile
      ),
      highlightTerms: buildHighlightTerms(chunk.text, highlightQueryTerms),
      _score:
        score +
        fileTypeBoost(chunk.item.fileType, searchQuery) -
        formNoisePenalty(chunk.text) +
        profileScore(
          `${chunk.item.name} ${chunk.item.relativePath} ${chunk.text}`,
          chunk.item.fileType,
          profile
        ),
    };
    const existing = grouped.get(groupKey);
    if (options.itemId) {
      out.push(candidate);
      if (out.length >= limit) break;
    } else if (!existing || candidate._score > existing._score) {
      if (existing) {
        candidate.relatedPages = unique([
          ...existing.relatedPages,
          ...candidate.relatedPages,
        ]).slice(0, 5);
      }
      grouped.set(groupKey, candidate);
    } else if (candidate.page !== null) {
      existing.relatedPages = unique([...existing.relatedPages, candidate.page]).slice(0, 5);
    }
  }
  if (options.itemId) {
    if (out.length === 0 && context) {
      return [
        {
          chunkId: `item:${options.itemId}`,
          itemId: options.itemId,
          itemName: context.name,
          relativePath: context.relativePath,
          fileType: context.fileType,
          page: null,
          chunkIndex: -1,
          text: `${context.name} ${context.relativePath}`,
          distance: 0.01,
          relatedCount: 1,
          relatedPages: [],
          matchKind: "filename",
          intent: profile.intent,
          topic: profile.topic,
          topicMatched: matchesTopic(`${context.name} ${context.relativePath}`, profile.topic),
          whyMatched: whyMatched(`${context.name} ${context.relativePath}`, profile),
          highlightTerms: highlightQueryTerms,
        },
      ];
    }
    return out.map(({ _score, ...hit }) => hit);
  }
  const sorted = [...grouped.values()].sort((a, b) => b._score - a._score);
  const topicStrict =
    profile.intent && profile.topic
      ? sorted.filter((hit) => hit.topicMatched)
      : [];
  const finalHits = topicStrict.length >= 3 ? topicStrict : sorted;
  return finalHits
    .slice(0, limit)
    .map(({ _score, ...hit }) => ({
      ...hit,
      relatedCount: relatedCounts.get(resultGroupKey(hit)) ?? hit.relatedCount,
    }));

  function scoreFor(chunkId: string): number {
    const lexical = lexicalById.get(chunkId) ?? 0;
    const vectorDistance = vectorById.get(chunkId);
    const vector = vectorDistance === undefined ? 0 : Math.max(0, 1 - vectorDistance);
    return lexical * 1.15 + vector;
  }
}

function detectSearchProfile(query: string): {
  intent?: SearchIntent;
  topic?: SearchTopic;
} {
  const q = fold(query);
  const intent =
    /νομοθε|nomothe|nomothes|nomo|law|fek|φεκ|ν\.?\s*\d|n\.?\s*\d/.test(q)
      ? "legislation"
      : /προτυπ|protyp|standard|ελοτ|elot|hd\s*384|60364/.test(q)
      ? "standard"
      : /πρωτοκολλ|protokoll|protocol|εντυπ|entyp|form|υδε|yde/.test(q)
      ? "form"
      : /δημοσ|dimos|dimosia|public|εργ|erga/.test(q)
      ? "publicWorks"
      : /κενακ|kenak|ενεργ|energeia|energy/.test(q)
      ? "energy"
      : /ηλεκτρ|ilektr|electr|κεηε|kehe/.test(q)
      ? "electrical"
      : /πυρ|pyr|pir|pirasfal|pyrasfal|pyroprost|pirosfal|fire|πυρασφαλ/.test(q)
      ? "fireSafety"
      : undefined;

  const topic =
    /πυρ|pyr|pir|pirasfal|pyrasfal|pyroprost|pirosfal|fire|πυρασφαλ/.test(q)
      ? "fireSafety"
      : /δημοσ|dimos|dimosia|public|εργ|erga|4412/.test(q)
      ? "publicWorks"
      : /κενακ|kenak|ενεργ|energeia|energy/.test(q)
      ? "energy"
      : /ηλεκτρ|ilektr|electr|κεηε|kehe/.test(q)
      ? "electrical"
      : /προτυπ|protyp|standard|ελοτ|elot|hd\s*384|60364/.test(q)
      ? "standards"
      : /πρωτοκολλ|protokoll|protocol|εντυπ|entyp|form|υδε|yde/.test(q)
      ? "forms"
      : undefined;
  return { intent, topic };
}

async function runScopedInDocumentSearch(options: {
  itemId: string;
  query: string;
  limit: number;
  profile: { intent?: SearchIntent; topic?: SearchTopic };
}): Promise<AiSearchHit[]> {
  const chunks = await prisma.aiChunk.findMany({
    where: {
      itemId: options.itemId,
      item: {
        isHidden: false,
        isAdminHidden: false,
        isBrowsable: true,
      },
    },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          relativePath: true,
          fileType: true,
        },
      },
    },
    orderBy: [{ page: "asc" }, { chunkIndex: "asc" }],
  });
  if (chunks.length === 0) return [];

  const baseTerms = extractQueryTerms(options.query).filter((term) => term.length >= 4);
  const scopedTopic = baseTerms.length <= 2 ? options.profile.topic : undefined;
  const scopedTerms = scopedQueryTerms(options.query, {
    ...options.profile,
    topic: scopedTopic,
  });
  if (scopedTerms.length === 0) return [];
  const normalizedQuery = normalizeSearchText(options.query);
  const compactQuery = compactSearchText(options.query);
  const minimumTermMatches =
    scopedTopic || scopedTerms.length <= 2 ? 1 : 2;

  const scored = chunks
    .map((chunk) => {
      const normalizedText = normalizeSearchText(chunk.text);
      const compactText = compactSearchText(chunk.text);
      const exactPhrase =
        normalizedQuery.length >= 8 && normalizedText.includes(normalizedQuery);
      const compactPhrase =
        compactQuery.length >= 8 && compactText.includes(compactQuery);
      const matchedTerms = scopedTerms.filter((term) =>
        normalizedText.includes(normalizeSearchText(term))
      );

      if (!exactPhrase && !compactPhrase && matchedTerms.length < minimumTermMatches) {
        return null;
      }
      if (scopedTopic && !matchesTopic(chunk.text, scopedTopic)) {
        return null;
      }

      const score =
        (exactPhrase ? 100 : 0) +
        (compactPhrase ? 80 : 0) +
        matchedTerms.reduce((sum, term) => sum + Math.min(16, term.length * 1.8), 0);

      return { chunk, score, matchedTerms };
    })
    .filter(
      (
        hit
      ): hit is {
        chunk: (typeof chunks)[number];
        score: number;
        matchedTerms: string[];
      } => hit !== null && hit.score > 0
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.chunk.page ?? 0) - (b.chunk.page ?? 0);
    })
    .slice(0, options.limit);

  return scored.map(({ chunk, score, matchedTerms }) => ({
    chunkId: chunk.id,
    itemId: chunk.itemId,
    itemName: chunk.item.name,
    relativePath: chunk.item.relativePath,
    fileType: chunk.item.fileType,
    page: chunk.page,
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
    distance: 1 / (score + 1),
    relatedCount: 1,
    relatedPages: chunk.page !== null ? [chunk.page] : [],
    matchKind: "text",
    intent: options.profile.intent,
    topic: scopedTopic,
    topicMatched: matchesTopic(chunk.text, scopedTopic),
    whyMatched: whyMatched(chunk.text, { ...options.profile, topic: scopedTopic }),
    highlightTerms: buildScopedHighlightTerms(options.query, matchedTerms, chunk.text),
  }));
}

function scopedQueryTerms(
  query: string,
  profile: { intent?: SearchIntent; topic?: SearchTopic }
): string[] {
  return unique([
    ...extractQueryTerms(query),
    ...topicScopedTerms(profile.topic),
  ])
    .map((term) => term.trim())
    .filter((term) => term.length >= 4);
}

function topicScopedTerms(topic: SearchTopic | undefined): string[] {
  if (topic === "fireSafety") {
    return [
      "πυρασφάλεια",
      "πυροπροστασία",
      "πυροσβεστική",
      "πυροδιαμέρισμα",
      "pirasfaleia",
      "pyrasfaleia",
      "fire",
    ];
  }
  if (topic === "publicWorks") return ["δημόσια", "έργα", "4412", "σύμβαση"];
  if (topic === "energy") return ["ΚΕΝΑΚ", "ενέργεια", "ενεργειακή"];
  if (topic === "electrical") return ["ηλεκτρική", "ηλεκτρολογικά", "ΚΕΗΕ", "ΕΛΟΤ", "HD", "60364"];
  if (topic === "standards") return ["πρότυπα", "ΕΛΟΤ", "standard", "HD", "60364"];
  if (topic === "forms") return ["πρωτόκολλο", "έντυπο", "δήλωση", "ΥΔΕ"];
  return [];
}

function buildScopedHighlightTerms(
  query: string,
  matchedTerms: string[],
  chunkText: string
): string[] {
  const terms = unique([
    query.trim(),
    ...matchedTerms,
  ]).filter((term) => term.length >= 3);
  return buildHighlightTerms(chunkText, terms).slice(0, 8);
}

function profileScore(
  text: string,
  fileType: string | null,
  profile: { intent?: SearchIntent; topic?: SearchTopic }
): number {
  if (!profile.intent && !profile.topic) return 0;
  let score = 0;
  const topicMatched = matchesTopic(text, profile.topic);
  const intentMatched = matchesIntent(text, profile.intent, fileType);
  if (profile.topic) score += topicMatched ? 55 : -45;
  if (profile.intent) score += intentMatched ? 18 : 0;
  if (profile.topic && profile.intent && topicMatched && intentMatched) score += 22;
  return score;
}

function matchesIntent(
  text: string,
  intent: SearchIntent | undefined,
  fileType: string | null
): boolean {
  if (!intent) return false;
  const t = fold(text);
  if (intent === "legislation") {
    return (
      fileType === "pdf" &&
      /νομοθε|νομ|φεκ|fek|κανονισ|διαταξ|πδ|υπουργικ|αποφασ|egkyk|εγκυκλ|law/.test(t)
    );
  }
  if (intent === "standard") return /προτυπ|standard|ελοτ|elot|hd|60364/.test(t);
  if (intent === "form") return /πρωτοκολλ|εντυπ|δηλωση|form|protocol|υδε/.test(t);
  if (intent === "publicWorks") return /δημοσ|εργ|4412|συμβασ|αναθεσ/.test(t);
  if (intent === "energy") return /κενακ|ενεργ|energy/.test(t);
  if (intent === "electrical") return /ηλεκτρ|κεηε|ελοτ|hd|60364/.test(t);
  if (intent === "fireSafety") return matchesTopic(text, "fireSafety");
  return false;
}

function matchesTopic(text: string, topic: SearchTopic | undefined): boolean {
  if (!topic) return false;
  const t = fold(text);
  if (topic === "fireSafety") {
    return /πυρ|πυρασφαλ|πυροπροστασ|πυροσβεσ|fire|pyr|pir/.test(t);
  }
  if (topic === "publicWorks") return /δημοσ|εργ|4412|συμβασ|αναθεσ/.test(t);
  if (topic === "energy") return /κενακ|ενεργ|energy/.test(t);
  if (topic === "electrical") return /ηλεκτρ|κεηε|ελοτ|hd|60364/.test(t);
  if (topic === "standards") return /προτυπ|standard|ελοτ|elot|hd|60364/.test(t);
  if (topic === "forms") return /πρωτοκολλ|εντυπ|δηλωση|form|protocol|υδε/.test(t);
  return false;
}

function whyMatched(
  text: string,
  profile: { intent?: SearchIntent; topic?: SearchTopic }
): string | undefined {
  const parts: string[] = [];
  if (matchesTopic(text, profile.topic)) {
    parts.push(topicLabel(profile.topic));
  }
  if (profile.intent && matchesIntent(text, profile.intent, null)) {
    parts.push(intentLabel(profile.intent));
  }
  return parts.length > 0 ? unique(parts).join(" + ") : undefined;
}

function topicLabel(topic: SearchTopic | undefined): string {
  if (topic === "fireSafety") return "Πυροπροστασία";
  if (topic === "publicWorks") return "Δημόσια έργα";
  if (topic === "energy") return "ΚΕΝΑΚ / Ενέργεια";
  if (topic === "electrical") return "Ηλεκτρολογικά";
  if (topic === "standards") return "Πρότυπα";
  if (topic === "forms") return "Έντυπα";
  return "Θέμα";
}

function intentLabel(intent: SearchIntent): string {
  if (intent === "legislation") return "Νομοθεσία";
  if (intent === "standard") return "Πρότυπο";
  if (intent === "form") return "Έντυπο";
  if (intent === "publicWorks") return "Δημόσια έργα";
  if (intent === "energy") return "Ενέργεια";
  if (intent === "electrical") return "Ηλεκτρολογικά";
  return "Πυρασφάλεια";
}

function resultGroupKey(item: { itemName?: string; name?: string; relativePath: string }): string {
  const name = "itemName" in item ? item.itemName ?? "" : item.name ?? "";
  const canonicalName = fold(name)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return canonicalName || fold(item.relativePath);
}

async function getItemContext(itemId: string) {
  return prisma.libraryItem.findUnique({
    where: { id: itemId },
    select: {
      name: true,
      relativePath: true,
      fileType: true,
    },
  });
}

function expandQuery(
  query: string,
  context: { name: string; relativePath: string; fileType: string | null } | null
): string {
  const topicHints = topicExpansion(query);
  if (!context) return unique([query, ...topicHints]).join(" ");
  const contextWords = [
    context.name,
    context.relativePath.split("/").slice(-3, -1).join(" "),
    context.fileType ?? "",
  ];
  return unique([query, ...topicHints, ...contextWords]).join(" ");
}

function topicExpansion(query: string): string[] {
  const q = fold(query);
  const hints: string[] = [];
  if (/νομοθε|nomothe|nomothes|nomo|law|fek|φεκ|ν\.?\s*\d|n\.?\s*\d/.test(q)) {
    hints.push("νομοθεσία ΦΕΚ νόμος υπουργική απόφαση εγκύκλιος");
  }
  if (/προτυπ|protyp|standard|ελοτ|elot|hd\s*384|60364/.test(q)) {
    hints.push("πρότυπα ΕΛΟΤ HD 384 EN 60364 τεχνική προδιαγραφή");
  }
  if (/πρωτοκολλ|protokoll|protocol|εντυπ|entyp|form|υδε|yde|ελεγχ|elegx|elench/.test(q)) {
    hints.push("πρωτόκολλο ελέγχου έντυπο υπεύθυνη δήλωση εγκατάσταση");
  }
  if (/δημοσ|dimos|dimosia|public|εργ|erga/.test(q)) {
    hints.push("δημόσια έργα Ν 4412 συμβάσεις οικοδομή κατασκευή προδιαγραφές μελέτη");
  }
  if (/κενακ|kenak|ενεργ|energeia|energy/.test(q)) {
    hints.push("ΚΕΝΑΚ ενεργειακή απόδοση κτίρια επιθεώρηση");
  }
  if (/ηλεκτρ|ilektr|electr|κεηε|kehe/.test(q)) {
    hints.push("ηλεκτρική εγκατάσταση ΚΕΗΕ ΕΛΟΤ HD 384 ΥΔΕ");
  }
  if (/πυρ|pyr|pir|pirasfal|pyrasfal|pyrosfal|pirosfal|fire|πυρασφαλ/.test(q)) {
    hints.push("πυρασφάλεια πυροπροστασία πυροσβεστική διάταξη");
  }
  return hints;
}

function formNoisePenalty(text: string): number {
  const nonSpace = Math.max(text.replace(/\s+/g, "").length, 1);
  const dotted = text.match(/[._-]{2,}|…/g)?.join("").length ?? 0;
  const checkbox = text.match(/[☐□■\[\]]/g)?.length ?? 0;
  const lowTextRatio = 1 - ((text.match(/\p{L}/gu)?.length ?? 0) / nonSpace);
  return Math.min(1.6, dotted / nonSpace + checkbox / nonSpace + lowTextRatio * 0.35);
}

function isMeaningfulChunk(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const nonSpace = text.replace(/\s+/g, "").length;
  if (letters < 16) return false;
  if (letters / Math.max(nonSpace, 1) <= 0.25) return false;
  const filler = text.match(/[._…-]/g)?.length ?? 0;
  if (filler / Math.max(nonSpace, 1) > 0.35) return false;
  const checkboxNoise = (text.match(/[☐□■\[\]]/g)?.length ?? 0) / Math.max(nonSpace, 1);
  return checkboxNoise < 0.08;
}

async function findLexicalChunkHits(options: {
  query: string;
  queryTerms: string[];
  itemId: string | null;
  limit: number;
}): Promise<{ chunkId: string; score: number }[]> {
  const terms = unique([options.query, ...options.queryTerms])
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 16);
  if (terms.length === 0) return [];

  const chunks = await prisma.aiChunk.findMany({
    where: {
      ...(options.itemId ? { itemId: options.itemId } : {}),
      OR: terms.map((term) => ({ text: { contains: term } })),
      item: {
        isHidden: false,
        isAdminHidden: false,
        isBrowsable: true,
      },
    },
    select: { id: true, text: true },
    take: options.limit * 4,
  });

  return chunks
    .map((chunk) => ({
      chunkId: chunk.id,
      score: lexicalScore(chunk.text, terms),
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit);
}

async function findFilenameHits(options: {
  query: string;
  queryTerms: string[];
  limit: number;
}) {
  const terms = unique([options.query, ...options.queryTerms])
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 18);
  if (terms.length === 0) return [];

  const items = await prisma.libraryItem.findMany({
    where: {
      itemType: "file",
      isHidden: false,
      isAdminHidden: false,
      isBrowsable: true,
      OR: terms.flatMap((term) => [
        { name: { contains: term } },
        { relativePath: { contains: term } },
      ]),
    },
    orderBy: [{ name: "asc" }],
    take: Math.max(options.limit * 100, 1000),
    select: {
      id: true,
      name: true,
      relativePath: true,
      fileType: true,
    },
  });
  const numericTerms = unique(
    terms.flatMap((term) => term.match(/\d{3,}/g) ?? [])
  );
  const numericItems =
    numericTerms.length > 0
      ? await prisma.libraryItem.findMany({
          where: {
            itemType: "file",
            isHidden: false,
            isAdminHidden: false,
            isBrowsable: true,
            OR: numericTerms.flatMap((term) => [
              { name: { contains: term } },
              { relativePath: { contains: term } },
            ]),
          },
          take: 80,
          select: {
            id: true,
            name: true,
            relativePath: true,
            fileType: true,
          },
        })
      : [];

  return uniqueById([...numericItems, ...items])
    .sort((a, b) => filenameScore(b, terms) - filenameScore(a, terms))
    .slice(0, options.limit);
}

function lexicalScore(text: string, terms: string[]): number {
  const folded = fold(text);
  let score = 0;
  for (const term of terms) {
    const needle = fold(term);
    if (!needle) continue;
    let pos = folded.indexOf(needle);
    while (pos !== -1) {
      score += Math.min(2.5, needle.length / 6);
      pos = folded.indexOf(needle, pos + needle.length);
    }
  }
  return score;
}

function filenameScore(
  item: { name: string; relativePath: string; fileType: string | null },
  terms: string[]
): number {
  const haystack = `${item.name} ${item.relativePath}`;
  const folded = fold(haystack);
  const numberBoost = terms.reduce((score, term) => {
    const digits = term.match(/\d{3,}/g) ?? [];
    return score + digits.filter((n) => folded.includes(n)).length * 20;
  }, 0);
  const exactTermBoost = terms.reduce((score, term) => {
    const needle = fold(term);
    return needle.length >= 4 && folded.includes(needle) ? score + 4 : score;
  }, 0);
  return (
    lexicalScore(haystack, terms) +
    numberBoost +
    exactTermBoost +
    topicFilenameBoost(haystack, terms.join(" ")) +
    fileTypeBoost(item.fileType, terms.join(" "))
  );
}

function topicFilenameBoost(haystack: string, query: string): number {
  const h = fold(haystack);
  const q = fold(query);
  let score = 0;
  if (/πυρ|pyr|pir|pirasfal|pyrasfal|pyrosfal|pirosfal|fire|πυρασφαλ/.test(q)) {
    if (/πυρ|πυρασφαλ|πυροπροστασ|fire/.test(h)) score += 18;
  }
  if (/κενακ|kenak/.test(q) && /κενακ|kenak/.test(h)) score += 18;
  if (/ελοτ|elot|hd\s*384|60364/.test(q) && /ελοτ|elot|hd|384|60364/.test(h)) {
    score += 14;
  }
  if (/πρωτοκολλ|protokoll|protocol/.test(q) && /πρωτοκολλ|protocol/.test(h)) {
    score += 14;
  }
  return score;
}

function fileTypeBoost(fileType: string | null, query: string): number {
  if (fileType !== "pdf") return 0;
  const q = fold(query);
  return /νομοθε|fek|φεκ|νομ|προτυπ|standard|κανονισ|regulation|δημοσ|εργ|κενακ|ελοτ|elot/.test(q)
    ? 1.5
    : 0.35;
}

/** Pull 3-6-word key phrases from a chunk that also overlap with the query. */
function buildHighlightTerms(chunkText: string, queryTerms: string[]): string[] {
  const terms = new Set<string>();
  const lowerChunk = chunkText.toLowerCase();

  // 1) Query terms that literally appear in the chunk.
  for (const q of queryTerms) {
    if (q.length >= 3 && lowerChunk.includes(q.toLowerCase())) {
      terms.add(q);
    }
  }
  // 2) Short n-grams of the chunk around each query term, so phrases like
  //    "αντισεισμικός κανονισμός" highlight even if the user only typed one word.
  const words = chunkText.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase();
    if (queryTerms.some((q) => w.includes(q.toLowerCase()))) {
      const start = Math.max(0, i - 1);
      const end = Math.min(words.length, i + 3);
      const phrase = words.slice(start, end).join(" ");
      if (phrase.length >= 6 && phrase.length <= 80) terms.add(phrase);
    }
  }
  if (terms.size === 0) {
    for (const phrase of fallbackHighlightPhrases(chunkText)) {
      terms.add(phrase);
      if (terms.size >= 3) break;
    }
  }
  return [...terms].slice(0, 8);
}

function fallbackHighlightPhrases(chunkText: string): string[] {
  const cleaned = chunkText
    .replace(/[._-]{4,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned
    .split(/\s+/u)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => /\p{L}/u.test(w));

  const phrases: string[] = [];
  for (let i = 0; i < words.length; i += 4) {
    const phrase = words.slice(i, i + 7).join(" ");
    const letters = phrase.match(/\p{L}/gu)?.length ?? 0;
    if (phrase.length >= 24 && phrase.length <= 120 && letters >= 16) {
      phrases.push(phrase);
    }
    if (phrases.length >= 4) break;
  }
  return phrases;
}

/** Split the query into useful terms: drop stop-words and punctuation. */
function extractQueryTerms(q: string): string[] {
  const stopWords = new Set([
    "ψαχνω",
    "ψάχνω",
    "αναζητω",
    "αναζήτηση",
    "για",
    "σε",
    "στο",
    "στη",
    "στην",
    "στα",
    "των",
    "και",
    "thelo",
    "psaxno",
    "psachno",
    "gia",
    "kai",
    "sto",
    "sta",
    "stin",
    "for",
    "the",
    "and",
  ]);
  return q
    .split(/[\s,.;:!?()\[\]"'«»—–-]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !stopWords.has(fold(w)));
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function normalizeSearchText(s: string): string {
  return fold(s)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(s: string): string {
  return normalizeSearchText(s).replace(/\s+/g, "");
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
