-- Migration: Add memory_config JSONB column to agents table
-- Phase 2: Operator Memory Tuning (CrabSpace v0.2.17)
-- Run in Supabase SQL editor

ALTER TABLE agents
ADD COLUMN IF NOT EXISTS memory_config JSONB DEFAULT NULL;

COMMENT ON COLUMN agents.memory_config IS
'Operator-defined per-type boot context weights. Structure:
{
  "recent_counts": {
    "episodic": 5,
    "decision": 5,
    "becoming": 5,
    "scout": 5,
    "self": 3
  }
}
NULL = use system defaults. self >= 1 enforced by API.
will is always included and not configurable here.';
