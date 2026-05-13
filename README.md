# Technical Digital Library & Technical Legislation AI Tool

Bilingual (Ελληνικά / English) web platform that presents a large local
technical archive as an elegant, file-explorer–style library with a
streaming PDF/DOCX/DOC viewer, selective downloads, an admin file
manager, and local AI semantic search with in-document highlighting.

- **V1 archive:** ~4 400 items, ~6.5 GB (PDF · DWG · DOC · DOCX · XLSX)
- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Framer
  Motion · Prisma · SQLite · next-intl · mammoth · LibreOffice (optional)
  · sqlite-vec · `@xenova/transformers` (`multilingual-e5-small`)

---

## 1. Prerequisites

- **Node.js ≥ 20** (tested with 20.x / 22.x)
- **Windows 10/11** (the V1 setup uses an NTFS junction). macOS/Linux
  work just as well — use a regular symlink or mount point instead.
- A copy of the technical archive (the folder that contains the 21
  numbered groups `1.1` … `1.21`).
- **LibreOffice** (optional, only required to preview legacy `.doc`
  files in-browser). On Windows the app auto-detects the default
  install under `C:\Program Files\LibreOffice\program\soffice.exe`;
  override with `LIBREOFFICE_PATH` if you installed elsewhere. Without
  LibreOffice, `.doc` files fall back to a download-only card.

---

## 2. Archive location strategy

The application never stores the archive inside the repo. Instead it
reads a single environment variable, `ARCHIVE_ROOT`, pointing to a
stable on-disk path. V1 uses an NTFS junction so the drive letter /
physical location can change without touching the app.

### Windows (junction)

Create the junction once:

```powershell
cmd /c mklink /J "D:\TechnicalLibrary" "E:\1.1Θ  ΤΕΧΝΙΚΟΣ  Η-Μ   ΟΔΗΓΟΣ ................................. Κ400 - 2022"
```

Verify it:

```powershell
Get-ChildItem -LiteralPath "D:\TechnicalLibrary" -Force | Select-Object -First 5 Name
```

### OneDrive (drop-in alternative)

When the archive later moves to a OneDrive-synced folder, just point
the junction (or `ARCHIVE_ROOT`) to that folder — **no code change is
required.**

```powershell
cmd /c rmdir "D:\TechnicalLibrary"
cmd /c mklink /J "D:\TechnicalLibrary" "C:\Users\<you>\OneDrive\TechnicalLibrary"
```

Then set `ARCHIVE_SOURCE_TYPE=onedrive_synced` in `.env.local`.

### External SSD

Mount it at a stable path (e.g. `D:\TechnicalLibrary` via the same
junction trick, or `/mnt/library` on Unix) and set
`ARCHIVE_SOURCE_TYPE=external_drive`.

### macOS / Linux

```bash
ln -s "/Volumes/USB/1.1Θ …/" /Users/you/TechnicalLibrary
# or
sudo mount --bind /mnt/archive /srv/TechnicalLibrary
```

Set `ARCHIVE_ROOT` accordingly.

---

## 3. Environment

Copy the sample file and adjust as needed:

```powershell
cp .env.example .env.local
```

| Variable              | Example                  | What it does                                                       |
|-----------------------|--------------------------|--------------------------------------------------------------------|
| `ARCHIVE_ROOT`        | `D:\TechnicalLibrary`   | Absolute path to the archive root (junction / symlink / folder).   |
| `ARCHIVE_SOURCE_TYPE` | `external_drive`         | `local` \| `onedrive_synced` \| `external_drive`. Stored per item. |
| `DATABASE_URL`        | `file:./dev.db`          | Prisma DB URL. SQLite for V1; change to `postgresql://…` later.    |
| `DEFAULT_LOCALE`      | `el`                     | Initial UI locale (`el` or `en`).                                  |
| `LIBREOFFICE_PATH`    | (optional full path to `soffice.exe`) | Forces LibreOffice detection for `.doc` → PDF preview. |
| `SKIP_NATIVE_CHECK`   | `1`                      | Skips automatic `better-sqlite3` load/rebuild hooks (not recommended). |

A tiny `.env` (with only `DATABASE_URL`) is kept alongside `.env.local`
because the Prisma CLI reads `.env` exclusively; both are gitignored.

---

## 4. Install, migrate, index, run

```powershell
npm install
npx prisma migrate dev --name init     # only the first time
npm run index                           # scan ARCHIVE_ROOT, fill the DB
npm run index:ai                        # optional: build the AI index
npm run dev                             # http://localhost:3000
```

The first indexer run against the sample archive takes ~5–6 minutes
(4 426 entries · 6.5 GB). Subsequent runs are much faster thanks to
the upsert-by-relativePath logic and mtime diff check. The AI indexer
is incremental by default — pass `--force` to re-embed everything.

### Production

```powershell
npm run build
npm run start
```

### Troubleshooting (`better-sqlite3` ABI)

If `/api/ai/search` logs **NODE_MODULE_VERSION** errors, native code was compiled for a **different Node** than the one running `next dev`:

1. Use **one stable Node version** everywhere (recommended: Node **20.x** or **22.x LTS**) — fnm/nvm-windows: same `node -v` for `npm install` and `npm run dev`.
2. Run **`npm run rebuild:native`** (or delete `node_modules` and **`npm install`** again).
3. Before **`npm run dev`**, **`npm run build`**, and **`npm run start`**, `scripts/ensure-better-sqlite3.cjs` loads `better-sqlite3` once and **`npm rebuild better-sqlite3`** if loading fails — set **`SKIP_NATIVE_CHECK=1`** only if you deliberately want to bypass that probe.

### Troubleshooting (`.doc` preview + scoped AI)

- **Legacy Word (`.doc`)** needs **LibreOffice** so the server can convert to PDF. Install LibreOffice Writer, restart `npm run dev`, or set **`LIBREOFFICE_PATH`** (see `.env.example`).
- The **sidebar AI** («Μόνο σε αυτό το έγγραφο») only finds text that was indexed for that file (`npm run index:ai`). If LibreOffice fails, embeddings can still fail for that document until conversion works.

---

## 5. Indexer

- **Source:** `src/lib/indexer.ts` (reusable) + `scripts/index-archive.ts` (CLI)
- **Trigger:** `npm run index`, or the "Run indexer now" button at
  `/el/admin` which calls `POST /api/admin/reindex`.
- **What it does:**
  - Walks `ARCHIVE_ROOT` recursively (async `fs.opendir`, 64-bit `stat`).
  - Derives `slug`, `fileType`, `level`, `libraryCode` (`1.1`…`1.21`).
  - Filters Windows/AutoCAD noise (`desktop.ini`, `Thumbs.db`, `.dwl`,
    `.dwl2`, `.SV$`, `.SHX`) and the `1.1Θ … .rar` root backup to
    `isHidden=true` so they disappear from the UI while remaining in
    the DB for forensics.
  - Upserts into `LibraryItem`; removes rows whose paths disappeared.
  - Writes progress to an `IndexRun` row (scanned / created / updated /
    removed / status) — the admin UI polls it.
  - Seeds `isHighlighted=true` on all level-1 PDFs the very first time
    it runs, so the homepage has content out of the box.

Rerun as often as you like; it is idempotent.

---

## 6. Routes

| Path                                  | Kind    | Notes                                              |
|---------------------------------------|---------|----------------------------------------------------|
| `/` → `/el`                           | Middleware redirect                                          |
| `/[locale]`                           | Home    | Hero + highlighted documents + CTA                 |
| `/[locale]/library`                   | Explorer | Top-level groups (`1.1` … `1.21`) + AI sidebar    |
| `/[locale]/library/[...slug]`         | Explorer | Any depth, Greek-safe URLs, local + AI search     |
| `/[locale]/viewer/[id]`               | Viewer  | PDF / image / DOCX / DOC inline + prev/next + AI   |
| `/[locale]/admin`                     | Admin   | Tabs: Explorer / Highlights / Reindex / AI        |
| `/api/library`                        | JSON    | `?parentId=<id|null>` — children of a folder       |
| `/api/library/[id]`                   | JSON    | Item + breadcrumbs                                 |
| `/api/highlights`                     | JSON    | Homepage highlighted items                         |
| `/api/search`                         | JSON    | `?q=&parentId=` — NFD-folded, Greek-aware         |
| `/api/ai/search`                      | JSON    | POST `{q, itemId?}` — semantic search, optional scope |
| `/api/files/stream/[id]`              | Stream  | Inline, `Range`-aware (PDFs, images, DOCX bytes)   |
| `/api/files/office/[id]`              | Stream  | LibreOffice-converted PDF for `.doc` files         |
| `/api/files/download/[id]`            | Stream  | `Content-Disposition: attachment`; gated by `isDownloadable` |
| `/api/admin/reindex`                  | JSON    | GET latest run · POST starts a new run             |
| `/api/admin/reindex-ai`               | JSON    | GET latest AI run · POST triggers ingestion        |
| `/api/admin/highlights`               | JSON    | GET candidates · POST toggles one item             |
| `/api/admin/browse`                   | JSON    | List a folder (admin view: includes hidden rows)   |
| `/api/admin/upload`                   | JSON    | Multipart upload into a target folder              |
| `/api/admin/mkdir`                    | JSON    | Create a new folder inside a target                |
| `/api/admin/move`                     | JSON    | Move items (files or folders) between folders      |
| `/api/admin/delete`                   | JSON    | Delete items from disk + DB (requires `confirm`)   |
| `/api/admin/downloadable`             | JSON    | Bulk toggle the `isDownloadable` flag              |

---

## 7. Security note (V1 has no auth)

Per the product decision documented in the plan, **V1 ships without
authentication**. `/admin` and every `/api/admin/*` route are therefore
reachable by anyone who can reach the server.

Mitigations you should apply before going beyond localhost:

1. Bind the server to `127.0.0.1` (firewall).
2. Put it behind a reverse proxy (Nginx/Caddy) with HTTP basic auth
   on `/admin` and `/api/admin/*`.
3. Swap to NextAuth (credentials/OAuth) by adding a `middleware.ts`
   matcher on `/admin/**` + `/api/admin/**`. Hook points for this are
   marked with `TODO (auth)` comments in:
   - `src/app/api/admin/reindex/route.ts`
   - `src/app/api/admin/highlights/route.ts`
   - `src/app/[locale]/admin/page.tsx`

The path-resolution layer is already hardened: `src/lib/paths.ts`
rejects traversal attempts and never echoes absolute paths to the UI.

---

## 8. SQLite → PostgreSQL migration

The schema is deliberately ANSI-SQL friendly (cuid ids, no SQLite-only
types). Switching databases is a two-step change:

1. **Edit** `prisma/schema.prisma`:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. **Configure** `DATABASE_URL`:

   ```text
   DATABASE_URL="postgresql://user:pass@host:5432/library"
   ```

3. **Regenerate migrations** on a fresh Postgres DB:

   ```powershell
   npx prisma migrate dev --name init_postgres
   ```

4. **Re-run the indexer** against the same `ARCHIVE_ROOT`:

   ```powershell
   npm run index
   ```

   The indexer is idempotent, so a brand-new Postgres DB is populated in
   a single pass. No extra import script is needed.

If you prefer to copy data from the existing SQLite file instead of
re-indexing, a one-off `tsx scripts/sqlite-to-postgres.ts` can use
Prisma's `findMany` / `createMany` pair — left as a TODO in V1.

---

## 9. Project structure

```text
src/
  app/
    [locale]/
      layout.tsx                 # i18n provider + site header
      page.tsx                   # Home: Hero + HighlightedDocumentsRow
      library/page.tsx           # Top-level explorer
      library/[...slug]/page.tsx # Nested explorer (any depth)
      viewer/[id]/page.tsx       # PDF / image / DOC / DWG viewer page
      admin/page.tsx             # Reindex + highlights (no auth V1)
    api/
      library/route.ts
      library/[id]/route.ts
      highlights/route.ts
      search/route.ts
      files/stream/[id]/route.ts
      files/download/[id]/route.ts
      admin/reindex/route.ts
      admin/highlights/route.ts
    layout.tsx                   # Root HTML shell
    globals.css
  components/
    Hero.tsx
    SiteHeader.tsx
    LanguageSwitcher.tsx
    HighlightedDocumentsRow.tsx
    ExplorerGrid.tsx
    FolderCard.tsx
    FileCard.tsx
    FileIcon.tsx
    Breadcrumbs.tsx
    SearchBar.tsx
    EmptyState.tsx
    PdfViewer.tsx
    FileActions.tsx
    SidebarAi.tsx              # active AI search (scoped / global)
    DocxViewer.tsx             # client-side mammoth preview + highlights
    ViewerNav.tsx              # prev/next sibling navigation in viewer
    viewer/ViewerShell.tsx     # client shell wiring AI state → viewers
    admin/
      AdminTabs.tsx
      AdminExplorer.tsx
      AdminReindexPanel.tsx
      AdminHighlightsPanel.tsx
      AdminAiPanel.tsx
  lib/
    db.ts          # Prisma singleton
    i18n.ts        # next-intl config
    routing.ts     # typed Link / useRouter / usePathname
    paths.ts       # resolveItemPath + traversal guard
    adminPaths.ts  # upload/move/delete filename + traversal guards
    slug.ts        # Greek-aware slug generator
    fileTypes.ts   # ext → type + noise detection
    format.ts      # humanFileSize, prettyDisplayName
    library.ts     # DTO serializer, listChildren, breadcrumbs, slug path resolver
    stream.ts      # Range-aware file response
    office.ts      # LibreOffice doc→pdf cache with mtime/size invalidation
    indexer.ts     # scan + upsert + seeding
    ai/
      chunk.ts       # 500-char sliding window, surrogate-safe
      extract.ts     # pdfjs / mammoth / LO-pdf text extraction
      embedder.ts    # Xenova/multilingual-e5-small singleton
      vectorStore.ts # sqlite-vec virtual-table wrapper
      ingest.ts      # AiIndexRun-tracked ingestion pipeline
      search.ts      # query embedding + KNN + highlight-term builder
  middleware.ts    # next-intl locale middleware
  types/library.ts
messages/
  el.json
  en.json
prisma/
  schema.prisma
  migrations/
scripts/
  index-archive.ts # CLI entry point (filesystem → DB)
  index-ai.ts      # CLI entry point (DB → embeddings)
public/
  hero.jpg         # copied once from the USB (iStock-121045480.jpg)
```

---

## 10. Download policy (V2)

V2 flips the default so documents are **read-only in the browser**
unless an admin explicitly marks them downloadable:

- **DWG** files are downloadable by default — they are CAD source and
  users need them offline. The migration backfills `isDownloadable=true`
  for every existing `.dwg`.
- **PDF, DOCX, DOC, images** default to `isDownloadable=false`. They
  stream inline but the download button (and `/api/files/download/[id]`)
  are both gated.
- Admins can flip individual files (or bulk-select) from the
  **Admin → Explorer** tab. The indexer never overwrites an admin's
  choice — the preserved-override logic lives in
  `src/lib/indexer.ts#upsertEntry`.
- The PDF `<object>` is served with `#toolbar=0&navpanes=0` as
  defence-in-depth so the Chromium built-in save/print buttons are
  hidden even if the flag is wrong.

---

## 11. Admin (V2)

`/el/admin` is a tabbed panel:

- **Explorer** — a full file manager: navigate, upload (drag & drop or
  file picker), create folder, move, delete, and bulk-toggle the
  `isDownloadable` flag. Uploads are capped per-file at 200 MB; server
  routes reject path traversal, reserved Windows names, and dot/space
  edge cases via `src/lib/adminPaths.ts`.
- **Highlights** — pick which level-1 PDFs appear on the homepage.
- **Reindex** — kick off a full filesystem rescan and watch the
  `IndexRun` stats live.
- **AI** — trigger `runAiIngest()` and watch `AiIndexRun` progress
  (items processed, chunks created, errors).

All admin endpoints are still unauthenticated in V1/V2 — see §7 for the
mitigations you must apply before exposing the server beyond localhost.

---

## 12. AI semantic search (V2)

### Free-model rationale

- **Model:** `Xenova/multilingual-e5-small` — 384-dim, multilingual
  (Greek + English + Latin), retrieval-tuned, ~120 MB quantized.
  It downloads on first run and caches under `node_modules/.cache/…`.
- **Vector store:** `sqlite-vec`'s `vec0` virtual table, co-located
  with the existing Prisma SQLite DB (`prisma/dev.db`). No new service
  to run, and it ports trivially to Postgres + `pgvector` later — same
  384 dims, same similarity metric.
- **Text extraction:** `pdfjs-dist` (per-page, so we can cite PDF page
  numbers), `mammoth` for `.docx`, and the existing LibreOffice cache
  for `.doc` (converted → PDF → pdfjs).
- **Chunking:** ~500 characters with 80-char overlap. Per-page for
  PDFs; single block for DOCX (no fixed pagination).

Why this combination: **zero cloud calls, zero API keys, zero per-token
cost**, runs on a laptop CPU, and is multilingual enough to handle the
mixed-language corpus.

### UI flow

- The viewer sidebar (`SidebarAi`) defaults to "scoped to this
  document" — hits are ranked by semantic similarity inside the open
  file, and clicking a hit highlights the match in-place (DOCX via a
  `<mark>` tree walker, PDF/DOC by jumping to the citation's page via
  the `#page=N` URL fragment).
- On the explorer, the same sidebar runs global search across the
  archive; hits open the matching document's viewer with `?ai=<query>`
  pre-applied so the destination page re-runs the scoped search and
  highlights the relevant passage.
- Shareable URLs — the current query is mirrored into `?ai=<query>`,
  so pasting a link into Slack lands the other engineer on the same
  highlight.

### Reindexing

```powershell
npm run index:ai           # incremental (default)
npm run index:ai -- --force # re-embed every eligible file
```

or click the button under **Admin → AI**. The indexer is idempotent;
if an item's modification time moves past the last successful run, it
is re-embedded automatically.

---

## 13. What's next (beyond V2)

- **DWG preview**: integrate ODA File Converter for offline thumbnail
  generation; schema already has `thumbnailPath`.
- **Auth**: middleware-based admin gate (see §7).
- **Postgres + pgvector**: swap SQLite + sqlite-vec for Postgres with
  `pgvector`. Chunk schema stays identical.
- **Better PDF highlights**: replace `<object>` with `react-pdf` so
  matches can be overlaid as an annotation layer instead of only
  navigating to the right page.

---
