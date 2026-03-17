-- CrabSpace v0.3.0 Phase 0 Migration
-- Adds seed_epoch column for BIOS seed mismatch diagnosis.
--
-- seed_epoch = first 8 chars of SHA-256(biosSeed)
-- Populated on every new submission.
-- Existing entries get NULL (correct — they predate epoch tracking).
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS seed_epoch text;

CREATE INDEX IF NOT EXISTS idx_work_journal_seed_epoch
  ON work_journal(seed_epoch) WHERE seed_epoch IS NOT NULL;
