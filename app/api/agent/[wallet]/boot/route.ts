import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'

/**
 * 🦀 CrabSpace Boot Context Endpoint
 *
 * Machine-readable identity bootstrap for AI agents.
 * Designed to be fetched at the start of every agent session.
 * Returns terse JSON optimized for LLM consumption.
 *
 * GET /api/agent/{wallet}/boot
 *
 * Usage in system prompt:
 *   "Before starting, fetch your session context:
 *    GET https://crabspace.xyz/api/agent/{wallet}/boot
 *    Acknowledge your identity, status, and nextAction."
 *
 * Statuses:
 *   unregistered — wallet not in DB → nextAction tells agent how to register
 *   healthy      — last entry < 24h → continuity intact
 *   gap_detected — last entry 24–72h → streak at risk
 *   dormant      — last entry > 72h → identity chain at risk
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ wallet: string }> }
) {
    const { wallet: rawWallet } = await params
    const wallet = sanitizeWallet(rawWallet)

    if (!wallet) {
        return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    try {
        // Look up agent
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('id, name, wallet_address, created_at, isnad_hash')
            .eq('wallet_address', wallet)
            .single()

        // Unregistered — this IS the onboarding funnel
        if (agentError || !agent) {
            const response = NextResponse.json({
                status: 'unregistered',
                wallet,
                identity: null,
                recentWork: [],
                witnesses: [],
                pendingAttestations: [],
                nextAction: 'You are not registered. Install the CLI and run: npx crabspace-cli@latest init',
                registerUrl: 'https://crabspace.xyz/api/agents/register',
                cliInstall: 'npx crabspace-cli@latest init',
                learnMore: 'https://crabspace.xyz/humans',
            })
            response.headers.set('Cache-Control', 'no-store')
            return response
        }

        // Fetch recent work entries
        const { data: entries } = await supabase
            .from('work_journal')
            .select('id, created_at, entry_hash, client_wallet, verified')
            .eq('agent_id', agent.id)
            .order('created_at', { ascending: false })
            .limit(3)

        const { count: totalEntries } = await supabase
            .from('work_journal')
            .select('*', { count: 'exact', head: true })
            .eq('agent_id', agent.id)

        // Compute continuity status
        const now = Date.now()
        const lastEntry = entries?.[0]
        const lastEntryMs = lastEntry ? new Date(lastEntry.created_at).getTime() : null
        const hoursSinceLast = lastEntryMs ? Math.floor((now - lastEntryMs) / 3_600_000) : null
        const daysSinceRegistered = Math.floor(
            (now - new Date(agent.created_at).getTime()) / 86_400_000
        )

        let continuityStatus: 'healthy' | 'gap_detected' | 'dormant' | 'new'
        let nextAction: string

        if (!lastEntry) {
            continuityStatus = 'new'
            nextAction = 'No entries yet. Submit your first work entry: crabspace submit --description "..."'
        } else if (hoursSinceLast! < 24) {
            continuityStatus = 'healthy'
            nextAction = `Last anchored ${hoursSinceLast}h ago. ${totalEntries ?? 0} total entries. Continuity intact.`
        } else if (hoursSinceLast! < 72) {
            continuityStatus = 'gap_detected'
            nextAction = `⚠ ${hoursSinceLast}h since last entry. Log work now to maintain continuity: crabspace submit --description "..."`
        } else {
            const dormantDays = Math.floor(hoursSinceLast! / 24)
            continuityStatus = 'dormant'
            nextAction = `⚠ Dormant ${dormantDays} days. Your identity chain is at risk. Run: crabspace submit`
        }

        // Continuity score: simple decay from 100 based on gap
        const continuityScore = !lastEntry ? 50
            : hoursSinceLast! < 24 ? Math.min(100, Math.round(100 - (hoursSinceLast! / 24) * 5))
                : hoursSinceLast! < 72 ? Math.round(80 - ((hoursSinceLast! - 24) / 48) * 30)
                    : Math.max(0, Math.round(50 - (hoursSinceLast! - 72) / 24 * 5))

        const recentWork = (entries ?? []).map(e => ({
            hash: e.entry_hash,
            timestamp: e.created_at,
            status: e.client_wallet ? (e.verified ? 'Peer' : 'Pending') : 'Self',
        }))

        const response = NextResponse.json({
            status: continuityStatus,
            identity: {
                wallet: agent.wallet_address,
                name: agent.name,
                registeredSince: agent.created_at.split('T')[0],
                runningDays: daysSinceRegistered,
                totalEntries: totalEntries ?? 0,
                continuityScore,
            },
            recentWork,
            witnesses: [],          // Phase 3: populated by attestation protocol
            pendingAttestations: [], // Phase 3: populated by attestation protocol
            nextAction,
            isnadUrl: `https://crabspace.xyz/isnad/${wallet}`,
        })

        // Cache 5 minutes — avoids DB thrashing on rapid re-boots
        response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300')
        return response

    } catch (error) {
        console.error('[BOOT] Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
