/**
 * CrabSpace CLI — Embeddings (Memory Recall v4, Phase B: fuzzy recall)
 *
 * Tags answer "where is topic X." Vectors answer "what do I know about
 * this situation." Each entry gets an embedding of its metadata text
 * (summaries + tags); recall is brute-force cosine over the local vector
 * cache — at vault scale (thousands of entries) that's milliseconds, no
 * ANN index needed yet.
 *
 * The local cache (~/.crabspace/embeddings.json) is — like everything
 * local — rebuildable: `crabspace embed backfill` regenerates it from the
 * entry metadata. The embedding model id is stamped so a future re-embed
 * pass knows what to redo (v4 design §4).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from './config.js';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
const OPENAI_URL = 'https://api.openai.com/v1/embeddings';
const BATCH_SIZE = 100;

export function embeddingsPath() {
    return join(getConfigDir(), 'embeddings.json');
}

export function readEmbeddingCache() {
    const p = embeddingsPath();
    if (!existsSync(p)) return { model: EMBEDDING_MODEL, generatedAt: null, entries: {} };
    try { return JSON.parse(readFileSync(p, 'utf-8')); } catch {
        return { model: EMBEDDING_MODEL, generatedAt: null, entries: {} };
    }
}

export function writeEmbeddingCache(cache) {
    writeFileSync(embeddingsPath(), JSON.stringify(cache));
}

/** Resolve the embedding API key: config.embeddingApiKey, then env. */
export function resolveEmbeddingKey(config) {
    return config.embeddingApiKey || process.env.OPENAI_API_KEY || null;
}

/**
 * The text that represents an entry in vector space: summaries carry the
 * meaning, tags carry the vocabulary. Bodies stay encrypted and unfetched —
 * metadata embedding is cheap, fast, and works offline from the cache.
 */
export function embeddingTextFor(entry) {
    return [
        entry.private_summary,
        entry.summary,
        (entry.private_tags || []).join(' '),
        (entry.tags || []).join(' '),
        entry.project_name,
    ].filter(Boolean).join('\n').slice(0, 6000);
}

/**
 * Embed a list of strings. Returns array of Float arrays (same order).
 */
export async function embedTexts(texts, apiKey) {
    const vectors = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const res = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
            signal: AbortSignal.timeout(60000),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Embedding API error ${res.status}: ${err.error?.message || res.statusText}`);
        }
        const data = await res.json();
        // API returns items with an index field; keep order explicit.
        const sorted = [...data.data].sort((a, b) => a.index - b.index);
        for (const item of sorted) {
            // Round to 6 decimals — visually lossless for cosine ranking,
            // roughly halves the cache size on disk.
            vectors.push(item.embedding.map(v => Math.round(v * 1e6) / 1e6));
        }
    }
    return vectors;
}

export function cosineSim(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Semantic recall over the local cache.
 * @returns [{id, score, meta}] sorted by score desc
 */
export async function semanticSearch(query, apiKey, { topK = 8 } = {}) {
    const cache = readEmbeddingCache();
    const ids = Object.keys(cache.entries);
    if (ids.length === 0) {
        throw new Error('No embedding cache. Run `crabspace embed backfill` first.');
    }
    const [queryVec] = await embedTexts([query], apiKey);
    const scored = ids.map(id => ({
        id,
        score: cosineSim(queryVec, cache.entries[id].vector),
        meta: cache.entries[id].meta,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}
