-- Migration: Remove PUBLIC from BoardVisibility enum
-- Step 1: Convert all existing PUBLIC boards to WORKSPACE (no board becomes inaccessible)
UPDATE "Board" SET visibility = 'WORKSPACE' WHERE visibility = 'PUBLIC';

-- Step 2: Recreate the enum without PUBLIC
-- PostgreSQL does not support ALTER TYPE ... DROP VALUE directly, so we:
--   a) change the column to text
--   b) drop and recreate the enum
--   c) restore the column type
ALTER TABLE "Board" ALTER COLUMN visibility TYPE TEXT;
DROP TYPE "BoardVisibility";
CREATE TYPE "BoardVisibility" AS ENUM ('WORKSPACE', 'PRIVATE');
ALTER TABLE "Board"
  ALTER COLUMN visibility TYPE "BoardVisibility" USING visibility::"BoardVisibility",
  ALTER COLUMN visibility SET DEFAULT 'WORKSPACE';
