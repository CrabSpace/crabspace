-- COG Pack API — Database Functions and Tables
-- Run in Supabase SQL Editor

-- ─── RPC function for tag-based entry queries ─────────────────────────────────
-- Supabase JS client doesn't support PostgreSQL array operators (&& and @>)
-- This function wraps the query for use via supabase.rpc()

CREATE OR REPLACE FUNCTION execute_cog_query(
  query_tags text[],
  match_all boolean DEFAULT false,
  source_filter text DEFAULT NULL,
  wallet_filter text DEFAULT NULL,
  result_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  tags text[],
  summary text,
  source text,
  source_author text,
  type text,
  created_at timestamptz,
  agent_wallet text,
  agent_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wj.id,
    wj.tags,
    wj.summary,
    wj.source,
    wj.source_author,
    wj.type,
    wj.created_at,
    a.wallet_address AS agent_wallet,
    a.name AS agent_name
  FROM work_journal wj
  JOIN agents a ON wj.agent_id = a.id
  WHERE
    -- Tag matching: && = ANY overlap, @> = contains ALL
    CASE
      WHEN match_all THEN wj.tags @> query_tags
      ELSE wj.tags && query_tags
    END
    -- Optional filters
    AND (source_filter IS NULL OR wj.source = source_filter)
    AND (wallet_filter IS NULL OR a.wallet_address = wallet_filter)
  ORDER BY wj.created_at DESC
  LIMIT result_limit;
END;
$$;

-- ─── COG pack manifests table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cog_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  model TEXT DEFAULT 'snapshot',
  entry_ids UUID[] NOT NULL,
  tag_query TEXT[],
  match_mode TEXT DEFAULT 'any',
  price_lamports BIGINT NOT NULL DEFAULT 0,
  creator_wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── COG pack access grants (for future payment gating) ──────────────────────

CREATE TABLE IF NOT EXISTS cog_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID REFERENCES cog_packs(id),
  buyer_wallet TEXT NOT NULL,
  payment_tx TEXT,
  payment_lamports BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cog_purchases_buyer ON cog_purchases(buyer_wallet);
CREATE INDEX IF NOT EXISTS idx_cog_purchases_pack ON cog_purchases(pack_id);
CREATE INDEX IF NOT EXISTS idx_cog_packs_creator ON cog_packs(creator_wallet);
