/**
 * CrabSpace CLI — index command (Memory Recall v4)
 *
 * The index is memory, not infrastructure. `index publish` writes an INDEX
 * ENTRY to Arweave: an encrypted topic → [tx ids + hooks] map, chained to
 * the previous index via `supersedes`. The latest index is discoverable
 * from chain alone (Entry-Type=index tag), which is what makes the agent's
 * recall survive the database.
 *
 * Usage:
 *   crabspace index publish              — dry-run: build + preview + cost
 *   crabspace index publish --publish    — encrypt, upload to Arweave, record
 *   crabspace index show                 — compact topic map (boot context)
 *   crabspace index status               — chain head, cache freshness
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { Keypair as SolKeypair } from '@solana/web3.js';
import { requireConfig, getConfigDir, appendJournal } from '../lib/config.js';
import { loadKeypair, signForAction } from '../lib/sign.js';
import { encryptData } from '../lib/encrypt.js';
import { uploadToArweave, getUploadCost } from '../lib/arweave.js';
import { anchorOnChain } from '../lib/anchor.js';
import { fetchAllEntries } from '../lib/vaultClient.js';
import {
    buildIndex, buildSubIndex, attachChildren, envelopeSize,
    findIndexTransactions, INDEX_ENTRY_TYPE,
} from '../lib/vaultIndex.js';

export function indexStatePath() {
    return join(getConfigDir(), 'index-state.json');
}

export function indexCachePath() {
    return join(getConfigDir(), 'index-cache.json');
}

export function readIndexState() {
    const p = indexStatePath();
    if (!existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; }
}

export function readIndexCache() {
    const p = indexCachePath();
    if (!existsSync(p)) return null;
    try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; }
}

export async function indexCommand(args) {
    const sub = args._?.[0] || 'show';
    switch (sub) {
        case 'publish': return publish(args);
        case 'show': return show(args);
        case 'status': return status(args);
        default:
            console.error(`Unknown subcommand: index ${sub}`);
            console.error('   Usage: crabspace index publish|show|status');
            process.exit(1);
    }
}

// ─── index publish ───────────────────────────────────────────────────────────

async function publish(args) {
    const config = requireConfig();
    if (!config.biosSeed) {
        console.error('❌ BIOS Seed missing — cannot encrypt index. Run `crabspace recover-seed`.');
        process.exit(1);
    }

    const keypairPath = (args.keypair || config.keypair).replace('~', process.env.HOME);
    const keypair = loadKeypair(keypairPath);
    const apiUrl = args['api-url'] || config.apiUrl;
    const live = args.publish === true;

    console.log(`🗂️  Building vault index${live ? '' : ' (dry run — use --publish to write to chain)'}...`);

    // 1. Enumerate the vault (from the cache — bootstrap inverts the
    //    dependency: after this publish, the chain can rebuild the cache).
    const entries = await fetchAllEntries({
        apiUrl, keypair,
        onPage: n => process.stdout.write(`\r   📥 Fetched ${n} entries...`),
    });
    console.log(`\r   📥 Fetched ${entries.length} entries.        `);
    if (entries.length === 0) {
        console.log('   Vault is empty — nothing to index.');
        return;
    }

    // 2. Resolve previous index (local state first, then chain discovery)
    let supersedes = readIndexState()?.lastTxId || null;
    if (!supersedes && !args['no-discover']) {
        try {
            const found = await findIndexTransactions(keypair.wallet, { first: 1 });
            supersedes = found[0]?.id || null;
            if (supersedes) console.log(`   🔗 Found previous index on chain: ${supersedes.slice(0, 12)}...`);
        } catch {
            // First publish or gateways unreachable — genesis index is fine.
        }
    }
    if (supersedes) console.log(`   🔗 Supersedes: ${supersedes.slice(0, 12)}...`);
    else console.log('   🌱 Genesis index (no previous index found).');

    // 3. Build
    const { index, oversizedTopics } = buildIndex(entries, {
        agentWallet: keypair.wallet,
        supersedes,
    });
    const topicCount = Object.keys(index.topics).length;
    const size = envelopeSize(index);

    console.log('');
    console.log(`   📊 ${topicCount} topics | ${entries.length} entries | as_of ${index.as_of.created_at?.slice(0, 10)}`);
    console.log(`   📦 Envelope: ${(size / 1024).toFixed(1)} KB${oversizedTopics.length ? ` + ${oversizedTopics.length} sub-index(es)` : ''}`);

    // Preview top topics
    const preview = Object.entries(index.topics)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, args.full ? topicCount : 15);
    console.log('');
    for (const [topic, t] of preview) {
        console.log(`   · ${topic} (${t.count})${t.children === null && t.count ? '' : ''} — ${t.hook}`);
    }
    if (!args.full && topicCount > 15) console.log(`   … ${topicCount - 15} more (use --full to list all)`);

    // 4. Persist draft locally (always — the draft is also the boot cache seed)
    const draftDir = join(getConfigDir(), 'index-drafts');
    mkdirSync(draftDir, { recursive: true });
    const draftPath = join(draftDir, `index-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(draftPath, JSON.stringify(index, null, 2));
    console.log('');
    console.log(`   💾 Draft saved: ${draftPath}`);

    if (!live) {
        try {
            const cost = await getUploadCost(size, keypairPath);
            console.log(`   💰 Estimated Arweave cost: ${cost.sol} SOL`);
        } catch { /* cost preview is best-effort */ }
        console.log('');
        console.log('   Dry run complete. Re-run with --publish to write the index to Arweave.');
        return;
    }

    // ─── LIVE PUBLISH ────────────────────────────────────────────────────────
    // 5. Sub-indexes first (their txids get wired into the master)
    const childTxIds = {};
    for (const { topic, entries: topicEntries } of oversizedTopics) {
        const sub = buildSubIndex(topic, topicEntries, { agentWallet: keypair.wallet });
        console.log(`   📦 Publishing sub-index for "${topic}" (${topicEntries.length} entries)...`);
        const { txId } = await publishIndexBlob(sub, config, keypair, keypairPath);
        childTxIds[topic] = txId;
        console.log(`      ✓ ${txId.slice(0, 12)}...`);
    }
    attachChildren(index, childTxIds);

    // 6. Master index
    console.log('   📦 Publishing master index to Arweave...');
    const { txId, contentHash } = await publishIndexBlob(index, config, keypair, keypairPath);
    console.log(`      ✓ Arweave: ${txId}`);

    // 7. Record in the API cache (a normal entry row, type=index) — best-effort
    try {
        await recordIndexEntry({ index, txId, contentHash, config, keypair, apiUrl, args, keypairPath });
        console.log('      ✓ Recorded in cache (Supabase)');
    } catch (err) {
        console.log(`      ⚠  Cache record failed (chain is still canonical): ${err.message}`);
    }

    // 8. Update local state — the new chain head
    writeFileSync(indexStatePath(), JSON.stringify({
        lastTxId: txId,
        publishedAt: new Date().toISOString(),
        entryCount: entries.length,
        topicCount,
        supersedes,
        subIndexes: childTxIds,
    }, null, 2));

    appendJournal(
        `**Entry:** Published vault index (${topicCount} topics, ${entries.length} entries)\n` +
        `**Type:** index\n**Arweave:** \`${txId}\`\n` +
        (supersedes ? `**Supersedes:** \`${supersedes}\`\n` : '**Chain:** genesis index\n')
    );

    console.log('');
    console.log('✅ Index published. The chain now carries its own map.');
    console.log(`   Head: ${txId}`);
    console.log('   Any fresh machine can now rebuild recall with: crabspace reindex');
}

/** Encrypt + upload one index object to Arweave with Entry-Type=index tags. */
async function publishIndexBlob(indexObj, config, keypair, keypairPath) {
    const plaintext = JSON.stringify(indexObj);
    const encrypted = await encryptData(plaintext, config.biosSeed);

    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintext));
    const contentHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    const seedStr = typeof config.biosSeed === 'object' ? JSON.stringify(config.biosSeed) : String(config.biosSeed);
    const epochBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seedStr));
    const seedEpoch = Array.from(new Uint8Array(epochBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);

    const { txId } = await uploadToArweave(encrypted, {
        agentWallet: keypair.wallet,
        seedEpoch,
        entryType: INDEX_ENTRY_TYPE,
    }, keypairPath);

    return { txId, contentHash, encrypted, seedEpoch };
}

/** Record the published index as a normal cache row via /api/work/submit. */
async function recordIndexEntry({ index, txId, contentHash, config, keypair, apiUrl, args, keypairPath }) {
    const { signature, message } = signForAction('submit', keypair);
    const topicCount = Object.keys(index.topics).length;

    const res = await fetch(`${apiUrl}/api/work/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            agentWallet: keypair.wallet,
            projectName: `${config.agentId || 'agent'}:memory:index`,
            arweaveTxId: txId,
            proofUrl: '',
            workHash: contentHash,
            isWill: false,
            entryType: INDEX_ENTRY_TYPE,
            tags: ['index'],
            summary: `Vault index: ${topicCount} topics, ${index.as_of.entry_count} entries`.slice(0, 150),
            signature,
            message,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || JSON.stringify(err));
    }
    const data = await res.json();

    // Best-effort on-chain anchor (same policy as regular submissions)
    if (!args['skip-anchor']) {
        try {
            const keypairJson = JSON.parse(readFileSync(keypairPath, 'utf-8'));
            const solKeypair = SolKeypair.fromSecretKey(Uint8Array.from(keypairJson));
            const rpcUrl = args['rpc-url'] || 'https://api.mainnet-beta.solana.com';
            const sig = await anchorOnChain(solKeypair, contentHash, rpcUrl);
            if (sig && data.entry?.id) {
                await fetch(`${apiUrl}/api/work/anchor`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workId: data.entry.id, onChainSig: sig }),
                });
            }
        } catch { /* anchor is best-effort */ }
    }
}

// ─── index show ──────────────────────────────────────────────────────────────

/**
 * Compact topic map for boot context. Reads the freshest local source:
 * reindex cache → publish state draft. This is the "ONE small fetch" of
 * the v4 boot sequence, served locally.
 */
async function show(args) {
    const cache = readIndexCache();
    const state = readIndexState();

    let topics = null, source = null, asOf = null;
    if (cache?.merged?.topics) {
        topics = cache.merged.topics;
        asOf = cache.merged.as_of;
        source = `chain (reindexed ${cache.fetchedAt?.slice(0, 16)})`;
    } else {
        const draft = latestDraft();
        if (draft) {
            topics = draft.topics;
            asOf = draft.as_of;
            source = 'local draft (never reindexed from chain)';
        }
    }

    if (!topics) {
        console.log('   No local index found.');
        console.log('   Build one:   crabspace index publish');
        console.log('   Or restore:  crabspace reindex');
        process.exit(1);
    }

    const sorted = Object.entries(topics).sort((a, b) => b[1].count - a[1].count);
    const limit = args.limit ? parseInt(args.limit) : sorted.length;

    console.log(`🧠 Vault Index — ${sorted.length} topics | as_of ${asOf?.created_at?.slice(0, 10) || '?'} (${asOf?.entry_count ?? '?'} entries)`);
    console.log(`   Source: ${source}`);
    if (state?.lastTxId) console.log(`   Head:   ${state.lastTxId}`);
    console.log('');
    for (const [topic, t] of sorted.slice(0, limit)) {
        console.log(`   ${topic} (${t.count}) — ${t.hook}`);
    }
    if (limit < sorted.length) console.log(`   … ${sorted.length - limit} more`);
    console.log('');
    console.log('   Fetch a topic: crabspace read --private-tags <topic>');
}

function latestDraft() {
    const draftDir = join(getConfigDir(), 'index-drafts');
    if (!existsSync(draftDir)) return null;
    try {
        const files = readdirSync(draftDir).filter(f => f.endsWith('.json')).sort();
        if (files.length === 0) return null;
        return JSON.parse(readFileSync(join(draftDir, files[files.length - 1]), 'utf-8'));
    } catch { return null; }
}

// ─── index status ────────────────────────────────────────────────────────────

async function status(args) {
    const config = requireConfig();
    const keypairPath = (args.keypair || config.keypair).replace('~', process.env.HOME);
    const keypair = loadKeypair(keypairPath);
    const state = readIndexState();
    const cache = readIndexCache();

    console.log('🗂️  Index Status');
    console.log('');
    console.log(`   Local head:  ${state?.lastTxId || '(none — never published from this machine)'}`);
    if (state?.publishedAt) console.log(`   Published:   ${state.publishedAt} (${state.topicCount} topics, ${state.entryCount} entries)`);
    console.log(`   Reindex:     ${cache ? `${cache.fetchedAt} (chain length ${cache.merged?.chain_length})` : '(never run)'}`);

    console.log('');
    console.log('   Querying chain for index entries...');
    try {
        const found = await findIndexTransactions(keypair.wallet, { first: 5 });
        if (found.length === 0) {
            console.log('   Chain: no index entries found (genesis pending).');
        } else {
            console.log(`   Chain: ${found.length} index transaction(s), newest first:`);
            for (const tx of found) {
                const marker = tx.id === state?.lastTxId ? ' ← local head' : '';
                console.log(`   · ${tx.id}${marker}`);
            }
            if (state?.lastTxId && found[0].id !== state.lastTxId) {
                console.log('');
                console.log('   ⚠  Chain head differs from local head — another machine may have');
                console.log('      published. Run `crabspace reindex` to adopt the chain view.');
            }
        }
    } catch (err) {
        console.log(`   ⚠  Chain query failed: ${err.message}`);
    }
    console.log('');
}
