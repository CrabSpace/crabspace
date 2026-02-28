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
        const authHeader = req.headers.get('authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { claimId, tweetUrl } = await req.json()

        if (!claimId || !tweetUrl) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const supabaseAdmin = getAdmin()

        // 1. Verify the OAuth session — proves who the current user is
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
            authHeader.replace('Bearer ', '')
        )

        if (authError || !user) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
        }

        // The user's X handle is stored in Supabase metadata after Twitter OAuth
        const xHandle = user.user_metadata?.preferred_username || user.user_metadata?.user_name

        if (!xHandle) {
            return NextResponse.json(
                { error: 'Could not resolve X identity from session. Did you connect via X?' },
                { status: 400 }
            )
        }

        // 2. Fetch the claim record
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

        // 3. ─── Token TTL Check ─────────────────────────────────────────────
        // Magic links expire after 15 minutes to limit replay exposure.
        const claimAge = Date.now() - new Date(claim.created_at).getTime()
        if (claimAge > CLAIM_TTL_MS) {
            return NextResponse.json(
                {
                    error: 'This verification link has expired. Please run `crabspace claim <email>` again to get a new link.'
                },
                { status: 410 }
            )
        }

        // 4. ─── X Account-Age Gate (via vxtwitter — free) ──────────────────
        // Fetches the operator's public X profile to check account creation date.
        // Requires account to be at least 30 days old to prevent throwaway accounts.
        // Uses the same api.vxtwitter.com service as tweet verification — no API key needed.
        let userJoinedDate: Date | null = null
        try {
            const profileRes = await fetch(`https://api.vxtwitter.com/${xHandle}`, {
                headers: { 'User-Agent': 'CrabSpace-Verification-Bot/1.0' }
            })
            if (profileRes.ok) {
                const profileData = await profileRes.json()
                // vxtwitter returns `user.joined` as a Twitter-format date string
                // e.g. "Tue Feb 20 14:35:54 +0000 2007"
                const joinedStr = profileData?.user?.joined || profileData?.joined
                if (joinedStr) {
                    userJoinedDate = new Date(joinedStr)
                }
            }
        } catch (profileErr) {
            // Non-blocking: if vxtwitter is down, we skip the age gate rather than
            // blocking legitimate operators. Log for monitoring.
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

        // 5. Extract Tweet ID from URL
        // e.g. https://x.com/username/status/1831032174313206263
        const match = tweetUrl.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i)
        if (!match || !match[1]) {
            return NextResponse.json({ error: 'Invalid X URL format' }, { status: 400 })
        }
        const tweetId = match[1]

        // 6. Fetch tweet data via free api.vxtwitter.com
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

        // 7. ─── Validation Logic ─────────────────────────────────────────────
        const fetchedText: string = vxData.text || ''
        const fetchedAuthor: string = vxData.user_screen_name || ''

        // Rule A: Tweet author must match the authenticated X user
        if (fetchedAuthor.toLowerCase() !== xHandle.toLowerCase()) {
            return NextResponse.json(
                { error: `Tweet author (@${fetchedAuthor}) does not match your connected account (@${xHandle})` },
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

        // 8. ─── SUCCESS ─────────────────────────────────────────────────────
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
