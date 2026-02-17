import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
    try {
        const { workId, clientWallet, signature } = await request.json()

        // Validate inputs
        if (!workId || !clientWallet) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Get work entry
        const { data: work, error: workError } = await supabase
            .from('work_journal')
            .select('*')
            .eq('id', workId)
            .single()

        if (workError || !work) {
            return NextResponse.json({ error: 'Work entry not found' }, { status: 404 })
        }

        // Verify client wallet matches
        if (work.client_wallet !== clientWallet) {
            return NextResponse.json({ error: 'Unauthorized: wallet mismatch' }, { status: 403 })
        }

        // For MVP, we'll accept any signature/confirmation
        // In production, this would verify an actual crypto signature
        const verificationSignature = signature || `verified_by_${clientWallet}_at_${Date.now()}`

        // Update work entry as verified
        const { data: updated, error: updateError } = await supabase
            .from('work_journal')
            .update({
                verified: true,
                client_signature: verificationSignature,
            })
            .eq('id', workId)
            .select()
            .single()

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            entry: updated,
            message: 'Work verified successfully!',
        })
    } catch (error) {
        console.error('Error verifying work:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
