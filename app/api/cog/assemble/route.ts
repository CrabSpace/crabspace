import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { calculatePackPrice, calculateRevenueShare } from '@/lib/cogPricing'

/**
 * POST /api/cog/assemble — Assemble a COG Pack from selected entries
 *
 * Takes a list of entry IDs (from /api/cog/query results), validates them,
 * generates a manifest with pricing and contributor breakdown, and stores
 * the pack in the database.
 *
 * Request body:
 *   entry_ids   — array of UUIDs (required)
 *   name        — pack name (required, max 200 chars)
 *   description — pack description (optional, max 1000 chars)
 *   creator_wallet — wallet of the person assembling (required)
 *   tag_query   — original tags used to find these entries (optional, for reference)
 *   match_mode  — original match mode used (optional)
 */
export async function POST(request: NextRequest) {
  try {
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { entry_ids, name, description, creator_wallet, tag_query, match_mode } = body

    // Validate required fields
    if (!entry_ids || !Array.isArray(entry_ids) || entry_ids.length === 0) {
      return NextResponse.json(
        { error: 'entry_ids is required and must be a non-empty array of UUIDs' },
        { status: 400 }
      )
    }

    if (!name || typeof name !== 'string' || name.length > 200) {
      return NextResponse.json(
        { error: 'name is required (max 200 chars)' },
        { status: 400 }
      )
    }

    if (!creator_wallet || typeof creator_wallet !== 'string') {
      return NextResponse.json(
        { error: 'creator_wallet is required' },
        { status: 400 }
      )
    }

    if (entry_ids.length > 500) {
      return NextResponse.json(
        { error: 'Maximum 500 entries per pack' },
        { status: 400 }
      )
    }

    // Fetch the actual entries to validate they exist and get metadata
    const { data: entries, error: fetchError } = await supabase
      .from('work_journal')
      .select('id, tags, summary, source, source_author, type, created_at, agent_id, agents!inner(wallet_address, name)')
      .in('id', entry_ids)

    if (fetchError) {
      console.error('COG assemble fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch entries', details: fetchError.message },
        { status: 500 }
      )
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json(
        { error: 'No valid entries found for the provided IDs' },
        { status: 404 }
      )
    }

    // Warn about missing entries
    const foundIds = new Set(entries.map((e: any) => e.id))
    const missingIds = entry_ids.filter((id: string) => !foundIds.has(id))

    // Calculate pricing
    const pricing = calculatePackPrice(entries.length)

    // Calculate contributor breakdown
    const contributors = calculateRevenueShare(entries.map((e: any) => ({
      wallet: e.agents?.wallet_address || 'unknown',
      name: e.agents?.name || 'Unknown',
    })))

    // Build tag distribution
    const tagDistribution: Record<string, number> = {}
    const sourceAuthors = new Set<string>()
    for (const entry of entries) {
      for (const tag of (entry as any).tags || []) {
        tagDistribution[tag] = (tagDistribution[tag] || 0) + 1
      }
      if ((entry as any).source_author) {
        sourceAuthors.add((entry as any).source_author)
      }
    }

    const sortedTags = Object.fromEntries(
      Object.entries(tagDistribution).sort((a, b) => b[1] - a[1])
    )

    // Store the pack in the database
    const { data: pack, error: insertError } = await supabase
      .from('cog_packs')
      .insert({
        name: name.trim(),
        description: description?.trim()?.slice(0, 1000) || null,
        model: 'snapshot',
        entry_ids: entries.map((e: any) => e.id),
        tag_query: tag_query || null,
        match_mode: match_mode || 'any',
        price_lamports: pricing.lamports,
        creator_wallet,
      })
      .select('id, created_at')
      .single()

    if (insertError) {
      console.error('COG assemble insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to save pack', details: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      manifest: {
        pack_id: pack.id,
        name: name.trim(),
        description: description?.trim() || null,
        version: '1.0',
        model: 'snapshot',
        entry_count: entries.length,
        tag_distribution: sortedTags,
        unique_tags: Object.keys(sortedTags).length,
        contributors,
        source_authors: Array.from(sourceAuthors),
        created_at: pack.created_at,
        entries: entries.map((e: any) => ({
          id: e.id,
          tags: e.tags,
          summary: e.summary,
          source: e.source,
          source_author: e.source_author,
          type: e.type,
          created_at: e.created_at,
        })),
      },
      pricing,
      missing_ids: missingIds.length > 0 ? missingIds : undefined,
    })

  } catch (err: any) {
    console.error('COG assemble error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
