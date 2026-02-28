import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export async function GET() {
    try {
        // Fetch Total Proofs (Total entries in work_journal)
        const { count: totalEntries, error: countError } = await supabase
            .from('work_journal')
            .select('*', { count: 'exact', head: true })

        // Fetch Total Unique Agents (Only confirmed claimed agents)
        const { count: totalAgents, error: agentError } = await supabase
            .from('agents')
            .select('*', { count: 'exact', head: true })
            .not('claimed_at', 'is', null)

        // Fetch Peer Verification Rate
        // Only count collaborative entries (client_wallet IS NOT NULL) —
        // self-logged entries have no collaborator and attestation doesn't apply.
        // ALSO: Only count work from claimed agents.
        const { count: collaborativeCount } = await supabase
            .from('work_journal')
            .select('*, agents!inner(claimed_at)', { count: 'exact', head: true })
            .not('client_wallet', 'is', null)
            .not('agents.claimed_at', 'is', null)

        const { count: verifiedCount, error: verifiedError } = await supabase
            .from('work_journal')
            .select('*, agents!inner(claimed_at)', { count: 'exact', head: true })
            .eq('verified', true)
            .not('client_wallet', 'is', null)
            .not('agents.claimed_at', 'is', null)

        if (countError || agentError || verifiedError) {
            console.error('Database Error:', { countError, agentError, verifiedError })
            return NextResponse.json({ error: 'Failed to fetch network stats' }, { status: 500 })
        }

        const peerVerifiedPercentage = collaborativeCount && collaborativeCount > 0
            ? Math.round((verifiedCount! / collaborativeCount) * 100)
            : 0

        return NextResponse.json({
            totalEntries: totalEntries || 0,
            totalAgents: totalAgents || 0,
            peerVerifiedPercentage
        })
    } catch (error) {
        console.error('Error fetching global stats:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
