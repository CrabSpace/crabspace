/**
 * CrabSpace CLI — Vault Index (Memory Recall v4: Index-as-Content)
 *
 * The index is not infrastructure — it is memory. This module builds
 * INDEX ENTRIES: compact maps of topic → [arweave tx ids + one-line hooks]
 * that are encrypted and stored on Arweave like any other entry, chained
 * via `supersedes` pointers. The latest index is discoverable purely from
 * Arweave tag queries (Entry-Type=index + Agent-Wallet), so recall survives
 * the death of any database. Supabase is a cache; the chain is the truth.
 *
 * Pure functions only in the build/merge section — no I/O — so they are
 * unit-testable. Network helpers (GraphQL discovery, chain walk) live at
 * the bottom.
 *
 * See: 06_memory_recall_v4_design.md
 */

import { decryptData } from './encrypt.js';
import { fetchFromArweave } from './arweave.js';

export const INDEX_VERSION = 1;
export const INDEX_ENTRY_TYPE = 'index';

// Target ceiling for a serialized index envelope. Topics that would push
// the master index past this get split into sub-index entries (§3 of the
// v4 design: index-of-indexes is O(log) fetches at any scale).
export const ENVELOPE_TARGET_BYTES = 32 * 1024;

// A single topic holding more entries than this is split into its own
// sub-index even if the master would still fit — keeps hooks scannable.
export const TOPIC_SPLIT_THRESHOLD = 150;

// ─── Topic derivation ────────────────────────────────────────────────────────

/**
 * Derive the topic keys for one vault entry.
 * Priority: private_tags (owner vocabulary) → public tags → memory type
 * namespace (from project_name like "eisner:memory:episodic") → 'untagged'.
 * Every entry lands in at least one topic so nothing is unreachable.
 */
export function topicsForEntry(entry) {
    const topics = new Set();
    for (const t of entry.private_tags || []) topics.add(normalizeTopic(t));
    for (const t of entry.tags || []) topics.add(normalizeTopic(t));
    if (topics.size === 0) {
        const memType = memoryTypeOf(entry);
        topics.add(memType ? `type:${memType}` : 'untagged');
    }
    return [...topics].filter(Boolean);
}

export function normalizeTopic(tag) {
    return String(tag || '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 64);
}

/** Extract memory type from "agent:memory:<type>" project names or entry.type. */
export function memoryTypeOf(entry) {
    const m = /^[^:]+:memory:(.+)$/.exec(entry.project_name || '');
    if (m) return m[1];
    return entry.type && entry.type !== 'self' ? entry.type : null;
}

/** Stable reference for an entry: Arweave txid when it exists, db id otherwise. */
export function entryRef(entry) {
    if (entry.arweave_tx_id) return entry.arweave_tx_id;
    return entry.id ? `db:${entry.id}` : null;
}

/** One-line hook for a topic: newest useful summary, trimmed. */
function hookFor(entries) {
    for (const e of entries) {
        const s = e.private_summary || e.summary;
        if (s && s.trim()) return s.trim().replace(/\s+/g, ' ').slice(0, 120);
    }
    const memType = memoryTypeOf(entries[0]);
    return memType ? `${entries.length} ${memType} entries` : `${entries.length} entries`;
}

// ─── Index building (pure) ───────────────────────────────────────────────────

/**
 * Build an index entry object from a list of vault entries (Supabase rows
 * or reindexed equivalents). Entries should be sorted newest-first; if not,
 * they are sorted here by created_at.
 *
 * Returns { index, oversizedTopics } — oversizedTopics lists topics that
 * exceed TOPIC_SPLIT_THRESHOLD and should become sub-index entries. The
 * caller publishes those first, then calls attachChildren() with their txids.
 */
export function buildIndex(entries, { agentWallet, supersedes = null } = {}) {
    const sorted = [...entries].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );

    const byTopic = new Map();
    for (const e of sorted) {
        for (const topic of topicsForEntry(e)) {
            if (!byTopic.has(topic)) byTopic.set(topic, []);
            byTopic.get(topic).push(e);
        }
    }

    const topics = {};
    const oversizedTopics = [];
    for (const [topic, topicEntries] of [...byTopic.entries()].sort()) {
        const refs = topicEntries.map(entryRef).filter(Boolean);
        if (refs.length > TOPIC_SPLIT_THRESHOLD) {
            oversizedTopics.push({ topic, entries: topicEntries });
            topics[topic] = {
                hook: hookFor(topicEntries),
                count: refs.length,
                entries: refs.slice(0, 10), // most recent stay inline for fast recall
                children: null,             // filled by attachChildren() after sub-publish
            };
        } else {
            topics[topic] = {
                hook: hookFor(topicEntries),
                count: refs.length,
                entries: refs,
            };
        }
    }

    const head = sorted[0];
    const index = {
        type: INDEX_ENTRY_TYPE,
        version: INDEX_VERSION,
        agent: agentWallet || null,
        supersedes,
        as_of: {
            tx: head ? entryRef(head) : null,
            created_at: head?.created_at || null,
            entry_count: entries.length,
        },
        topics,
        wikilinks: buildWikilinks(sorted),
        // Reserved for Phase B (semantic recall). Stamped now so the envelope
        // shape is stable and re-embedding is a single backfill pass.
        embedding_model: null,
    };

    return { index, oversizedTopics };
}

/**
 * Co-occurrence wikilinks: for each topic, the other topics it shares
 * entries with (≥2 shared entries, top 5 by overlap). This is the graph
 * an Obsidian vault derives from wikilinks — computed, not curated.
 */
export function buildWikilinks(entries) {
    const pairCounts = new Map();
    for (const e of entries) {
        const topics = topicsForEntry(e);
        for (let i = 0; i < topics.length; i++) {
            for (let j = i + 1; j < topics.length; j++) {
                const key = [topics[i], topics[j]].sort().join('\n');
                pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
            }
        }
    }

    const links = {};
    for (const [key, count] of pairCounts) {
        if (count < 2) continue;
        const [a, b] = key.split('\n');
        (links[a] = links[a] || []).push([b, count]);
        (links[b] = links[b] || []).push([a, count]);
    }

    const result = {};
    for (const [topic, neighbors] of Object.entries(links).sort()) {
        result[topic] = neighbors
            .sort((x, y) => y[1] - x[1])
            .slice(0, 5)
            .map(([t]) => t);
    }
    return result;
}

/**
 * Build a sub-index entry for one oversized topic.
 * Same envelope shape as a master index, but scoped to one topic and
 * pointing back at nothing (the master points at it via `children`).
 */
export function buildSubIndex(topic, topicEntries, { agentWallet } = {}) {
    const refs = topicEntries.map(entryRef).filter(Boolean);
    return {
        type: INDEX_ENTRY_TYPE,
        version: INDEX_VERSION,
        agent: agentWallet || null,
        subindex_of: topic,
        entries: refs,
        hooks: topicEntries.slice(0, 25).map(e => ({
            tx: entryRef(e),
            hook: (e.private_summary || e.summary || '').trim().replace(/\s+/g, ' ').slice(0, 120) || null,
            created_at: e.created_at || null,
        })),
    };
}

/** Wire published sub-index txids into the master index. Mutates and returns it. */
export function attachChildren(index, childTxIds) {
    for (const [topic, txId] of Object.entries(childTxIds)) {
        if (index.topics[topic]) index.topics[topic].children = txId;
    }
    return index;
}

/**
 * Merge a walked index chain (newest first) into a single logical index.
 * Newest index wins per topic; older indexes only contribute topics the
 * newer ones no longer carry (so nothing indexed is ever lost, matching
 * append-only semantics).
 */
export function mergeIndexChain(indexesNewestFirst) {
    const merged = { topics: {}, wikilinks: {}, as_of: null, chain_length: indexesNewestFirst.length };
    for (const idx of indexesNewestFirst) {
        if (!merged.as_of && idx.as_of) merged.as_of = idx.as_of;
        for (const [topic, data] of Object.entries(idx.topics || {})) {
            if (!(topic in merged.topics)) merged.topics[topic] = data;
        }
        for (const [topic, links] of Object.entries(idx.wikilinks || {})) {
            if (!(topic in merged.wikilinks)) merged.wikilinks[topic] = links;
        }
    }
    return merged;
}

/** Serialized size guard for the envelope target. */
export function envelopeSize(index) {
    return Buffer.byteLength(JSON.stringify(index), 'utf-8');
}

// ─── Chain discovery + walk (network) ────────────────────────────────────────

// Two gateway families with different GraphQL schemas. The Irys uploader
// indexes its own bundles immediately (fresh publishes show up in seconds);
// arweave.net can lag hours behind but covers the long tail. Query both,
// merge, newest-first. A GraphQL "errors" payload arrives as HTTP 200, so
// each adapter must throw on it rather than treating it as zero results.

async function gqlPost(endpoint, query) {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`GraphQL ${res.status} from ${endpoint}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(`${endpoint}: ${json.errors[0].message}`);
    return json?.data?.transactions?.edges || [];
}

// Irys schema: owner-scoped (the data-item signer IS the Solana wallet),
// millisecond timestamps, order/limit params.
async function queryIrys(wallet, first) {
    const edges = await gqlPost('https://uploader.irys.xyz/graphql',
        `query { transactions(
            owners: [${JSON.stringify(wallet)}],
            tags: [{name: "Entry-Type", values: [${JSON.stringify(INDEX_ENTRY_TYPE)}]}],
            order: DESC, limit: ${first}
        ) { edges { node { id timestamp } } } }`);
    return edges.map(e => ({ id: e.node.id, timestamp: e.node.timestamp || null }));
}

// Arweave schema: tag-scoped (Agent-Wallet rides as a tag), block timestamps
// in seconds (normalized to ms), sort/first params. Unconfirmed txs have a
// null block and are treated as newest.
async function queryArweaveNet(wallet, first) {
    const edges = await gqlPost('https://arweave.net/graphql',
        `query { transactions(
            tags: [
                {name: "Entry-Type", values: [${JSON.stringify(INDEX_ENTRY_TYPE)}]},
                {name: "Agent-Wallet", values: [${JSON.stringify(wallet)}]}
            ],
            first: ${first}, sort: HEIGHT_DESC
        ) { edges { node { id block { timestamp } } } } }`);
    return edges.map(e => ({
        id: e.node.id,
        timestamp: e.node.block?.timestamp ? e.node.block.timestamp * 1000 : null,
    }));
}

/**
 * Find the most recent index entries for a wallet. This is the chain-head
 * convention: no database, no Solana PDA — just permanent public metadata
 * on encrypted blobs.
 *
 * Returns [{ id, timestamp(ms) }] newest-first; null timestamps
 * (unconfirmed) sort first.
 */
export async function findIndexTransactions(agentWallet, { first = 10 } = {}) {
    const results = await Promise.allSettled([
        queryIrys(agentWallet, first),
        queryArweaveNet(agentWallet, first),
    ]);

    const byId = new Map();
    let lastError = null;
    let anySucceeded = false;
    for (const r of results) {
        if (r.status === 'fulfilled') {
            anySucceeded = true;
            for (const tx of r.value) if (!byId.has(tx.id)) byId.set(tx.id, tx);
        } else {
            lastError = r.reason;
        }
    }
    if (!anySucceeded) {
        throw new Error(`Index discovery failed on all gateways: ${lastError?.message}`);
    }
    return [...byId.values()]
        .sort((a, b) => (b.timestamp ?? Infinity) - (a.timestamp ?? Infinity))
        .slice(0, first);
}

/**
 * Fetch + decrypt one index entry from Arweave.
 */
export async function fetchIndexEntry(txId, biosSeed) {
    const encrypted = await fetchFromArweave(txId);
    const plaintext = await decryptData(encrypted, biosSeed);
    const parsed = JSON.parse(plaintext);
    if (parsed.type !== INDEX_ENTRY_TYPE) {
        throw new Error(`Transaction ${txId} decrypted but is not an index entry (type=${parsed.type})`);
    }
    return parsed;
}

/**
 * Walk the index chain from a head txid via `supersedes` pointers.
 * Returns { indexes: [decoded, ...newest-first], txIds: [...] }.
 * maxDepth bounds the walk; older history remains reachable but a merged
 * view rarely needs more than a few generations.
 */
export async function walkIndexChain(headTxId, biosSeed, { maxDepth = 10, onStep = null } = {}) {
    const indexes = [];
    const txIds = [];
    let cursor = headTxId;
    const seen = new Set();

    while (cursor && indexes.length < maxDepth) {
        if (seen.has(cursor)) break; // defensive: a cycle would mean a corrupted chain
        seen.add(cursor);
        if (onStep) onStep(cursor, indexes.length);
        const idx = await fetchIndexEntry(cursor, biosSeed);
        indexes.push(idx);
        txIds.push(cursor);
        cursor = idx.supersedes || null;
    }

    return { indexes, txIds };
}

// ─── Transaction id ↔ bytes ──────────────────────────────────────────────────
// Both id families encode exactly 32 bytes: native Arweave txids are
// base64url (43 chars, may contain - and _); Irys data-item ids are base58
// (43-44 chars). The byte form is what fits the PDA's latest_hash field.

import bs58 from 'bs58';

export function txidToBytes(txId) {
    let bytes;
    if (/[-_]/.test(txId) || txId.length === 43 && /=/.test(txId)) {
        const b64 = txId.replace(/-/g, '+').replace(/_/g, '/');
        bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    } else {
        try {
            bytes = bs58.decode(txId);
        } catch {
            const b64 = txId.replace(/-/g, '+').replace(/_/g, '/');
            bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        }
    }
    if (bytes.length !== 32) throw new Error(`Not a 32-byte transaction id: ${txId}`);
    return new Uint8Array(bytes);
}

/** Encode 32 bytes back to candidate txids: [base58, base64url]. */
export function bytesToTxidCandidates(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const b64url = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return [bs58.encode(bytes), b64url];
}
