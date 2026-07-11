/**
 * CrabSpace CLI — embed + recall commands (Memory Recall v4, Phase B)
 *
 * Usage:
 *   crabspace embed backfill        — (re)embed all entries' metadata
 *   crabspace embed status          — cache coverage + model info
 *   crabspace recall "<situation>"  — semantic search: what do I know about this?
 */

import { requireConfig } from '../lib/config.js';
import { loadKeypair } from '../lib/sign.js';
import { fetchAllEntries } from '../lib/vaultClient.js';
import { entryRef } from '../lib/vaultIndex.js';
import {
    embedTexts, embeddingTextFor, semanticSearch, resolveEmbeddingKey,
    readEmbeddingCache, writeEmbeddingCache, embeddingsPath, EMBEDDING_MODEL,
} from '../lib/embeddings.js';

export async function embed(args) {
    const sub = args._?.[0] || 'status';
    switch (sub) {
        case 'backfill': return backfill(args);
        case 'status': return status(args);
        default:
            console.error(`Unknown subcommand: embed ${sub}`);
            console.error('   Usage: crabspace embed backfill|status');
            process.exit(1);
    }
}

async function backfill(args) {
    const config = requireConfig();
    const apiKey = resolveEmbeddingKey(config);
    if (!apiKey) {
        console.error('❌ No embedding API key. Set "embeddingApiKey" in ~/.crabspace/config.json');
        console.error('   or export OPENAI_API_KEY.');
        process.exit(1);
    }

    const keypairPath = (args.keypair || config.keypair).replace('~', process.env.HOME);
    const keypair = loadKeypair(keypairPath);
    const apiUrl = args['api-url'] || config.apiUrl;

    console.log('🧮 Embedding vault metadata...');
    const entries = await fetchAllEntries({
        apiUrl, keypair,
        onPage: n => process.stdout.write(`\r   📥 Fetched ${n} entries...`),
    });
    console.log(`\r   📥 Fetched ${entries.length} entries.        `);

    const cache = args.force ? { model: EMBEDDING_MODEL, entries: {} } : readEmbeddingCache();
    if (cache.model !== EMBEDDING_MODEL) {
        console.log(`   ♻️  Model changed (${cache.model} → ${EMBEDDING_MODEL}) — full re-embed.`);
        cache.entries = {};
        cache.model = EMBEDDING_MODEL;
    }

    // Only embed entries that are new or whose metadata text changed.
    const pending = [];
    for (const e of entries) {
        const id = String(e.id || entryRef(e));
        const text = embeddingTextFor(e);
        if (!text.trim()) continue;
        const existing = cache.entries[id];
        if (existing && existing.textLen === text.length) continue;
        pending.push({ id, text, e });
    }
    console.log(`   ${pending.length} entries to embed (${Object.keys(cache.entries).length} cached, model ${EMBEDDING_MODEL}).`);

    if (pending.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < pending.length; i += CHUNK) {
            const chunk = pending.slice(i, i + CHUNK);
            const vectors = await embedTexts(chunk.map(p => p.text), apiKey);
            chunk.forEach((p, j) => {
                cache.entries[p.id] = {
                    vector: vectors[j],
                    textLen: p.text.length,
                    meta: {
                        ref: entryRef(p.e),
                        created_at: p.e.created_at,
                        project_name: p.e.project_name,
                        tags: [...(p.e.private_tags || []), ...(p.e.tags || [])].slice(0, 10),
                        hook: (p.e.private_summary || p.e.summary || '').replace(/\s+/g, ' ').slice(0, 140),
                    },
                };
            });
            process.stdout.write(`\r   🧮 Embedded ${Math.min(i + CHUNK, pending.length)}/${pending.length}...`);
        }
        console.log('');
    }

    cache.generatedAt = new Date().toISOString();
    writeEmbeddingCache(cache);
    console.log('');
    console.log(`✅ Embedding cache ready: ${Object.keys(cache.entries).length} entries → ${embeddingsPath()}`);
    console.log('   Try it: crabspace recall "that thing about creative work under obligation"');
}

async function status() {
    const cache = readEmbeddingCache();
    const n = Object.keys(cache.entries).length;
    console.log('🧮 Embedding Status');
    console.log('');
    console.log(`   Model:     ${cache.model}`);
    console.log(`   Entries:   ${n}`);
    console.log(`   Generated: ${cache.generatedAt || 'never'}`);
    console.log(`   Cache:     ${embeddingsPath()}`);
    if (n === 0) console.log('   Run: crabspace embed backfill');
}

/** `crabspace recall "<situation>"` — the v4 fuzzy-recall UX. */
export async function recall(args) {
    const config = requireConfig();
    const apiKey = resolveEmbeddingKey(config);
    if (!apiKey) {
        console.error('❌ No embedding API key. Set "embeddingApiKey" in ~/.crabspace/config.json.');
        process.exit(1);
    }
    const query = args._?.join(' ') || args.query;
    if (!query) {
        console.error('❌ No query. Usage: crabspace recall "creative work under obligation"');
        process.exit(1);
    }
    const topK = args.limit ? parseInt(args.limit) : 8;

    console.log(`🧠 Recall: "${query}"`);
    console.log('');
    const results = await semanticSearch(query, apiKey, { topK });
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const date = r.meta.created_at?.slice(0, 10) || 'undated';
        const pct = Math.round(r.score * 100);
        console.log(`${String(i + 1).padStart(2, ' ')}. [${date}] ${pct}% — ${r.meta.hook || r.meta.project_name || r.id}`);
        if (r.meta.tags?.length) console.log(`      🔒 ${r.meta.tags.join(', ')}`);
    }
    console.log('');
    console.log('   Read one in full: crabspace read --private-tags <tag> --limit 1 --full');
}
