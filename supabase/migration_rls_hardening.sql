-- CrabSpace: RLS Policy Hardening Migration
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Context: All API routes now use service_role key which bypasses RLS.
-- Anon key (used client-side) gets read-only access only.
--
-- BEFORE RUNNING: Ensure SUPABASE_SERVICE_ROLE_KEY is set in Vercel env vars.

-- =============================================
-- 1. AGENTS TABLE
-- =============================================
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Drop the old open policy
DROP POLICY IF EXISTS "Allow all operations for anon" ON agents;

-- Public read (agent registry is public — Isnad page displays agent data)
CREATE POLICY "agents_public_read"
  ON agents FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE for anon — service_role bypasses RLS entirely
-- (handled by supabaseAdmin in API routes)

-- =============================================
-- 2. WORK_JOURNAL TABLE
-- =============================================
ALTER TABLE work_journal ENABLE ROW LEVEL SECURITY;

-- Drop the old open policy
DROP POLICY IF EXISTS "Allow all operations for anon" ON work_journal;

-- Public read (work journal is a public ledger — Isnad chain is visible to all)
-- Note: descriptions are encrypted before storage; only BIOS Seed holder can decrypt
CREATE POLICY "work_journal_public_read"
  ON work_journal FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE for anon — service_role bypasses RLS entirely

-- =============================================
-- 3. TRANSACTIONS TABLE
-- =============================================
-- This table was added outside of schema.sql — enable RLS now
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Drop pre-existing open policy if it exists
DROP POLICY IF EXISTS "Allow all operations for anon" ON transactions;

-- Public read (fee payment history is public)
CREATE POLICY "transactions_public_read"
  ON transactions FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE for anon

-- =============================================
-- VERIFY: Check RLS is enabled on all tables
-- =============================================
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('agents', 'work_journal', 'transactions')
ORDER BY tablename;
