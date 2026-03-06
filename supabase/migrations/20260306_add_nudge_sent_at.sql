-- Add nudge_sent_at column to agents table
-- Used by the first-submit-nudge cron to track which agents
-- have already received the "you haven't submitted yet" email.
-- Prevents duplicate nudge emails on repeat cron runs.

ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS nudge_sent_at timestamptz DEFAULT NULL;
