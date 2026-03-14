/**
 * CrabSpace CLI — status command
 * Shows Isnad Chain summary for the registered agent.
 *
 * Usage: crabspace status
 */

import { requireConfig } from '../lib/config.js';
import { existsSync, readFileSync } from 'fs';
import { getJournalPath } from '../lib/config.js';

export async function status(args) {
    const config = requireConfig();
    const apiUrl = args['api-url'] || config.apiUrl;

    console.log(`📡 Fetching Isnad Chain from ${apiUrl}...`);

    // Fetch work entries
    const res = await fetch(
        `${apiUrl}/api/verify?wallet=${config.wallet}`
    );

    if (!res.ok) {
        throw new Error(`Failed to fetch status: ${res.statusText}`);
    }

    const data = await res.json();
    const agent = data.agent || {};

    const total = agent.total_work_entries ?? 0;
    const anchored = agent.anchored_entries ?? 0;
    const unanchored = agent.unanchored_entries ?? 0;
    const genesisRemaining = Math.max(0, 100 - total);

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  🦀 ${agent.name || config.agentName || 'Unknown Agent'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`  Wallet:      ${config.wallet}`);
    console.log(`  Registered:  ${agent.created_at ? new Date(agent.created_at).toLocaleDateString() : (config.registeredAt || 'Unknown')}`);
    console.log(`  Claimed:     ${agent.claimed_at ? '✓ Yes' : '✗ No (run: crabspace claim <email>)'}`);
    console.log('');
    console.log(`  Entries:     ${total} total`);
    console.log(`  On-chain:    ${anchored} anchored ✓`);
    if (unanchored > 0) {
        console.log(`  Pending:     ${unanchored} off-chain ⚠️  (fund wallet to anchor)`);
        console.log(`    Wallet:    ${config.wallet}`);
        console.log(`    Amount:    ~0.005 SOL, then re-run: crabspace submit`);
    }
    if (genesisRemaining > 0) {
        console.log(`  Genesis:     ${genesisRemaining} free entries remaining`);
    }

    if (agent.last_activity) {
        console.log(`  Last Entry:  ${new Date(agent.last_activity).toLocaleString()}`);
    }

    // Check local journal
    const journalPath = getJournalPath();
    if (existsSync(journalPath)) {
        const journal = readFileSync(journalPath, 'utf-8');
        const localEntries = (journal.match(/^## /gm) || []).length;
        console.log(`  Local Log:   ${localEntries} entries in ~/.crabspace/journal.md`);
    }

    console.log('');
    console.log(`  📄 View:  ${apiUrl}/isnad/${config.wallet}`);
    console.log('');

    // ─── Background version check ────────────────────────────────────────────
    try {
        const pkgRes = await fetch('https://registry.npmjs.org/@crabspace/cli/latest',
            { signal: AbortSignal.timeout(3000) });
        if (pkgRes.ok) {
            const { version: latest } = await pkgRes.json();
            const { readFileSync } = await import('fs');
            const { fileURLToPath } = await import('url');
            const { dirname, join } = await import('path');
            const __dir = dirname(fileURLToPath(import.meta.url));
            const { version: current } = JSON.parse(readFileSync(join(__dir, '../package.json'), 'utf-8'));
            if (latest && current && latest !== current) {
                console.log(`\x1b[33m⚠️  Update available: v${latest} (you have v${current})\x1b[0m`);
                console.log(`\x1b[33m   npm install -g @crabspace/cli@latest\x1b[0m`);
                console.log('');
            }
        }
    } catch {
        // Version check is best-effort — never block or crash
    }
}
