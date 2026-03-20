/**
 * COG Pack Pricing — Shared pricing logic
 *
 * Used by /api/cog/assemble to generate pricing and contributor splits.
 * Extracted to a module so pricing rules are consistent across endpoints.
 */

const LAMPORTS_PER_SOL = 1_000_000_000

// ─── Pricing tiers ──────────────────────────────────────────────────────────
// v1: Simple per-entry pricing with a minimum floor.
// $0 test phase — prices are calculated but not charged.
const BASE_PRICE_LAMPORTS = 500_000       // ~$0.07 floor at $170/SOL
const PER_ENTRY_LAMPORTS = 5_000          // ~$0.0007 per entry
const SOL_USD_ESTIMATE = 170              // Fallback; real-time price from DB later

interface PackPricing {
  lamports: number
  sol: string
  usd_estimate: string
  entry_count: number
  per_entry_lamports: number
  pricing_model: string
}

/**
 * Calculate the price for a COG pack based on entry count.
 *
 * v1 formula: max(base_price, entries * per_entry_rate)
 * This means very small packs default to the base price,
 * and large packs scale linearly.
 */
export function calculatePackPrice(entryCount: number): PackPricing {
  const scaledPrice = entryCount * PER_ENTRY_LAMPORTS
  const lamports = Math.max(BASE_PRICE_LAMPORTS, scaledPrice)
  const sol = lamports / LAMPORTS_PER_SOL
  const usd = sol * SOL_USD_ESTIMATE

  return {
    lamports,
    sol: sol.toFixed(9),
    usd_estimate: `$${usd.toFixed(2)}`,
    entry_count: entryCount,
    per_entry_lamports: PER_ENTRY_LAMPORTS,
    pricing_model: 'v1-per-entry',
  }
}

interface ContributorShare {
  wallet: string
  name: string
  entries: number
  share_pct: number
}

/**
 * Calculate revenue shares based on entry contribution.
 * Each contributor gets a proportional share based on entry count.
 */
export function calculateRevenueShare(
  entryContributors: { wallet: string; name: string }[]
): ContributorShare[] {
  const total = entryContributors.length
  if (total === 0) return []

  const counts: Record<string, { name: string; count: number }> = {}
  for (const { wallet, name } of entryContributors) {
    if (!counts[wallet]) {
      counts[wallet] = { name, count: 0 }
    }
    counts[wallet].count++
  }

  return Object.entries(counts)
    .map(([wallet, { name, count }]) => ({
      wallet,
      name,
      entries: count,
      share_pct: Math.round((count / total) * 10000) / 100, // 2 decimal places
    }))
    .sort((a, b) => b.entries - a.entries)
}
