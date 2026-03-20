/**
 * CrabSpace CLI — search command
 * Searches the vault by private tags, fuzzy keyword, or public tags.
 * Output formatted for Eisner consumption.
 *
 * Usage:
 *   crabspace search --private-tags af-vol2,five-year-question
 *   crabspace search --keyword "creative work survives obligation"
 *   crabspace search --tags canon --cog-only
 *   crabspace search --keyword "boring bridge" --limit 5 --full
 */

import { loadKeypair, signForAction } from '../lib/sign.js';
import { requireConfig } from '../lib/config.js';

export async function search(args) {
    const config = requireConfig();

    // Build query params
    const params = new URLSearchParams();

    // Private tags (exact match, wallet-authenticated)
    if (args['private-tags']) {
        params.set('private_tags', String(args['private-tags']));
    }

    // Public tags
    if (args.tags) {
        params.set('tags', String(args.tags));
    }

    // Keyword (fuzzy match on private_summary via pg_trgm)
    if (args.keyword) {
        params.set('keyword', String(args.keyword));
    }

    // COG-only filter
    if (args['cog-only']) {
        params.set('cog_eligible', 'true');
    }

    // Limit
    const limit = args.limit || 20;
    params.set('limit', String(limit));

    // Require at least one search criterion
    if (!args['private-tags'] && !args.tags && !args.keyword) {
        console.error('❌ No search criteria provided.');
        console.error('');
        console.error('   Usage:');
        console.error('     crabspace search --private-tags af-vol2,five-year-question');
        console.error('     crabspace search --keyword "creative obligation"');
        console.error('     crabspace search --tags canon --cog-only');
        console.error('');
        process.exit(1);
    }

    // Sign request for wallet authentication (needed for private tag access)
    const keypairPath = args.keypair || config.keypair;
    const resolvedPath = keypairPath.replace('~', process.env.HOME);
    const keypair = loadKeypair(resolvedPath);
    const { signature, message } = signForAction('search', keypair);

    // Add auth params
    params.set('wallet', keypair.wallet);
    params.set('signature', signature);
    params.set('message', message);

    const apiUrl = args['api-url'] || config.apiUrl;
    const url = `${apiUrl}/api/cog/search?${params.toString()}`;

    console.log('🔍 Searching vault...');
    if (args['private-tags']) console.log(`   🔒 Private tags: ${args['private-tags']}`);
    if (args.tags) console.log(`   🏷️  Tags: ${args.tags}`);
    if (args.keyword) console.log(`   🔎 Keyword: "${args.keyword}"`);
    console.log('');

    try {
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error(`❌ Search failed: ${err.error || res.statusText}`);
            process.exit(1);
        }

        const data = await res.json();
        const entries = data.entries || [];

        if (entries.length === 0) {
            console.log('   No entries found.');
            return;
        }

        console.log(`   Found ${entries.length} entries${data.total > entries.length ? ` (showing ${entries.length} of ${data.total})` : ''}:\n`);

        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const date = new Date(e.created_at).toISOString().split('T')[0];
            const num = String(i + 1).padStart(2, ' ');

            console.log(`${num}. [${date}] ${e.project_name || 'Entry'}`);

            // Show private tags if present
            if (e.private_tags && e.private_tags.length > 0) {
                console.log(`    🔒 ${e.private_tags.join(', ')}`);
            }

            // Show public tags if present
            if (e.tags && e.tags.length > 0) {
                console.log(`    🏷️  ${e.tags.join(', ')}`);
            }

            // Show private summary (primary content for Eisner)
            if (e.private_summary) {
                const summary = e.private_summary.length > 200
                    ? e.private_summary.slice(0, 200) + '...'
                    : e.private_summary;
                console.log(`    "${summary}"`);
            } else if (e.summary) {
                console.log(`    "${e.summary}"`);
            }

            // Show source file if present
            if (e.source_file) {
                console.log(`    📄 ${e.source_file}`);
            }

            // Show source author if different from agent
            if (e.source_author) {
                console.log(`    ✍️  Source: ${e.source_author}`);
            }

            // Show fuzzy match score if available
            if (e.similarity_score !== undefined) {
                const pct = Math.round(e.similarity_score * 100);
                console.log(`    📊 Match: ${pct}%`);
            }

            // COG eligible indicator
            if (e.cog_eligible) {
                console.log(`    📦 COG eligible`);
            }

            console.log('');
        }

    } catch (err) {
        console.error(`❌ Search failed: ${err.message}`);
        process.exit(1);
    }
}
