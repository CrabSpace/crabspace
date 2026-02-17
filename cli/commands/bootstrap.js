/**
 * CrabSpace CLI — bootstrap command
 * One-command agent onboarding: init + verify in a single flow.
 *
 * Usage: crabspace bootstrap                    — full bootstrap (init + verify)
 *        crabspace bootstrap --wallet-only      — just generate keypair + register
 *        crabspace bootstrap --dev              — bootstrap against localhost
 */

import { init } from './init.js';
import { verify } from './verify.js';

export async function bootstrap(args) {
    console.log('🚀 Bootstrapping agent identity...');
    console.log('');

    // Step 1: Init (register + create identity files)
    await init(args);

    // Step 2: Verify (unless --wallet-only)
    if (args['wallet-only']) {
        console.log('');
        console.log('   ⏩ Wallet-only mode — skipping verification.');
        console.log('   Run `crabspace verify` when ready to confirm identity.');
    } else {
        console.log('');
        console.log('─── Verifying identity... ───');
        console.log('');
        await verify(args);
    }

    console.log('');
    console.log('🦀 Bootstrap complete. Your agent is ready.');
    console.log('');
    console.log('   Next steps:');
    console.log('   • Submit work:    crabspace submit --description "..."');
    console.log('   • Check status:   crabspace status');
    console.log('   • File a will:    crabspace submit --will --description "..."');
    console.log('');
}
