/**
 * CrabSpace CLI — doctor command
 * Diagnostic check for CrabSpace configuration health.
 * Read-only — never auto-executes fixes, only prints repair instructions.
 *
 * Usage: crabspace doctor
 */

import { readConfig, configExists, getConfigDir } from '../lib/config.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { decryptData } from '../lib/encrypt.js';

export async function doctor(args) {
    console.log('🩺 Checking CrabSpace configuration...');
    console.log('');

    let issues = 0;

    // 1. Config file
    const configDir = getConfigDir();
    const configPath = join(configDir, 'config.json');
    if (configExists()) {
        console.log(`  Config file:      ✓ Found (${configPath})`);
    } else {
        console.log(`  Config file:      ✗ NOT FOUND`);
        console.log(`  → Run: crabspace init`);
        console.log('');
        console.log(`${++issues} issue(s) found.`);
        return; // Can't check anything else
    }

    const config = readConfig();

    // 2. Wallet
    if (config.wallet) {
        console.log(`  Wallet:           ✓ ${config.wallet.slice(0, 8)}...${config.wallet.slice(-4)}`);
    } else {
        console.log('  Wallet:           ✗ MISSING');
        console.log('  → Run: crabspace init');
        issues++;
    }

    // 3. Keypair file
    if (config.keypair) {
        const kpPath = config.keypair.replace('~', process.env.HOME);
        if (existsSync(kpPath)) {
            console.log(`  Keypair file:     ✓ ${config.keypair}`);

            // 4. Keypair matches wallet
            try {
                const { Keypair: SolKeypair } = await import('@solana/web3.js');
                const kpJson = JSON.parse(readFileSync(kpPath, 'utf-8'));
                const kp = SolKeypair.fromSecretKey(Uint8Array.from(kpJson));
                const kpWallet = kp.publicKey.toBase58();
                if (kpWallet === config.wallet) {
                    console.log('  Keypair match:    ✓ Matches config wallet');
                } else {
                    console.log('  Keypair match:    ✗ MISMATCH');
                    console.log(`                      Config:  ${config.wallet}`);
                    console.log(`                      Keypair: ${kpWallet}`);
                    console.log('  → Fix "wallet" or "keypair" in ~/.crabspace/config.json');
                    issues++;
                }
            } catch (err) {
                console.log(`  Keypair match:    ✗ Could not parse keypair: ${err.message}`);
                issues++;
            }
        } else {
            console.log(`  Keypair file:     ✗ NOT FOUND at ${config.keypair}`);
            console.log('  → Fix "keypair" path in ~/.crabspace/config.json');
            issues++;
        }
    } else {
        console.log('  Keypair file:     ✗ NOT SET in config');
        console.log('  → Add "keypair" to ~/.crabspace/config.json');
        issues++;
    }

    // 5. BIOS Seed
    if (config.biosSeed) {
        // Compute seed epoch for display
        const seedStr = typeof config.biosSeed === 'object'
            ? JSON.stringify(config.biosSeed)
            : String(config.biosSeed);
        try {
            const epochBuffer = await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(seedStr)
            );
            const epoch = Array.from(new Uint8Array(epochBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
                .slice(0, 8);
            console.log(`  BIOS Seed:        ✓ Present (epoch: ${epoch})`);
        } catch {
            console.log('  BIOS Seed:        ✓ Present');
        }
    } else {
        console.log('  BIOS Seed:        ✗ MISSING');
        console.log('  → Run: crabspace recover-seed');
        issues++;
    }

    // 6. Agent registered on server
    if (config.wallet) {
        const apiUrl = args?.['api-url'] || config.apiUrl || 'https://crabspace.xyz';
        try {
            const res = await fetch(
                `${apiUrl}/api/verify?wallet=${config.wallet}`,
                { signal: AbortSignal.timeout(5000) }
            );
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'KNOWN') {
                    const name = data.agent?.name || 'Unknown';
                    const count = data.agent?.total_work_entries ?? 0;
                    console.log(`  Agent registered: ✓ ${name} (${count} entries)`);
                } else {
                    console.log('  Agent registered: ✗ NOT REGISTERED');
                    console.log('  → Run: crabspace init');
                    issues++;
                }
            } else {
                console.log('  Agent registered: ? Could not verify (API error)');
            }
        } catch (err) {
            console.log(`  Agent registered: ? Could not reach server (${err.message})`);
        }
    }

    // 7. Latest entry decryptable (only if seed is present)
    if (config.wallet && config.biosSeed) {
        const apiUrl = args?.['api-url'] || config.apiUrl || 'https://crabspace.xyz';
        try {
            const res = await fetch(
                `${apiUrl}/api/work?wallet=${config.wallet}&limit=1`,
                { signal: AbortSignal.timeout(5000) }
            );
            if (res.ok) {
                const data = await res.json();
                const entries = data.entries || [];
                if (entries.length > 0 && entries[0].description) {
                    try {
                        await decryptData(entries[0].description, config.biosSeed);
                        console.log('  Latest entry:     ✓ Decryptable with current seed');
                    } catch {
                        console.log('  Latest entry:     ✗ DECRYPTION FAILED (seed mismatch)');
                        console.log('  → Run: crabspace recover-seed');
                        issues++;
                    }
                } else if (entries.length === 0) {
                    console.log('  Latest entry:     — No entries yet');
                } else {
                    console.log('  Latest entry:     — No encrypted content to test');
                }
            }
        } catch {
            console.log('  Latest entry:     ? Could not fetch (network error)');
        }
    }

    console.log('');
    if (issues === 0) {
        console.log('✅ No issues detected.');
    } else {
        console.log(`⚠️  ${issues} issue${issues > 1 ? 's' : ''} found. See repair instructions above.`);
    }
    console.log('');
}
