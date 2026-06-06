-- Migration: notification_first_invites
-- Converts WorkspaceInvite from email-based to inviteeId-based,
-- adds BoardInvite model, adds DECLINED to InviteStatus, and
-- enforces partial unique indexes for PENDING invites.

-- Step 1: Add DECLINED to the InviteStatus enum
ALTER TYPE "InviteStatus" ADD VALUE IF NOT EXISTS 'DECLINED';

-- Step 2: Drop existing WorkspaceInvite constraints and indexes that reference email
DROP INDEX IF EXISTS "WorkspaceInvite_workspaceId_email_key";
DROP INDEX IF EXISTS "WorkspaceInvite_token_idx";

-- Step 3: Add inviteeId column to WorkspaceInvite (nullable first for safe migration)
ALTER TABLE "WorkspaceInvite" ADD COLUMN IF NOT EXISTS "inviteeId" TEXT;

-- Step 4: Populate inviteeId from User.email where possible
UPDATE "WorkspaceInvite" wi
SET "inviteeId" = u.id
FROM "User" u
WHERE lower(u.email) = lower(wi.email)
  AND wi."inviteeId" IS NULL;

-- Step 5: Delete rows where we could not resolve the inviteeId
--         (email-only invites with no matching user — orphaned, unreachable)
DELETE FROM "WorkspaceInvite" WHERE "inviteeId" IS NULL;

-- Step 6: Make inviteeId NOT NULL now that orphaned rows are removed
ALTER TABLE "WorkspaceInvite" ALTER COLUMN "inviteeId" SET NOT NULL;

-- Step 7: Drop the email column
ALTER TABLE "WorkspaceInvite" DROP COLUMN IF EXISTS "email";

-- Step 8: Add indexes on the new inviteeId column
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_inviteeId_idx" ON "WorkspaceInvite"("inviteeId");
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_workspaceId_idx" ON "WorkspaceInvite"("workspaceId");

-- Step 9: Partial unique index — only one PENDING invite per (workspaceId, inviteeId)
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_invite_pending_unique"
  ON "WorkspaceInvite" ("workspaceId", "inviteeId")
  WHERE status = 'PENDING';

-- Step 10: Create BoardInvite table
CREATE TABLE IF NOT EXISTS "BoardInvite" (
  "id"          TEXT         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "boardId"     TEXT         NOT NULL,
  "inviteeId"   TEXT         NOT NULL,
  "invitedById" TEXT         NOT NULL,
  "status"      "InviteStatus" NOT NULL DEFAULT 'PENDING',
  "token"       TEXT         NOT NULL,
  "expiresAt"   TIMESTAMPTZ  NOT NULL,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "BoardInvite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BoardInvite_token_key" UNIQUE ("token"),
  CONSTRAINT "BoardInvite_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE,
  CONSTRAINT "BoardInvite_inviteeId_fkey"
    FOREIGN KEY ("inviteeId") REFERENCES "User"("id"),
  CONSTRAINT "BoardInvite_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id")
);

CREATE INDEX IF NOT EXISTS "BoardInvite_inviteeId_idx"   ON "BoardInvite"("inviteeId");
CREATE INDEX IF NOT EXISTS "BoardInvite_boardId_idx"     ON "BoardInvite"("boardId");

-- Partial unique index — only one PENDING invite per (boardId, inviteeId)
CREATE UNIQUE INDEX IF NOT EXISTS "board_invite_pending_unique"
  ON "BoardInvite" ("boardId", "inviteeId")
  WHERE status = 'PENDING';
