import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * LibreOffice-powered document conversion with on-disk caching.
 *
 * We use LibreOffice's headless `soffice --convert-to pdf` command to render
 * `.doc` files (and potentially older formats) to PDF on demand. The result
 * is cached per LibraryItem id so subsequent requests are instant.
 *
 * Cache invalidation: we key the cache entry by a stable digest of the source
 * mtime + size, so any change to the underlying file forces a re-render.
 *
 * If LibreOffice isn't installed the module works but conversions fail with
 * `LibreOfficeUnavailableError`; callers can surface a graceful "preview
 * unavailable" message.
 */

export class LibreOfficeUnavailableError extends Error {
  constructor(message = "LibreOffice is not installed or not on PATH") {
    super(message);
    this.name = "LibreOfficeUnavailableError";
  }
}

const CACHE_ROOT = path.join(process.cwd(), "prisma", "cache", "office");

// Windows ships LibreOffice under `C:\Program Files\LibreOffice\program\soffice.exe`.
// Linux/macOS typically have `soffice` on PATH. We probe common spots once.
let sofficePathPromise: Promise<string | null> | null = null;
let microsoftWordAvailablePromise: Promise<boolean> | null = null;

async function resolveSofficePath(): Promise<string | null> {
  const envPath = process.env.LIBREOFFICE_PATH?.trim();
  const winExtras: string[] = [];
  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles;
    const pfx86 = process.env["ProgramFiles(x86)"];
    const local = process.env.LOCALAPPDATA;
    if (pf) {
      winExtras.push(path.join(pf, "LibreOffice", "program", "soffice.exe"));
    }
    if (pfx86) {
      winExtras.push(path.join(pfx86, "LibreOffice", "program", "soffice.exe"));
    }
    if (local) {
      winExtras.push(
        path.join(local, "Programs", "LibreOffice", "program", "soffice.exe")
      );
    }
    // Common fixed paths (always try; harmless if missing)
    winExtras.push(
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
    );
  }

  const candidates = [
    envPath,
    "soffice",
    ...winExtras,
    "/usr/bin/soffice",
    "/usr/local/bin/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  ].filter(Boolean) as string[];

  /** De-dupe while preserving order (env + PATH probes first). */
  const seen = new Set<string>();
  const uniq = candidates.filter((c) => {
    const k = path.normalize(c).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  for (const candidate of uniq) {
    try {
      // A quick `--version` run proves the binary is executable.
      await new Promise<void>((resolve, reject) => {
        const child = spawn(candidate, ["--version"], {
          stdio: "ignore",
          windowsHide: true,
          shell: candidate === "soffice",
        });
        child.on("error", reject);
        child.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`exit ${code}`));
        });
      });
      return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

export function getSofficePath(): Promise<string | null> {
  if (!sofficePathPromise) {
    sofficePathPromise = resolveSofficePath();
  }
  return sofficePathPromise;
}

export async function isLibreOfficeAvailable(): Promise<boolean> {
  return (await getSofficePath()) !== null || (await isMicrosoftWordAvailable());
}

function cacheKeyFor(itemId: string, mtimeMs: number, size: bigint | null): string {
  const sizeStr = size === null ? "0" : size.toString();
  // Short, collision-free key; no secrets so a plain string is fine.
  return `${itemId}_${Math.round(mtimeMs)}_${sizeStr}`;
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_ROOT, { recursive: true });
}

async function isMicrosoftWordAvailable(): Promise<boolean> {
  if (process.platform !== "win32") return false;
  if (!microsoftWordAvailablePromise) {
    microsoftWordAvailablePromise = new Promise<boolean>((resolve) => {
      const script = [
        "$ErrorActionPreference = 'Stop'",
        "try {",
        "  $word = New-Object -ComObject Word.Application",
        "  $word.Quit()",
        "  exit 0",
        "} catch {",
        "  exit 1",
        "}",
      ].join("\n");
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
        { stdio: "ignore", windowsHide: true }
      );
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
    });
  }
  return microsoftWordAvailablePromise;
}

async function convertWithMicrosoftWord(srcAbs: string, pdfAbs: string): Promise<void> {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$word = $null",
    "$doc = $null",
    `Set-Variable -Name SourcePath -Value ${JSON.stringify(srcAbs)}`,
    `Set-Variable -Name OutputPath -Value ${JSON.stringify(pdfAbs)}`,
    "try {",
    "  $word = New-Object -ComObject Word.Application",
    "  $word.Visible = $false",
    "  $word.DisplayAlerts = 0",
    "  $doc = $word.Documents.Open($SourcePath, $false, $true, $false)",
    "  $doc.ExportAsFixedFormat($OutputPath, 17)",
    "} finally {",
    "  if ($doc -ne $null) { $doc.Close($false) }",
    "  if ($word -ne $null) { $word.Quit() }",
    "}",
  ].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { stdio: "ignore", windowsHide: true }
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Microsoft Word conversion failed (exit ${code})`));
    });
  });
}

/**
 * Convert `srcAbs` to PDF via LibreOffice, re-using the cached result if the
 * source file hasn't changed.
 *
 * Returns the absolute path to the cached PDF.
 */
export async function convertToPdfCached(params: {
  itemId: string;
  srcAbs: string;
}): Promise<string> {
  const { itemId, srcAbs } = params;
  const soffice = await getSofficePath();
  const canUseMicrosoftWord = !soffice && (await isMicrosoftWordAvailable());
  if (!soffice && !canUseMicrosoftWord) {
    throw new LibreOfficeUnavailableError(
      "LibreOffice or Microsoft Word is not available for .doc conversion"
    );
  }

  const stat = await fs.stat(srcAbs, { bigint: true });
  const key = cacheKeyFor(itemId, Number(stat.mtimeMs), stat.size);
  const cachedPdf = path.join(CACHE_ROOT, `${key}.pdf`);

  try {
    await fs.access(cachedPdf);
    return cachedPdf;
  } catch {
    /* fallthrough: convert */
  }

  await ensureCacheDir();

  if (!soffice && canUseMicrosoftWord) {
    try {
      await convertWithMicrosoftWord(srcAbs, cachedPdf);
      return cachedPdf;
    } catch (err) {
      await fs.rm(cachedPdf, { force: true }).catch(() => undefined);
      throw err;
    }
  }
  const sofficeExecutable = soffice;
  if (!sofficeExecutable) {
    throw new LibreOfficeUnavailableError();
  }

  // LibreOffice output filename is derived from the input basename, so we
  // convert inside a per-call temp dir and then rename.
  const workDir = path.join(CACHE_ROOT, `_tmp_${key}`);
  await fs.mkdir(workDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      sofficeExecutable,
      [
        "--headless",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        workDir,
        srcAbs,
      ],
      { stdio: "ignore" }
    );
    child.on("error", reject);
    child.on("exit", (code: number | null) => {
      if (code === 0) resolve();
      else reject(new Error(`LibreOffice conversion failed (exit ${code})`));
    });
  });

  const outputName =
    path.basename(srcAbs, path.extname(srcAbs)) + ".pdf";
  const outputAbs = path.join(workDir, outputName);
  try {
    await fs.rename(outputAbs, cachedPdf);
  } catch (err) {
    // Clean up and propagate.
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup errors */
  }

  return cachedPdf;
}

/**
 * Proactively evict the cached PDF for an item (e.g. when admin deletes the
 * source file). Cheap no-op if no cache entries match.
 */
export async function evictOfficeCacheForItem(itemId: string): Promise<void> {
  try {
    const entries = await fs.readdir(CACHE_ROOT);
    await Promise.all(
      entries
        .filter((e) => e.startsWith(`${itemId}_`) && e.endsWith(".pdf"))
        .map((e) =>
          fs.rm(path.join(CACHE_ROOT, e), { force: true }).catch(() => undefined)
        )
    );
  } catch {
    /* cache dir may not exist yet */
  }
}
