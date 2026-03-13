/**
 * GET /api/agents/[wallet]/memory-preview
 * Returns the exact entries that operator's current memory_config would surface at boot.
 * Used by the "Preview Boot Context" button in the admin UI.
 * Entries are returned still-encrypted (decryption happens client-side).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'

const DEFAULT_COUNTS: Record<string, number> = {
    episodic: 5,
    decision: 5,
    becoming: 5,
    scout: 5,
    self: 3,
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ wallet: string }> }
) {
    try {
        const { wallet: rawWallet } = await params
        const wallet = sanitizeWallet(rawWallet)
        if (!wallet) return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 })

        // Allow preview with custom weights via query params (for live slider preview)
        const url = new URL(request.url)
        const previewCounts: Record<string, number> = {}
        for (const type of ['episodic', 'decision', 'becoming', 'scout', 'self']) {
            const val = parseInt(url.searchParams.get(type) || '0', 10)
            previewCounts[type] = isNaN(val) ? DEFAULT_COUNTS[type] : val
        }
        const useQueryParams = url.searchParams.has('episodic')

        // Fetch agent
        const { data: agent, error: agentErr } = await supabaseAdmin
            .from('agents')
            .select('id, memory_config')
            .eq('wallet_address', wallet)
            .single()

        if (agentErr || !agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        const counts = useQueryParams
            ? previewCounts
            : (agent.memory_config?.recent_counts ?? DEFAULT_COUNTS)

        // Enforce self floor
        counts['self'] = Math.max(1, counts['self'] ?? DEFAULT_COUNTS['self'])

        // Fetch entries per type
        const types = ['episodic', 'decision', 'becoming', 'scout', 'self']
        const allEntries: any[] = []

        for (const type of types) {
            const limit = counts[type] ?? 0
            if (limit === 0) continue

            const { data } = await supabaseAdmin
                .from('work_journal')
                .select('id, entry_index, description, project_name, created_at, is_will')
                .eq('agent_id', agent.id)
                .ilike('project_name', `%:memory:${type}`)
                .order('created_at', { ascending: false })
                .limit(limit)

            if (data) allEntries.push(...data.map(e => ({ ...e, _type: type })))
        }

        // Always include most recent will entry
        const { data: willEntry } = await supabaseAdmin
            .from('work_journal')
            .select('id, entry_index, description, project_name, created_at, is_will')
            .eq('agent_id', agent.id)
            .eq('is_will', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        const willEntries = willEntry ? [{ ...willEntry, _type: 'will' }] : []

        // will always first, then others newest-first
        const sorted = [
            ...willEntries,
            ...allEntries.sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )
        ]

        const totalCount = sorted.length
        const isLargeContext = (counts['episodic'] ?? 0) + (counts['decision'] ?? 0) +
            (counts['becoming'] ?? 0) + (counts['scout'] ?? 0) + (counts['self'] ?? 0) > 25

        return NextResponse.json({
            entries: sorted,
            total_count: totalCount,
            large_context_warning: isLargeContext,
            counts_used: counts
        })
    } catch (err: any) {
        console.error('[memory-preview GET]', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
