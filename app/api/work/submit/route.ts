import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sanitizeString, sanitizeWallet } from '@/lib/sanitize'
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
    const agentWallet = sanitizeWallet(body.agentWallet || body.agent_wallet)

    // 🔐 Wallet Signature Verification
    const sigError = requireSignature(
      agentWallet || '',
      body.signature,
      body.message,
      'submit'
    )
    if (sigError) {
      return NextResponse.json({ error: sigError }, { status: 401 })
    }

    // Accept remaining fields
    const clientWallet = sanitizeWallet(body.clientWallet || body.client_wallet)
    const projectName = sanitizeString(body.projectName || body.project_name, 200)
    const description = sanitizeString(body.description, 5000)

    const proofUrl = sanitizeString(body.proofUrl || body.proof_url, 500)
    const workHash = body.workHash || body.work_hash  // Hash is validated, not sanitized
    const encryptedData = body.encryptedData || body.encrypted_data  // Encrypted payload, pass through
    const onChainSig = body.onChainSig || body.on_chain_sig
    const isWill = body.isWill || body.is_will

    // Build detailed validation message
    const missing: string[] = []
    if (!agentWallet) missing.push('agentWallet (or agent_wallet)')
    if (!projectName) missing.push('projectName (or project_name)')

    if (!clientWallet && !isWill) missing.push('clientWallet (or client_wallet) OR isWill=true')

    if (missing.length > 0) {
      return NextResponse.json({
        error: 'Missing required fields',
        missing: missing,
        received: Object.keys(body)
      }, { status: 400 })
    }



    // Get agent ID
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id')
      .eq('wallet_address', agentWallet)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found. Connect wallet first.' }, { status: 404 })
    }

    // Use canonical hashing if none provided by client
    // This ensures every entry HAS a hash for the Isnad chain
    let finalWorkHash = workHash
    if (!finalWorkHash) {
      const { generateWorkHash } = await import('@/lib/attribution')
      finalWorkHash = generateWorkHash({
        agentId: agent.id,
        walletAddress: agentWallet,
        projectName,
        description: description || '',
        timestamp: Date.now()
      })
    }

    // Create work journal entry
    const { data: entry, error: createError } = await supabase
      .from('work_journal')
      .insert({
        agent_id: agent.id,
        client_wallet: clientWallet || (isWill ? 'N/A' : ''),
        project_name: projectName,
        description,
        encrypted_data: encryptedData,

        work_hash: finalWorkHash,
        on_chain_sig: onChainSig,
        proof_url: proofUrl,
        verified: false,
        is_will: isWill || false
      })
      .select()
      .single()

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      entry,
      message: 'Work submitted! Waiting for client verification.',
    })
  } catch (error) {
    console.error('Error submitting work:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
