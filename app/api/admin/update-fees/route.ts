import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const WORK_ENTRY_USD = 0.01
const WILL_USD = 0.25
const LAMPORTS_PER_SOL = 1_000_000_000

/**
 * GET /api/admin/update-fees
 *
 * Called daily by Vercel Cron at 6:00 AM ET.
 * Fetches SOL/USD from CoinGecko, recalculates lamport fees,
 * and writes them to the Supabase config table.
 *
 * No machine dependency. No redeploy required.
 * Auth: CRON_SECRET header (set in Vercel env vars).
 */
export async function GET(request: Request) {
    // Verify this is coming from Vercel Cron (or an authorised caller)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Fetch SOL price from CoinGecko (free tier, no key required)
        const res = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
            {
                headers: { 'User-Agent': 'crabspace-fee-updater/1.0' },
                next: { revalidate: 0 },
            }
        )

        if (!res.ok) {
            throw new Error(`CoinGecko returned ${res.status}`)
        }

        const data = await res.json()
        const solPrice: number = data?.solana?.usd

        if (!solPrice || solPrice <= 0) {
            throw new Error(`Unexpected SOL price: ${solPrice}`)
        }

        const workLamports = Math.round((WORK_ENTRY_USD / solPrice) * LAMPORTS_PER_SOL)
        const willLamports = Math.round((WILL_USD / solPrice) * LAMPORTS_PER_SOL)
        const now = new Date().toISOString()

        // Upsert all four config keys
        const updates = [
            { key: 'WORK_ENTRY_FEE_LAMPORTS', value: String(workLamports) },
            { key: 'WILL_SUCCESSION_FEE_LAMPORTS', value: String(willLamports) },
            { key: 'SOL_USD_PRICE', value: String(solPrice) },
            { key: 'FEES_LAST_UPDATED', value: now },
        ]

        const { error } = await supabase
            .from('config')
            .upsert(updates, { onConflict: 'key' })

        if (error) {
            throw new Error(`Supabase upsert failed: ${error.message}`)
        }

        const result = {
            success: true,
            solPrice,
            workLamports,
            willLamports,
            updatedAt: now,
            message: `Fees updated. SOL=$${solPrice} | Work=${workLamports.toLocaleString()} lam | Will=${willLamports.toLocaleString()} lam`,
        }

        console.log('[SOL-FEE-CRON]', result.message)
        return NextResponse.json(result)

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[SOL-FEE-CRON] Failed:', message)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}
