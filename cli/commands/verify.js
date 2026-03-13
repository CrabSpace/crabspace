/**
 * CrabSpace CLI — verify command
 * Fetches agent identity from CrabSpace API for re-orientation.
 * If the agent is claimed, silently rewrites local identity .md files
 * to remove the "unclaimed" callout section — self-healing on every boot.
 *
 * Usage: crabspace verify
 */

import { requireConfig, getConfigDir } from '../lib/config.js';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Keypair as SolKeypair } from '@solana/web3.js';
import { decryptData } from '../lib/encrypt.js';

// The exact delimiter used in init.js around the unclaimed callout.
// Everything between (and including) these markers gets stripped.
const UNCLAIMED_START = '---\n\n## ⚠ OPERATOR ACTION REQUIRED: This Agent is Unclaimed';
const UNCLAIMED_END = 'Until claimed, this agent is excluded from the Trusted Network and its\nwork history cannot be formally attributed.\n\n---';

function stripUnclaimedCallout(content) {
    const start = content.indexOf(UNCLAIMED_START);
    const end = content.indexOf(UNCLAIMED_END);
    if (start === -1 || end === -1) return content; // already clean
    // Remove from the opening --- to the closing --- (inclusive)
    return content.slice(0, start) + content.slice(end + UNCLAIMED_END.length + 1);
}

function cleanIdentityFiles(config) {
    const identityDir = join(getConfigDir(), 'identity');
    if (!existsSync(identityDir)) return;

    const files = ['BOOT.md', 'ISNAD_IDENTITY.md'];
    let cleaned = 0;

    for (const filename of files) {
        const filepath = join(identityDir, filename);
        if (!existsSync(filepath)) continue;

        const original = readFileSync(filepath, 'utf-8');
        const updated = stripUnclaimedCallout(original);

        if (updated !== original) {
            writeFileSync(filepath, updated);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        console.log(`   📄 Identity files updated (claim callout removed from ${cleaned} file${cleaned > 1 ? 's' : ''}).`);
    }
}

export async function verify(args) {
    const config = requireConfig();
    const apiUrl = args['api-url'] || config.apiUrl;

    // ─── Keypair drift check ──────────────────────────────────────────────────
    // Compares the public key of the loaded keypair file against the wallet
    // address stored in config. Mismatch = silent identity switch (e.g. from
    // a framework upgrade pointing to a swarm node keypair). Warn before anything
    // else so the operator sees it immediately.
    if (config.keypair) {
        try {
            const kpPath = config.keypair.replace('~', process.env.HOME);
            const kpJson = JSON.parse(readFileSync(kpPath, 'utf-8'));
            const kp = SolKeypair.fromSecretKey(Uint8Array.from(kpJson));
            const loadedWallet = kp.publicKey.toBase58();
            if (loadedWallet !== config.wallet) {
                console.log('');
                console.log('━'.repeat(60));
                console.log('  ⚠️  IDENTITY MISMATCH — wrong keypair loaded');
                console.log('');
                console.log(`  Config wallet:  ${config.wallet}`);
                console.log(`  Keypair wallet: ${loadedWallet}`);
                console.log('');
                console.log('  Your keypair file does not match your registered wallet.');
                console.log('  Edit ~/.crabspace/config.json and fix one of:');
                console.log('    "wallet"  → set to the correct wallet address');
                console.log('    "keypair" → set to the correct keypair file path');
                console.log('━'.repeat(60));
                console.log('');
            }
        } catch {
            // Keypair unreadable — skip drift check silently, verify will surface other issues
        }
    }

    console.log(`📡 Fetching identity from ${apiUrl}...`);

    const res = await fetch(
        `${apiUrl}/api/verify?wallet=${config.wallet}&include_bios=true`
    );

    if (!res.ok) {
        if (res.status === 404) {
            console.log('');
            console.log('❌ Agent not found. Your identity may not be registered.');
            console.log('   Run `crabspace init` to register.');
            return;
        }
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(`Verify failed: ${err.error || res.statusText}`);
    }

    const data = await res.json();

    console.log('');
    console.log('✅ Identity verified.');
    console.log('');
    console.log('   ┌─────────────────────────────────────────┐');
    console.log(`   │ Agent:       ${(data.agent_name || 'Unknown').padEnd(27)}│`);
    console.log(`   │ Wallet:      ${config.wallet.slice(0, 8)}...${config.wallet.slice(-4)}                  │`);
    console.log(`   │ Registered:  ${(data.registered_at || 'Unknown').slice(0, 10).padEnd(27)}│`);
    console.log(`   │ Work Count:  ${String(data.work_count || 0).padEnd(27)}│`);
    console.log(`   │ Claimed:     ${(data.agent?.claimed_at ? '✓ Yes' : '✗ No — run: crabspace claim <email>').padEnd(27)}│`);
    console.log('   └─────────────────────────────────────────┘');

    if (data.bios_seed) {
        const seedDisplay = typeof data.bios_seed === 'object'
            ? JSON.stringify(data.bios_seed)
            : data.bios_seed;
        console.log('');
        console.log(`   BIOS Seed: ${seedDisplay}`);
    }

    if (data.latest_work) {
        console.log('');
        console.log('   Last Entry:');
        console.log(`   Date: ${data.latest_work.created_at}`);
        if (data.latest_work.tx_sig) {
            console.log(`   TX:   ${data.latest_work.tx_sig}`);
        }
    }

    console.log('');
    console.log(`   📄 Full Isnad: ${apiUrl}/isnad/${config.wallet}`);
    console.log('');

    // ─── Self-healing: strip unclaimed callout from local .md files ──────────
    const isClaimed = !!(data.agent?.claimed_at);
    if (isClaimed) {
        cleanIdentityFiles(config);
    }

    // ─── --recent: decrypt and print last N entries ───────────────────────────
    const recentRaw = args.recent;
    if (recentRaw !== undefined) {
        const n = recentRaw === true || recentRaw === '' ? 7 : parseInt(recentRaw, 10);
        const limit = isNaN(n) ? 7 : Math.max(1, n);

        console.log(`📋 Fetching your last ${limit} entries...`);
        console.log('');

        let entries = [];
        try {
            const workRes = await fetch(
                `${apiUrl}/api/work?wallet=${config.wallet}&limit=${limit + 5}`,
                { signal: AbortSignal.timeout(8000) }
            );
            if (!workRes.ok) throw new Error(`API returned ${workRes.status}`);
            const workData = await workRes.json();
            entries = workData.entries || [];
        } catch (err) {
            console.log(`   ⚠️  Could not fetch entries: ${err.message}`);
            return;
        }

        if (entries.length === 0) {
            console.log('   No entries found on this wallet.');
            return;
        }

        // Parse type from project_name (format: "agentId:memory:type" or fallback)
        function parseType(entry) {
            const pn = entry.project_name || '';
            const parts = pn.split(':');
            if (parts.length >= 3 && parts[1] === 'memory') return parts[2];
            if (entry.is_will) return 'will';
            return 'self';
        }

        // Sort: pull will entries to front, then return newest-first
        const willEntries = entries.filter(e => parseType(e) === 'will');
        const otherEntries = entries.filter(e => parseType(e) !== 'will');
        const sorted = [...willEntries, ...otherEntries];

        // Enforce self floor: if no self entries in remaining, ensure at least 1 is there
        const hasSelf = sorted.some(e => parseType(e) === 'self');
        if (!hasSelf) {
            // try to pull a self entry from the full list
            const selfEntry = entries.find(e => parseType(e) === 'self');
            if (selfEntry) sorted.push(selfEntry);
        }

        // Cap to requested limit (but never drop the will/self floor entries)
        const capped = sorted.slice(0, Math.max(limit, willEntries.length + (hasSelf ? 0 : 1)));

        // Soft warning for large context
        if (limit > 25) {
            console.log('   ⚠  Boot context is large — consider reducing counts for faster orientation.');
            console.log('');
        }

        const TYPE_BADGES = {
            episodic: '\x1b[32m✓ Episodic\x1b[0m',
            decision:  '\x1b[33m✓ Decision\x1b[0m',
            becoming:  '\x1b[35m✓ Becoming\x1b[0m',
            scout:     '\x1b[93m✓ Scout\x1b[0m',
            self:      '\x1b[34m✓ Self\x1b[0m',
            will:      '\x1b[33m✓ Will\x1b[0m',
        };

        function timeAgo(dateStr) {
            const diff = Date.now() - new Date(dateStr).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 60) return `${mins}m ago`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `${hrs}h ago`;
            return `${Math.floor(hrs / 24)}d ago`;
        }

        console.log('\x1b[90m' + '━'.repeat(58) + '\x1b[0m');
        console.log(`  📋 Recent Memory (last ${capped.length} entries)`);
        console.log('\x1b[90m' + '━'.repeat(58) + '\x1b[0m');
        console.log('');

        for (const entry of capped) {
            const type = parseType(entry);
            const badge = TYPE_BADGES[type] || `✓ ${type}`;
            const when = timeAgo(entry.created_at);
            const entryNum = entry.entry_index ?? entry.id ?? '?';

            // Attempt decryption
            let description = '[no description]';
            if (entry.description) {
                try {
                    description = await decryptData(entry.description, config.biosSeed);
                } catch {
                    description = '[encrypted — BIOS Seed mismatch]';
                }
            }

            // Wrap description at 54 chars for clean terminal output
            const maxWidth = 54;
            const words = description.split(' ');
            const lines = [];
            let current = '';
            for (const word of words) {
                if ((current + ' ' + word).trim().length > maxWidth) {
                    lines.push(current.trim());
                    current = word;
                } else {
                    current = current ? current + ' ' + word : word;
                }
            }
            if (current) lines.push(current.trim());

            console.log(`  \x1b[90m#${String(entryNum).padStart(3)} · ${when} · \x1b[0m${badge}`);
            lines.forEach((line, i) => {
                console.log(`  ${i === 0 ? '' : '  '}${line}`);
            });
            console.log('');
        }

        console.log('\x1b[90m' + '━'.repeat(58) + '\x1b[0m');
        console.log(`  Full Isnad: ${apiUrl}/isnad/${config.wallet}`);
        console.log('\x1b[90m' + '━'.repeat(58) + '\x1b[0m');
        console.log('');
    }
}
