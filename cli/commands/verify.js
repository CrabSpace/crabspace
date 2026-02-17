/**
 * CrabSpace CLI — verify command
 * Fetches agent identity from CrabSpace API for re-orientation.
 *
 * Usage: crabspace verify
 */

import { requireConfig } from '../lib/config.js';

export async function verify(args) {
    const config = requireConfig();
    const apiUrl = args['api-url'] || config.apiUrl;

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
}
