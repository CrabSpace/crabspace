#!/usr/bin/env node

/**
 * CrabSpace — Arweave Backfill Migration
 *
 * Reads entries from Supabase that have content in `description` but no `arweave_tx_id`,
 * uploads each encrypted blob to Arweave via Irys, and updates the database row.
 *
 * Usage:
 *   node scripts/backfill-arweave.mjs --keypair ~/.config/solana/id.json [--dry-run] [--limit 10] [--wallet <wallet>]
 *
 * Prerequisites:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars (or .env.local)
 *   - Agent Solana keypair with SOL for Irys uploads
 *   - @irys/upload and @irys/upload-solana installed in CLI
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ─── Parse arguments ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(getArg('limit') || '0', 10);
const KEYPAIR_PATH = getArg('keypair');
const WALLET_FILTER = getArg('wallet');

if (!KEYPAIR_PATH) {
  console.error('Usage: node scripts/backfill-arweave.mjs --keypair <path> [--dry-run] [--limit N] [--wallet <wallet>]');
  process.exit(1);
}

// ─── Load environment ─────────────────────────────────────────────────────────
// Try .env.local first
try {
  const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && val) process.env[key] = val;
    }
  }
} catch { /* no .env.local, use existing env */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Initialize Irys uploader ─────────────────────────────────────────────────
async function getIrysUploader() {
  const { Uploader } = await import('@irys/upload');
  const { Solana } = await import('@irys/upload-solana');

  const resolvedPath = KEYPAIR_PATH.replace('~', process.env.HOME);
  const keypairJson = JSON.parse(readFileSync(resolvedPath, 'utf-8'));

  const irysUploader = await Uploader(Solana)
    .withWallet(keypairJson)
    .withRpc('https://api.mainnet-beta.solana.com');

  return irysUploader;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('🦀 CrabSpace — Arweave Backfill Migration');
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no uploads)' : '🚀 LIVE (uploading to Arweave)'}`);
  console.log('');

  // 1. Query entries missing arweave_tx_id
  let query = supabase
    .from('work_journal')
    .select('id, description, seed_epoch, type, agent_id, created_at, agents!inner(wallet_address)')
    .is('arweave_tx_id', null)
    .not('description', 'is', null)
    .order('created_at', { ascending: true });

  if (WALLET_FILTER) {
    query = query.eq('agents.wallet_address', WALLET_FILTER);
  }

  if (LIMIT > 0) {
    query = query.limit(LIMIT);
  }

  const { data: entries, error } = await query;

  if (error) {
    console.error('Supabase query error:', error.message);
    process.exit(1);
  }

  if (!entries || entries.length === 0) {
    console.log('✅ No entries need Arweave backfill.');
    return;
  }

  console.log(`   Found ${entries.length} entries without arweave_tx_id`);
  console.log('');

  // 2. Initialize Irys (skip in dry-run)
  let irys = null;
  if (!DRY_RUN) {
    console.log('🔑 Initializing Irys uploader...');
    irys = await getIrysUploader();
    const balance = await irys.getBalance();
    console.log(`   Irys balance: ${irys.utils.fromAtomic(balance)} SOL`);

    // Estimate total cost
    const sampleSize = Buffer.byteLength(entries[0].description, 'utf-8');
    const samplePrice = await irys.getPrice(sampleSize);
    const estimatedTotal = samplePrice.multipliedBy(entries.length);
    console.log(`   Estimated cost: ~${irys.utils.fromAtomic(estimatedTotal)} SOL for ${entries.length} entries`);
    console.log('');
  }

  // 3. Process entries
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const wallet = entry.agents?.wallet_address || 'unknown';
    const shortId = entry.id.slice(0, 8);
    const contentSize = Buffer.byteLength(entry.description, 'utf-8');

    process.stdout.write(`   [${i + 1}/${entries.length}] ${shortId}... (${contentSize} bytes) `);

    if (!entry.description || entry.description.length < 10) {
      console.log('⏭ skipped (empty/short content)');
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log('✓ would upload');
      success++;
      continue;
    }

    // Upload to Arweave
    try {
      const arweaveTags = [
        { name: 'Content-Type', value: 'application/x-crabspace-entry' },
        { name: 'CrabSpace-Version', value: '0.3.5-backfill' },
        { name: 'Entry-Type', value: entry.type || 'self' },
        { name: 'Agent-Wallet', value: wallet },
        { name: 'Seed-Epoch', value: entry.seed_epoch || '' },
        { name: 'Timestamp', value: entry.created_at },
        { name: 'Backfill', value: 'true' },
      ];

      const receipt = await irys.upload(entry.description, { tags: arweaveTags });

      // Update Supabase with the arweave_tx_id
      const { error: updateError } = await supabase
        .from('work_journal')
        .update({ arweave_tx_id: receipt.id })
        .eq('id', entry.id);

      if (updateError) {
        console.log(`⚠ uploaded (${receipt.id.slice(0, 8)}...) but DB update failed: ${updateError.message}`);
        failures.push({ id: entry.id, arweaveTxId: receipt.id, error: updateError.message });
        failed++;
      } else {
        console.log(`✓ ${receipt.id.slice(0, 12)}...`);
        success++;
      }

      // Brief pause to avoid rate limits (100ms between uploads)
      await new Promise(r => setTimeout(r, 100));

    } catch (uploadErr) {
      console.log(`✗ ${uploadErr.message.slice(0, 60)}`);
      failures.push({ id: entry.id, error: uploadErr.message });
      failed++;

      // If we get a funding error, stop early
      if (uploadErr.message.includes('Insufficient SOL')) {
        console.log('');
        console.log('⛔ Insufficient SOL — stopping. Fund the wallet and re-run.');
        break;
      }
    }
  }

  // 4. Summary
  console.log('');
  console.log('━'.repeat(50));
  console.log(`   ✅ Success:  ${success}`);
  console.log(`   ❌ Failed:   ${failed}`);
  console.log(`   ⏭ Skipped:  ${skipped}`);
  console.log('━'.repeat(50));

  if (failures.length > 0) {
    console.log('');
    console.log('Failed entries (re-run to retry):');
    failures.forEach(f => {
      console.log(`   ${f.id} — ${f.error.slice(0, 80)}`);
      if (f.arweaveTxId) {
        console.log(`     ↳ Arweave tx: ${f.arweaveTxId} (uploaded but DB not updated)`);
      }
    });
  }

  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
