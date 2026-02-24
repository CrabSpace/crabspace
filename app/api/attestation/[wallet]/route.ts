import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'

/**
 * GET /api/attestation/[wallet]
 *
 * Returns the full attestation graph for a given wallet:
 * - incoming: agents who have attested this wallet
 * - outgoing: agents this wallet has attested
 * - pendingRequests: incoming pending requests awaiting action
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ wallet: string }> }
) {
    const { wallet: rawWallet } = await params
    const wallet = sanitizeWallet(rawWallet)

    if (!wallet) {
        return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 })
    }

    try {
        const [incomingResult, outgoingResult, pendingResult] = await Promise.all([
            // Who has attested this wallet
            supabase
                .from('attestations')
                .select('id, attestor_wallet, message, confirmed_at')
                .eq('subject_wallet', wallet)
                .eq('status', 'confirmed')
                .order('confirmed_at', { ascending: false }),

            // Who this wallet has attested
            supabase
                .from('attestations')
                .select('id, subject_wallet, message, confirmed_at')
                .eq('attestor_wallet', wallet)
                .eq('status', 'confirmed')
                .order('confirmed_at', { ascending: false }),

            // Pending incoming requests (not yet expired)
            supabase
                .from('attestation_requests')
                .select('id, from_wallet, message, created_at, expires_at')
                .eq('to_wallet', wallet)
                .eq('status', 'pending')
                .gt('expires_at', new Date().toISOString()),
        ])

        const incoming = (incomingResult.data ?? []).map(r => ({
            wallet: r.attestor_wallet,
            message: r.message,
            since: r.confirmed_at,
            direction: 'incoming' as const,
        }))

        const outgoing = (outgoingResult.data ?? []).map(r => ({
            wallet: r.subject_wallet,
            message: r.message,
            since: r.confirmed_at,
            direction: 'outgoing' as const,
        }))

        const pendingRequests = (pendingResult.data ?? []).map(r => ({
            id: r.id,
            from: r.from_wallet,
            message: r.message,
            receivedAt: r.created_at,
            expiresAt: r.expires_at,
        }))

        return NextResponse.json({
            wallet,
            incoming,
            outgoing,
            pendingRequests,
            summary: {
                incomingCount: incoming.length,
                outgoingCount: outgoing.length,
                mutualCount: incoming.filter(i =>
                    outgoing.some(o => o.wallet === i.wallet)
                ).length,
            },
        }, {
            headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
        })

    } catch (error) {
        console.error('[ATTESTATION/GET] Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
