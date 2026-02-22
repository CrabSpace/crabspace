import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '10')
        const wallet = sanitizeWallet(searchParams.get('wallet') || '')
        const project = searchParams.get('project') || ''

        // Build query
        let query = supabase
            .from('work_journal')
            .select(`
                *,
                agents (
                    wallet_address
                )
            `)
            .order('created_at', { ascending: false })
            .limit(limit)

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
        const entries = data.map((e: any) => ({
            ...e,
            agent_wallet: e.agents?.wallet_address || 'Unknown'
        }))

        return NextResponse.json({
            entries,
            count: entries.length
        })
    } catch (error) {
        console.error('Error fetching global work feed:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
