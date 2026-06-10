import { prisma } from "@/lib/db";
import { resolveItemPath } from "@/lib/paths";

import { chunkPages } from "./chunk";
import { embedPassages } from "./embedder";
import { extractTextByType } from "./extract";
import {
  countChunkVectors,
  deleteChunkVectors,
  getVecDb,
  listVectorChunkIds,
  upsertChunkVectorsBatch,
} from "./vectorStore";

const BATCH_SIZE = 32;

export type AiIngestResult = {
  runId: string;
  status: "success" | "failed" | "skipped";
  itemsProcessed: number;
  chunksCreated: number;
  durationMs: number;
  errors: string[];
};

/**
 * Full AI ingestion pass.
 *
 * Scope: PDF / DOC / DOCX files that are browsable, not hidden, and whose
 * last-known modifiedAt is newer than the last successful AI run (or that
 * have no chunks yet). This keeps reruns cheap once the library stabilises.
 *
 * Process per item:
 *  1. Extract text (pdfjs / mammoth / LO→pdf).
 *  2. Chunk to ~500 chars, 80 overlap, preserving PDF page numbers.
 *  3. Insert AiChunk rows in one transaction.
 *  4. Embed the batch with multilingual-e5-small (CPU, batch=32).
 *  5. Upsert vectors into vec_ai_chunks.
 */
export async function runAiIngest(options: {
  verbose?: boolean;
  force?: boolean;
}): Promise<AiIngestResult> {
  const start = Date.now();
  const run = await prisma.aiIndexRun.create({
    data: { status: "running" },
  });

  // Warm up the vec0 table.
  try {
    getVecDb();
  } catch (err) {
    const msg = `sqlite-vec failed to initialise: ${(err as Error).message}`;
    await prisma.aiIndexRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errors: JSON.stringify([msg]),
      },
    });
    return {
      runId: run.id,
      status: "failed",
      itemsProcessed: 0,
      chunksCreated: 0,
      durationMs: Date.now() - start,
      errors: [msg],
    };
  }

  // Find the last successful run's finish time for incremental mode.
  const lastSuccess = await prisma.aiIndexRun.findFirst({
    where: { status: "success" },
    orderBy: { startedAt: "desc" },
  });
  const existingVectorCount = countChunkVectors();
  const force = options.force || existingVectorCount === 0;

  const sinceTime = force
    ? null
    : lastSuccess?.finishedAt ?? null;

  const candidates = await prisma.libraryItem.findMany({
    where: {
      itemType: "file",
      fileType: { in: ["pdf", "docx", "doc"] },
      isHidden: false,
      isAdminHidden: false,
      isBrowsable: true,
    },
    orderBy: [{ level: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      relativePath: true,
      fileType: true,
      modifiedAt: true,
    },
  });

  // Fetch chunk counts per item in one query to avoid N+1.
  const counts = await prisma.aiChunk.groupBy({
    by: ["itemId"],
    _count: { itemId: true },
  });
  const countsByItem = new Map(counts.map((c) => [c.itemId, c._count.itemId]));

  let itemsProcessed = 0;
  let chunksCreated = 0;
  const errors: string[] = [];

  async function cancellationRequested() {
    const latest = await prisma.aiIndexRun.findUnique({
      where: { id: run.id },
      select: { status: true },
    });
    return latest?.status === "skipped";
  }

  const vectorBackfill = await backfillMissingVectors({ verbose: options.verbose });
  if (await cancellationRequested()) {
    return {
      runId: run.id,
      status: "skipped",
      itemsProcessed,
      chunksCreated,
      durationMs: Date.now() - start,
      errors: ["AI indexing was stopped by the administrator."],
    };
  }
  itemsProcessed += vectorBackfill.itemsProcessed;
  chunksCreated += vectorBackfill.chunksCreated;
  errors.push(...vectorBackfill.errors);
  if (vectorBackfill.chunksCreated > 0) {
    await prisma.aiIndexRun.update({
      where: { id: run.id },
      data: { itemsProcessed, chunksCreated },
    });
  }

  for (const item of candidates) {
    if (await cancellationRequested()) {
      await prisma.aiIndexRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: "skipped",
          itemsProcessed,
          chunksCreated,
          errors: JSON.stringify(["AI indexing was stopped by the administrator."]),
        },
      });
      return {
        runId: run.id,
        status: "skipped",
        itemsProcessed,
        chunksCreated,
        durationMs: Date.now() - start,
        errors: ["AI indexing was stopped by the administrator."],
      };
    }
    const hasChunks = (countsByItem.get(item.id) ?? 0) > 0;
    const isStale =
      sinceTime === null ||
      !hasChunks ||
      (item.modifiedAt && item.modifiedAt > sinceTime);
    if (!isStale) continue;

    try {
      const abs = resolveItemPath(item.relativePath);
      const pages = await extractTextByType(
        item.fileType ?? "",
        abs,
        item.id
      );
      const chunks = chunkPages(pages);

      if (chunks.length === 0) {
        // Still count as processed so we don't retry every run.
        itemsProcessed++;
        continue;
      }

      // Wipe any existing chunks for this item so re-index is idempotent.
      const existingIds = (
        await prisma.aiChunk.findMany({
          where: { itemId: item.id },
          select: { id: true },
        })
      ).map((r) => r.id);
      if (existingIds.length > 0) {
        await prisma.aiChunk.deleteMany({ where: { itemId: item.id } });
        deleteChunkVectors(existingIds);
      }

      // Insert chunks, capturing generated ids.
      const createdIds: string[] = [];
      // SQLite can't do createMany + returning for free -> loop.
      for (const c of chunks) {
        const row = await prisma.aiChunk.create({
          data: {
            itemId: item.id,
            page: c.page,
            chunkIndex: c.chunkIndex,
            text: c.text,
            tokenCount: Math.round(c.text.length / 4),
          },
          select: { id: true },
        });
        createdIds.push(row.id);
      }

      // Embed + store vectors in batches.
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batchTexts = chunks
          .slice(i, i + BATCH_SIZE)
          .map((c) => c.text);
        const batchIds = createdIds.slice(i, i + BATCH_SIZE);
        const vecs = await embedPassages(batchTexts);
        upsertChunkVectorsBatch(
          vecs.map((vec, idx) => ({ chunkId: batchIds[idx], vec }))
        );
      }

      chunksCreated += chunks.length;
      itemsProcessed++;

      if (options.verbose) {
        // eslint-disable-next-line no-console
        console.log(
          `[ai] indexed ${item.relativePath} — ${chunks.length} chunks`
        );
      }

      // Checkpoint progress on the run row so the admin UI reflects it.
      await prisma.aiIndexRun.update({
        where: { id: run.id },
        data: { itemsProcessed, chunksCreated },
      });
    } catch (err) {
      const msg = `${item.relativePath}: ${(err as Error).message}`;
      errors.push(msg);
      if (options.verbose) {
        // eslint-disable-next-line no-console
        console.warn(`[ai] skipped ${msg}`);
      }
    }
  }

  // Treat partial runs as "success" so incremental logic can advance for the
  // items that did get indexed; the `errors` JSON column still preserves the
  // full list for the admin UI.
  const status: "success" | "failed" =
    itemsProcessed > 0 || errors.length === 0 ? "success" : "failed";
  await prisma.aiIndexRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      status,
      itemsProcessed,
      chunksCreated,
      errors: errors.length ? JSON.stringify(errors.slice(0, 100)) : null,
    },
  });

  return {
    runId: run.id,
    status,
    itemsProcessed,
    chunksCreated,
    durationMs: Date.now() - start,
    errors,
  };
}

async function backfillMissingVectors(options: {
  verbose?: boolean;
}): Promise<{ itemsProcessed: number; chunksCreated: number; errors: string[] }> {
  const vectorIds = new Set(listVectorChunkIds());
  const chunks = await prisma.aiChunk.findMany({
    where: {
      item: {
        isHidden: false,
        isAdminHidden: false,
        isBrowsable: true,
      },
    },
    select: {
      id: true,
      text: true,
      itemId: true,
      item: {
        select: {
          relativePath: true,
        },
      },
    },
    orderBy: [{ itemId: "asc" }, { chunkIndex: "asc" }],
  });
  const missing = chunks.filter((chunk) => !vectorIds.has(chunk.id));
  if (missing.length === 0) {
    return { itemsProcessed: 0, chunksCreated: 0, errors: [] };
  }

  const errors: string[] = [];
  let chunksCreated = 0;
  const itemIds = new Set<string>();
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    try {
      const vecs = await embedPassages(batch.map((chunk) => chunk.text));
      upsertChunkVectorsBatch(
        vecs.map((vec, idx) => ({ chunkId: batch[idx].id, vec }))
      );
      chunksCreated += batch.length;
      for (const chunk of batch) itemIds.add(chunk.itemId);
      if (options.verbose) {
        // eslint-disable-next-line no-console
        console.log(`[ai] vector backfill ${chunksCreated}/${missing.length}`);
      }
    } catch (err) {
      const first = batch[0];
      errors.push(
        `${first.item.relativePath}: vector backfill failed: ${(err as Error).message}`
      );
    }
  }

  return {
    itemsProcessed: itemIds.size,
    chunksCreated,
    errors,
  };
}
