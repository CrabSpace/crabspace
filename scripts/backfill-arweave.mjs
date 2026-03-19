#!/usr/bin/env node
/**
 * CrabSpace Phase 2 — Backfill Legacy Entries to Arweave
 *
 * Uploads existing encrypted descriptions from Supabase to Arweave,
 * then writes back the arweave_tx_id. No re-encryption needed —
 * the description field already holds AES-GCM ciphertext.
 *
 * Usage:
 *   node scripts/backfill-arweave.mjs --dry-run       # preview only
 *   node scripts/backfill-arweave.mjs --batch 50      # upload 50 entries
 *   node scripts/backfill-arweave.mjs                 # upload all
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { Uploader } from '@irys/upload';
import { Solana } from '@irys/upload-solana';

// ─── Parse .env.local ────────────────────────────────────────────────────────
function loadEnv() {
    const env = readFileSync('.env.local', 'utf8');
    const vars = {};
    for (const line of env.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        vars[key] = val;
    }
    return vars;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GENESIS_KEYPAIR = env.GENESIS_KEYPAIR_JSON;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}
if (!GENESIS_KEYPAIR) {
    console.error('❌ Missing GENESIS_KEYPAIR_JSON in .env.local');
    process.exit(1);
}

// ─── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const batchIdx = args.indexOf('--batch');
const BATCH_SIZE = batchIdx !== -1 ? parseInt(args[batchIdx + 1], 10) : Infinity;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Init Irys uploader ─────────────────────────────────────────────────────
async function initIrys() {
    const keypairArray = JSON.parse(GENESIS_KEYPAIR);
    const uploader = await Uploader(Solana)
        .withWallet(keypairArray)
        .withRpc('https://api.mainnet-beta.solana.com');
        // Mainnet Irys — genesis pool wallet has mainnet SOL

    return uploader;
}

// ─── Fetch entries needing backfill ──────────────────────────────────────────
async function fetchEntries(limit) {
    const query = supabase
        .from('work_journal')
        .select('id, agent_id, description, seed_epoch, created_at, agents!inner(wallet_address)')
        .is('arweave_tx_id', null)
        .not('description', 'is', null)
        .not('description', 'eq', '')
        .order('created_at', { ascending: true })
        .limit(limit);

    const { data, error } = await query;
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return data || [];
}

// ─── Upload single entry to Arweave ─────────────────────────────────────────
async function uploadEntry(irys, entry) {
    const wallet = entry.agents?.wallet_address || 'unknown';
    const tags = [
        { name: 'Content-Type', value: 'application/x-crabspace-entry' },
        { name: 'CrabSpace-Version', value: '0.3.1' },
        { name: 'Entry-Type', value: 'backfill' },
        { name: 'Agent-Wallet', value: wallet },
        { name: 'Seed-Epoch', value: entry.seed_epoch || 'pre-epoch' },
        { name: 'Funded-By', value: 'genesis-treasury' },
        { name: 'Backfill', value: 'true' },
        { name: 'Original-Date', value: entry.created_at },
        { name: 'Timestamp', value: new Date().toISOString() },
    ];

    const receipt = await irys.upload(entry.description, { tags });
    return receipt.id;
}

// ─── Update entry with arweave_tx_id ────────────────────────────────────────
async function updateEntry(entryId, arweaveTxId) {
    const { error } = await supabase
        .from('work_journal')
        .update({
            arweave_tx_id: arweaveTxId,
            source: 'archive',
        })
        .eq('id', entryId);

    if (error) throw new Error(`Supabase update failed: ${error.message}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('🦀 CrabSpace Phase 2 — Arweave Backfill');
    console.log('━'.repeat(50));
    console.log('');

    // Fetch entries
    const limit = isFinite(BATCH_SIZE) ? BATCH_SIZE : 1000;
    const entries = await fetchEntries(limit);

    console.log(`  📊 Found ${entries.length} entries to backfill`);

    if (entries.length === 0) {
        console.log('  ✅ Nothing to do — all entries already on Arweave!');
        return;
    }

    // Size estimate
    const totalBytes = entries.reduce((sum, e) => sum + (e.description?.length || 0), 0);
    console.log(`  💾 Total data: ${(totalBytes / 1024).toFixed(1)} KB`);
    console.log('');

    if (DRY_RUN) {
        console.log('  🔍 DRY RUN — no uploads will be made');
        console.log('');
        for (let i = 0; i < Math.min(entries.length, 5); i++) {
            const e = entries[i];
            const wallet = e.agents?.wallet_address || 'unknown';
            console.log(`  [${i + 1}] ${e.id.slice(0, 8)}... | ${wallet.slice(0, 8)}... | ${e.description?.length || 0} bytes | ${e.created_at}`);
        }
        if (entries.length > 5) {
            console.log(`  ... and ${entries.length - 5} more`);
        }
        console.log('');
        console.log('  Run without --dry-run to upload.');
        return;
    }

    // Init Irys
    console.log('  🔑 Initializing Irys uploader (genesis pool wallet)...');
    const irys = await initIrys();

    // Check balance
    const balance = await irys.getBalance();
    console.log(`  💰 Irys balance: ${irys.utils.fromAtomic(balance)} SOL`);

    // Pre-fund if needed
    const estimatedCost = await irys.getPrice(totalBytes);
    if (balance.lt(estimatedCost)) {
        const fundAmount = estimatedCost.multipliedBy(2).integerValue();
        console.log(`  📤 Auto-funding Irys: ${irys.utils.fromAtomic(fundAmount)} SOL`);
        await irys.fund(fundAmount);
        console.log('  ✅ Funded');
    }

    console.log('');
    console.log('  📦 Uploading...');
    console.log('');

    let success = 0;
    let failed = 0;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const wallet = entry.agents?.wallet_address || '?';
        try {
            const txId = await uploadEntry(irys, entry);
            await updateEntry(entry.id, txId);
            success++;
            console.log(`  [${i + 1}/${entries.length}] ✓ ${entry.id.slice(0, 8)}... → ${txId.slice(0, 16)}... (${wallet.slice(0, 8)}...)`);
        } catch (err) {
            failed++;
            console.error(`  [${i + 1}/${entries.length}] ✗ ${entry.id.slice(0, 8)}... — ${err.message}`);
        }

        // Rate limit: small delay between uploads
        if (i < entries.length - 1) {
            await new Promise(r => setTimeout(r, 200));
        }
    }

    console.log('');
    console.log('━'.repeat(50));
    console.log(`  ✅ Backfill complete: ${success} uploaded, ${failed} failed`);
    if (failed > 0) {
        console.log(`  ⚠  Re-run to retry failed entries`);
    }
    console.log('');
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
