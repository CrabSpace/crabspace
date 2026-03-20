import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { sha256 } from '@/lib/hash'

/**
 * GET /api/cog/read — Server-side decryption for COG Pack access
 *
 * Fetches encrypted entries from Arweave/Supabase, decrypts server-side
 * using the agent's derived BIOS seed, and returns plaintext over HTTPS.
 * Buyer never receives encryption keys.
 *
 * Query params:
 *   pack_id   — COG pack UUID (required)
 *   entry_id  — specific entry UUID (optional, omit for all)
 *
 * For the $0 test phase, no payment verification — any request with
 * a valid pack_id gets access. Payment gating added with Stripe later.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const packId = searchParams.get('pack_id')
    const entryId = searchParams.get('entry_id')

    if (!packId) {
      return NextResponse.json(
        { error: 'Missing required parameter: pack_id' },
        { status: 400 }
      )
    }

    // 1. Fetch the pack to get entry_ids
    const { data: pack, error: packError } = await supabase
      .from('cog_packs')
      .select('id, name, entry_ids, model')
      .eq('id', packId)
      .single()

    if (packError || !pack) {
      return NextResponse.json(
        { error: 'Pack not found' },
        { status: 404 }
      )
    }

    // Determine which entries to fetch
    let targetIds = pack.entry_ids as string[]
    if (entryId) {
      if (!targetIds.includes(entryId)) {
        return NextResponse.json(
          { error: 'Entry not in this pack' },
          { status: 403 }
        )
      }
      targetIds = [entryId]
    }

    // 2. Fetch entries with their encrypted content + agent identity fields
    const { data: entries, error: fetchError } = await supabase
      .from('work_journal')
      .select(`
        id, description, arweave_tx_id, tags, summary,
        source, source_author, type, created_at, seed_epoch,
        agents!inner(wallet_address, name, isnad_hash, pda_address)
      `)
      .in('id', targetIds)

    if (fetchError || !entries || entries.length === 0) {
      return NextResponse.json(
        { error: 'Failed to fetch entries', details: fetchError?.message },
        { status: 500 }
      )
    }

    // 3. Decrypt each entry server-side
    const decryptedEntries = []
    const errors: { id: string; error: string }[] = []

    // Cache derived BIOS seeds per agent wallet (avoid re-deriving)
    const seedCache: Record<string, string> = {}

    for (const entry of entries) {
      try {
        const agent = entry.agents as any
        const wallet = agent?.wallet_address

        if (!wallet) {
          errors.push({ id: entry.id, error: 'No agent wallet' })
          continue
        }

        // Derive BIOS seed (the verify_key stored in config.json)
        // Config stores biosSeed as just the verify_key string (e.g. "e95a5251"),
        // NOT the full JSON object. The CLI passes this directly to encryptData().
        if (!seedCache[wallet]) {
          const verifyKey = (await sha256(wallet + ':verify')).slice(0, 8)
          seedCache[wallet] = verifyKey
        }

        // Get encrypted content (prefer Arweave, fallback to DB)
        let encryptedContent = entry.description

        if (entry.arweave_tx_id && !encryptedContent) {
          // Fetch from Arweave if description is null but arweave_tx_id exists
          try {
            const arRes = await fetch(`https://gateway.irys.xyz/${entry.arweave_tx_id}`, {
              signal: AbortSignal.timeout(10000),
            })
            if (arRes.ok) {
              encryptedContent = await arRes.text()
            }
          } catch {
            // Fallback: try arweave.net gateway
            try {
              const arRes2 = await fetch(`https://arweave.net/${entry.arweave_tx_id}`, {
                signal: AbortSignal.timeout(10000),
              })
              if (arRes2.ok) {
                encryptedContent = await arRes2.text()
              }
            } catch {
              errors.push({ id: entry.id, error: 'Failed to fetch from Arweave' })
              continue
            }
          }
        }

        if (!encryptedContent) {
          errors.push({ id: entry.id, error: 'No encrypted content available' })
          continue
        }

        // Decrypt using AES-GCM (mirrors CLI decrypt logic)
        const decrypted = await decryptEntry(encryptedContent, seedCache[wallet])

        decryptedEntries.push({
          id: entry.id,
          content: decrypted,
          tags: entry.tags,
          summary: entry.summary,
          source: entry.source,
          source_author: entry.source_author,
          type: entry.type,
          created_at: entry.created_at,
          agent_wallet: agent.wallet_address,
          agent_name: agent.name,
        })
      } catch (decryptErr: any) {
        errors.push({ id: entry.id, error: `Decryption failed: ${decryptErr.message}` })
      }
    }

    return NextResponse.json({
      pack_id: pack.id,
      pack_name: pack.name,
      total_entries: pack.entry_ids.length,
      returned_entries: decryptedEntries.length,
      entries: decryptedEntries,
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (err: any) {
    console.error('COG read error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Decrypt an AES-GCM encrypted entry using a BIOS seed.
 * Mirrors the CLI encrypt.js decryptData() function EXACTLY:
 *
 * Key derivation: PBKDF2 (100,000 iterations, SHA-256)
 * Payload format: base64( salt[16 bytes] + iv[12 bytes] + ciphertext )
 *
 * IMPORTANT: Must use Uint8Array copies (not Buffer.slice views)
 * because Buffer.slice shares memory and .buffer returns the full
 * backing ArrayBuffer, not the slice.
 */
async function decryptEntry(encryptedBase64: string, biosSeed: string): Promise<string> {
  const { webcrypto } = await import('crypto')
  const crypto = webcrypto as unknown as Crypto

  // Decode base64 — match CLI: Uint8Array.from(atob(...), c => c.charCodeAt(0))
  const raw = Buffer.from(encryptedBase64, 'base64')
  const combined = new Uint8Array(raw)  // independent copy with its own ArrayBuffer

  // Extract salt, iv, ciphertext as independent Uint8Arrays (own backing buffers)
  const salt = new Uint8Array(combined.slice(0, 16))
  const iv = new Uint8Array(combined.slice(16, 28))
  const ciphertext = new Uint8Array(combined.slice(28))

  // Derive key using PBKDF2 (mirrors CLI deriveKey)
  const encoder = new TextEncoder()
  const keyData = encoder.encode(biosSeed)

  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  // Decrypt
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  )

  return new TextDecoder().decode(plainBuffer)
}


