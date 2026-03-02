import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const token = searchParams.get('token')

        if (!token) {
            return NextResponse.json({ error: 'Missing token' }, { status: 400 })
        }

        // Decode token — same encoding as email route: Buffer.from(uuid).toString('base64')
        let claimId: string
        try {
            claimId = Buffer.from(token, 'base64').toString('utf8')
        } catch {
            return NextResponse.json({ error: 'Invalid verification link.' }, { status: 400 })
        }

        const supabaseAdmin = getAdmin()

        const { data, error } = await supabaseAdmin
            .from('operator_claims')
            .select('id, agent_wallet, email, status, verification_code, created_at')
            .eq('id', claimId)
            .single()

        if (error || !data) {
            return NextResponse.json({ error: 'Claim not found or expired.' }, { status: 404 })
        }

        if (data.status === 'claimed') {
            return NextResponse.json({ error: 'This agent has already been claimed.' }, { status: 400 })
        }

        // Mark email as verified
        if (data.status === 'pending') {
            await supabaseAdmin
                .from('operator_claims')
                .update({ status: 'email_verified' })
                .eq('id', claimId)
        }

        return NextResponse.json({ claim: data })

    } catch (error) {
        console.error('Claim lookup error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
