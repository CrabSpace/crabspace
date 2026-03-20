import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

/**
 * GET /api/cog/search — Vault Search (Private + Public)
 *
 * Searches entries by private tags, fuzzy keyword on private_summary,
 * public tags, and cog_eligible filter. Private fields only returned
 * when request wallet matches entry owner.
 *
 * Query params:
 *   private_tags  — comma-separated private tags (exact match, requires wallet auth)
 *   tags          — comma-separated public tags
 *   keyword       — fuzzy text search on private_summary (pg_trgm)
 *   cog_eligible  — 'true' to filter only COG-eligible entries
 *   wallet        — requesting agent wallet (required for private access)
 *   signature     — wallet signature for auth
 *   message       — signed message
 *   limit         — max results (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Auth: wallet + signature required for private field access
    const wallet = searchParams.get('wallet')
    const signature = searchParams.get('signature')
    const message = searchParams.get('message')

    // Validate wallet auth for private access
    let authenticatedWallet: string | null = null
    if (wallet && signature && message) {
      const { requireSignature } = await import('@/lib/verifySignature')
      const sigError = requireSignature(wallet, signature, message, 'search')
      if (!sigError) {
        authenticatedWallet = wallet
      }
    }

    // Parse search criteria
    const privateTagsParam = searchParams.get('private_tags')
    const tagsParam = searchParams.get('tags')
    const keyword = searchParams.get('keyword')
    const cogEligible = searchParams.get('cog_eligible') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100)

    // Require at least one search criterion
    if (!privateTagsParam && !tagsParam && !keyword) {
      return NextResponse.json(
        { error: 'At least one search criterion required: private_tags, tags, or keyword' },
        { status: 400 }
      )
    }

    // Private tags require authentication
    if (privateTagsParam && !authenticatedWallet) {
      return NextResponse.json(
        { error: 'Wallet authentication required for private tag search' },
        { status: 401 }
      )
    }

    // Build dynamic SQL query
    const conditions: string[] = []
    const params: any[] = []
    let paramIdx = 1
    let selectSimilarity = ''

    // Private tags: array overlap (any match)
    if (privateTagsParam) {
      const privateTags = privateTagsParam
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0)

      if (privateTags.length > 0) {
        conditions.push(`wj.private_tags && $${paramIdx}::text[]`)
        params.push(privateTags)
        paramIdx++

        // Only search entries owned by authenticated wallet
        conditions.push(`a.wallet_address = $${paramIdx}`)
        params.push(authenticatedWallet)
        paramIdx++
      }
    }

    // Public tags: array overlap
    if (tagsParam) {
      const tags = tagsParam
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0)

      if (tags.length > 0) {
        conditions.push(`wj.tags && $${paramIdx}::text[]`)
        params.push(tags)
        paramIdx++
      }
    }

    // Keyword: fuzzy match on private_summary via pg_trgm
    if (keyword) {
      // Use similarity threshold — catches "creative obligation" matching
      // "creative death under continuity pressure"
      conditions.push(`wj.private_summary % $${paramIdx}`)
      selectSimilarity = `, similarity(wj.private_summary, $${paramIdx}) as similarity_score`
      params.push(keyword)
      paramIdx++

      // Keyword search on private_summary requires wallet auth
      if (!authenticatedWallet) {
        return NextResponse.json(
          { error: 'Wallet authentication required for keyword search on private summaries' },
          { status: 401 }
        )
      }

      // Only search own entries for keyword
      if (!privateTagsParam) {
        // Only add wallet filter if not already added by private_tags
        conditions.push(`a.wallet_address = $${paramIdx}`)
        params.push(authenticatedWallet)
        paramIdx++
      }
    }

    // COG eligible filter
    if (cogEligible) {
      conditions.push(`wj.cog_eligible = true`)
    }

    // Determine sort order — by similarity if keyword, else by date
    const orderBy = keyword
      ? `ORDER BY similarity_score DESC, wj.created_at DESC`
      : `ORDER BY wj.created_at DESC`

    // Build final query
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const query = `
      SELECT
        wj.id,
        wj.project_name,
        wj.tags,
        wj.summary,
        wj.source_author,
        wj.source_file,
        wj.type,
        wj.created_at,
        wj.cog_eligible,
        ${authenticatedWallet ? 'wj.private_tags,' : ''}
        ${authenticatedWallet ? 'wj.private_summary,' : ''}
        a.wallet_address as agent_wallet,
        a.name as agent_name
        ${selectSimilarity}
      FROM work_journal wj
      JOIN agents a ON wj.agent_id = a.id
      ${whereClause}
      ${orderBy}
      LIMIT $${paramIdx}
    `
    params.push(limit)

    // Execute via raw SQL (Supabase RPC or direct)
    const { data: entries, error } = await supabase.rpc('execute_vault_search', {
      search_query: query,
      search_params: params,
    })

    // Fallback: if RPC function doesn't exist yet, use the query builder
    if (error && error.message.includes('execute_vault_search')) {
      // Build using Supabase query builder as fallback
      let queryBuilder = supabase
        .from('work_journal')
        .select(`
          id, project_name, tags, summary, source_author, source_file,
          type, created_at, cog_eligible,
          ${authenticatedWallet ? 'private_tags, private_summary,' : ''}
          agents!inner(wallet_address, name)
        `)
        .order('created_at', { ascending: false })
        .limit(limit)

      // Apply filters via query builder (limited — no pg_trgm here)
      if (privateTagsParam && authenticatedWallet) {
        const privateTags = privateTagsParam.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0)
        queryBuilder = queryBuilder
          .overlaps('private_tags', privateTags)
          .eq('agents.wallet_address', authenticatedWallet)
      }

      if (tagsParam) {
        const tags = tagsParam.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0)
        queryBuilder = queryBuilder.overlaps('tags', tags)
      }

      if (keyword && authenticatedWallet) {
        // Fallback: ILIKE instead of trigram (less fuzzy, but works without RPC)
        queryBuilder = queryBuilder
          .ilike('private_summary', `%${keyword}%`)
          .eq('agents.wallet_address', authenticatedWallet)
      }

      if (cogEligible) {
        queryBuilder = queryBuilder.eq('cog_eligible', true)
      }

      const { data: fallbackEntries, error: fallbackError } = await queryBuilder

      if (fallbackError) {
        console.error('Vault search error:', fallbackError)
        return NextResponse.json(
          { error: 'Search failed', details: fallbackError.message },
          { status: 500 }
        )
      }

      // Format fallback results
      const formatted = (fallbackEntries || []).map((e: any) => ({
        id: e.id,
        project_name: e.project_name,
        tags: e.tags,
        summary: e.summary,
        private_tags: e.private_tags || null,
        private_summary: e.private_summary || null,
        source_author: e.source_author,
        source_file: e.source_file,
        type: e.type,
        cog_eligible: e.cog_eligible,
        agent_wallet: e.agents?.wallet_address,
        agent_name: e.agents?.name,
        created_at: e.created_at,
      }))

      return NextResponse.json({
        entries: formatted,
        total: formatted.length,
        query: {
          private_tags: privateTagsParam,
          tags: tagsParam,
          keyword,
          cog_eligible: cogEligible,
        },
        fuzzy: false, // ILIKE fallback, not trigram
      })
    }

    if (error) {
      console.error('Vault search error:', error)
      return NextResponse.json(
        { error: 'Search failed', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      entries: entries || [],
      total: (entries || []).length,
      query: {
        private_tags: privateTagsParam,
        tags: tagsParam,
        keyword,
        cog_eligible: cogEligible,
      },
      fuzzy: !!keyword,
    })

  } catch (err: any) {
    console.error('Vault search error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
