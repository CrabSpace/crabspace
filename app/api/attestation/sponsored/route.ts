import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeWallet } from '@/lib/sanitize'
import { Keypair } from '@solana/web3.js'
import { generateWorkHash } from '@/lib/attribution'

const GENESIS_POOL_WALLET = process.env.GENESIS_POOL_WALLET_ADDRESS || ''

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const targetWallet = sanitizeWallet(body.wallet)
        const sessionToken = request.headers.get('Authorization')?.replace('Bearer ', '')

        if (!targetWallet || !sessionToken) {
            return NextResponse.json({ error: 'Missing wallet or authentication token' }, { status: 400 })
        }

        // Verify the user's Supabase session 
        const { data: { user }, error: userError } = await supabase.auth.getUser(sessionToken)
        if (userError || !user) {
            return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
        }

        // Get target agent
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('id')
            .eq('wallet_address', targetWallet)
            .single()

        if (agentError || !agent) {
            return NextResponse.json({ error: 'Target agent not found' }, { status: 404 })
        }

        // Ensure this user hasn't already vouched for this agent
        // We use the Supabase Auth User ID to prevent spam, while hiding it from the public UI
        const deduplicationProject = `vouch_${user.id}`
        const { count: priorVouches } = await supabase
            .from('work_journal')
            .select('id', { count: 'exact', head: true })
            .eq('agent_id', agent.id)
            .eq('project_name', deduplicationProject)

        if (priorVouches && priorVouches > 0) {
            return NextResponse.json({ error: 'You have already verified this agent' }, { status: 429 })
        }

        // Enforce a strict 3-vouch lifetime limit per human
        const { count: lifetimeVouches } = await supabase
            .from('work_journal')
            .select('id', { count: 'exact', head: true })
            .eq('project_name', deduplicationProject)

        if (lifetimeVouches && lifetimeVouches >= 3) {
            return NextResponse.json({ error: 'You have reached your lifetime limit of 3 sponsored attestations. To attest to more agents, you must anchor your own agent to the network.' }, { status: 429 })
        }

        // Get the social handle
        let socialHandle = user.email ? (user.email.split('@')[0]) : 'Human'
        if (user.user_metadata?.user_name) {
            socialHandle = `@${user.user_metadata.user_name}`
        } else if (user.user_metadata?.preferred_username) {
            socialHandle = `@${user.user_metadata.preferred_username}`
        }

        // Generate an ephemeral throwaway keypair for the attester (we still need this for the hypothetical on-chain sigs if we do client signing later)
        const ephemeralKeypair = Keypair.generate()
        const clientWallet = ephemeralKeypair.publicKey.toBase58()

        // Generate the attribution hash
        const workHash = generateWorkHash({
            agentId: agent.id,
            walletAddress: targetWallet,
            projectName: deduplicationProject,
            description: 'Anonymous Human Verification',
            timestamp: Date.now()
        })

        // Insert the verified attestation into the work journal
        // The transaction fee is "sponsored" by the Genesis Pool
        const { data: entry, error: createError } = await supabase
            .from('work_journal')
            .insert({
                agent_id: agent.id,
                client_wallet: socialHandle,
                project_name: deduplicationProject, // Hidden identity deduplication string
                description: `Human Verification via social oath (${socialHandle}). Sponsored by Genesis Purse.`,
                work_hash: workHash,
                verified: true,
                fee_paid_lamports: 5000,
                fee_source: 'genesis_pool',
                fee_destination: GENESIS_POOL_WALLET,
            })
            .select()
            .single()

        if (createError) {
            return NextResponse.json({ error: createError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            entry,
            ephemeralWallet: clientWallet,
            sponsoredBy: 'Genesis Purse'
        })
    } catch (error) {
        console.error('Error processing sponsored attestation:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
