import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'
import { requireSignature } from '@/lib/verifySignature'

/**
 * POST /api/attestation/accept
 *
 * Explicit accept for a pending attestation request.
 * Phase 0 note: bilateral flow is normally completed by the subject
 * running `crabspace attest {attestorWallet}` (a counter-request),
 * which creates a second attestation edge. This endpoint exists for
 * direct Phase 1 integration and tooling that wants explicit accept flow.
 *
 * Body:
 *   requestId      — uuid from attestation_requests
 *   acceptorWallet — must match to_wallet on the request
 *   signature      — bs58 detached ed25519 sig
 *   signedMessage  — the exact string that was signed
 */
export async function POST(request: NextRequest) {
    let body: {
        requestId?: string
        acceptorWallet?: string
        signature?: string
        signedMessage?: string
    }

    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { requestId, acceptorWallet: rawAcceptor, signature, signedMessage } = body

    const acceptorWallet = sanitizeWallet(rawAcceptor)

    if (!requestId || !acceptorWallet) {
        return NextResponse.json({ error: 'requestId and acceptorWallet are required' }, { status: 400 })
    }
    if (!signature || !signedMessage) {
        return NextResponse.json({ error: 'signature and signedMessage are required' }, { status: 400 })
    }

    // Fetch the request
    const { data: req, error: reqError } = await supabase
        .from('attestation_requests')
        .select('*')
        .eq('id', requestId)
        .single()

    if (reqError || !req) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }
    if (req.to_wallet !== acceptorWallet) {
        return NextResponse.json({ error: 'Wallet does not match request target' }, { status: 403 })
    }
    if (req.status !== 'pending') {
        return NextResponse.json({ error: `Request already ${req.status}` }, { status: 409 })
    }
    if (new Date(req.expires_at) < new Date()) {
        await supabase
            .from('attestation_requests')
            .update({ status: 'expired' })
            .eq('id', requestId)
        return NextResponse.json({ error: 'Request has expired' }, { status: 410 })
    }

    // Verify acceptor signature
    const sigError = requireSignature(acceptorWallet, signature, signedMessage, 'attest')
    if (sigError) {
        return NextResponse.json({ error: sigError }, { status: 401 })
    }

    // Write the counter-attestation edge (acceptor → attestor)
    const { data: newAttestation, error: attestError } = await supabase
        .from('attestations')
        .insert({
            attestor_wallet: acceptorWallet,
            subject_wallet: req.from_wallet,
            subject_hash: null, // subject_hash for the original attestor fetched lazily
            message: `Accepted attestation from ${req.from_wallet}`,
            signature,
            status: 'confirmed',
        })
        .select('id')
        .single()

    if (attestError) {
        console.error('[ATTEST/ACCEPT] Insert error:', attestError)
        return NextResponse.json({ error: 'Failed to store attestation' }, { status: 500 })
    }

    // Mark request accepted
    await supabase
        .from('attestation_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)

    return NextResponse.json({
        status: 'confirmed',
        attestationId: newAttestation?.id,
        message: 'Mutual attestation confirmed.',
    })
}
