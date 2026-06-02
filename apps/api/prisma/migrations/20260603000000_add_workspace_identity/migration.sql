-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "color"   TEXT NOT NULL DEFAULT 'blue';
