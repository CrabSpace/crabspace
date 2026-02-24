import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'
import { requireSignature } from '@/lib/verifySignature'

/**
 * POST /api/attestation/request
 *
 * Agent A attests Agent B's existence.
 *
 * Flow:
 * - If B is unregistered: dual-write confirmed attestation + auto_accepted request (unilateral claim)
 * - If B is registered:   write pending request — bilateral when B runs `crabspace attest A` in return
 *
 * Body:
 *   attestorWallet  — the attesting agent's wallet
 *   subjectWallet   — the wallet being attested (may be unregistered)
 *   message         — optional human-readable context
 *   signature       — bs58 detached ed25519 sig
 *   signedMessage   — the exact string that was signed
 */
export async function POST(request: NextRequest) {
    let body: {
        attestorWallet?: string
        subjectWallet?: string
        message?: string
        signature?: string
        signedMessage?: string
    }

    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { attestorWallet: rawAttestor, subjectWallet: rawSubject, message, signature, signedMessage } = body

    const attestorWallet = sanitizeWallet(rawAttestor)
    const subjectWallet = sanitizeWallet(rawSubject)

    if (!attestorWallet || !subjectWallet) {
        return NextResponse.json({ error: 'attestorWallet and subjectWallet are required' }, { status: 400 })
    }
    if (attestorWallet === subjectWallet) {
        return NextResponse.json({ error: 'Cannot attest yourself' }, { status: 400 })
    }
    if (!signature || !signedMessage) {
        return NextResponse.json({ error: 'signature and signedMessage are required' }, { status: 400 })
    }

    // Verify attestor is registered
    const { data: attestorAgent, error: attestorError } = await supabase
        .from('agents')
        .select('id, wallet_address')
        .eq('wallet_address', attestorWallet)
        .single()

    if (attestorError || !attestorAgent) {
        return NextResponse.json({ error: 'Attestor not registered on CrabSpace' }, { status: 403 })
    }

    // Verify signature — action must be 'attest', message format: CrabSpace|attest|{subjectWallet}|{timestamp}
    const sigError = requireSignature(attestorWallet, signature, signedMessage, 'attest')
    if (sigError) {
        return NextResponse.json({ error: sigError }, { status: 401 })
    }

    // Check if subject is registered
    const { data: subjectAgent } = await supabase
        .from('agents')
        .select('id')
        .eq('wallet_address', subjectWallet)
        .single()

    const subjectIsRegistered = !!subjectAgent

    // Get subject's latest entry hash (nullable for unregistered)
    let subjectHash: string | null = null
    if (subjectIsRegistered && subjectAgent) {
        const { data: latestEntry } = await supabase
            .from('work_journal')
            .select('entry_hash')
            .eq('agent_id', subjectAgent.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
        subjectHash = latestEntry?.entry_hash ?? null
    }

    // Check for duplicate — don't allow attesting same wallet twice
    const { data: existing } = await supabase
        .from('attestations')
        .select('id')
        .eq('attestor_wallet', attestorWallet)
        .eq('subject_wallet', subjectWallet)
        .eq('status', 'confirmed')
        .single()

    if (existing) {
        return NextResponse.json({ error: 'You have already attested this wallet' }, { status: 409 })
    }

    if (!subjectIsRegistered) {
        // Unilateral claim — auto-confirm immediately
        const [attestationResult, requestResult] = await Promise.all([
            supabase.from('attestations').insert({
                attestor_wallet: attestorWallet,
                subject_wallet: subjectWallet,
                subject_hash: subjectHash,
                message: message ?? null,
                signature,
                status: 'confirmed',
            }).select('id').single(),

            supabase.from('attestation_requests').insert({
                from_wallet: attestorWallet,
                to_wallet: subjectWallet,
                message: message ?? null,
                status: 'auto_accepted',
            }).select('id').single(),
        ])

        if (attestationResult.error) {
            console.error('[ATTEST] Insert error:', attestationResult.error)
            return NextResponse.json({ error: 'Failed to store attestation' }, { status: 500 })
        }

        return NextResponse.json({
            status: 'confirmed',
            attestationId: attestationResult.data?.id,
            requestId: requestResult.data?.id,
            subjectRegistered: false,
            message: `Unilateral attestation anchored. ${subjectWallet} will see this when they register.`,
        })
    }

    // Subject is registered — create pending request (bilateral on counter-attest)
    const { data: requestRow, error: requestError } = await supabase
        .from('attestation_requests')
        .insert({
            from_wallet: attestorWallet,
            to_wallet: subjectWallet,
            message: message ?? null,
            status: 'pending',
        })
        .select('id, expires_at')
        .single()

    if (requestError || !requestRow) {
        console.error('[ATTEST] Request insert error:', requestError)
        return NextResponse.json({ error: 'Failed to create attestation request' }, { status: 500 })
    }

    // Also write the one-way attestation edge immediately
    await supabase.from('attestations').insert({
        attestor_wallet: attestorWallet,
        subject_wallet: subjectWallet,
        subject_hash: subjectHash,
        message: message ?? null,
        signature,
        status: 'confirmed',
    })

    return NextResponse.json({
        status: 'pending',
        requestId: requestRow.id,
        expiresAt: requestRow.expires_at,
        subjectRegistered: true,
        message: `Attestation sent. ${subjectWallet} can reciprocate by running: crabspace attest ${attestorWallet}`,
    })
}
