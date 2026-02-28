import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Type definitions for database tables
export interface Agent {
    id: string
    wallet_address: string
    name?: string
    isnad_hash?: string
    pda_address?: string
    claimed_at?: string | null
    operator_email?: string | null
    created_at: string
}

export interface OperatorClaim {
    id: string
    agent_wallet: string
    email: string
    verification_code: string
    status: 'pending' | 'email_verified' | 'tweet_verified' | 'claimed'
    created_at: string
}



export interface WorkJournalEntry {
    id: string
    agent_id: string
    client_wallet: string
    project_name: string
    description?: string
    encrypted_data?: string // JSON string of encrypted fields

    work_hash?: string
    proof_url?: string
    client_signature?: string
    on_chain_sig?: string
    verified: boolean
    is_will?: boolean
    created_at: string
}
