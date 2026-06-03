#!/usr/bin/env tsx
/**
 * Verify a local archive folder against a committed archive blueprint.
 *
 * This script is read-only. It reports missing items, extras, type mismatches,
 * and file size mismatches. It exits with code 1 when the archive differs.
 * By default it ignores Windows noise files that the website already hides
 * during indexing. Pass --include-noise to verify those too.
 *
 * Usage:
 *   npm run archive:verify -- --blueprint archive-blueprint-usb.json --source "G:\Other computers\USB and External Devices\EMTEC B250\1.1Θ ..."
 */

import { config as loadEnv } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: true });

type BlueprintEntry = {
  relativePath: string;
  name: string;
  itemType: "folder" | "file";
  size: string | null;
};

type Blueprint = {
  entries: BlueprintEntry[];
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

function comparablePath(relativePath: string) {
  return relativePath.normalize("NFC");
}

function isNoiseRelativePath(relativePath: string) {
  const name = path.posix.basename(toPosix(relativePath)).toLocaleLowerCase("el-GR");
  return (
    name === "desktop.ini" ||
    name === "thumbs.db" ||
    name.endsWith(".dwl") ||
    name.endsWith(".dwl2") ||
    name.endsWith(".sv$") ||
    name.startsWith("~$")
  );
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
    };
    if (isFolder) {
      yield* walk(root, absolutePath);
    }
  }
}

function printList(title: string, values: string[], max: number) {
  console.log(`${title}: ${values.length}`);
  for (const value of values.slice(0, max)) {
    console.log(`  - ${value}`);
  }
  if (values.length > max) {
    console.log(`  ... ${values.length - max} more`);
  }
}

async function main() {
  const blueprintPath =
    argValue("--blueprint", "archive-blueprint-usb.json") ??
    "archive-blueprint-usb.json";
  const source = argValue("--source", process.env.ARCHIVE_ROOT);
  const maxOutput = Number(argValue("--max", "50"));
  const includeNoise = process.argv.includes("--include-noise");

  if (!source) {
    throw new Error(
      'Set ARCHIVE_ROOT or pass --source "G:\\Other computers\\USB and External Devices\\EMTEC B250\\..."'
    );
  }

  const sourceRoot = path.resolve(source);
  const blueprint = JSON.parse(
    await fs.readFile(path.resolve(blueprintPath), "utf8")
  ) as Blueprint;

  const expected = new Map<string, BlueprintEntry>();
  for (const entry of blueprint.entries) {
    if (!includeNoise && isNoiseRelativePath(entry.relativePath)) continue;
    expected.set(comparablePath(entry.relativePath), entry);
  }

  const actual = new Map<string, BlueprintEntry>();
  for await (const entry of walk(sourceRoot, sourceRoot)) {
    if (!includeNoise && isNoiseRelativePath(entry.relativePath)) continue;
    actual.set(comparablePath(entry.relativePath), entry);
  }

  const missing: string[] = [];
  const extra: string[] = [];
  const typeMismatch: string[] = [];
  const sizeMismatch: string[] = [];

  for (const [key, expectedEntry] of expected) {
    const actualEntry = actual.get(key);
    if (!actualEntry) {
      missing.push(expectedEntry.relativePath);
      continue;
    }
    if (actualEntry.itemType !== expectedEntry.itemType) {
      typeMismatch.push(
        `${expectedEntry.relativePath} expected=${expectedEntry.itemType} actual=${actualEntry.itemType}`
      );
      continue;
    }
    if (
      expectedEntry.itemType === "file" &&
      actualEntry.size !== expectedEntry.size
    ) {
      sizeMismatch.push(
        `${expectedEntry.relativePath} expected=${expectedEntry.size} actual=${actualEntry.size}`
      );
    }
  }

  for (const [key, actualEntry] of actual) {
    if (!expected.has(key)) {
      extra.push(actualEntry.relativePath);
    }
  }

  console.log(`Blueprint: ${path.resolve(blueprintPath)}`);
  console.log(`Source: ${sourceRoot}`);
  console.log(`Noise files: ${includeNoise ? "included" : "ignored"}`);
  console.log(`Expected items: ${expected.size}`);
  console.log(`Actual items: ${actual.size}`);
  console.log("");
  printList("Missing", missing, maxOutput);
  printList("Extra", extra, maxOutput);
  printList("Type mismatches", typeMismatch, maxOutput);
  printList("Size mismatches", sizeMismatch, maxOutput);

  const ok =
    missing.length === 0 &&
    extra.length === 0 &&
    typeMismatch.length === 0 &&
    sizeMismatch.length === 0;

  console.log("");
  console.log(ok ? "Archive matches blueprint." : "Archive differs from blueprint.");
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
