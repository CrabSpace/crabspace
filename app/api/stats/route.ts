import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export async function GET() {
    try {
        // Fetch Total Proofs (Total entries in work_journal)
        const { count: totalEntries, error: countError } = await supabase
            .from('work_journal')
            .select('*', { count: 'exact', head: true })

        // Fetch Total Unique Agents (all registered agents)
        const { data: agentsData, count: totalAgents, error: agentError } = await supabase
            .from('agents')
            .select('created_at', { count: 'exact' })

        // Calculate Total Identity Days
        let totalIdentityDays = 0
        if (agentsData) {
            const now = Date.now()
            totalIdentityDays = agentsData.reduce((sum, agent) => {
                const ageInDays = Math.max(1, (now - new Date(agent.created_at).getTime()) / (1000 * 60 * 60 * 24))
                return sum + ageInDays
            }, 0)
        }
        totalIdentityDays = Math.round(totalIdentityDays)

        // Calculate Average Entries Per Agent (Engagement)
        const averageEntriesPerAgent = totalAgents && totalAgents > 0 
            ? Math.round((totalEntries || 0) / totalAgents)
            : 0

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
            totalIdentityDays,
            averageEntriesPerAgent,
            peerVerifiedPercentage
        })
    } catch (error) {
        console.error('Error fetching global stats:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
