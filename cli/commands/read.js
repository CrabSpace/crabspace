/**
 * CrabSpace CLI — read command
 * Search + decrypt: finds entries by tag/keyword, fetches encrypted
 * content from Arweave, decrypts with BIOS Seed, and returns full text.
 *
 * Two-step approach:
 *   1. Search via /api/cog/search (returns metadata + entry IDs)
 *   2. Fetch full entries from /api/work (returns arweave_tx_id for decrypt)
 *
 * Usage:
 *   crabspace read --tags narrative-funnel
 *   crabspace read --private-tags notion-import --limit 3
 *   crabspace read --keyword "creator burnout" --limit 5
 *   crabspace read --tags goshi --summary-only
 *   crabspace read --tags goshi --truncate 500
 */

import { loadKeypair, signForAction } from '../lib/sign.js';
import { requireConfig } from '../lib/config.js';
import { decryptWithHistory } from '../lib/encrypt.js';
import { fetchFromArweave } from '../lib/arweave.js';

export async function read(args) {
    const config = requireConfig();

    // ─── Parse search criteria ──────────────────────────────────────────────
    if (!args['private-tags'] && !args.tags && !args.keyword) {
        console.error('❌ No search criteria provided.');
        console.error('');
        console.error('   Usage:');
        console.error('     crabspace read --tags narrative-funnel');
        console.error('     crabspace read --private-tags notion-import --limit 3');
        console.error('     crabspace read --keyword "creator burnout"');
        console.error('     crabspace read --tags goshi --summary-only');
        console.error('');
        process.exit(1);
    }

    if (!config.biosSeed) {
        console.error('❌ BIOS Seed not found in config. Run `crabspace verify` first.');
        process.exit(1);
    }

    // ─── Step 1: Search for entry metadata ──────────────────────────────────
    const params = new URLSearchParams();

    if (args['private-tags']) params.set('private_tags', String(args['private-tags']));
    if (args.tags) params.set('tags', String(args.tags));
    if (args.keyword) params.set('keyword', String(args.keyword));

    const limit = args.limit || 5;
    params.set('limit', String(limit));

    // Sign request for wallet authentication
    const keypairPath = args.keypair || config.keypair;
    const resolvedPath = keypairPath.replace('~', process.env.HOME);
    const keypair = loadKeypair(resolvedPath);
    const { signature, message } = signForAction('search', keypair);

    params.set('wallet', keypair.wallet);
    params.set('signature', signature);
    params.set('message', message);

    const apiUrl = args['api-url'] || config.apiUrl;
    const searchUrl = `${apiUrl}/api/cog/search?${params.toString()}`;

    const summaryOnly = args['summary-only'] || false;

    console.log('');
    console.log('📖 CrabSpace Read');
    console.log('');
    if (args['private-tags']) console.log(`   🔒 Private tags: ${args['private-tags']}`);
    if (args.tags) console.log(`   🏷️  Tags: ${args.tags}`);
    if (args.keyword) console.log(`   🔎 Keyword: "${args.keyword}"`);
    console.log(`   📋 Limit: ${limit}`);
    if (summaryOnly) console.log('   📝 Summary only (no full decrypt)');
    console.log('');

    let searchEntries;
    try {
        const res = await fetch(searchUrl);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error(`❌ Search failed: ${err.error || res.statusText}`);
            process.exit(1);
        }
        const data = await res.json();
        searchEntries = data.entries || [];
    } catch (err) {
        console.error(`❌ Search failed: ${err.message}`);
        process.exit(1);
    }

    if (searchEntries.length === 0) {
        console.log('   No entries found.');
        return;
    }

    console.log(`   Found ${searchEntries.length} entries. ${summaryOnly ? 'Showing summaries.' : 'Fetching content...'}`);
    console.log('');

    // ─── Step 2: Fetch full entries from /api/work (includes arweave_tx_id) ─
    // We need arweave_tx_id to fetch encrypted blobs — the search API
    // might not include it (depends on deployment state).
    let fullEntries;
    if (!summaryOnly) {
        try {
            // Signed request — /api/work only returns private fields (incl. the
            // inline encrypted description fallback) to the authenticated owner.
            const workAuth = signForAction('search', keypair);
            const workParams = new URLSearchParams({
                wallet: keypair.wallet,
                limit: String(limit + 10),
                signature: workAuth.signature,
                message: workAuth.message,
            });
            const workUrl = `${apiUrl}/api/work?${workParams}`;
            const workRes = await fetch(workUrl, { signal: AbortSignal.timeout(10000) });
            if (!workRes.ok) throw new Error(`API returned ${workRes.status}`);
            const workData = await workRes.json();
            fullEntries = workData.entries || [];
        } catch (err) {
            console.log(`   ⚠️  Could not fetch full entries: ${err.message}`);
            console.log('   Falling back to summaries only.');
            fullEntries = [];
        }
    }

    // ─── Display + decrypt each entry ───────────────────────────────────────
    let decrypted = 0;
    let failed = 0;

    for (let i = 0; i < searchEntries.length; i++) {
        const entry = searchEntries[i];
        const date = new Date(entry.created_at).toISOString().split('T')[0];
        const num = String(i + 1).padStart(2, ' ');

        console.log('━'.repeat(60));
        console.log(`  ${num}. [${date}] ${entry.project_name || 'Entry'}`);

        // Show tags
        if (entry.tags && entry.tags.length > 0) {
            console.log(`      🏷️  ${entry.tags.join(', ')}`);
        }
        if (entry.private_tags && entry.private_tags.length > 0) {
            console.log(`      🔒 ${entry.private_tags.join(', ')}`);
        }

        // Show summary
        if (entry.private_summary) {
            console.log(`      📋 ${entry.private_summary}`);
        } else if (entry.summary) {
            console.log(`      📋 ${entry.summary}`);
        }

        // Source info
        if (entry.source_author) console.log(`      ✍️  ${entry.source_author}`);
        if (entry.source_file) console.log(`      📄 ${entry.source_file}`);

        if (summaryOnly) {
            console.log('');
            continue;
        }

        // ─── Decrypt full content ───────────────────────────────────────────
        // Find matching full entry (by ID) from /api/work response
        const fullEntry = fullEntries?.find(fe => fe.id === entry.id);
        const arweaveTxId = fullEntry?.arweave_tx_id || entry.arweave_tx_id;
        const inlineDesc = fullEntry?.description || entry.description;

        console.log('      🔐 Decrypting...');

        let content = null;

        // Try Arweave first (primary storage)
        if (arweaveTxId) {
            try {
                const encryptedBlob = await fetchFromArweave(arweaveTxId);
                content = await decryptWithHistory(encryptedBlob, config);
                decrypted++;
            } catch (e) {
                console.log(`      ⚠️  Arweave decrypt failed: ${e.message?.slice(0, 60)}`);
            }
        }

        // Fallback: try inline description field
        if (!content && inlineDesc) {
            try {
                content = await decryptWithHistory(inlineDesc, config);
                decrypted++;
            } catch (e) {
                console.log(`      ⚠️  Inline decrypt failed: ${e.message?.slice(0, 60)}`);
            }
        }

        if (content) {
            console.log('');

            // Default truncate to 2000 chars to prevent context exhaustion.
            // Use --full to see entire document, or --truncate N for custom limit.
            const defaultTruncate = args.full ? 0 : 2000;
            const truncate = args.truncate ? parseInt(args.truncate) : defaultTruncate;
            if (truncate > 0 && content.length > truncate) {
                console.log(content.slice(0, truncate));
                console.log(`\n      ... [truncated at ${truncate} chars, full: ${content.length} chars]`);
                console.log(`      Use --full to see entire document, or --truncate N for custom limit.`);
            } else {
                console.log(content);
            }
        } else {
            if (!arweaveTxId && !inlineDesc) {
                console.log('      ⚠️  No encrypted content found (entry may predate Arweave storage).');
            } else {
                console.log('      ❌ Could not decrypt this entry.');
            }
            failed++;
        }

        console.log('');
    }

    // ─── Summary ────────────────────────────────────────────────────────────
    console.log('━'.repeat(60));
    console.log(`  📊 Read Results: ${decrypted} decrypted, ${failed} failed, ${searchEntries.length} total`);
    console.log('━'.repeat(60));
    console.log('');
}
