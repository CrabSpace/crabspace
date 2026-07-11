/**
 * CrabSpace CLI — Memory Recall v4 Unit Tests
 * Pure-function coverage for the index-as-content core: topic derivation,
 * index building, sub-index splitting, chain merge, and frontmatter parse.
 *
 * Run: node --test cli/test/vault-index.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Isolate from production config before importing anything config-adjacent.
import { join } from 'path';
import { homedir } from 'os';
process.env.CRABSPACE_CONFIG_DIR = join(homedir(), '.crabspace-test-unit-v4');

const {
    topicsForEntry, memoryTypeOf, entryRef, normalizeTopic,
    buildIndex, buildSubIndex, attachChildren, mergeIndexChain,
    buildWikilinks, envelopeSize, TOPIC_SPLIT_THRESHOLD,
} = await import('../lib/vaultIndex.js');

const { parseFrontmatter } = await import('../commands/vault.js');

function fakeEntry(overrides = {}) {
    return {
        id: overrides.id ?? Math.random().toString(36).slice(2),
        arweave_tx_id: 'ar_' + (overrides.id ?? 'x'),
        project_name: 'eisner:memory:episodic',
        tags: [],
        private_tags: [],
        summary: null,
        private_summary: null,
        created_at: '2026-07-01T00:00:00Z',
        ...overrides,
    };
}

describe('topic derivation', () => {
    it('prefers private tags, includes public tags', () => {
        const e = fakeEntry({ private_tags: ['goshi', 'stack'], tags: ['canon'] });
        assert.deepEqual(topicsForEntry(e).sort(), ['canon', 'goshi', 'stack']);
    });

    it('falls back to memory type namespace for untagged entries', () => {
        const e = fakeEntry({ project_name: 'eisner:memory:decision' });
        assert.deepEqual(topicsForEntry(e), ['type:decision']);
    });

    it('lands untagged non-memory entries in "untagged" — nothing unreachable', () => {
        const e = fakeEntry({ project_name: 'Autonomous Work' });
        assert.deepEqual(topicsForEntry(e), ['untagged']);
    });

    it('normalizes topics: lowercase, hyphenated, capped', () => {
        assert.equal(normalizeTopic('  Boring Bridge V2 '), 'boring-bridge-v2');
        assert.equal(normalizeTopic('x'.repeat(100)).length, 64);
    });

    it('memoryTypeOf parses agent:memory:type project names', () => {
        assert.equal(memoryTypeOf(fakeEntry({ project_name: 'eisner:memory:will' })), 'will');
        assert.equal(memoryTypeOf(fakeEntry({ project_name: 'Autonomous Work' })), null);
    });

    it('entryRef prefers arweave txid, falls back to db id', () => {
        assert.equal(entryRef({ arweave_tx_id: 'abc', id: '1' }), 'abc');
        assert.equal(entryRef({ arweave_tx_id: null, id: '42' }), 'db:42');
        assert.equal(entryRef({}), null);
    });
});

describe('buildIndex', () => {
    it('builds a v4 envelope with supersedes and as_of watermark', () => {
        const entries = [
            fakeEntry({ id: 'old', private_tags: ['goshi'], created_at: '2026-06-01T00:00:00Z' }),
            fakeEntry({ id: 'new', private_tags: ['goshi'], private_summary: 'GOSHI whitepaper synthesis', created_at: '2026-07-01T00:00:00Z' }),
        ];
        const { index } = buildIndex(entries, { agentWallet: 'W', supersedes: 'prev_tx' });

        assert.equal(index.type, 'index');
        assert.equal(index.supersedes, 'prev_tx');
        assert.equal(index.as_of.tx, 'ar_new');
        assert.equal(index.as_of.entry_count, 2);
        assert.equal(index.topics.goshi.count, 2);
        // Newest-first ordering inside a topic
        assert.deepEqual(index.topics.goshi.entries, ['ar_new', 'ar_old']);
        // Hook comes from the newest entry with a summary
        assert.match(index.topics.goshi.hook, /GOSHI whitepaper/);
        // Embedding field reserved for Phase B
        assert.equal(index.embedding_model, null);
    });

    it('splits oversized topics and keeps 10 inline for fast recall', () => {
        const big = Array.from({ length: TOPIC_SPLIT_THRESHOLD + 5 }, (_, i) =>
            fakeEntry({ id: `e${i}`, private_tags: ['huge'], created_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` }));
        const { index, oversizedTopics } = buildIndex(big, { agentWallet: 'W' });

        assert.equal(oversizedTopics.length, 1);
        assert.equal(oversizedTopics[0].topic, 'huge');
        assert.equal(index.topics.huge.entries.length, 10);
        assert.equal(index.topics.huge.count, TOPIC_SPLIT_THRESHOLD + 5);
        assert.equal(index.topics.huge.children, null);

        // Sub-index carries the full listing; master gets wired to it
        const sub = buildSubIndex('huge', oversizedTopics[0].entries, { agentWallet: 'W' });
        assert.equal(sub.subindex_of, 'huge');
        assert.equal(sub.entries.length, TOPIC_SPLIT_THRESHOLD + 5);

        attachChildren(index, { huge: 'sub_tx_id' });
        assert.equal(index.topics.huge.children, 'sub_tx_id');
    });

    it('stays well under the 32KB envelope target at Eisner scale (~400 entries)', () => {
        const entries = Array.from({ length: 400 }, (_, i) =>
            fakeEntry({
                id: `e${i}`,
                private_tags: [`topic-${i % 25}`],
                private_summary: 'A representative one-line summary of the entry contents.',
                created_at: '2026-07-01T00:00:00Z',
            }));
        const { index } = buildIndex(entries, { agentWallet: 'W' });
        // 400 refs + hooks + wikilinks should serialize comfortably.
        assert.ok(envelopeSize(index) < 64 * 1024, `envelope was ${envelopeSize(index)} bytes`);
    });
});

describe('wikilinks (co-occurrence graph)', () => {
    it('links topics sharing >=2 entries, skips single co-occurrence', () => {
        const entries = [
            fakeEntry({ id: '1', private_tags: ['flowzilla', 'succession'] }),
            fakeEntry({ id: '2', private_tags: ['flowzilla', 'succession'] }),
            fakeEntry({ id: '3', private_tags: ['flowzilla', 'one-off'] }),
        ];
        const links = buildWikilinks(entries);
        assert.deepEqual(links.flowzilla, ['succession']);
        assert.deepEqual(links.succession, ['flowzilla']);
        assert.equal(links['one-off'], undefined);
    });
});

describe('mergeIndexChain', () => {
    it('newest index wins per topic; older topics survive if dropped later', () => {
        const newest = {
            as_of: { entry_count: 100, created_at: '2026-07-01T00:00:00Z' },
            topics: { goshi: { count: 10, hook: 'new hook', entries: ['a'] } },
            wikilinks: { goshi: ['stack'] },
        };
        const older = {
            as_of: { entry_count: 50, created_at: '2026-06-01T00:00:00Z' },
            topics: {
                goshi: { count: 5, hook: 'old hook', entries: ['b'] },
                'legacy-topic': { count: 3, hook: 'still reachable', entries: ['c'] },
            },
            wikilinks: {},
        };
        const merged = mergeIndexChain([newest, older]);

        assert.equal(merged.topics.goshi.hook, 'new hook');           // newest wins
        assert.equal(merged.topics['legacy-topic'].hook, 'still reachable'); // nothing lost
        assert.equal(merged.as_of.entry_count, 100);                  // watermark from head
        assert.equal(merged.chain_length, 2);
    });
});

describe('parseFrontmatter (vault push)', () => {
    it('round-trips generated note frontmatter', () => {
        const note = [
            '---',
            'crabspace_ref: "ar_abc"',
            'memory_type: decision',
            'tags: ["goshi", "canon"]',
            'source_file: "AF_Vol2.docx"',
            '---',
            '',
            'The note body.',
        ].join('\n');
        const { meta, body } = parseFrontmatter(note);
        assert.equal(meta.crabspace_ref, 'ar_abc');
        assert.equal(meta.memory_type, 'decision');
        assert.deepEqual(meta.tags, ['goshi', 'canon']);
        assert.equal(body.trim(), 'The note body.');
    });

    it('passes through notes without frontmatter untouched', () => {
        const { meta, body } = parseFrontmatter('Just a human note.');
        assert.deepEqual(meta, {});
        assert.equal(body, 'Just a human note.');
    });
});
