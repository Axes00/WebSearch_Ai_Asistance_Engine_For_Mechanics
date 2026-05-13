-- CreateTable
CREATE TABLE "AiChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "page" INTEGER,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiChunk_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LibraryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiIndexRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "chunksCreated" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "errors" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LibraryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "parentId" TEXT,
    "itemType" TEXT NOT NULL,
    "fileType" TEXT,
    "size" BIGINT,
    "modifiedAt" DATETIME,
    "level" INTEGER NOT NULL,
    "libraryCode" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isDownloadOnly" BOOLEAN NOT NULL DEFAULT false,
    "isDownloadable" BOOLEAN NOT NULL DEFAULT false,
    "isBrowsable" BOOLEAN NOT NULL DEFAULT true,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "thumbnailPath" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'local',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LibraryItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LibraryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LibraryItem" ("createdAt", "displayOrder", "fileType", "id", "isBrowsable", "isDownloadOnly", "isHidden", "isHighlighted", "itemType", "level", "libraryCode", "modifiedAt", "name", "parentId", "relativePath", "size", "slug", "sourceType", "thumbnailPath", "updatedAt") SELECT "createdAt", "displayOrder", "fileType", "id", "isBrowsable", "isDownloadOnly", "isHidden", "isHighlighted", "itemType", "level", "libraryCode", "modifiedAt", "name", "parentId", "relativePath", "size", "slug", "sourceType", "thumbnailPath", "updatedAt" FROM "LibraryItem";
DROP TABLE "LibraryItem";
ALTER TABLE "new_LibraryItem" RENAME TO "LibraryItem";
CREATE UNIQUE INDEX "LibraryItem_relativePath_key" ON "LibraryItem"("relativePath");
CREATE INDEX "LibraryItem_parentId_idx" ON "LibraryItem"("parentId");
CREATE INDEX "LibraryItem_slug_idx" ON "LibraryItem"("slug");
CREATE INDEX "LibraryItem_fileType_idx" ON "LibraryItem"("fileType");
CREATE INDEX "LibraryItem_isHighlighted_idx" ON "LibraryItem"("isHighlighted");
CREATE INDEX "LibraryItem_isHidden_idx" ON "LibraryItem"("isHidden");
CREATE INDEX "LibraryItem_libraryCode_idx" ON "LibraryItem"("libraryCode");
CREATE INDEX "LibraryItem_isDownloadable_idx" ON "LibraryItem"("isDownloadable");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AiChunk_itemId_idx" ON "AiChunk"("itemId");

-- CreateIndex
CREATE INDEX "AiChunk_itemId_page_idx" ON "AiChunk"("itemId", "page");

-- One-time backfill: DWG files are downloadable by default; admin can change
-- per-file afterwards. This mirrors what the indexer does for NEW rows and is
-- idempotent (WHERE fileType = 'dwg').
UPDATE "LibraryItem" SET "isDownloadable" = true WHERE "fileType" = 'dwg';
