import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'

// Columns safe for the public feed. Private vault fields (private_tags,
// private_summary) and the encrypted description blob are only returned
// to the entry owner via signed-wallet auth — same gate as /api/cog/search.
const PUBLIC_COLUMNS =
    'id, agent_id, project_name, work_hash, proof_url, on_chain_sig, ' +
    'arweave_tx_id, seed_epoch, type, tags, summary, source_author, ' +
    'source_file, cog_eligible, is_will, created_at'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 500)
        const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0)
        const wallet = sanitizeWallet(searchParams.get('wallet') || '')
        const project = searchParams.get('project') || ''

        // Optional signed-wallet auth → unlocks private fields for own entries
        const signature = searchParams.get('signature')
        const message = searchParams.get('message')
        let authenticatedWallet: string | null = null
        if (wallet && signature && message) {
            const { requireSignature } = await import('@/lib/verifySignature')
            const sigError = requireSignature(wallet, signature, message, 'search')
            if (!sigError) {
                authenticatedWallet = wallet
            }
        }

        const isOwnerQuery = !!(authenticatedWallet && wallet && authenticatedWallet === wallet)
        const columns = isOwnerQuery
            ? `${PUBLIC_COLUMNS}, description, private_tags, private_summary`
            : PUBLIC_COLUMNS

        // Build query - Only get entries from claimed agents
        let query = supabase
            .from('work_journal')
            .select(`
                ${columns},
                agents!inner (
                    wallet_address,
                    claimed_at
                )
            `)
            .not('agents.claimed_at', 'is', null)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        // Filter by wallet if provided
        if (wallet) {
            // First get agent ID for this wallet
            const { data: agent } = await supabase
                .from('agents')
                .select('id')
                .eq('wallet_address', wallet)
                .single()

            if (agent) {
                query = query.eq('agent_id', agent.id)
            } else {
                return NextResponse.json({ entries: [], count: 0 })
            }
        }

        // Filter by project name prefix (supports namespace queries like "eisner:memory:")
        if (project) {
            query = query.ilike('project_name', `${project}%`)
        }

        const { data, error } = await query

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Map entries to include wallet address at top level for UI convenience
        const entries = (data || []).map((e: any) => ({
            ...e,
            agent_wallet: e.agents?.wallet_address || 'Unknown'
        }))

        return NextResponse.json({
            entries,
            count: entries.length,
            offset,
        })
    } catch (error) {
        console.error('Error fetching global work feed:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
