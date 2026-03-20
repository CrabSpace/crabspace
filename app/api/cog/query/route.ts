import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

/**
 * GET /api/cog/query — COG Pack Discovery
 *
 * Returns matching entry metadata based on tag queries.
 * Never exposes encrypted content. This is the public discovery layer.
 *
 * Query params:
 *   tags    — comma-separated tags (required)
 *   match   — 'any' (OR, default) or 'all' (AND)
 *   source  — filter by source type (live, derived, archive)
 *   wallet  — filter by agent wallet
 *   limit   — max entries (default 100, max 500)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Parse tags
    const tagsParam = searchParams.get('tags')
    if (!tagsParam) {
      return NextResponse.json(
        { error: 'Missing required parameter: tags' },
        { status: 400 }
      )
    }

    const tags = tagsParam
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0 && t.length <= 50)

    if (tags.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid tag is required' },
        { status: 400 }
      )
    }

    const matchMode = searchParams.get('match') || 'any'
    const sourceFilter = searchParams.get('source')
    const walletFilter = searchParams.get('wallet')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)

    // Build query using tag array operators
    // ANY match: tags && ARRAY[...] (overlap — has at least one)
    // ALL match: tags @> ARRAY[...] (contains all)
    const tagOperator = matchMode === 'all' ? '@>' : '&&'

    // Use RPC call for tag array matching (Supabase JS doesn't support array operators directly)
    let rpcQuery = `
      SELECT
        wj.id,
        wj.tags,
        wj.summary,
        wj.source,
        wj.source_author,
        wj.created_at,
        wj.type,
        a.wallet_address as agent_wallet,
        a.name as agent_name
      FROM work_journal wj
      JOIN agents a ON wj.agent_id = a.id
      WHERE wj.tags ${tagOperator} $1::text[]
    `

    const params: any[] = [tags]
    let paramIdx = 2

    if (sourceFilter) {
      rpcQuery += ` AND wj.source = $${paramIdx}`
      params.push(sourceFilter)
      paramIdx++
    }

    if (walletFilter) {
      rpcQuery += ` AND a.wallet_address = $${paramIdx}`
      params.push(walletFilter)
      paramIdx++
    }

    rpcQuery += ` ORDER BY wj.created_at DESC LIMIT $${paramIdx}`
    params.push(limit)

    // Execute raw SQL via Supabase RPC
    const { data: entries, error } = await supabase.rpc('execute_cog_query', {
      query_tags: tags,
      match_all: matchMode === 'all',
      source_filter: sourceFilter || null,
      wallet_filter: walletFilter || null,
      result_limit: limit,
    })

    if (error) {
      console.error('COG query error:', error)
      return NextResponse.json(
        { error: 'Query failed', details: error.message },
        { status: 500 }
      )
    }

    // Compute tag distribution and contributor breakdown
    const tagDistribution: Record<string, number> = {}
    const contributorMap: Record<string, { wallet: string; name: string; entries: number }> = {}

    for (const entry of entries || []) {
      // Tag distribution
      for (const tag of entry.tags || []) {
        tagDistribution[tag] = (tagDistribution[tag] || 0) + 1
      }
      // Contributor breakdown
      const wallet = entry.agent_wallet
      if (!contributorMap[wallet]) {
        contributorMap[wallet] = { wallet, name: entry.agent_name || 'Unknown', entries: 0 }
      }
      contributorMap[wallet].entries++
    }

    // Sort tag distribution descending
    const sortedTags = Object.fromEntries(
      Object.entries(tagDistribution).sort((a, b) => b[1] - a[1])
    )

    return NextResponse.json({
      entries: (entries || []).map((e: any) => ({
        id: e.id,
        tags: e.tags,
        summary: e.summary,
        source: e.source,
        source_author: e.source_author,
        type: e.type,
        agent_wallet: e.agent_wallet,
        agent_name: e.agent_name,
        created_at: e.created_at,
      })),
      total: (entries || []).length,
      query: { tags, match: matchMode, source: sourceFilter, wallet: walletFilter },
      tag_distribution: sortedTags,
      contributors: Object.values(contributorMap),
    })

  } catch (err: any) {
    console.error('COG query error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
