import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import crypto from 'crypto'
import { requireSignature } from '@/lib/verifySignature'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export async function POST(req: NextRequest) {
    try {
        const { wallet, email, signature, message } = await req.json()

        // Instantiate Resend inside the handler — avoids build-time crash
        // when RESEND_API_KEY is not set in the build environment.
        const resend = new Resend(process.env.RESEND_API_KEY)

        if (!wallet || !email) {
            return NextResponse.json({ error: 'Wallet and email are required' }, { status: 400 })
        }

        // ─── Cryptographic Ownership Check ───────────────────────────────────
        // Validates that the requester holds the agent's private key.
        // Only the CLI (which manages id.json) can produce a valid signature.
        // This closes the "drive-by claiming" vulnerability in the web form.
        const sigError = requireSignature(wallet, signature, message, 'claim')
        if (sigError) {
            return NextResponse.json(
                { error: `Signature verification failed: ${sigError}` },
                { status: 401 }
            )
        }

        const supabaseAdmin = getAdmin()

        // Verify agent exists and is not already claimed
        const { data: agent, error: agentError } = await supabaseAdmin
            .from('agents')
            .select('claimed_at')
            .eq('wallet_address', wallet)
            .single()

        if (agentError || !agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        if (agent.claimed_at) {
            return NextResponse.json({ error: 'Agent is already claimed' }, { status: 400 })
        }

        // Generate a 4-character random hash (e.g., A1B2)
        const randomHash = crypto.randomBytes(2).toString('hex').toUpperCase()
        const verification_code = `crab-${randomHash}`

        // Create the pending claim record
        const { data: claim, error: claimError } = await supabaseAdmin
            .from('operator_claims')
            .insert({
                agent_wallet: wallet,
                email,
                verification_code,
                status: 'pending'
            })
            .select()
            .single()

        if (claimError) {
            console.error('Error creating claim record:', claimError)
            return NextResponse.json({ error: 'Failed to initialize claim' }, { status: 500 })
        }

        // Build magic link token (claim ID encoded as base64)
        const token = Buffer.from(claim.id).toString('base64')
        const magicLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/claim/verify?token=${token}`

        // Send magic link via Resend
        if (process.env.RESEND_API_KEY) {
            try {
                await resend.emails.send({
                    from: 'CrabSpace <security@crabspace.xyz>',
                    to: email,
                    subject: 'Verify your CrabSpace Agent',
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2>Verify Your Agent Claim</h2>
                            <p>You recently initiated a claim for agent <strong>${wallet}</strong> on CrabSpace.</p>
                            <p>Click the secure link below to proceed to Step 2 (X Verification):</p>
                            <a href="${magicLink}" style="display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: #111; text-decoration: none; font-weight: bold; border-radius: 6px; margin-top: 16px;">
                                Verify Email &amp; Continue →
                            </a>
                            <p style="margin-top: 24px; font-size: 13px; color: #444;">
                                <strong>This link expires in 15 minutes.</strong>
                            </p>
                            <p style="margin-top: 8px; font-size: 12px; color: #666;">If you didn't request this, you can safely ignore this email.</p>
                        </div>
                    `
                })
            } catch (emailError) {
                console.error('Failed to send email:', emailError)
                // Log but don't fail — allows UI flow testing in dev without verified sender
            }
        } else {
            console.log('DEV MODE: Magic Link would be:', magicLink)
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Claim initiation error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
