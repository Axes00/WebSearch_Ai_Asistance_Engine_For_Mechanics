-- Admin-safe virtual moves and soft hides.
-- Source files stay in ARCHIVE_ROOT; these fields only affect website/admin UI.

ALTER TABLE "LibraryItem" ADD COLUMN "adminParentId" TEXT;
ALTER TABLE "LibraryItem" ADD COLUMN "hasAdminParentOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LibraryItem" ADD COLUMN "isAdminHidden" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "LibraryItem_adminParentId_idx" ON "LibraryItem"("adminParentId");
CREATE INDEX "LibraryItem_hasAdminParentOverride_idx" ON "LibraryItem"("hasAdminParentOverride");
CREATE INDEX "LibraryItem_isAdminHidden_idx" ON "LibraryItem"("isAdminHidden");
