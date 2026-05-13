#!/usr/bin/env tsx
/**
 * CLI entry point for the archive indexer.
 *
 *   npm run index
 *
 * Reads ARCHIVE_ROOT from .env / .env.local, walks the folder tree, and
 * upserts every folder/file into the SQLite database.
 */

import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

// Load env in the order Next.js would: .env, .env.local (overrides).
// We use dotenv directly since the CLI runs outside Next's runtime.
loadEnv({ path: path.resolve(process.cwd(), ".env") });
const localPath = path.resolve(process.cwd(), ".env.local");
if (existsSync(localPath)) {
  loadEnv({ path: localPath, override: true });
}

import { runIndex, seedDefaultHighlightsIfEmpty } from "../src/lib/indexer";
import { prisma } from "../src/lib/db";

async function main() {
  const verbose = !process.argv.includes("--quiet");
  if (verbose) {
    console.log(`[index] ARCHIVE_ROOT=${process.env.ARCHIVE_ROOT}`);
  }
  const res = await runIndex({ verbose });
  const seeded = await seedDefaultHighlightsIfEmpty();
  if (verbose && seeded > 0) {
    console.log(`[index] seeded ${seeded} homepage-highlighted documents`);
  }
  if (res.status === "failed") {
    console.error(
      `[index] finished with ${res.errors.length} error(s) in ${res.durationMs}ms`
    );
    for (const e of res.errors.slice(0, 10)) console.error("  -", e);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[index] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
