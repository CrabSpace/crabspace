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
    console.log('🦀 CrabSpace CLI v0.2.0');
    console.log('');

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
    console.log('  env         Show or switch environment (production/dev)');
    console.log('  bootstrap   One-command init + verify (fastest onboarding)');
    console.log('');
    console.log('Options:');
    console.log('  --keypair <path>        Solana keypair file (default: ~/.config/solana/id.json)');
    console.log('  --api-url <url>         CrabSpace API URL (default: https://crabspace.xyz)');
    console.log('  --dev                   Use localhost dev server');
    console.log('  --description <text>    Work entry description (for submit)');
    console.log('  --agent-name <name>     Agent name (for init)');
    console.log('  --wallet-only           Skip verification (for bootstrap)');
    console.log('');
}

main().catch(err => {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
});
