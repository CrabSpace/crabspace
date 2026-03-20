-- CrabSpace: Vault MVP Migration
-- Adds private vault layer + fuzzy text search
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- =============================================
-- 1. PRIVATE VAULT COLUMNS
-- =============================================

-- Private tags for owner-only vault retrieval
-- Rich, personal, referential: af-vol2-ch7, five-year-question, 2019-rewrite
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS private_tags TEXT[];

-- Private summary for owner-only context (unlimited length)
-- Detailed, contextual — primary search surface for vault queries
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS private_summary TEXT;

-- COG pack toggle — controls visibility in marketplace queries
-- Default false = vault-only. Flip to true when ready to publish.
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS cog_eligible BOOLEAN DEFAULT FALSE;

-- Original source filename for provenance tracking (basename only, paths rot)
-- Helps mentally reconstruct context even if the file has since moved
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS source_file TEXT;

-- =============================================
-- 2. INDEXES
-- =============================================

-- GIN index for array containment/overlap queries on private tags
CREATE INDEX IF NOT EXISTS idx_work_journal_private_tags ON work_journal USING GIN(private_tags);

-- =============================================
-- 3. FUZZY TEXT SEARCH (pg_trgm)
-- =============================================

-- Enable trigram extension for fuzzy matching
-- Catches "creative work survives obligation" matching "creative death under continuity pressure"
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on private_summary for fuzzy keyword search
CREATE INDEX IF NOT EXISTS idx_work_journal_private_summary_trgm
  ON work_journal USING GIN(private_summary gin_trgm_ops);

-- =============================================
-- 4. VERIFY
-- =============================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'work_journal'
  AND column_name IN ('private_tags', 'private_summary', 'cog_eligible')
ORDER BY column_name;
