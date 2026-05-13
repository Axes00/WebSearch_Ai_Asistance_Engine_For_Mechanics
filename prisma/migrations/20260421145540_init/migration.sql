-- CreateTable
CREATE TABLE "LibraryItem" (
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
    "isBrowsable" BOOLEAN NOT NULL DEFAULT true,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "thumbnailPath" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'local',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LibraryItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "LibraryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndexRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "itemsScanned" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsRemoved" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "errors" TEXT,
    "archiveRoot" TEXT
);

-- CreateTable
CREATE TABLE "Config" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryItem_relativePath_key" ON "LibraryItem"("relativePath");

-- CreateIndex
CREATE INDEX "LibraryItem_parentId_idx" ON "LibraryItem"("parentId");

-- CreateIndex
CREATE INDEX "LibraryItem_slug_idx" ON "LibraryItem"("slug");

-- CreateIndex
CREATE INDEX "LibraryItem_fileType_idx" ON "LibraryItem"("fileType");

-- CreateIndex
CREATE INDEX "LibraryItem_isHighlighted_idx" ON "LibraryItem"("isHighlighted");

-- CreateIndex
CREATE INDEX "LibraryItem_isHidden_idx" ON "LibraryItem"("isHidden");

-- CreateIndex
CREATE INDEX "LibraryItem_libraryCode_idx" ON "LibraryItem"("libraryCode");
