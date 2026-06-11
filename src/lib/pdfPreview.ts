import fs from "node:fs/promises";
import path from "node:path";

import pdfPoppler from "pdf-poppler";

import { convertToPdfCached } from "@/lib/office";

const CACHE_ROOT = path.join(process.cwd(), "prisma", "cache", "pdf-preview");

function cacheKeyFor(itemId: string, mtimeMs: number, size: bigint | null) {
  const sizeStr = size === null ? "0" : size.toString();
  return `${itemId}_${Math.round(mtimeMs)}_${sizeStr}`;
}

async function resolvePreviewSource(params: {
  itemId: string;
  abs: string;
  fileType: string | null;
}) {
  if (params.fileType === "doc") {
    return convertToPdfCached({ itemId: params.itemId, srcAbs: params.abs });
  }
  return params.abs;
}

async function prepareCache(params: {
  itemId: string;
  abs: string;
  fileType: string | null;
}) {
  const sourceAbs = await resolvePreviewSource(params);
  const stats = await fs.stat(sourceAbs, { bigint: true });
  const cacheKey = cacheKeyFor(params.itemId, Number(stats.mtimeMs), stats.size);
  const itemCacheDir = path.join(CACHE_ROOT, cacheKey);
  const asciiSource = path.join(itemCacheDir, "source.pdf");

  await fs.mkdir(itemCacheDir, { recursive: true });
  try {
    await fs.access(asciiSource);
  } catch {
    // Poppler on Windows is not reliable with long Unicode Google Drive paths.
    // Copy to an ASCII cache path; never modify the archive source file.
    await fs.copyFile(sourceAbs, asciiSource);
  }

  return { itemCacheDir, asciiSource };
}

export async function getPdfPreviewInfo(params: {
  itemId: string;
  abs: string;
  fileType: string | null;
}) {
  const { asciiSource } = await prepareCache(params);
  const info = await pdfPoppler.info(asciiSource);
  return { pageCount: Number(info.pages) || 0 };
}

export async function renderPdfPreviewPage(params: {
  itemId: string;
  abs: string;
  fileType: string | null;
  page: number;
}) {
  if (!Number.isInteger(params.page) || params.page < 1) {
    throw new Error("Invalid preview page");
  }

  const { itemCacheDir, asciiSource } = await prepareCache(params);
  const cachedPng = path.join(itemCacheDir, `page-${params.page}.png`);

  try {
    await fs.access(cachedPng);
    return cachedPng;
  } catch {
    /* render below */
  }

  await pdfPoppler.convert(asciiSource, {
    format: "png",
    out_dir: itemCacheDir,
    out_prefix: "page",
    page: params.page,
  });

  await fs.access(cachedPng);
  return cachedPng;
}
