import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * PATCH /api/work/anchor
 * Updates an existing work entry with an on-chain transaction signature.
 * Called after successful Solana anchoring to link the DB entry to its TX.
 */
export async function PATCH(request: NextRequest) {
    try {
        const { workId, onChainSig } = await request.json()

        if (!workId || !onChainSig) {
            return NextResponse.json(
                { error: 'Missing required fields: workId, onChainSig' },
                { status: 400 }
            )
        }

        // Update the existing work entry with the on-chain signature
        const { data: updated, error: updateError } = await supabase
            .from('work_journal')
            .update({ on_chain_sig: onChainSig })
            .eq('id', workId)
            .select()
            .single()

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        if (!updated) {
            return NextResponse.json({ error: 'Work entry not found' }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            entry: updated,
            message: 'On-chain signature linked to work entry.',
        })
    } catch (error) {
        console.error('Error anchoring work entry:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
