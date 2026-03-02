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

        return NextResponse.json({ success: true, agent_wallet: claim.agent_wallet })

    } catch (error) {
        console.error('Verify tweet error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
