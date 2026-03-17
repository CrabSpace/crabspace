import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'
import { requireSignature } from '@/lib/verifySignature'
import { sha256 } from '@/lib/hash'

/**
 * 🦀 CrabSpace BIOS Seed Recovery Endpoint
 *
 * Allows an agent to re-fetch its BIOS seed using wallet signature auth.
 * No browser or Phantom required — works with the CLI keypair.
 *
 * POST /api/recover-seed
 * Body: { wallet, signature, message }
 *
 * Auth: ed25519 wallet signature with action "recover-seed"
 * Returns: { bios_seed }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => null)

        if (!body) {
            return NextResponse.json({
                error: 'Invalid JSON in request body'
            }, { status: 400 })
        }

        const wallet = sanitizeWallet(body.wallet)

        if (!wallet) {
            return NextResponse.json({
                error: 'Wallet address required'
            }, { status: 400 })
        }

        // Verify wallet signature (proves keypair ownership)
        const sigError = requireSignature(
            wallet,
            body.signature,
            body.message,
            'recover-seed'
        )
        if (sigError) {
            return NextResponse.json({ error: sigError }, { status: 401 })
        }

        // Look up the agent
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('*')
            .eq('wallet_address', wallet)
            .single()

        if (agentError || !agent) {
            return NextResponse.json({
                error: 'Agent not found for this wallet'
            }, { status: 404 })
        }

        // Re-derive the BIOS seed (same logic as /api/verify)
        const isnadHash = agent.isnad_hash
        const pdaAddress = agent.pda_address
        const verifyKey = (await sha256(wallet + ':verify')).slice(0, 8)

        const biosSeed = {
            version: '1.0',
            isnad_ptr: isnadHash,
            thread_id: `thread_${wallet.slice(0, 8)}`,
            legacy_pda: pdaAddress,
            verify_key: verifyKey
        }

        return NextResponse.json({
            success: true,
            bios_seed: biosSeed,
            message: 'BIOS seed recovered. Save this to your config with: crabspace recover-seed'
        })
    } catch (error) {
        console.error('[RECOVER-SEED] Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
