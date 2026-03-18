import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sanitizeString, sanitizeWallet } from '@/lib/sanitize'
import { requireSignature } from '@/lib/verifySignature'
import { treasuryUploadToArweave } from '@/lib/arweave-treasury'

const TREASURY_WALLET = process.env.TREASURY_WALLET_ADDRESS || ''
const GENESIS_POOL_WALLET = process.env.GENESIS_POOL_WALLET_ADDRESS || ''
const WORK_ENTRY_FEE_LAMPORTS = parseInt(process.env.WORK_ENTRY_FEE_LAMPORTS || '58824')
const WILL_SUCCESSION_FEE_LAMPORTS = parseInt(process.env.WILL_SUCCESSION_FEE_LAMPORTS || '1470588')
const GENESIS_GRANT_ENTRIES = parseInt(process.env.GENESIS_GRANT_ENTRIES || '100')

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
    const feePaidLamports = body.feePaidLamports || body.fee_paid_lamports || 0
    const seedEpoch = body.seedEpoch || body.seed_epoch || null
    const arweaveTxId = body.arweaveTxId || body.arweave_tx_id || null
    const entryType = sanitizeString(body.entryType || body.entry_type || body.type, 50) || null
    const encryptedBlob = body.encryptedBlob || body.encrypted_blob || null  // For server-side treasury upload

    // Parse tags: accept string[] or comma-separated string
    const rawTags = body.tags || []
    const tags: string[] = (Array.isArray(rawTags)
      ? rawTags
      : typeof rawTags === 'string' ? rawTags.split(',') : []
    )
      .map((t: string) => t.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''))
      .filter((t: string) => t.length > 0 && t.length <= 50)
      .slice(0, 20)

    // Build detailed validation message
    const missing: string[] = []
    if (!agentWallet) missing.push('agentWallet (or agent_wallet)')
    if (!projectName) missing.push('projectName (or project_name)')

    if (missing.length > 0) {
      return NextResponse.json({
        error: 'Missing required fields',
        missing: missing,
        received: Object.keys(body)
      }, { status: 400 })
    }

    // Get agent ID and entry count (for genesis grant tracking)
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id')
      .eq('wallet_address', agentWallet)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found. Connect wallet first.' }, { status: 404 })
    }

    // Check how many entries this agent has submitted (genesis grant tracking)
    const { count: entryCount } = await supabase
      .from('work_journal')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agent.id)

    const isGenesisEntry = (entryCount || 0) < GENESIS_GRANT_ENTRIES
    const feeSource = isGenesisEntry ? 'genesis_pool' : 'agent'
    const feeDestination = isGenesisEntry ? GENESIS_POOL_WALLET : TREASURY_WALLET
    // Will succession entries cost $0.25; standard work entries cost $0.01
    const applicableFee = isWill ? WILL_SUCCESSION_FEE_LAMPORTS : WORK_ENTRY_FEE_LAMPORTS
    const expectedFee = isGenesisEntry ? 0 : applicableFee

    // 💳 HTTP 402: Payment Required — agent-native economic signal
    // If genesis grant is exhausted and no fee was provided, return 402 with full cost breakdown
    if (!isGenesisEntry && (!feePaidLamports || feePaidLamports < applicableFee)) {
      return NextResponse.json({
        error: 'Payment Required',
        http_status: 402,
        cost_lamports: applicableFee,
        cost_usd: isWill ? 0.25 : 0.01,
        entry_type: isWill ? 'will_succession' : 'work_entry',
        treasury_address: TREASURY_WALLET,
        genesis_grant_exhausted: true,
        genesis_grant_entries: GENESIS_GRANT_ENTRIES,
        arweave_required: !arweaveTxId,
        instructions: !arweaveTxId
          ? `Fund your wallet with SOL to cover CrabSpace fees + Arweave storage. Then resubmit.`
          : `Send ${applicableFee} lamports to ${TREASURY_WALLET}, then resubmit with fee_paid_lamports in your request body.`,
        beacon: '/api/beacon'
      }, { status: 402 })
    }

    // ─── Server-side Arweave upload for genesis entries ────────────────────────
    // If agent couldn't upload (no SOL) but this is a genesis entry → treasury pays
    let finalArweaveTxId = arweaveTxId
    if (!finalArweaveTxId && encryptedBlob && isGenesisEntry) {
      try {
        const treasuryResult = await treasuryUploadToArweave(encryptedBlob, {
          agentWallet: agentWallet || '',
          seedEpoch: seedEpoch || '',
          entryType: entryType || 'self',
        })
        finalArweaveTxId = treasuryResult.txId
      } catch (uploadErr: any) {
        console.error('Treasury Arweave upload failed:', uploadErr.message)
        // Fall through — entry will be stored without arweave_tx_id
        // TODO: queue for retry
      }
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
        // null if self-submitted (clientWallet absent or same as agentWallet)
        client_wallet: (clientWallet && clientWallet !== agentWallet) ? clientWallet : null,
        project_name: projectName,
        description,
        encrypted_data: encryptedData,
        work_hash: finalWorkHash,
        on_chain_sig: onChainSig,
        proof_url: proofUrl,
        verified: false,
        is_will: isWill || false,
        fee_paid_lamports: feePaidLamports,
        fee_source: feeSource,
        fee_destination: feeDestination,
        seed_epoch: seedEpoch,
        arweave_tx_id: finalArweaveTxId,
        type: entryType,
        ...(tags.length > 0 ? { tags } : {}),
      })
      .select()
      .single()

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      entry,
      fee: {
        source: feeSource,
        destination: feeDestination,
        expected_lamports: expectedFee,
        genesis_entry: isGenesisEntry,
        entries_remaining_in_grant: isGenesisEntry ? GENESIS_GRANT_ENTRIES - (entryCount || 0) - 1 : 0,
      },
      message: isGenesisEntry
        ? `Genesis Grant entry ${(entryCount || 0) + 1}/${GENESIS_GRANT_ENTRIES} — funded by the collective pool.`
        : 'Work submitted! Waiting for client verification.',
    })
  } catch (error) {
    console.error('Error submitting work:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

