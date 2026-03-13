/**
 * GET /api/agents/[wallet]/memory-preview
 * Returns the exact entries that the operator's current memory_config would surface at boot.
 * Used by the "Preview Boot Context" button in the admin UI.
 * Entries are returned still-encrypted (decryption happens client-side).
 *
 * Strategy: fetch all recent entries for the agent in ONE query, classify by
 * project_name in code, then apply per-type count limits. Avoids all PostgREST
 * ilike syntax edge-cases.
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

/** Classify a project_name into one of our memory types */
function classifyProjectName(projectName: string | null): string {
    if (!projectName) return 'self'
    const lower = projectName.toLowerCase()
    if (lower.includes(':memory:episodic')) return 'episodic'
    if (lower.includes(':memory:decision')) return 'decision'
    if (lower.includes(':memory:becoming')) return 'becoming'
    if (lower.includes(':memory:scout')) return 'scout'
    if (lower.includes(':memory:self')) return 'self'
    if (lower.includes(':memory:will')) return 'will'
    // Un-typed entries (e.g. "Autonomous Work") → treat as self
    return 'self'
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
            console.error('[memory-preview] Agent lookup failed:', agentErr?.message, 'wallet:', wallet)
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        const counts = useQueryParams
            ? previewCounts
            : (agent.memory_config?.recent_counts ?? DEFAULT_COUNTS)

        // Enforce self floor
        counts['self'] = Math.max(1, counts['self'] ?? DEFAULT_COUNTS['self'])

        // ── Single fetch: get all recent entries for this agent ──
        // We fetch enough to comfortably fill all type buckets (max 20 per type × 5 types + buffer)
        const fetchLimit = Math.max(
            200,
            Object.values(counts).reduce((a, b) => a + b, 0) * 3
        )

        const { data: allRaw, error: fetchErr } = await supabaseAdmin
            .from('work_journal')
            .select('id, entry_index, description, project_name, created_at, is_will')
            .eq('agent_id', agent.id)
            .order('created_at', { ascending: false })
            .limit(fetchLimit)

        if (fetchErr) {
            console.error('[memory-preview] Entry fetch failed:', fetchErr.message)
            return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
        }

        // ── Classify and bucket entries by type ──
        const buckets: Record<string, any[]> = {
            episodic: [], decision: [], becoming: [], scout: [], self: [], will: []
        }

        for (const entry of (allRaw || [])) {
            // Will entries get their own bucket
            if (entry.is_will) {
                buckets['will'].push(entry)
                continue
            }
            const type = classifyProjectName(entry.project_name)
            buckets[type].push(entry)
        }

        // ── Apply per-type limits ──
        const allEntries: any[] = []
        for (const type of ['episodic', 'decision', 'becoming', 'scout', 'self']) {
            const limit = counts[type] ?? 0
            const slice = buckets[type].slice(0, limit)
            allEntries.push(...slice.map(e => ({ ...e, _type: type })))
        }

        // Always include most recent will entry (will entries are always shown first)
        const willEntry = buckets['will'][0] ?? null
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
