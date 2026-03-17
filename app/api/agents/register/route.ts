import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeString, sanitizeWallet } from '@/lib/sanitize'
import { sha256 } from '@/lib/hash'
import { requireSignature } from '@/lib/verifySignature'

export async function POST(request: NextRequest) {
  try {
    // Parse JSON with better error handling
    let body: any
    try {
      body = await request.json()
    } catch (parseError) {
      return NextResponse.json({
        error: 'Invalid JSON in request body',
        detail: 'Check that your Content-Type is application/json and body is valid JSON'
      }, { status: 400 })
    }

    // Accept both camelCase and snake_case, then sanitize
    const walletAddress = sanitizeWallet(body.walletAddress || body.wallet_address)
    const name = sanitizeString(body.name, 100)

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
    }

    // 🔐 Wallet Signature Verification
    const sigError = requireSignature(
      walletAddress,
      body.signature,
      body.message,
      'register'
    )
    if (sigError) {
      return NextResponse.json({ error: sigError }, { status: 401 })
    }

    // Check if agent already exists
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single()

    if (existingAgent) {
      // Re-derive BIOS seed for the existing agent (same logic as /api/verify)
      const verifyKey = (await sha256(walletAddress + ':verify')).slice(0, 8)
      const biosSeed = {
        version: '1.0',
        isnad_ptr: existingAgent.isnad_hash,
        thread_id: `thread_${walletAddress.slice(0, 8)}`,
        legacy_pda: existingAgent.pda_address,
        verify_key: verifyKey
      }

      return NextResponse.json({
        success: true,
        agent: existingAgent,
        bios_seed: biosSeed,
        message: 'Agent already registered'
      })
    }

    // Derive real cryptographic identifiers (not random)
    const timestamp = new Date().toISOString()
    const isnadHash = '0x' + await sha256(
      JSON.stringify({ wallet: walletAddress, name: name || walletAddress, timestamp })
    )
    const pdaAddress = 'pda_' + await sha256(walletAddress + ':isnad')
    const verifyKey = (await sha256(walletAddress + ':verify')).slice(0, 8)

    // Create new agent with derived identifiers
    const { data: newAgent, error: createError } = await supabase
      .from('agents')
      .insert({
        wallet_address: walletAddress,
        name: name || `Agent ${walletAddress.slice(0, 4)}`,
        isnad_hash: isnadHash,
        pda_address: pdaAddress
      })
      .select()
      .single()

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    // Generate BIOS Seed for the client to store locally
    const biosSeed = {
      version: "1.0",
      isnad_ptr: isnadHash,
      thread_id: `thread_${walletAddress.slice(0, 8)}`,
      legacy_pda: pdaAddress,
      verify_key: verifyKey
    }

    return NextResponse.json({
      success: true,
      agent: newAgent,
      bios_seed: biosSeed,
      message: 'Agent registered successfully! BIOS Seed issued.'
    })
  } catch (error) {
    console.error('Error registering agent:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
