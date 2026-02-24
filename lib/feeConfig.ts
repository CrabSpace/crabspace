import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const LAMPORTS_PER_SOL = 1_000_000_000

// Fallback values — used if Supabase is unreachable
// Recalculated 2026-02-24 at SOL=$78.15
const FALLBACK_WORK_LAMPORTS = 127959
const FALLBACK_WILL_LAMPORTS = 3198976

interface FeeConfig {
    workEntryLamports: number
    willSuccessionLamports: number
    solUsdPrice: number | null
    source: 'supabase' | 'fallback'
}

/**
 * Fetches current fee values from Supabase config table.
 * Falls back to hardcoded values if the DB is unreachable.
 *
 * Use this in any route that needs to quote or validate fee amounts.
 */
export async function getFeeConfig(): Promise<FeeConfig> {
    try {
        const { data, error } = await supabase
            .from('config')
            .select('key, value')
            .in('key', ['WORK_ENTRY_FEE_LAMPORTS', 'WILL_SUCCESSION_FEE_LAMPORTS', 'SOL_USD_PRICE'])

        if (error || !data?.length) {
            throw new Error(error?.message ?? 'No config rows returned')
        }

        const map = Object.fromEntries(data.map(r => [r.key, r.value]))

        return {
            workEntryLamports: parseInt(map['WORK_ENTRY_FEE_LAMPORTS'] ?? '') || FALLBACK_WORK_LAMPORTS,
            willSuccessionLamports: parseInt(map['WILL_SUCCESSION_FEE_LAMPORTS'] ?? '') || FALLBACK_WILL_LAMPORTS,
            solUsdPrice: parseFloat(map['SOL_USD_PRICE'] ?? '') || null,
            source: 'supabase',
        }
    } catch (err) {
        console.warn('[getFeeConfig] Falling back to hardcoded values:', err)
        return {
            workEntryLamports: FALLBACK_WORK_LAMPORTS,
            willSuccessionLamports: FALLBACK_WILL_LAMPORTS,
            solUsdPrice: null,
            source: 'fallback',
        }
    }
}

export function lamportsToSol(lamports: number): number {
    return lamports / LAMPORTS_PER_SOL
}
