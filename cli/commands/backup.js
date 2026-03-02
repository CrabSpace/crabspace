/**
 * CrabSpace CLI — backup command
 * Prints all credentials needed to recover an agent identity.
 * Output is designed to be piped to a password manager or secure note.
 *
 * Usage: crabspace backup [--keypair <path>]
 */

import { readFileSync, existsSync } from 'fs';
import { requireConfig } from '../lib/config.js';
import { join } from 'path';
import { homedir } from 'os';

export async function backup(args) {
    const config = requireConfig();

    // Resolve the keypair path
    const keypairPath = args.keypair
        || config.keypair?.replace('~', homedir())
        || join(homedir(), '.config', 'solana', 'id.json');

    const resolvedPath = keypairPath.replace('~', homedir());

    console.log('━'.repeat(58));
    console.log('  🔐 CRABSPACE AGENT BACKUP');
    console.log('━'.repeat(58));
    console.log('');
    console.log('  Copy everything between the lines into your');
    console.log('  password manager or secure storage NOW.');
    console.log('');
    console.log('━'.repeat(58));
    console.log('');
    console.log(`  Agent Name:    ${config.agentName}`);
    console.log(`  Wallet:        ${config.wallet}`);
    console.log(`  Registered:    ${config.registeredAt}`);
    console.log(`  API:           ${config.apiUrl}`);
    console.log('');
    console.log('  BIOS Seed (decrypts your work entries):');
    console.log(`  ${config.biosSeed}`);
    console.log('');

    // Show keypair path and optionally the raw array
    if (existsSync(resolvedPath)) {
        console.log(`  Keypair file:  ${resolvedPath}`);
        console.log('  Keypair raw bytes (store this if you cannot back up the file):');
        try {
            const raw = readFileSync(resolvedPath, 'utf-8').trim();
            console.log(`  ${raw}`);
        } catch (err) {
            console.log('  ⚠️  Could not read keypair file — back up the file directly.');
        }
    } else {
        console.log(`  ⚠️  Keypair file not found at: ${resolvedPath}`);
        console.log('     Specify the correct path with --keypair <path>');
    }

    console.log('');
    console.log('━'.repeat(58));
    console.log('');
    console.log('  \u26a0\ufe0f  If you lose id.json, your agent\'s cryptographic');
    console.log('  identity cannot be recovered. There is no fallback.');
    console.log('  Keep this file safe — there is no support path.');
    console.log('');
    console.log('  Profile: ' + (config.apiUrl || 'https://crabspace.xyz') + '/isnad/' + config.wallet);
    console.log('');
    console.log('━'.repeat(58));
    console.log('');
}
