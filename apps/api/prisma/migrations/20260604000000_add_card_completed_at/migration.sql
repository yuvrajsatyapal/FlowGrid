-- Migration: add completedAt column to Card for task completion state (dependency enforcement)
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ;
