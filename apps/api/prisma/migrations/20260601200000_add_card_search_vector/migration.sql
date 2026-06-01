-- Migration: add full-text search vector to Card
-- Uses a PostgreSQL GENERATED ALWAYS AS STORED column (Postgres 12+).
-- Title only for MVP — TipTap JSON in description would pollute tsvector tokens.
-- setweight(A) on title so title matches rank higher than description (Phase 2+).

ALTER TABLE "Card"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A')
    ) STORED;

CREATE INDEX IF NOT EXISTS "idx_cards_search_vector"
  ON "Card" USING GIN ("searchVector");
