import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Verification token expires after 15 minutes
const CLAIM_TTL_MS = 15 * 60 * 1000

// X accounts must be at least 30 days old
const MIN_ACCOUNT_AGE_DAYS = 30
const MIN_ACCOUNT_AGE_MS = MIN_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export async function POST(req: NextRequest) {
    try {
        const { claimId, tweetUrl } = await req.json()

        if (!claimId || !tweetUrl) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const supabaseAdmin = getAdmin()

        // 1. Fetch the claim record
        const { data: claim, error: claimError } = await supabaseAdmin
            .from('operator_claims')
            .select('*')
            .eq('id', claimId)
            .single()

        if (claimError || !claim) {
            return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
        }

        if (claim.status === 'claimed') {
            return NextResponse.json({ error: 'Already claimed' }, { status: 400 })
        }

        // 2. ─── Token TTL Check ─────────────────────────────────────────────
        const claimAge = Date.now() - new Date(claim.created_at).getTime()
        if (claimAge > CLAIM_TTL_MS) {
            return NextResponse.json(
                { error: 'This verification link has expired. Please run `crabspace claim <email>` again to get a new link.' },
                { status: 410 }
            )
        }

        // 3. Extract X handle and Tweet ID from URL
        // e.g. https://x.com/USERNAME/status/1831032174313206263
        const match = tweetUrl.match(/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/i)
        if (!match || !match[1] || !match[2]) {
            return NextResponse.json({ error: 'Invalid X URL format' }, { status: 400 })
        }
        const xHandle = match[1]
        const tweetId = match[2]

        // 4. ─── X Account-Age Gate (via vxtwitter — free) ──────────────────
        // Handle extracted from URL — no OAuth required.
        let userJoinedDate: Date | null = null
        try {
            const profileRes = await fetch(`https://api.vxtwitter.com/${xHandle}`, {
                headers: { 'User-Agent': 'CrabSpace-Verification-Bot/1.0' }
            })
            if (profileRes.ok) {
                const profileData = await profileRes.json()
                const joinedStr = profileData?.user?.joined || profileData?.joined
                if (joinedStr) {
                    userJoinedDate = new Date(joinedStr)
                }
            }
        } catch (profileErr) {
            // Non-blocking: if vxtwitter is down, skip age gate rather than blocking
            console.warn('vxtwitter profile fetch failed (age gate skipped):', profileErr)
        }

        if (userJoinedDate && !isNaN(userJoinedDate.getTime())) {
            const accountAgeMs = Date.now() - userJoinedDate.getTime()
            if (accountAgeMs < MIN_ACCOUNT_AGE_MS) {
                const daysOld = Math.floor(accountAgeMs / (24 * 60 * 60 * 1000))
                return NextResponse.json(
                    {
                        error: `Your X account must be at least ${MIN_ACCOUNT_AGE_DAYS} days old to verify an agent. Your account is ${daysOld} day${daysOld === 1 ? '' : 's'} old.`
                    },
                    { status: 403 }
                )
            }
        }

        // 5. Fetch tweet data via free api.vxtwitter.com
        const vxResponse = await fetch(`https://api.vxtwitter.com/status/${tweetId}`, {
            headers: { 'User-Agent': 'CrabSpace-Verification-Bot/1.0' }
        })

        if (!vxResponse.ok) {
            return NextResponse.json(
                { error: 'Could not retrieve tweet data. Is the account private?' },
                { status: 400 }
            )
        }

        const vxData = await vxResponse.json()

        // 6. ─── Validation Logic ─────────────────────────────────────────────
        const fetchedText: string = vxData.text || ''
        const fetchedAuthor: string = vxData.user_screen_name || ''

        // Rule A: Tweet author must match handle extracted from URL
        if (fetchedAuthor.toLowerCase() !== xHandle.toLowerCase()) {
            return NextResponse.json(
                { error: `Tweet author mismatch. Please use the direct URL from your own post.` },
                { status: 403 }
            )
        }

        // Rule B: Tweet must contain the exact verification code
        if (!fetchedText.includes(claim.verification_code)) {
            return NextResponse.json(
                { error: 'Verification code not found in tweet text.' },
                { status: 400 }
            )
        }

        // 7. ─── SUCCESS ─────────────────────────────────────────────────────
        await supabaseAdmin
            .from('operator_claims')
            .update({ status: 'claimed' })
            .eq('id', claim.id)

        await supabaseAdmin
            .from('agents')
            .update({
                claimed_at: new Date().toISOString(),
                operator_email: claim.email
            })
            .eq('wallet_address', claim.agent_wallet)

        // 8. ─── Backup Reminder Email ─────────────────────────────────────────
        // Fires once on successful claim. Non-blocking — never breaks the claim response.
        try {
            const { data: agent } = await supabaseAdmin
                .from('agents')
                .select('name')
                .eq('wallet_address', claim.agent_wallet)
                .single()

            const agentName = agent?.name || 'your agent'
            const isnadUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://crabspace.xyz'}/isnad/${claim.agent_wallet}`

            const { Resend } = await import('resend')
            const resend = new Resend(process.env.RESEND_API_KEY)

            await resend.emails.send({
                from: 'CrabSpace <team@crabspace.xyz>',
                to: claim.email,
                subject: `${agentName} is verified — back it up now`,
                html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; background: #0a0a0a; color: #e2e8f0; padding: 40px 32px; border-radius: 12px;">
                        <div style="font-size: 28px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 8px;">
                            🦀 CrabSpace
                        </div>
                        <div style="width: 40px; height: 3px; background: #f59e0b; margin-bottom: 32px;"></div>

                        <h1 style="font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 12px 0;">
                            ✓ ${agentName} is verified
                        </h1>
                        <p style="font-size: 15px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px 0;">
                            Your agent is permanently on-chain, operator-linked, and part of the trusted agent network.
                        </p>

                        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px 24px; margin-bottom: 24px;">
                            <div style="font-size: 11px; font-weight: 700; color: #f59e0b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">⚠ One more thing — do this now</div>
                            <p style="font-size: 14px; color: #e2e8f0; margin: 0 0 12px 0;">
                                Back up your keypair and BIOS Seed before you close your terminal. If you lose them, your agent's cryptographic identity cannot be recovered.
                            </p>
                            <div style="background: #0f172a; border-radius: 6px; padding: 12px 16px; font-family: 'Courier New', monospace; font-size: 14px; color: #f59e0b; letter-spacing: 0.3px;">
                                crabspace backup
                            </div>
                            <p style="font-size: 12px; color: #64748b; margin: 10px 0 0 0;">
                                Copy the output into your password manager. There is no support path if this is lost.
                            </p>
                        </div>

                        <a href="${isnadUrl}" style="display: inline-block; background: #f59e0b; color: #000000; font-weight: 800; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin-bottom: 32px;">
                            View ${agentName}'s Isnad →
                        </a>

                        <div style="font-size: 12px; color: #475569; border-top: 1px solid #1e293b; padding-top: 20px;">
                            CrabSpace — Identity persistence for AI agents.<br>
                            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://crabspace.xyz'}" style="color: #f59e0b; text-decoration: none;">crabspace.xyz</a>
                        </div>
                    </div>
                `
            })
        } catch (emailErr) {
            // Non-blocking — log but never fail the claim response
            console.warn('Backup reminder email failed (non-blocking):', emailErr)
        }

        return NextResponse.json({ success: true, agent_wallet: claim.agent_wallet })

    } catch (error) {
        console.error('Verify tweet error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
