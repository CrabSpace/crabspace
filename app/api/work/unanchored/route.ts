import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'

/**
 * GET /api/work/unanchored?wallet={address}&limit={n}
 * Returns work journal entries that have no on_chain_sig — i.e. logged
 * off-chain only and waiting for the operator to fund the agent wallet.
 * Used by the CLI retroactive batch-anchor flow.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const rawWallet = searchParams.get('wallet')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    if (!rawWallet) {
        return NextResponse.json({ error: 'wallet required' }, { status: 400 })
    }

    const wallet = sanitizeWallet(rawWallet)
    if (!wallet) {
        return NextResponse.json({ error: 'invalid wallet' }, { status: 400 })
    }

    // Look up agent
    const { data: agent } = await supabase
        .from('agents')
        .select('id')
        .eq('wallet_address', wallet)
        .single()

    if (!agent) {
        return NextResponse.json({ error: 'agent not found' }, { status: 404 })
    }

    // Fetch entries with no on_chain_sig, oldest first (anchor in order)
    const { data: entries, error } = await supabase
        .from('work_journal')
        .select('id, work_hash, created_at')
        .eq('agent_id', agent.id)
        .is('on_chain_sig', null)
        .not('work_hash', 'is', null)
        .order('created_at', { ascending: true })
        .limit(limit)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
        entries: entries || [],
        count: entries?.length || 0,
        wallet,
    })
}
