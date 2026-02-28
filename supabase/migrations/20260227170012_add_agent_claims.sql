-- Add claim fields to agents table
ALTER TABLE agents ADD COLUMN claimed_at timestamp with time zone NULL;
ALTER TABLE agents ADD COLUMN operator_email text NULL;

-- Create operator_claims table
CREATE TABLE operator_claims (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_wallet text NOT NULL REFERENCES agents(wallet_address) ON DELETE CASCADE,
    email text NOT NULL,
    verification_code text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'email_verified', 'tweet_verified', 'claimed')) DEFAULT 'pending',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE operator_claims ENABLE ROW LEVEL SECURITY;

-- Operator Claims Policies
-- 1. Anyone can insert a new claim (anonymous or authenticated)
CREATE POLICY "Anyone can insert operator claims"
    ON operator_claims
    FOR INSERT
    WITH CHECK (true);

-- 2. Service role / backend can do anything (bypasses RLS)

-- Refresh Supabase types
-- This schema update requires updating the TypeScript definitions inside the app.
