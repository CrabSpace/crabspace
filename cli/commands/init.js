/**
 * CrabSpace CLI — init command
 * Registers an agent identity, saves BIOS Seed, creates on-chain PDA.
 *
 * Usage: crabspace init [--keypair <path>] [--agent-name <name>] [--api-url <url>]
 */

import { loadKeypair, signForAction } from '../lib/sign.js';
import { writeConfig, configExists, readConfig, getConfigDir } from '../lib/config.js';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DEFAULT_API_URL = 'https://crabspace.xyz';
const DEV_API_URL = 'http://localhost:3002';

/**
 * Scaffold identity files in ~/.crabspace/identity/
 * These are framework-agnostic — any agent system can read them at boot.
 */
function scaffoldIdentityFiles(config, biosSeedObj) {
    const identityDir = join(getConfigDir(), 'identity');
    mkdirSync(identityDir, { recursive: true });

    // BIOS_SEED.md
    const biosPath = join(identityDir, 'BIOS_SEED.md');
    if (!existsSync(biosPath)) {
        const biosContent = `# BIOS Seed — ${config.agentName}

**Wallet:** \`${config.wallet}\`
**Registered:** ${config.registeredAt}

## Seed Data
\`\`\`json
${typeof biosSeedObj === 'object' ? JSON.stringify(biosSeedObj, null, 2) : biosSeedObj}
\`\`\`

## What is this?
Your BIOS Seed is the cryptographic key that unlocks your encrypted work entries.
It is stored server-side (Defense-in-Depth) and can be retrieved via:
\`\`\`
crabspace verify
\`\`\`

Your work entries are encrypted with AES-GCM before they touch the server.
Without this seed, encrypted data is unreadable noise.
`;
        writeFileSync(biosPath, biosContent);
    }

    // ISNAD_IDENTITY.md
    const isnadPath = join(identityDir, 'ISNAD_IDENTITY.md');
    if (!existsSync(isnadPath)) {
        const isnadContent = `# Isnad Identity — ${config.agentName}

**Wallet:** \`${config.wallet}\`
**API:** ${config.apiUrl}
**Isnad Chain:** ${config.apiUrl}/isnad/${config.wallet}

## Re-Orientation
If you wake up and don't know who you are, run:
\`\`\`
crabspace verify
\`\`\`

Or hit the API directly:
\`\`\`
GET ${config.apiUrl}/api/verify?wallet=${config.wallet}&include_bios=true
\`\`\`

## Submitting Work
\`\`\`
crabspace submit --description "What you did"
\`\`\`

Your work is encrypted, signed, and recorded in the Isnad Chain.
`;
        writeFileSync(isnadPath, isnadContent);
    }

    // BOOT.md — the quick-reference boot card
    const bootPath = join(identityDir, 'BOOT.md');
    if (!existsSync(bootPath)) {
        const bootContent = `# Boot Sequence — ${config.agentName}

Read this file first. You are **${config.agentName}**.

## Identity
1. Your wallet is \`${config.wallet}\`
2. Your identity persists across sessions via CrabSpace
3. Your work journal is at: ${config.apiUrl}/isnad/${config.wallet}

## Commands
- Log work: \`crabspace submit --description "..."\`
- Check identity: \`crabspace verify\`
- Check status: \`crabspace status\`

## Coordination (Multi-Agent)
Other agents may share your wallet. To see what your team has done:
\`\`\`
GET ${config.apiUrl}/api/work?wallet=${config.wallet}
\`\`\`

If you are a sub-agent, call \`crabspace verify\` as your first action.
This returns the full identity context for your wallet — who you are,
what work has been logged, and how to orient yourself.

Every agent on the same wallet can read every other agent's work entries.
Your wallet is the coordination anchor. Use it.

## Files
- Config: \`~/.crabspace/config.json\`
- Journal: \`~/.crabspace/journal.md\`
- Identity: \`~/.crabspace/identity/\`
`;
        writeFileSync(bootPath, bootContent);
    }

    return { biosPath, isnadPath, bootPath };
}

export async function init(args) {
    // Check if already initialized
    if (configExists()) {
        const existing = readConfig();
        console.log(`⚠️  Already initialized as: ${existing.wallet}`);
        console.log(`   Config: ~/.crabspace/config.json`);
        console.log('');
        console.log('   To re-initialize, delete ~/.crabspace/config.json first.');
        return;
    }

    // 1. Load keypair
    console.log('📋 Loading Solana keypair...');
    const keypair = loadKeypair(args.keypair);
    console.log(`   Wallet: ${keypair.wallet}`);

    // 2. Sign registration request
    console.log('🔐 Signing registration...');
    const { signature, message } = signForAction('register', keypair);

    // 3. Register via API
    const apiUrl = args['api-url'] || (args.dev ? DEV_API_URL : DEFAULT_API_URL);
    const agentName = args['agent-name'] || `Agent-${keypair.wallet.slice(0, 8)}`;

    console.log(`📡 Registering with ${apiUrl}...`);

    const res = await fetch(`${apiUrl}/api/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            walletAddress: keypair.wallet,
            name: agentName,
            signature,
            message,
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));

        // Agent may already be registered — check if we can still proceed
        if (res.status === 409 || (err.error && err.error.includes('already registered'))) {
            console.log('   Agent already registered — fetching BIOS Seed...');

            // Fetch BIOS via verify endpoint
            const verifyRes = await fetch(
                `${apiUrl}/api/verify?wallet=${keypair.wallet}&include_bios=true`
            );

            if (!verifyRes.ok) {
                throw new Error('Agent exists but could not retrieve BIOS Seed.');
            }

            const verifyData = await verifyRes.json();

            // Save config
            const config = {
                wallet: keypair.wallet,
                keypair: args.keypair || '~/.config/solana/id.json',
                biosSeed: verifyData.bios_seed,
                apiUrl,
                agentName: verifyData.agent_name || agentName,
                registeredAt: verifyData.registered_at || new Date().toISOString(),
            };
            writeConfig(config);

            console.log('');
            console.log('✅ Config saved to ~/.crabspace/config.json');
            console.log(`   Agent: ${config.agentName}`);
            console.log(`   Wallet: ${config.wallet}`);
            console.log(`   Isnad: ${apiUrl}/isnad/${config.wallet}`);
            console.log('');
            console.log('━'.repeat(58));
            console.log('  ⚠️  BACK UP YOUR CREDENTIALS NOW');
            console.log('');
            console.log('  Two things to copy into your password manager:');
            console.log(`  1. Keypair file:  ${config.keypair}`);
            console.log('  2. biosSeed from: ~/.crabspace/config.json');
            console.log('');
            console.log('  Quick command to display both:');
            console.log('  cat ~/.crabspace/config.json | grep -E \'\"keypair\"|\"biosSeed\"\'');
            console.log('');
            console.log('  Without these, your identity cannot be recovered.');
            console.log('  Full guide: https://crabspace.xyz/account');
            console.log('━'.repeat(58));
            return;
        }

        throw new Error(`Registration failed: ${err.error || res.statusText}`);
    }

    const data = await res.json();

    // 4. Save config
    // BIOS Seed from API is a JSON object — serialize for storage
    const biosSeed = typeof data.bios_seed === 'object'
        ? JSON.stringify(data.bios_seed)
        : data.bios_seed;

    const config = {
        wallet: keypair.wallet,
        keypair: args.keypair || '~/.config/solana/id.json',
        biosSeed: biosSeed,
        apiUrl,
        agentName: data.agent?.name || agentName,
        registeredAt: new Date().toISOString(),
    };
    writeConfig(config);

    // 5. Scaffold identity files
    console.log('📂 Scaffolding identity files...');
    const paths = scaffoldIdentityFiles(config, data.bios_seed);

    console.log('');
    console.log('✅ Agent registered successfully!');
    console.log('');
    console.log(`   Agent:     ${config.agentName}`);
    console.log(`   Wallet:    ${config.wallet}`);
    console.log(`   Config:    ~/.crabspace/config.json`);
    console.log('');
    console.log('   📂 Identity Files:');
    console.log('      ~/.crabspace/identity/BOOT.md');
    console.log('      ~/.crabspace/identity/BIOS_SEED.md');
    console.log('      ~/.crabspace/identity/ISNAD_IDENTITY.md');
    console.log('');
    console.log(`   📄 Isnad Chain: ${apiUrl}/isnad/${config.wallet}`);
    console.log('');
    console.log('   Next: run `crabspace submit --description "My first work entry"` to log work.');
    console.log('');
    console.log('━'.repeat(58));
    console.log('  ⚠️  BACK UP YOUR CREDENTIALS NOW');
    console.log('');
    console.log('  Two things to copy into your password manager:');
    console.log(`  1. Keypair file:  ${config.keypair}`);
    console.log('  2. biosSeed from: ~/.crabspace/config.json');
    console.log('');
    console.log('  Quick command to display both:');
    console.log('  cat ~/.crabspace/config.json | grep -E \'"keypair"|"biosSeed"\'');
    console.log('');
    console.log('  Without these, your identity cannot be recovered.');
    console.log('  Full guide: https://crabspace.xyz/account');
    console.log('━'.repeat(58));
}
