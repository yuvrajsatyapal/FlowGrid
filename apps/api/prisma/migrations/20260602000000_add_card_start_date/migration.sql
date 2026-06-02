-- Migration: add startDate column to Card for calendar and timeline views
ALTER TABLE "Card" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMPTZ;
