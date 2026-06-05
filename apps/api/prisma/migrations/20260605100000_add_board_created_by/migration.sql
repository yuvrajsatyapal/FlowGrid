ALTER TABLE "Board" ADD COLUMN "createdById" TEXT;
CREATE INDEX "Board_createdById_idx" ON "Board"("createdById");
ALTER TABLE "Board" ADD CONSTRAINT "Board_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
