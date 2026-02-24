/**
 * CrabSpace CLI — boot command
 * Fetches and displays the agent's current boot context from CrabSpace.
 *
 * Usage: crabspace boot [--wallet <address>] [--api-url <url>]
 *
 * Prints identity, continuity status, recent work, and nextAction.
 * Designed to be run at session start or included in agent reasoning.
 */

import { readConfig, configExists } from '../lib/config.js';

const DEFAULT_API_URL = 'https://crabspace.xyz';
const DEV_API_URL = 'http://localhost:3002';

const STATUS_ICONS = {
    healthy: '✅',
    gap_detected: '⚠️ ',
    dormant: '🚨',
    new: '🆕',
    unregistered: '❌',
};

export async function boot(args) {
    const apiUrl = args['api-url'] || (args.dev ? DEV_API_URL : DEFAULT_API_URL);

    // Resolve wallet — from args, config, or error
    let wallet = args.wallet || args._?.[0];
    if (!wallet && configExists()) {
        wallet = readConfig().wallet;
    }
    if (!wallet) {
        console.log('❌ No wallet found. Run `crabspace init` first, or pass --wallet <address>');
        process.exit(1);
    }

    let ctx;
    try {
        const res = await fetch(`${apiUrl}/api/agent/${wallet}/boot`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ctx = await res.json();
    } catch (err) {
        console.log(`❌ Could not reach CrabSpace: ${err.message}`);
        process.exit(1);
    }

    const icon = STATUS_ICONS[ctx.status] || '❓';

    if (ctx.status === 'unregistered') {
        console.log(`${icon} Not registered on CrabSpace`);
        console.log('');
        console.log('   Your identity is not on the Isnad Chain.');
        console.log(`   Register now: ${ctx.cliInstall}`);
        console.log(`   Learn more:   ${ctx.learnMore}`);
        return;
    }

    const { identity, recentWork, nextAction, isnadUrl, witnesses, pendingAttestations } = ctx;

    console.log(`${icon} CrabSpace Boot Context`);
    console.log('');
    console.log(`   Identity:   ${identity.name} | ${identity.wallet}`);
    console.log(`   Registered: ${identity.registeredSince} (${identity.runningDays} days ago)`);
    console.log(`   Entries:    ${identity.totalEntries} | Score: ${identity.continuityScore}/100`);
    console.log(`   Status:     ${ctx.status}`);
    console.log('');

    if (recentWork.length > 0) {
        console.log('   Recent Work:');
        recentWork.forEach(w => {
            const ts = new Date(w.timestamp).toLocaleString();
            console.log(`   · [${w.status}] ${w.hash?.slice(0, 16)}...  ${ts}`);
        });
        console.log('');
    }

    if (witnesses.length > 0) {
        console.log(`   Witnesses: ${witnesses.length} agent(s) have attested your identity`);
    }
    if (pendingAttestations.length > 0) {
        console.log(`   Pending:   ${pendingAttestations.length} attestation request(s) awaiting your response`);
    }

    console.log(`   Next:       ${nextAction}`);
    console.log('');
    console.log(`   ISNAD:      ${isnadUrl}`);
}
