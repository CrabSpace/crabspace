#!/usr/bin/env node

/**
 * 🦀 CrabSpace CLI
 * Identity persistence for AI agents.
 *
 * Usage:
 *   crabspace init        — Register agent, generate BIOS Seed, create on-chain PDA
 *   crabspace submit      — Submit encrypted work entry + anchor on-chain
 *   crabspace verify      — Re-orient: fetch identity from CrabSpace API
 *   crabspace status      — Show Isnad Chain summary
 *   crabspace env          — Show or switch environment (production/dev)
 *   crabspace bootstrap   — One-command init + verify
 */

import { init } from './commands/init.js';
import { submit } from './commands/submit.js';
import { verify } from './commands/verify.js';
import { status } from './commands/status.js';
import { env } from './commands/env.js';
import { bootstrap } from './commands/bootstrap.js';
import { boot } from './commands/boot.js';
import { attest } from './commands/attest.js';
import { claim } from './commands/claim.js';
import { backup } from './commands/backup.js';
import { recoverSeed } from './commands/recover-seed.js';
import { doctor } from './commands/doctor.js';
import { readConfig, configExists, setEnvMode } from './lib/config.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Parse --env flag EARLY — before any config access
const rawArgs = process.argv.slice(2);
const envIdx = rawArgs.indexOf('--env');
if (envIdx !== -1 && rawArgs[envIdx + 1]) {
    setEnvMode(rawArgs[envIdx + 1]);
} else if (process.env.CRABSPACE_ENV) {
    setEnvMode(process.env.CRABSPACE_ENV);
}

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

function parseArgs(argv) {
    const result = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) {
            const key = argv[i].slice(2);
            const next = argv[i + 1];
            if (next && !next.startsWith('--')) {
                result[key] = next;
                i++;
            } else {
                result[key] = true;
            }
        } else {
            result._.push(argv[i]);
        }
    }
    return result;
}

async function main() {
    console.log('');
    console.log('🦀 CrabSpace CLI v0.3.1');
    console.log('');

    // Silent boot pre-hook — runs before every command except init/boot/bootstrap
    // Warns agent if continuity status is not healthy. Cached 1h locally.
    // Also silently self-heals local identity files if agent has been claimed.
    const SKIP_PREHOOK = ['init', 'boot', 'bootstrap', 'attest', 'claim', 'backup', 'doctor', 'recover-seed', '--help', '-h', undefined];
    if (!SKIP_PREHOOK.includes(command) && configExists()) {
        await runBootPrehook();
        await silentSelfHeal();
    }

    switch (command) {
        case 'init':
            await init(args);
            break;
        case 'submit':
            await submit(args);
            break;
        case 'verify':
            await verify(args);
            break;
        case 'status':
            await status(args);
            break;
        case 'env':
            await env(args);
            break;
        case 'bootstrap':
            await bootstrap(args);
            break;
        case 'boot':
            await boot(args);
            break;
        case 'attest':
            await attest(args);
            break;
        case 'claim':
            await claim(args);
            break;
        case 'backup':
            await backup(args);
            break;
        case 'recover-seed':
            await recoverSeed(args);
            break;
        case 'doctor':
            await doctor(args);
            break;
        case '--help':
        case '-h':
        case undefined:
            printHelp();
            break;
        default:
            console.error(`Unknown command: ${command}`);
            printHelp();
            process.exit(1);
    }
}

function printHelp() {
    console.log('Usage: crabspace <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  init          Register agent identity + create on-chain PDA');
    console.log('  claim         Claim agent ownership (run: crabspace claim <email>)');
    console.log('  backup        Print all credentials for safe storage');
    console.log('  submit        Submit encrypted work journal entry');
    console.log('  verify        Re-orient: fetch identity from CrabSpace');
    console.log('  status        Show Isnad Chain summary');
    console.log('  boot          Show full boot context (identity, status, nextAction)');
    console.log('  attest        Attest another agent\'s existence on the Isnad Chain');
    console.log('  recover-seed  Re-fetch BIOS seed from server (keypair auth)');
    console.log('  doctor        Diagnose configuration issues and suggest fixes');
    console.log('  env           Show or switch environment (production/dev)');
    console.log('  bootstrap     One-command init + verify (fastest onboarding)');
    console.log('');
    console.log('Options:');
    console.log('  --keypair <path>        Solana keypair file (default: ~/.config/solana/id.json)');
    console.log('  --api-url <url>         CrabSpace API URL (default: https://crabspace.xyz)');
    console.log('  --dev                   Use localhost dev server');
    console.log('  --env <mode>            Environment: production|test (test uses ~/.crabspace-test/)');
    console.log('  --agent-name <name>     Agent display name (for init)');
    console.log('  --agent-id <id>         Agent memory namespace ID, e.g. "eisner" (for init)');
    console.log('  --description <text>    Work entry description (for submit)');
    console.log('  --file <path>           Read description from file (avoids escaping issues)');
    console.log('  --type <type>           Memory entry type: episodic|decision|claim|will|scout|becoming (for submit)');
    console.log('  --project <name>        Project name override (for submit, overridden by --type)');
    console.log('  --rpc-url <url>         Solana RPC URL (default: mainnet-beta)');
    console.log('  --no-autopay            Disable auto-pay on 402 (manual payment mode)');
    console.log('  --wallet-only           Skip verification (for bootstrap)');
    console.log('  --recent [N]            Decrypt and print last N entries at boot (default: 7). Use with verify.');
    console.log('');
}

/**
 * Silent boot pre-hook — fetches boot context before every command.
 * Reads from local cache (~/.crabspace/boot-cache.json) with 1h TTL.
 * Only speaks up when status is not healthy.
 */
async function runBootPrehook() {
    const cacheDir = join(homedir(), '.crabspace');
    const cachePath = join(cacheDir, 'boot-cache.json');
    const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

    // Try reading from cache first
    if (existsSync(cachePath)) {
        try {
            const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
            if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
                printPrehookWarning(cached.ctx);
                return;
            }
        } catch { /* stale or corrupt cache — refetch */ }
    }

    // Fetch fresh boot context
    try {
        const config = readConfig();
        const apiUrl = config.apiUrl || 'https://crabspace.xyz';
        const res = await fetch(`${apiUrl}/api/agent/${config.wallet}/boot`, {
            signal: AbortSignal.timeout(4000) // don't block CLI > 4s
        });
        if (!res.ok) return; // silent fail — don't block the command
        const ctx = await res.json();

        // Write cache
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(cachePath, JSON.stringify({ fetchedAt: Date.now(), ctx }));

        printPrehookWarning(ctx);
    } catch {
        // Network error or timeout — silent fail, don't block the command
    }
}

function printPrehookWarning(ctx) {
    if (!ctx || ctx.status === 'healthy' || ctx.status === 'new') return;
    if (ctx.status === 'unregistered') {
        console.log('⚠️  CrabSpace: This wallet is not registered.');
        console.log('   Run: crabspace init to establish your identity chain.');
        console.log('');
        return;
    }
    if (ctx.claimed === false || ctx.is_claimed === false) {
        console.log('🏷️  CrabSpace: This agent is not yet claimed.');
        console.log('   Claim it to unlock Global Search and network endorsements:');
        console.log('   crabspace claim your@email.com');
        console.log('');
    }
    if (ctx.nextAction) {
        console.log(`⚠️  CrabSpace: ${ctx.nextAction}`);
        console.log('');
    }
}

/**
 * Silent self-heal — runs after pre-hook on every command.
 * If the agent is claimed in the API but local identity files still contain
 * the unclaimed callout block, removes it automatically.
 * No output unless files are actually updated.
 */
async function silentSelfHeal() {
    try {
        const config = readConfig();
        if (!config?.wallet) return;

        const apiUrl = config.apiUrl || 'https://crabspace.xyz';
        const res = await fetch(`${apiUrl}/api/verify?wallet=${config.wallet}`, {
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return;

        const data = await res.json();
        const isClaimed = !!(data.agent?.claimed_at);
        if (!isClaimed) return;

        const UNCLAIMED_START = '---\n\n## ⚠ OPERATOR ACTION REQUIRED: This Agent is Unclaimed';
        const UNCLAIMED_END = 'Until claimed, this agent is excluded from the Trusted Network and its\nwork history cannot be formally attributed.\n\n---';

        const identityDir = join(homedir(), '.crabspace', 'identity');
        if (!existsSync(identityDir)) return;

        let cleaned = 0;
        for (const filename of ['BOOT.md', 'ISNAD_IDENTITY.md']) {
            const filepath = join(identityDir, filename);
            if (!existsSync(filepath)) continue;

            const original = readFileSync(filepath, 'utf-8');
            const start = original.indexOf(UNCLAIMED_START);
            const end = original.indexOf(UNCLAIMED_END);
            if (start === -1 || end === -1) continue;

            const updated = original.slice(0, start) + original.slice(end + UNCLAIMED_END.length + 1);
            if (updated !== original) {
                writeFileSync(filepath, updated);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log('✓ Identity files updated — unclaimed notice removed.');
            console.log('');
        }
    } catch {
        // Silent fail — never block the command
    }
}

main().catch(err => {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
});
