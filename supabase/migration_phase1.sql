-- CrabSpace Phase 1 Migration: Arweave Integration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Adds arweave_tx_id, type, and source columns to work_journal.
-- seed_epoch already exists from Phase 0 migration.

-- Add Arweave transaction ID column
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS arweave_tx_id text;

-- Add denormalized entry type (previously derived from project_name)
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS type text;

-- Add source provenance (live = real-time, archive = retroactive, derived = from external sources)
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS source text DEFAULT 'live';

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_work_journal_arweave
  ON work_journal(arweave_tx_id) WHERE arweave_tx_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_journal_type
  ON work_journal(type) WHERE type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_journal_source
  ON work_journal(source);
