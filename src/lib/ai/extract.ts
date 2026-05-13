import fs from "node:fs/promises";
import path from "node:path";

import type { RawPage } from "./chunk";
import { convertToPdfCached } from "@/lib/office";

/**
 * Text extraction for PDF / DOCX / DOC.
 *
 * - PDF: pdfjs-dist (legacy Node build) gives per-page text, perfect for
 *   our chunk→page mapping used by in-document highlighting.
 * - DOCX: mammoth's Node API returns raw text. No page info (docx has no
 *   fixed pagination), so we emit a single `page: null` entry.
 * - DOC: we reuse the LibreOffice-to-PDF cache from /src/lib/office.ts
 *   and then run the PDF extractor.
 */

export async function extractTextByType(
  fileType: string,
  srcAbs: string,
  itemId: string
): Promise<RawPage[]> {
  switch (fileType) {
    case "pdf":
      return extractFromPdf(srcAbs);
    case "docx":
      return extractFromDocx(srcAbs);
    case "doc": {
      const pdfAbs = await convertToPdfCached({ itemId, srcAbs });
      return extractFromPdf(pdfAbs);
    }
    default:
      return [];
  }
}

async function extractFromPdf(absPath: string): Promise<RawPage[]> {
  // pdfjs-dist ships both ESM and legacy builds; the legacy build avoids
  // Worker and DOM requirements for Node.
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument: (
      args: { data: Uint8Array; useWorker?: boolean; isEvalSupported?: boolean }
    ) => { promise: Promise<PdfDoc> };
    GlobalWorkerOptions?: { workerSrc: string };
  };

  const buf = await fs.readFile(absPath);
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;

  const pages: RawPage[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((i: { str?: string }) => i.str ?? "")
      .join(" ");
    pages.push({ page: p, text });
  }
  return pages;
}

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: { str?: string }[] }>;
  }>;
};

async function extractFromDocx(absPath: string): Promise<RawPage[]> {
  const mammoth = (await import("mammoth")) as unknown as {
    extractRawText: (opts: {
      buffer?: Buffer;
      path?: string;
    }) => Promise<{ value: string }>;
  };
  const ext = path.extname(absPath).toLowerCase();
  if (ext !== ".docx") return [];
  const result = await mammoth.extractRawText({ path: absPath });
  return [{ page: null, text: result.value ?? "" }];
}
