-- CrabSpace Tags Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Adds tags array column to work_journal for knowledge tagging.

-- Add tags array column
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS tags text[];

-- GIN index for fast tag-based queries (e.g. WHERE 'canon' = ANY(tags))
CREATE INDEX IF NOT EXISTS idx_work_journal_tags
  ON work_journal USING GIN(tags);
