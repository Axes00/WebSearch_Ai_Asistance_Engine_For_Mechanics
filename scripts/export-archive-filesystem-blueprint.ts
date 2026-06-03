#!/usr/bin/env tsx
/**
 * Export a filesystem archive blueprint from a known-good archive folder.
 *
 * Use this against the USB / canonical Google Drive archive. The generated
 * JSON can be committed and used by collaborators to verify their local
 * ARCHIVE_ROOT before indexing the website.
 *
 * Usage:
 *   npm run archive:blueprint:fs -- --source "E:\ArchiveRoot" --out archive-blueprint-usb.json
 */

import fs from "node:fs/promises";
import path from "node:path";

type BlueprintEntry = {
  relativePath: string;
  name: string;
  itemType: "folder" | "file";
  size: string | null;
  modifiedAt: string | null;
  level: number;
};

function argValue(name: string, fallback?: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function toPosix(relativePath: string) {
  return relativePath.split(path.sep).join("/");
}

async function* walk(
  root: string,
  current: string
): AsyncGenerator<BlueprintEntry> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    const relativePath = toPosix(path.relative(root, absolutePath));
    const stat = await fs.stat(absolutePath);
    const isFolder = entry.isDirectory();
    yield {
      relativePath,
      name: entry.name,
      itemType: isFolder ? "folder" : "file",
      size: isFolder ? null : stat.size.toString(),
      modifiedAt: stat.mtime.toISOString(),
      level: relativePath.split("/").length,
    };
    if (isFolder) {
      yield* walk(root, absolutePath);
    }
  }
}

async function main() {
  const source = argValue("--source");
  const out = argValue("--out", "archive-blueprint-usb.json") ?? "archive-blueprint-usb.json";
  if (!source) {
    throw new Error(
      'Usage: npm run archive:blueprint:fs -- --source "E:\\ArchiveRoot" --out archive-blueprint-usb.json'
    );
  }

  const sourceRoot = path.resolve(source);
  const stat = await fs.stat(sourceRoot);
  if (!stat.isDirectory()) {
    throw new Error(`Source is not a directory: ${sourceRoot}`);
  }

  const entries: BlueprintEntry[] = [];
  for await (const entry of walk(sourceRoot, sourceRoot)) {
    entries.push(entry);
  }
  entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "el"));

  const blueprint = {
    generatedAt: new Date().toISOString(),
    sourceRoot,
    itemCount: entries.length,
    folderCount: entries.filter((entry) => entry.itemType === "folder").length,
    fileCount: entries.filter((entry) => entry.itemType === "file").length,
    entries,
  };

  const outputPath = path.resolve(out);
  await fs.writeFile(outputPath, JSON.stringify(blueprint, null, 2), "utf8");
  console.log(`Wrote ${entries.length} entries to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
