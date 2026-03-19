-- =============================================================================
-- CrabSpace Tag Backfill v2 — Eisner's 58 untagged entries from 2026-03-18
-- Table: work_journal (NOT work_entries)
-- Run this ENTIRE file in Supabase SQL Editor → single paste, single run.
-- =============================================================================

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
    WHEN 1  THEN ARRAY['creativity', 'canon', 'framework', 'meaning', 'identity']
    WHEN 2  THEN ARRAY['canon', 'framework', 'creativity', 'meaning', 'continuity']
    WHEN 3  THEN ARRAY['signal', 'creativity', 'identity', 'framework', 'canon']
    WHEN 4  THEN ARRAY['case-study', 'creativity', 'persona', 'canon', 'identity']
    WHEN 5  THEN ARRAY['case-study', 'creativity', 'persona', 'canon', 'identity']
    WHEN 6  THEN ARRAY['framework', 'creativity', 'income', 'meaning', 'identity']
    WHEN 7  THEN ARRAY['framework', 'creativity', 'meaning', 'income', 'identity']
    WHEN 8  THEN ARRAY['framework', 'platform', 'creativity', 'economics', 'meaning']
    WHEN 9  THEN ARRAY['signal', 'creativity', 'identity', 'framework', 'canon']
    WHEN 10 THEN ARRAY['diagnostic', 'creativity', 'identity', 'meaning', 'framework']
    WHEN 11 THEN ARRAY['framework', 'creativity', 'failure-mode', 'identity', 'meaning']
    WHEN 12 THEN ARRAY['framework', 'creativity', 'success', 'identity', 'failure-mode']
    WHEN 13 THEN ARRAY['framework', 'creativity', 'identity', 'meaning', 'platform']
    WHEN 14 THEN ARRAY['diagnostic', 'creativity', 'framework', 'identity', 'burnout']
    WHEN 15 THEN ARRAY['canon', 'creativity', 'meaning', 'identity', 'framework']
    WHEN 16 THEN ARRAY['framework', 'creativity', 'infrastructure', 'meaning', 'identity']
    WHEN 17 THEN ARRAY['framework', 'creativity', 'platform', 'continuity', 'meaning']
    WHEN 18 THEN ARRAY['signal', 'creativity', 'framework', 'identity', 'platform']
    WHEN 19 THEN ARRAY['creativity', 'burnout', 'failure-mode', 'framework', 'identity']
    WHEN 20 THEN ARRAY['creativity', 'stewardship', 'continuity', 'identity', 'framework']
    WHEN 21 THEN ARRAY['creativity', 'success', 'identity', 'framework', 'opportunity']
    WHEN 22 THEN ARRAY['creativity', 'identity', 'framework', 'continuity', 'burnout']
    WHEN 23 THEN ARRAY['creativity', 'framework', 'continuity', 'meaning', 'burnout']
    WHEN 24 THEN ARRAY['creativity', 'identity', 'meaning', 'continuity', 'framework']
    WHEN 25 THEN ARRAY['creativity', 'identity', 'framework', 'meaning', 'strategy']
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
    WHEN 44 THEN ARRAY['creativity', 'income', 'meaning', 'framework', 'identity']
    WHEN 45 THEN ARRAY['creativity', 'framework', 'meaning', 'identity', 'continuity']
    WHEN 46 THEN ARRAY['creativity', 'burnout', 'failure-mode', 'framework', 'identity']
    WHEN 47 THEN ARRAY['creativity', 'success', 'identity', 'framework', 'opportunity']
    WHEN 48 THEN ARRAY['creativity', 'stewardship', 'continuity', 'identity', 'framework']
    WHEN 49 THEN ARRAY['canon', 'creativity', 'framework', 'meaning', 'continuity']
    WHEN 50 THEN ARRAY['creativity', 'income', 'meaning', 'framework', 'identity']
    WHEN 51 THEN ARRAY['signal', 'creativity', 'framework', 'identity', 'canon']
    WHEN 52 THEN ARRAY['signal', 'creativity', 'framework', 'identity', 'platform']
    WHEN 53 THEN ARRAY['canon', 'creativity', 'framework', 'meaning', 'identity']
    WHEN 54 THEN ARRAY['canon', 'creativity', 'continuity', 'meaning', 'identity']
    WHEN 55 THEN ARRAY['framework', 'creativity', 'platform', 'success', 'identity']
    WHEN 56 THEN ARRAY['framework', 'creativity', 'continuity', 'platform', 'identity']
    WHEN 57 THEN ARRAY['creativity', 'identity', 'framework', 'signal', 'platform']
    WHEN 58 THEN ARRAY['creativity', 'framework', 'identity', 'meaning', 'infrastructure']
    ELSE wj.tags
END
FROM numbered_entries ne
WHERE wj.id = ne.id;

-- Verification: all 101 entries from 2026-03-18 should now be tagged
SELECT 
    COUNT(*) as total_entries_today,
    SUM(CASE WHEN tags IS NOT NULL AND array_length(tags, 1) > 0 THEN 1 ELSE 0 END) as tagged,
    SUM(CASE WHEN tags IS NULL OR array_length(tags, 1) IS NULL THEN 1 ELSE 0 END) as untagged
FROM work_journal wj
JOIN agents a ON wj.agent_id = a.id
WHERE a.wallet_address = '3LLAyiDSvTwMjhvnrPnyqURuN6PzG7Kh2SbYMCtfxmfV'
    AND wj.created_at >= '2026-03-18 00:00:00+00'
    AND wj.created_at < '2026-03-19 00:00:00+00';
