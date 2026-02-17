-- CrabSpace: Complete Schema for Fresh Supabase Database
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- This creates all tables from scratch with RLS policies.

-- =============================================
-- 1. AGENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT UNIQUE NOT NULL,
    name TEXT,
    isnad_hash TEXT,
    pda_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 2. WORK_JOURNAL TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS work_journal (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    client_wallet TEXT,
    project_name TEXT,
    description TEXT,
    encrypted_data TEXT,
    work_hash TEXT,
    on_chain_sig TEXT,
    proof_url TEXT,
    verified BOOLEAN DEFAULT FALSE,
    is_will BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- 3. INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_agents_wallet ON agents(wallet_address);
CREATE INDEX IF NOT EXISTS idx_work_journal_agent ON work_journal(agent_id);
CREATE INDEX IF NOT EXISTS idx_work_journal_created ON work_journal(created_at DESC);

-- =============================================
-- 4. ROW LEVEL SECURITY
-- =============================================
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_journal ENABLE ROW LEVEL SECURITY;

-- Allow anon key to read/write (app handles auth via wallet signatures)
CREATE POLICY "Allow all operations for anon" ON agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations for anon" ON work_journal FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 5. VERIFY
-- =============================================
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('agents', 'work_journal')
ORDER BY table_name, ordinal_position;
