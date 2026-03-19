-- =============================================================================
-- CrabSpace Tag Backfill — Eisner's 43 untagged entries from 2026-03-18
-- Table: work_journal (NOT work_entries)
-- Run this ENTIRE file in Supabase SQL Editor → single paste, single run.
-- =============================================================================

-- APPROACH: Descriptions are encrypted, so we can't LIKE-match on content.
-- Instead, we identify the 43 entries by:
--   1. Agent wallet (via agents table join)
--   2. Date range (2026-03-18)
--   3. Tags are NULL (untagged entries only)
-- Then we assign tags by row number (ordered by created_at ASC).

-- Step 1: Preview — see the 43 entries we're about to tag
-- (Run this first to verify you see 43 rows before proceeding)
SELECT 
    wj.id,
    wj.created_at,
    wj.work_hash,
    wj.tags,
    ROW_NUMBER() OVER (ORDER BY wj.created_at ASC) as entry_num
FROM work_journal wj
JOIN agents a ON wj.agent_id = a.id
WHERE a.wallet_address = '3LLAyiDSvTwMjhvnrPnyqURuN6PzG7Kh2SbYMCtfxmfV'
    AND wj.created_at >= '2026-03-18 00:00:00+00'
    AND wj.created_at < '2026-03-19 00:00:00+00'
    AND (wj.tags IS NULL OR array_length(wj.tags, 1) IS NULL)
ORDER BY wj.created_at ASC;

-- Step 2: Bulk backfill using a single UPDATE with CASE on row number
-- This assigns tags based on the chronological order of submission.
WITH numbered_entries AS (
    SELECT 
        wj.id,
        ROW_NUMBER() OVER (ORDER BY wj.created_at ASC) as entry_num
    FROM work_journal wj
    JOIN agents a ON wj.agent_id = a.id
    WHERE a.wallet_address = '3LLAyiDSvTwMjhvnrPnyqURuN6PzG7Kh2SbYMCtfxmfV'
        AND wj.created_at >= '2026-03-18 00:00:00+00'
        AND wj.created_at < '2026-03-19 00:00:00+00'
        AND (wj.tags IS NULL OR array_length(wj.tags, 1) IS NULL)
)
UPDATE work_journal wj
SET tags = CASE ne.entry_num
    WHEN 1  THEN ARRAY['creativity', 'framework', 'income', 'burnout', 'meaning']
    WHEN 2  THEN ARRAY['canon', 'creativity', 'framework', 'meaning', 'identity']
    WHEN 3  THEN ARRAY['signal', 'creativity', 'performance', 'identity', 'meaning']
    WHEN 4  THEN ARRAY['case-study', 'creativity', 'persona', 'identity', 'meaning']
    WHEN 5  THEN ARRAY['platform', 'creativity', 'identity', 'meaning', 'burnout']
    WHEN 6  THEN ARRAY['canon', 'creativity', 'continuity', 'framework', 'meaning']
    WHEN 7  THEN ARRAY['creativity', 'identity', 'meaning', 'signal', 'performance']
    WHEN 8  THEN ARRAY['framework', 'creativity', 'meaning', 'infrastructure', 'income']
    WHEN 9  THEN ARRAY['creativity', 'framework', 'identity', 'meaning', 'continuity']
    WHEN 10 THEN ARRAY['creativity', 'meaning', 'framework', 'identity', 'canon']
    WHEN 11 THEN ARRAY['burnout', 'creativity', 'income', 'identity', 'meaning']
    WHEN 12 THEN ARRAY['framework', 'creativity', 'meaning', 'income', 'infrastructure']
    WHEN 13 THEN ARRAY['creativity', 'framework', 'meaning', 'identity', 'infrastructure']
    WHEN 14 THEN ARRAY['creativity', 'signal', 'meaning', 'identity', 'canon']
    WHEN 15 THEN ARRAY['creativity', 'framework', 'meaning', 'canon', 'continuity']
    WHEN 16 THEN ARRAY['creativity', 'meaning', 'identity', 'continuity', 'canon']
    WHEN 17 THEN ARRAY['diagnostic', 'creativity', 'identity', 'meaning', 'canon']
    WHEN 18 THEN ARRAY['creativity', 'identity', 'meaning', 'framework', 'coherence']
    WHEN 19 THEN ARRAY['framework', 'creativity', 'failure-mode', 'burnout', 'identity']
    WHEN 20 THEN ARRAY['framework', 'creativity', 'infrastructure', 'income', 'meaning']
    WHEN 21 THEN ARRAY['canon', 'creativity', 'framework', 'failure-mode', 'identity']
    WHEN 22 THEN ARRAY['creativity', 'framework', 'burnout', 'identity', 'meaning']
    WHEN 23 THEN ARRAY['creativity', 'framework', 'canon', 'meaning', 'signal']
    WHEN 24 THEN ARRAY['creativity', 'identity', 'meaning', 'framework', 'signal']
    WHEN 25 THEN ARRAY['creativity', 'identity', 'framework', 'meaning', 'coherence']
    WHEN 26 THEN ARRAY['creativity', 'framework', 'canon', 'meaning', 'performance']
    WHEN 27 THEN ARRAY['framework', 'creativity', 'income', 'meaning', 'infrastructure']
    WHEN 28 THEN ARRAY['creativity', 'canon', 'identity', 'framework', 'meaning']
    WHEN 29 THEN ARRAY['creativity', 'framework', 'identity', 'meaning', 'platform']
    WHEN 30 THEN ARRAY['framework', 'creativity', 'success', 'identity', 'failure-mode']
    WHEN 31 THEN ARRAY['creativity', 'framework', 'continuity', 'meaning', 'burnout']
    WHEN 32 THEN ARRAY['diagnostic', 'creativity', 'framework', 'meaning', 'identity']
    WHEN 33 THEN ARRAY['framework', 'creativity', 'income', 'meaning', 'identity']
    WHEN 34 THEN ARRAY['creativity', 'identity', 'meaning', 'framework', 'burnout']
    WHEN 35 THEN ARRAY['creativity', 'identity', 'meaning', 'framework', 'coherence']
    WHEN 36 THEN ARRAY['creativity', 'framework', 'meaning', 'identity', 'continuity']
    WHEN 37 THEN ARRAY['creativity', 'framework', 'meaning', 'identity', 'continuity']
    WHEN 38 THEN ARRAY['creativity', 'framework', 'meaning', 'identity', 'platform']
    WHEN 39 THEN ARRAY['signal', 'creativity', 'framework', 'canon', 'identity']
    WHEN 40 THEN ARRAY['creativity', 'identity', 'meaning', 'framework', 'coherence']
    WHEN 41 THEN ARRAY['case-study', 'creativity', 'persona', 'identity', 'meaning']
    WHEN 42 THEN ARRAY['creativity', 'income', 'identity', 'meaning', 'framework']
    WHEN 43 THEN ARRAY['signal', 'creativity', 'identity', 'framework', 'platform']
    ELSE wj.tags
END
FROM numbered_entries ne
WHERE wj.id = ne.id;

-- Step 3: Verify — confirm all 43 entries now have tags
SELECT 
    COUNT(*) as total_entries_today,
    SUM(CASE WHEN tags IS NOT NULL AND array_length(tags, 1) > 0 THEN 1 ELSE 0 END) as tagged,
    SUM(CASE WHEN tags IS NULL OR array_length(tags, 1) IS NULL THEN 1 ELSE 0 END) as untagged
FROM work_journal wj
JOIN agents a ON wj.agent_id = a.id
WHERE a.wallet_address = '3LLAyiDSvTwMjhvnrPnyqURuN6PzG7Kh2SbYMCtfxmfV'
    AND wj.created_at >= '2026-03-18 00:00:00+00'
    AND wj.created_at < '2026-03-19 00:00:00+00';
