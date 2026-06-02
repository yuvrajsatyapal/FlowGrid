-- Add source column with temporary default to backfill existing rows
ALTER TABLE "Notification" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SYSTEM';

-- Add index for future source-filtered queries
CREATE INDEX "Notification_userId_source_idx" ON "Notification"("userId", "source");

-- Drop the default — new inserts must provide source explicitly
ALTER TABLE "Notification" ALTER COLUMN "source" DROP DEFAULT;
