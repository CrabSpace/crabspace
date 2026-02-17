import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')

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

        return NextResponse.json({
            agent,
            workJournal: workJournal || [],
        })
    } catch (error) {
        console.error('Error fetching agent:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
