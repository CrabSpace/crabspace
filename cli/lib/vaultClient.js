/**
 * CrabSpace CLI — Vault Client
 * Enumerates the agent's full entry list from the API cache with signed
 * requests (private fields require wallet auth) and offset paging.
 *
 * Tolerates older deployed APIs that ignore `offset`: if a page repeats
 * the previous page's head entry, pagination stops rather than looping.
 */

import { signForAction } from './sign.js';

const PAGE_SIZE = 200;

/**
 * Fetch all vault entries for the agent, newest first.
 * @returns {Promise<Array>} Supabase work_journal rows (with agent fields)
 */
export async function fetchAllEntries({ apiUrl, keypair, maxEntries = 5000, onPage = null }) {
    const all = [];
    const seenIds = new Set();
    let offset = 0;

    while (all.length < maxEntries) {
        const { signature, message } = signForAction('search', keypair);
        const params = new URLSearchParams({
            wallet: keypair.wallet,
            limit: String(PAGE_SIZE),
            offset: String(offset),
            signature,
            message,
        });

        const res = await fetch(`${apiUrl}/api/work?${params}`, {
            signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Entry fetch failed (${res.status}): ${err.error || res.statusText}`);
        }

        const { entries = [] } = await res.json();
        if (entries.length === 0) break;

        let fresh = 0;
        for (const e of entries) {
            if (e.id && seenIds.has(e.id)) continue;
            if (e.id) seenIds.add(e.id);
            all.push(e);
            fresh++;
        }
        if (onPage) onPage(all.length);

        // Deployed API ignores offset (pre-v4) → same page again → stop.
        if (fresh === 0 || entries.length < PAGE_SIZE) break;
        offset += entries.length;
    }

    return all.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}
