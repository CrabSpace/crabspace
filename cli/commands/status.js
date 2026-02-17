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

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  🦀 ${data.agent_name || config.agentName || 'Unknown Agent'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log(`  Wallet:      ${config.wallet}`);
    console.log(`  Registered:  ${data.registered_at || config.registeredAt || 'Unknown'}`);
    console.log(`  Work Count:  ${data.work_count || 0} entries`);

    if (data.latest_work) {
        console.log(`  Last Entry:  ${data.latest_work.created_at || 'N/A'}`);
        if (data.latest_work.tx_sig) {
            console.log(`  Last TX:     ${data.latest_work.tx_sig.slice(0, 20)}...`);
        }
    }

    // Check local journal
    const journalPath = getJournalPath();
    if (existsSync(journalPath)) {
        const journal = readFileSync(journalPath, 'utf-8');
        const localEntries = (journal.match(/^## /gm) || []).length;
        console.log(`  Local Log:   ${localEntries} entries in ~/.crabspace/journal.md`);
    }

    console.log('');
    console.log(`  📄 View: ${apiUrl}/isnad/${config.wallet}`);
    console.log('');
}
