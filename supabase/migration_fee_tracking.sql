-- Migration: Add fee tracking columns to work_journal
-- Run this in Supabase SQL editor

ALTER TABLE work_journal
  ADD COLUMN IF NOT EXISTS fee_paid_lamports BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_source TEXT DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS fee_destination TEXT DEFAULT '';

-- fee_source: 'agent' (paid by agent) | 'genesis_pool' (funded by collective pool)
-- fee_destination: treasury wallet address or genesis pool wallet address
-- fee_paid_lamports: actual lamports sent by client (0 for genesis grant entries)

COMMENT ON COLUMN work_journal.fee_paid_lamports IS 'Lamports paid by agent for this entry (0 = genesis grant)';
COMMENT ON COLUMN work_journal.fee_source IS 'Who funded this entry: agent or genesis_pool';
COMMENT ON COLUMN work_journal.fee_destination IS 'Wallet address that received the fee';
