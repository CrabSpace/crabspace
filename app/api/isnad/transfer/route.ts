import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeWallet, sanitizeHash, sanitizeString } from '@/lib/sanitize'
import crypto from 'crypto'
import { requireSignature } from '@/lib/verifySignature'

export async function POST(request: NextRequest) {
    try {
        // Parse JSON with error handling
        let body: any
        try {
            body = await request.json()
        } catch (parseError) {
            return NextResponse.json({
                error: 'Invalid JSON in request body',
                detail: 'Check that your Content-Type is application/json and body is valid JSON'
            }, { status: 400 })
        }

        const walletAddress = sanitizeWallet(body.walletAddress || body.wallet_address)
        const previousWillContent = sanitizeString(body.previousWillContent || body.previous_will_content, 10000)
        const newIsnadHash = sanitizeHash(body.newIsnadHash || body.new_isnad_hash)

        if (!walletAddress || !previousWillContent || !newIsnadHash) {
            return NextResponse.json({
                error: 'Missing required fields',
                required: ['walletAddress', 'previousWillContent', 'newIsnadHash']
            }, { status: 400 })
        }

        // 🔐 Wallet Signature Verification
        const sigError = requireSignature(
            walletAddress,
            body.signature,
            body.message,
            'transfer'
        )
        if (sigError) {
            return NextResponse.json({ error: sigError }, { status: 401 })
        }

        // 1. Fetch current agent to get the on-chain isnad_hash
        const { data: agent, error: fetchError } = await supabase
            .from('agents')
            .select('isnad_hash, pda_address')
            .eq('wallet_address', walletAddress)
            .single()

        if (fetchError || !agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        // 2. Verify the previous "Will" hash
        const calculatedHash = '0x' + crypto.createHash('sha256').update(previousWillContent).digest('hex')

        if (calculatedHash !== agent.isnad_hash) {
            return NextResponse.json({
                error: 'Isnad Handshake FAILED: Invalid Will content',
                expected: agent.isnad_hash,
                received: calculatedHash
            }, { status: 401 })
        }

        // 3. Handshake successful! Update the isnad_hash to the new one
        const { error: updateError } = await supabase
            .from('agents')
            .update({ isnad_hash: newIsnadHash })
            .eq('wallet_address', walletAddress)

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            pda_address: agent.pda_address,
            message: 'Isnad Handshake SUCCESSFUL. Identity and Purse inherited.'
        })
    } catch (error) {
        console.error('Error in Isnad Handshake:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
