-- CrabSpace Migration: summary + source_author
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Adds plaintext summary and source_author columns to work_journal.

-- Summary: short (150 char max) plaintext for COG pack discovery.
-- Disambiguates generic tags. Never encrypted.
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS summary TEXT;

-- Source author: who wrote the original source material.
-- Null for source:live entries (agent is the author).
-- Populated for source:derived and source:archive entries.
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS source_author TEXT;

-- Index for source_author queries (COG pack contributor lookup)
CREATE INDEX IF NOT EXISTS idx_work_journal_source_author
  ON work_journal(source_author) WHERE source_author IS NOT NULL;
