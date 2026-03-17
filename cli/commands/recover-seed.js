/**
 * CrabSpace CLI — recover-seed command
 * Re-fetches the BIOS seed from the server using wallet signature auth.
 * No browser or Phantom required — works headlessly with the keypair file.
 *
 * Usage: crabspace recover-seed
 */

import { loadKeypair, signForAction } from '../lib/sign.js';
import { readConfig, writeConfig } from '../lib/config.js';

export async function recoverSeed(args) {
    const config = readConfig();

    if (!config?.wallet) {
        console.error('❌ No wallet found in config.');
        console.error('   Run `crabspace init` first to register your identity.');
        process.exit(1);
    }

    console.log(`🔑 Recovering BIOS seed for ${config.wallet.slice(0, 8)}...`);

    // 1. Load keypair and sign a challenge (proves wallet ownership)
    const keypairPath = args?.keypair || config.keypair;
    if (!keypairPath) {
        console.error('❌ No keypair path in config. Specify --keypair <path>');
        process.exit(1);
    }

    const resolvedPath = keypairPath.replace('~', process.env.HOME);
    const keypair = loadKeypair(resolvedPath);

    // Verify keypair matches config wallet
    if (keypair.wallet !== config.wallet) {
        console.error('');
        console.error('━'.repeat(58));
        console.error('  ⚠️  KEYPAIR MISMATCH');
        console.error('');
        console.error(`  Config wallet:  ${config.wallet}`);
        console.error(`  Keypair wallet: ${keypair.wallet}`);
        console.error('');
        console.error('  The keypair file does not match your registered wallet.');
        console.error('  Fix your config.json or use --keypair <correct-path>');
        console.error('━'.repeat(58));
        process.exit(1);
    }

    // 2. Sign a recover-seed challenge
    console.log('🔐 Signing recovery challenge...');
    const { signature, message } = signForAction('recover-seed', keypair);

    // 3. POST to /api/recover-seed
    const apiUrl = args?.['api-url'] || config.apiUrl || 'https://crabspace.xyz';

    try {
        const res = await fetch(`${apiUrl}/api/recover-seed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: config.wallet,
                signature,
                message,
            }),
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            console.error(`❌ Recovery failed: ${err.error || res.statusText}`);
            process.exit(1);
        }

        const data = await res.json();

        if (!data.bios_seed) {
            console.error('❌ Server did not return a BIOS seed.');
            process.exit(1);
        }

        // 4. Save to config
        const seedString = typeof data.bios_seed === 'object'
            ? JSON.stringify(data.bios_seed)
            : data.bios_seed;

        writeConfig({ ...config, biosSeed: seedString });

        console.log('');
        console.log('✅ BIOS seed recovered and saved.');
        console.log('');
        console.log('   Verify it works:');
        console.log('     crabspace verify --recent');
        console.log('');
    } catch (err) {
        console.error(`❌ Could not reach server: ${err.message}`);
        console.error('   Check your network connection and API URL.');
        process.exit(1);
    }
}
