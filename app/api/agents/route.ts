import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')
    const ownerWallet = searchParams.get('ownerWallet')

    // ── List all agents for an owner wallet (My Agents on account page) ──
    if (ownerWallet) {
        const { data: agents, error } = await supabase
            .from('agents')
            .select('wallet_address, name, claimed_at, created_at, total_work_entries')
            .eq('owner_wallet', ownerWallet)
            .order('created_at', { ascending: false })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json({ agents: agents || [] })
    }

    if (!walletAddress) {
        return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
    }

    try {
        // Get agent data
        const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('*')
            .eq('wallet_address', walletAddress)
            .single()

        if (agentError || !agent) {
            return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
        }

        // Get work journal
        const { data: workJournal, error: workError } = await supabase
            .from('work_journal')
            .select('*')
            .eq('agent_id', agent.id)
            .order('created_at', { ascending: false })

        if (workError) {
            return NextResponse.json({ error: workError.message }, { status: 500 })
        }

        // Get incoming attestations (friend requests)
        // Find all work entries where client_wallet == walletAddress
        const { data: incomingEntries, error: incomingError } = await supabase
            .from('work_journal')
            .select('*, agents(wallet_address)')
            .eq('client_wallet', walletAddress)
            .order('created_at', { ascending: false })

        if (incomingError) {
            console.error('Error fetching incoming:', incomingError)
        }

        return NextResponse.json({
            agent,
            workJournal: workJournal || [],
            incomingAttestations: incomingEntries || [],
        })
    } catch (error) {
        console.error('Error fetching agent:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
