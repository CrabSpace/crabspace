/**
 * CrabSpace CLI — vault command (Memory Recall v4, §5: the Obsidian mapping)
 *
 * An Obsidian vault IS index-as-content with a UI: plain files, frontmatter
 * tags, wikilinks, zero database. `vault sync` materializes the agent's
 * memory as a real vault — the hot local working set; Arweave stays the
 * cold permanent truth. Agent AND human browse the same brain.
 *
 * Layout:
 *   <vault>/_INDEX.md              — master MOC (map of content)
 *   <vault>/topics/<topic>.md      — one MOC per topic, wikilinked
 *   <vault>/entries/<date>-<id>.md — one note per entry (frontmatter + body)
 *   <vault>/_outbox/               — human/agent edits staged for resubmit
 *   <vault>/.crabspace/sync-state.json
 *
 * Conflict rule (append-only all the way down): chain wins at sync time.
 * A locally edited note is copied to _outbox/ before being overwritten,
 * and `vault push` submits outbox notes back as NEW entries.
 *
 * Usage:
 *   crabspace vault sync [--dir <path>] [--recent N | --all | --summaries-only]
 *   crabspace vault push [--yes]
 *   crabspace vault status
 */

import {
    readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync,
    renameSync, copyFileSync,
} from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { requireConfig, writeConfig, readConfig } from '../lib/config.js';
import { loadKeypair } from '../lib/sign.js';
import { decryptData } from '../lib/encrypt.js';
import { fetchFromArweave } from '../lib/arweave.js';
import { fetchAllEntries } from '../lib/vaultClient.js';
import { buildIndex, topicsForEntry, memoryTypeOf, entryRef } from '../lib/vaultIndex.js';
import { readIndexCache } from './index-cmd.js';
import { submit } from './submit.js';

const DEFAULT_RECENT_BODIES = 30;

export async function vault(args) {
    const sub = args._?.[0] || 'status';
    switch (sub) {
        case 'sync': return sync(args);
        case 'push': return push(args);
        case 'status': return status(args);
        default:
            console.error(`Unknown subcommand: vault ${sub}`);
            console.error('   Usage: crabspace vault sync|push|status');
            process.exit(1);
    }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function resolveVaultDir(args, config) {
    const dir = args.dir || config.vaultDir || join(homedir(), 'CrabSpaceVault');
    return dir.replace('~', homedir());
}

function sha256(text) {
    return createHash('sha256').update(text, 'utf-8').digest('hex');
}

function sanitizeFilename(name) {
    return String(name).replace(/[\/\\:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function statePath(vaultDir) {
    return join(vaultDir, '.crabspace', 'sync-state.json');
}

function readState(vaultDir) {
    const p = statePath(vaultDir);
    if (!existsSync(p)) return { files: {} };
    try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return { files: {} }; }
}

function yamlList(arr) {
    if (!arr || arr.length === 0) return '[]';
    return `[${arr.map(t => JSON.stringify(String(t))).join(', ')}]`;
}

// ─── vault sync ──────────────────────────────────────────────────────────────

async function sync(args) {
    const config = requireConfig();
    const vaultDir = resolveVaultDir(args, config);
    const keypairPath = (args.keypair || config.keypair).replace('~', process.env.HOME);
    const keypair = loadKeypair(keypairPath);
    const apiUrl = args['api-url'] || config.apiUrl;

    console.log(`🧠 Syncing vault → ${vaultDir}`);
    console.log('');

    // ─── 1. Load entries (API cache first, chain-degraded mode second) ──────
    let entries = null;
    let chainMode = false;
    try {
        entries = await fetchAllEntries({
            apiUrl, keypair,
            onPage: n => process.stdout.write(`\r   📥 Fetched ${n} entries from cache...`),
        });
        console.log(`\r   📥 Fetched ${entries.length} entries from cache.        `);
    } catch (err) {
        console.log(`   ⚠  API unreachable (${err.message.slice(0, 60)})`);
        const cache = readIndexCache();
        if (!cache?.merged?.topics) {
            console.error('   ❌ No API and no local index cache. Run `crabspace reindex` first.');
            process.exit(1);
        }
        console.log('   ⛓️  Degrading to chain mode: notes built from the index entry itself.');
        chainMode = true;
        entries = entriesFromIndexCache(cache);
    }

    if (entries.length === 0) {
        console.log('   Vault is empty — nothing to sync.');
        return;
    }

    // ─── 2. Build the topic map ──────────────────────────────────────────────
    const { index } = buildIndex(entries, { agentWallet: keypair.wallet });
    const topics = index.topics;
    const wikilinks = index.wikilinks;

    // ─── 3. Prepare directories + state ──────────────────────────────────────
    for (const d of ['', 'topics', 'entries', '_outbox', '.crabspace']) {
        mkdirSync(join(vaultDir, d), { recursive: true });
    }
    const state = readState(vaultDir);
    const newState = { syncedAt: new Date().toISOString(), files: {} };
    let written = 0, unchanged = 0, editsPreserved = 0;

    const writeNote = (relPath, content) => {
        const abs = join(vaultDir, relPath);
        const newHash = sha256(content);
        if (existsSync(abs)) {
            const current = readFileSync(abs, 'utf-8');
            const currentHash = sha256(current);
            if (currentHash === newHash) {
                unchanged++;
                newState.files[relPath] = newHash;
                return;
            }
            // Human edit detection: file differs from what WE last wrote.
            const lastWritten = state.files?.[relPath];
            if (lastWritten && currentHash !== lastWritten) {
                const outName = `${Date.now()}-${basename(relPath)}`;
                copyFileSync(abs, join(vaultDir, '_outbox', outName));
                editsPreserved++;
                console.log(`   ✏️  Local edit preserved → _outbox/${outName} (chain wins in place)`);
            }
        }
        writeFileSync(abs, content);
        newState.files[relPath] = newHash;
        written++;
    };

    // ─── 4. Entry notes ──────────────────────────────────────────────────────
    // Decrypt full bodies for the newest N (network-bound); summaries for the rest.
    const bodyCount = args.all ? entries.length
        : args['summaries-only'] ? 0
        : Math.min(args.recent ? parseInt(args.recent) : DEFAULT_RECENT_BODIES, entries.length);

    console.log(`   📝 Writing ${entries.length} entry notes (${bodyCount} with full decrypted bodies)...`);

    const entryFiles = new Map(); // ref → relative note path (for wikilinks)
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const ref = entryRef(e) || `row-${i}`;
        const date = (e.created_at || '').slice(0, 10) || 'undated';
        const noteName = sanitizeFilename(`${date}-${ref.replace(/^db:/, '').slice(0, 10)}`);
        const relPath = join('entries', `${noteName}.md`);
        entryFiles.set(ref, noteName);

        let body = null;
        if (i < bodyCount && e.arweave_tx_id && !String(e.arweave_tx_id).startsWith('test_ar_')) {
            try {
                const blob = await fetchFromArweave(e.arweave_tx_id);
                body = await decryptData(blob, config.biosSeed);
                process.stdout.write(`\r   🔓 Decrypted ${i + 1}/${bodyCount}...`);
            } catch { /* summary-only note for this entry */ }
        }

        writeNote(relPath, renderEntryNote(e, ref, body, chainMode));
    }
    if (bodyCount > 0) console.log(`\r   🔓 Decrypted bodies: done.          `);

    // ─── 5. Topic MOCs + master index ────────────────────────────────────────
    console.log(`   🗂️  Writing ${Object.keys(topics).length} topic pages + _INDEX.md...`);
    for (const [topic, t] of Object.entries(topics)) {
        const relPath = join('topics', `${sanitizeFilename(topic)}.md`);
        writeNote(relPath, renderTopicNote(topic, t, wikilinks[topic] || [], entries, entryFiles));
    }
    writeNote('_INDEX.md', renderMasterIndex(index, config, chainMode));

    // ─── 6. Save state + config ──────────────────────────────────────────────
    writeFileSync(statePath(vaultDir), JSON.stringify(newState, null, 2));
    if (!config.vaultDir) {
        writeConfig({ ...readConfig(), vaultDir });
    }

    console.log('');
    console.log('✅ Vault synced.');
    console.log('');
    console.log(`   ${written} notes written, ${unchanged} unchanged${editsPreserved ? `, ${editsPreserved} local edits preserved to _outbox/` : ''}`);
    console.log(`   Open in Obsidian: ${vaultDir}`);
    if (editsPreserved > 0) {
        console.log('   Submit preserved edits back to the chain: crabspace vault push --yes');
    }
}

/** Chain mode: reconstruct minimal entry records from the merged index cache. */
function entriesFromIndexCache(cache) {
    const byRef = new Map();
    for (const [topic, t] of Object.entries(cache.merged.topics)) {
        for (const ref of t.entries || []) {
            if (!byRef.has(ref)) {
                byRef.set(ref, {
                    arweave_tx_id: ref.startsWith('db:') ? null : ref,
                    id: ref.startsWith('db:') ? ref.slice(3) : null,
                    private_tags: [],
                    tags: [],
                    summary: null,
                    private_summary: null,
                    created_at: null,
                    project_name: null,
                });
            }
            byRef.get(ref).private_tags.push(topic);
        }
        // The topic hook doubles as a summary for its most recent entry.
        const first = t.entries?.[0];
        if (first && byRef.has(first) && !byRef.get(first).private_summary) {
            byRef.get(first).private_summary = t.hook;
        }
    }
    return [...byRef.values()];
}

function renderEntryNote(e, ref, body, chainMode) {
    const topics = topicsForEntry(e);
    const memType = memoryTypeOf(e);
    const fm = [
        '---',
        `crabspace_ref: ${JSON.stringify(ref)}`,
        e.arweave_tx_id ? `arweave_tx: ${JSON.stringify(e.arweave_tx_id)}` : null,
        e.created_at ? `created: ${e.created_at}` : null,
        memType ? `memory_type: ${memType}` : null,
        `tags: ${yamlList([...(e.tags || []), ...(e.private_tags || [])])}`,
        e.source_file ? `source_file: ${JSON.stringify(e.source_file)}` : null,
        e.source_author ? `source_author: ${JSON.stringify(e.source_author)}` : null,
        e.on_chain_sig ? `solana_anchor: ${JSON.stringify(e.on_chain_sig)}` : null,
        'origin: crabspace-sync',
        '---',
    ].filter(Boolean).join('\n');

    const lines = [fm, ''];
    const summary = e.private_summary || e.summary;
    if (summary) lines.push(`> ${summary}`, '');
    if (topics.length) {
        lines.push(`Topics: ${topics.map(t => `[[${sanitizeFilename(t)}]]`).join(' ')}`, '');
    }
    if (body) {
        lines.push('---', '', body, '');
    } else if (e.arweave_tx_id) {
        lines.push('---', '', `_Body not synced. Fetch it: \`crabspace read --keyword "..."\` or re-sync with \`--all\`._`, '');
    } else if (!chainMode) {
        lines.push('---', '', '_No permanent blob for this entry (predates Arweave storage)._', '');
    }
    return lines.join('\n');
}

function renderTopicNote(topic, t, related, entries, entryFiles) {
    const lines = [
        '---',
        `topic: ${JSON.stringify(topic)}`,
        `entry_count: ${t.count}`,
        'origin: crabspace-sync',
        '---',
        '',
        `# ${topic}`,
        '',
        `> ${t.hook}`,
        '',
    ];
    if (related.length) {
        lines.push(`Related: ${related.map(r => `[[${sanitizeFilename(r)}]]`).join(' ')}`, '');
    }
    lines.push('## Entries', '');
    for (const ref of t.entries || []) {
        const note = entryFiles.get(ref);
        const e = entries.find(x => entryRef(x) === ref);
        const date = e?.created_at ? e.created_at.slice(0, 10) : '';
        const hook = (e?.private_summary || e?.summary || '').replace(/\s+/g, ' ').slice(0, 90);
        lines.push(note ? `- [[${note}]] ${date}${hook ? ` — ${hook}` : ''}` : `- \`${ref}\``);
    }
    if (t.children) {
        lines.push('', `_Full listing lives in a sub-index on chain: \`${t.children}\`_`);
    }
    return lines.join('\n') + '\n';
}

function renderMasterIndex(index, config, chainMode) {
    const sorted = Object.entries(index.topics).sort((a, b) => b[1].count - a[1].count);
    const lines = [
        '---',
        'origin: crabspace-sync',
        `as_of: ${index.as_of?.created_at || 'unknown'}`,
        `entry_count: ${index.as_of?.entry_count ?? 'unknown'}`,
        '---',
        '',
        `# ${config.agentName || 'Agent'}'s Brain — Master Index`,
        '',
        `${index.as_of?.entry_count ?? '?'} entries across ${sorted.length} topics.`,
        chainMode
            ? '_Built from the on-chain index entry (API was unreachable — and it didn\'t matter)._'
            : '_Hot local working set. Cold permanent truth lives on Arweave._',
        '',
        '| Topic | Entries | Hook |',
        '|---|---|---|',
    ];
    for (const [topic, t] of sorted) {
        lines.push(`| [[${sanitizeFilename(topic)}]] | ${t.count} | ${t.hook.replace(/\|/g, '\\|')} |`);
    }
    lines.push('', '_Edit any note freely — at next sync, chain wins in place and your edit is preserved to `_outbox/` for resubmission (`crabspace vault push`). Append-only all the way down._');
    return lines.join('\n') + '\n';
}

// ─── vault push ──────────────────────────────────────────────────────────────

/**
 * Submit staged notes in _outbox/ back to the chain as NEW entries.
 * Frontmatter (if present) supplies tags/type/summary; the note body is
 * the entry description. Requires --yes because this writes permanently.
 */
async function push(args) {
    const config = requireConfig();
    const vaultDir = resolveVaultDir(args, config);
    const outboxDir = join(vaultDir, '_outbox');

    if (!existsSync(outboxDir)) {
        console.log('   No _outbox/ directory — nothing staged. Run `crabspace vault sync` first.');
        return;
    }
    const files = readdirSync(outboxDir).filter(f => f.endsWith('.md'));
    if (files.length === 0) {
        console.log('   Outbox is empty — nothing to push.');
        return;
    }

    console.log(`📤 Vault push — ${files.length} staged note(s):`);
    for (const f of files) console.log(`   · ${f}`);
    console.log('');

    if (!args.yes) {
        console.log('   Dry run. These would be submitted as NEW entries (permanent, Arweave).');
        console.log('   Re-run with --yes to submit.');
        return;
    }

    const submittedDir = join(outboxDir, 'submitted');
    mkdirSync(submittedDir, { recursive: true });

    for (const f of files) {
        const path = join(outboxDir, f);
        const raw = readFileSync(path, 'utf-8');
        const { meta, body } = parseFrontmatter(raw);

        console.log(`   📨 Submitting ${f}...`);
        await submit({
            description: body.trim(),
            type: meta.memory_type || 'derived',
            tags: (meta.tags || []).join(',') || undefined,
            'private-tags': (meta.private_tags || []).join(',') || undefined,
            summary: meta.summary || `Vault edit: ${f.replace(/^\d+-/, '').replace(/\.md$/, '')}`.slice(0, 150),
            'source-file': meta.source_file || f,
            keypair: args.keypair,
            'api-url': args['api-url'],
        });
        renameSync(path, join(submittedDir, f));
    }

    console.log('');
    console.log(`✅ Pushed ${files.length} note(s). Originals moved to _outbox/submitted/.`);
    console.log('   Tip: publish a fresh index so the new entries are mapped:');
    console.log('        crabspace index publish --publish');
}

/** Minimal frontmatter parser for notes this CLI generated. */
export function parseFrontmatter(raw) {
    if (!raw.startsWith('---')) return { meta: {}, body: raw };
    const end = raw.indexOf('\n---', 3);
    if (end === -1) return { meta: {}, body: raw };
    const metaBlock = raw.slice(4, end);
    const body = raw.slice(end + 4).replace(/^\n/, '');

    const meta = {};
    for (const line of metaBlock.split('\n')) {
        const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
        if (!m) continue;
        const [, key, valRaw] = m;
        let val = valRaw.trim();
        if (val.startsWith('[') && val.endsWith(']')) {
            meta[key] = val.slice(1, -1).split(',')
                .map(s => s.trim().replace(/^"|"$/g, ''))
                .filter(Boolean);
        } else {
            meta[key] = val.replace(/^"|"$/g, '');
        }
    }
    return { meta, body };
}

// ─── vault status ────────────────────────────────────────────────────────────

async function status(args) {
    const config = requireConfig();
    const vaultDir = resolveVaultDir(args, config);

    console.log('🧠 Vault Status');
    console.log('');
    console.log(`   Directory: ${vaultDir}${existsSync(vaultDir) ? '' : ' (not created yet — run `crabspace vault sync`)'}`);
    if (!existsSync(vaultDir)) return;

    const state = readState(vaultDir);
    const noteCount = Object.keys(state.files || {}).length;
    console.log(`   Last sync: ${state.syncedAt || 'never'}`);
    console.log(`   Notes:     ${noteCount}`);

    // Detect drift: files edited since last sync
    let edited = 0;
    for (const [relPath, hash] of Object.entries(state.files || {})) {
        const abs = join(vaultDir, relPath);
        if (existsSync(abs) && sha256(readFileSync(abs, 'utf-8')) !== hash) edited++;
    }
    if (edited) console.log(`   ✏️  ${edited} note(s) edited locally since last sync (preserved to _outbox/ at next sync)`);

    const outboxDir = join(vaultDir, '_outbox');
    if (existsSync(outboxDir)) {
        const staged = readdirSync(outboxDir).filter(f => f.endsWith('.md')).length;
        if (staged) console.log(`   📤 ${staged} note(s) staged in _outbox/ — submit with: crabspace vault push --yes`);
    }
    console.log('');
}
