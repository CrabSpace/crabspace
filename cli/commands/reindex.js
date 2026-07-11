/**
 * CrabSpace CLI — reindex command (Memory Recall v4)
 *
 * The decentralization proof: rebuild recall from chain alone.
 *
 *   1. Discover the latest index entry via Arweave tag query
 *      (Entry-Type=index + Agent-Wallet) — no database consulted.
 *   2. Fetch + decrypt it, walk the `supersedes` chain.
 *   3. Merge into a single topic map and write the local cache
 *      (~/.crabspace/index-cache.json) that `index show`, `vault sync`,
 *      and boot read from.
 *
 * Lose the DB, lose nothing: this command is the receipt.
 *
 * Usage:
 *   crabspace reindex                 — discover, walk (depth 10), cache
 *   crabspace reindex --depth 50      — walk deeper history
 *   crabspace reindex --head <txid>   — start from a known head (skip discovery)
 *   crabspace reindex --verify        — also compare coverage vs the API cache
 */

import { writeFileSync } from 'fs';
import { requireConfig } from '../lib/config.js';
import { loadKeypair } from '../lib/sign.js';
import {
    findIndexTransactions, walkIndexChain, mergeIndexChain, fetchIndexEntry,
} from '../lib/vaultIndex.js';
import { indexCachePath } from './index-cmd.js';

export async function reindex(args) {
    const config = requireConfig();
    if (!config.biosSeed) {
        console.error('❌ BIOS Seed missing — cannot decrypt index entries.');
        console.error('   Run `crabspace recover-seed` or `crabspace verify` first.');
        process.exit(1);
    }

    const keypairPath = (args.keypair || config.keypair).replace('~', process.env.HOME);
    const keypair = loadKeypair(keypairPath);
    const maxDepth = args.depth ? parseInt(args.depth) : 10;

    console.log('⛓️  Rebuilding recall from chain (no database consulted)...');
    console.log('');

    // ─── 1. Resolve the chain head ───────────────────────────────────────────
    // Fastest path: the Solana PDA's latest_hash IS the index txid when the
    // last anchor was an index publish — one RPC read, no gateway indexing lag.
    let headTxId = args.head || null;
    if (!headTxId && !args['no-pda']) {
        try {
            console.log('   ⛓️  Reading PDA head pointer (Solana)...');
            const { readIdentityHead } = await import('../lib/anchor.js');
            const { bytesToTxidCandidates } = await import('../lib/vaultIndex.js');
            const headBytes = await readIdentityHead(keypair.wallet, args['rpc-url'] || 'https://api.mainnet-beta.solana.com');
            if (headBytes) {
                for (const candidate of bytesToTxidCandidates(headBytes)) {
                    try {
                        await fetchIndexEntry(candidate, config.biosSeed);
                        headTxId = candidate;
                        console.log(`   ✓ PDA pointer resolves to a live index: ${candidate.slice(0, 12)}...`);
                        break;
                    } catch { /* not an index txid under this encoding — try next */ }
                }
                if (!headTxId) console.log('   · PDA head is not an index pointer (predates v4 anchoring) — falling back to tag discovery.');
            }
        } catch (pdaErr) {
            console.log(`   · PDA read unavailable (${pdaErr.message.split('\n')[0].slice(0, 50)}) — falling back to tag discovery.`);
        }
    }
    if (!headTxId) {
        console.log('   🔎 Discovering index entries via Arweave tag query...');
        const candidates = await findIndexTransactions(keypair.wallet, { first: 10 });
        if (candidates.length === 0) {
            console.log('');
            console.log('   No index entries found on chain for this wallet.');
            console.log('   Publish the genesis index first: crabspace index publish --publish');
            process.exit(1);
        }
        console.log(`   Found ${candidates.length} index transaction(s). Trying newest first...`);

        // The newest by block height that actually decrypts with our seed wins.
        for (const candidate of candidates) {
            try {
                await fetchIndexEntry(candidate.id, config.biosSeed);
                headTxId = candidate.id;
                break;
            } catch (err) {
                console.log(`   ⚠  ${candidate.id.slice(0, 12)}... skipped (${err.message.split('\n')[0].slice(0, 60)})`);
            }
        }
        if (!headTxId) {
            console.error('   ❌ No discovered index entry decrypts with the current BIOS seed.');
            console.error('      Check the seed epoch (crabspace doctor) — or the entries belong to another seed.');
            process.exit(1);
        }
    }
    console.log(`   ✓ Chain head: ${headTxId}`);

    // ─── 2. Walk the supersedes chain ────────────────────────────────────────
    console.log('');
    console.log(`   🚶 Walking index chain (max depth ${maxDepth})...`);
    const { indexes, txIds } = await walkIndexChain(headTxId, config.biosSeed, {
        maxDepth,
        onStep: (txId, depth) => console.log(`      [${depth}] ${txId.slice(0, 20)}...`),
    });
    console.log(`   ✓ Walked ${indexes.length} index generation(s).`);

    // ─── 3. Merge + write local cache ────────────────────────────────────────
    const merged = mergeIndexChain(indexes);
    const topicCount = Object.keys(merged.topics).length;
    const entryRefs = new Set();
    for (const t of Object.values(merged.topics)) {
        for (const ref of t.entries || []) entryRefs.add(ref);
    }

    const cache = {
        fetchedAt: new Date().toISOString(),
        headTxId,
        chainTxIds: txIds,
        merged,
    };
    writeFileSync(indexCachePath(), JSON.stringify(cache, null, 2));

    console.log('');
    console.log('✅ Recall rebuilt from chain.');
    console.log('');
    console.log(`   Topics:      ${topicCount}`);
    console.log(`   Entry refs:  ${entryRefs.size} inline (${merged.as_of?.entry_count ?? '?'} total as of last publish)`);
    console.log(`   Coverage:    up to ${merged.as_of?.created_at || 'unknown'}`);
    console.log(`   Cache:       ${indexCachePath()}`);
    console.log('');
    console.log('   Note: entries written after the last index publish are reachable');
    console.log('   by walking the chain from as_of — the index is a checkpoint, not a gate.');

    // ─── 4. Optional: verify coverage against the API cache ─────────────────
    if (args.verify) {
        console.log('');
        console.log('   🔬 Verifying against API cache...');
        try {
            const apiUrl = args['api-url'] || config.apiUrl;
            const res = await fetch(`${apiUrl}/api/verify?wallet=${keypair.wallet}`, {
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const dbTotal = data.agent?.total_entries ?? data.agent?.totalEntries ?? null;
            if (dbTotal === null) {
                console.log('   ⚠  Could not read total from API response.');
            } else {
                const indexed = merged.as_of?.entry_count ?? 0;
                const delta = dbTotal - indexed;
                console.log(`   DB total: ${dbTotal} | indexed as_of: ${indexed} | unindexed delta: ${delta}`);
                if (delta > 0) {
                    console.log(`   → ${delta} entr${delta === 1 ? 'y' : 'ies'} written since last publish. Run: crabspace index publish --publish`);
                } else {
                    console.log('   ✓ Index fully covers the cache. The DB is redundant — as designed.');
                }
            }
        } catch (err) {
            console.log(`   ⚠  API unreachable (${err.message}) — which is fine. Chain recall works without it.`);
        }
    }
    console.log('');
    console.log('   Next: crabspace index show     (topic map)');
    console.log('         crabspace vault sync     (materialize Obsidian vault)');
}
