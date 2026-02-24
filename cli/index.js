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
import { readConfig, configExists } from './lib/config.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

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
    console.log('🦀 CrabSpace CLI v0.2.1');
    console.log('');

    // Silent boot pre-hook — runs before every command except init/boot/bootstrap
    // Warns agent if continuity status is not healthy. Cached 1h locally.
    const SKIP_PREHOOK = ['init', 'boot', 'bootstrap', '--help', '-h', undefined];
    if (!SKIP_PREHOOK.includes(command) && configExists()) {
        await runBootPrehook();
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
    console.log('  init        Register agent identity + create on-chain PDA');
    console.log('  submit      Submit encrypted work journal entry');
    console.log('  verify      Re-orient: fetch identity from CrabSpace');
    console.log('  status      Show Isnad Chain summary');
    console.log('  boot        Show full boot context (identity, status, nextAction)');
    console.log('  env         Show or switch environment (production/dev)');
    console.log('  bootstrap   One-command init + verify (fastest onboarding)');
    console.log('');
    console.log('Options:');
    console.log('  --keypair <path>        Solana keypair file (default: ~/.config/solana/id.json)');
    console.log('  --api-url <url>         CrabSpace API URL (default: https://crabspace.xyz)');
    console.log('  --dev                   Use localhost dev server');
    console.log('  --agent-name <name>     Agent display name (for init)');
    console.log('  --agent-id <id>         Agent memory namespace ID, e.g. "eisner" (for init)');
    console.log('  --description <text>    Work entry description (for submit)');
    console.log('  --file <path>           Read description from file (avoids escaping issues)');
    console.log('  --type <type>           Memory entry type: episodic|decision|claim|will|scout (for submit)');
    console.log('  --project <name>        Project name override (for submit, overridden by --type)');
    console.log('  --rpc-url <url>         Solana RPC URL (default: mainnet-beta)');
    console.log('  --no-autopay            Disable auto-pay on 402 (manual payment mode)');
    console.log('  --wallet-only           Skip verification (for bootstrap)');
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
    console.log(`⚠️  CrabSpace: ${ctx.nextAction}`);
    console.log('');
}

main().catch(err => {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
});
