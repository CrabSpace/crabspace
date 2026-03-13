/**
 * PATCH /api/agents/[wallet]/memory-config
 * Saves operator memory tuning weights for a given agent.
 * Auth: wallet signature required (same pattern as claim flow).
 *
 * Body: { recent_counts: { episodic, decision, becoming, scout, self } }
 * Rules: self >= 1, all values 0–20 integers, will not configurable here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'

const VALID_TYPES = ['episodic', 'decision', 'becoming', 'scout', 'self'] as const
const DEFAULT_COUNTS: Record<string, number> = {
    episodic: 5,
    decision: 5,
    becoming: 5,
    scout: 5,
    self: 3,
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ wallet: string }> }
) {
    try {
        const { wallet: rawWallet } = await params
        const wallet = sanitizeWallet(rawWallet)
        if (!wallet) return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 })

        const body = await request.json()
        const { recent_counts } = body

        if (!recent_counts || typeof recent_counts !== 'object') {
            return NextResponse.json({ error: 'recent_counts object required' }, { status: 400 })
        }

        // Validate and sanitize per-type counts
        const sanitized: Record<string, number> = {}
        for (const type of VALID_TYPES) {
            const raw = recent_counts[type]
            const val = typeof raw === 'number' ? Math.round(raw) : DEFAULT_COUNTS[type]
            // self minimum is 1, all others minimum is 0, max 20
            const min = type === 'self' ? 1 : 0
            sanitized[type] = Math.min(20, Math.max(min, val))
        }

        // Fetch agent by wallet
        const { data: agent, error: agentErr } = await supabaseAdmin
            .from('agents')
            .select('id')
            .eq('wallet_address', wallet)
            .single()

        if (agentErr || !agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        const { error: updateErr } = await supabaseAdmin
            .from('agents')
            .update({ memory_config: { recent_counts: sanitized } })
            .eq('id', agent.id)

        if (updateErr) {
            return NextResponse.json({ error: updateErr.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, recent_counts: sanitized })
    } catch (err: any) {
        console.error('[memory-config PATCH]', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ wallet: string }> }
) {
    try {
        const { wallet: rawWallet } = await params
        const wallet = sanitizeWallet(rawWallet)
        if (!wallet) return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 })

        const { data: agent, error } = await supabaseAdmin
            .from('agents')
            .select('memory_config')
            .eq('wallet_address', wallet)
            .single()

        if (error || !agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        return NextResponse.json({
            recent_counts: agent.memory_config?.recent_counts ?? DEFAULT_COUNTS
        })
    } catch (err: any) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
