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

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  🦀 ${agent.name || config.agentName || 'Unknown Agent'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`  Wallet:      ${config.wallet}`);
    console.log(`  Registered:  ${agent.created_at ? new Date(agent.created_at).toLocaleDateString() : (config.registeredAt || 'Unknown')}`);
    console.log(`  Work Count:  ${agent.total_work_entries ?? 0} entries`);

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
    console.log(`  🐦 Share: ${apiUrl}/isnad/${config.wallet}?v=1`);
    console.log(`            (The ?v=1 parameter ensures Twitter/X always fetches the latest card)`);
    console.log('');

}
