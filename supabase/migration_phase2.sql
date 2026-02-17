-- CrabSpace MVP: Schema Migration
-- Adds missing columns to existing tables for Phase 2+ features
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- =============================================
-- 1. AGENTS TABLE: Add identity columns
-- =============================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS isnad_hash TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS pda_address TEXT;

-- =============================================
-- 2. WORK_JOURNAL TABLE: Add Phase 2+ columns
-- =============================================
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS work_hash TEXT;
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS encrypted_data TEXT;
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS on_chain_sig TEXT;
ALTER TABLE work_journal ADD COLUMN IF NOT EXISTS is_will BOOLEAN DEFAULT FALSE;

-- =============================================
-- 3. Verify the migration
-- =============================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('agents', 'work_journal')
ORDER BY table_name, ordinal_position;
