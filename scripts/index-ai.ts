#!/usr/bin/env tsx
/**
 * CLI entry point for the AI indexer.
 *
 *   npm run index:ai
 *
 * Extracts text from PDF / DOC / DOCX files, chunks it, embeds each chunk
 * with `Xenova/multilingual-e5-small`, and stores the vectors in the
 * sqlite-vec `vec_ai_chunks` virtual table.
 *
 * Add `--force` to re-embed everything instead of incrementally.
 */

import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env") });
const localPath = path.resolve(process.cwd(), ".env.local");
if (existsSync(localPath)) {
  loadEnv({ path: localPath, override: true });
}

import { runAiIngest } from "../src/lib/ai/ingest";
import { closeVecDb } from "../src/lib/ai/vectorStore";
import { prisma } from "../src/lib/db";

async function main() {
  const verbose = !process.argv.includes("--quiet");
  const force = process.argv.includes("--force");
  if (verbose) {
    console.log(`[ai] starting ingestion${force ? " (force)" : " (incremental)"}`);
  }
  const res = await runAiIngest({ verbose, force });
  if (verbose) {
    console.log(
      `[ai] done — items=${res.itemsProcessed} chunks=${res.chunksCreated} durationMs=${res.durationMs}`
    );
  }
  if (res.errors.length > 0) {
    console.error(`[ai] ${res.errors.length} item error(s):`);
    for (const e of res.errors.slice(0, 10)) console.error("  -", e);
  }
  if (res.status !== "success") process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[ai] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    closeVecDb();
    await prisma.$disconnect();
  });
