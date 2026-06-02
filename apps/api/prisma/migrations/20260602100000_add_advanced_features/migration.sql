-- Migration: add Checklist, ChecklistItem, CardDependency, CardWatcher, CardTemplate

CREATE TABLE "Checklist" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "cardId"    TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "position"  TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "Checklist_cardId_idx" ON "Checklist"("cardId");

CREATE TABLE "ChecklistItem" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "checklistId" TEXT NOT NULL,
  "text"        TEXT NOT NULL,
  "checked"     BOOLEAN NOT NULL DEFAULT FALSE,
  "position"    TEXT NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");

CREATE TABLE "CardDependency" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "CardDependency_blockerId_blockedId_key" ON "CardDependency"("blockerId","blockedId");
CREATE INDEX "CardDependency_blockerId_idx" ON "CardDependency"("blockerId");
CREATE INDEX "CardDependency_blockedId_idx" ON "CardDependency"("blockedId");

CREATE TABLE "CardWatcher" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "cardId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX "CardWatcher_cardId_userId_key" ON "CardWatcher"("cardId","userId");
CREATE INDEX "CardWatcher_cardId_idx" ON "CardWatcher"("cardId");
CREATE INDEX "CardWatcher_userId_idx"  ON "CardWatcher"("userId");

CREATE TABLE "CardTemplate" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "workspaceId"    TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "priority"       TEXT NOT NULL DEFAULT 'NONE',
  "checklistsData" JSONB,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "CardTemplate_workspaceId_idx" ON "CardTemplate"("workspaceId");
