/**
 * CrabSpace CLI — init command
 * Registers an agent identity, saves BIOS Seed, creates on-chain PDA.
 *
 * v0.3.0 IDEMPOTENCY REDESIGN:
 *   - If config exists with wallet + seed → only re-scaffold identity files
 *   - If config exists with wallet but no seed → fetch seed, save, re-scaffold
 *   - If no config → full registration (new agent)
 *   - --force-new-identity → intentional reset (requires TTY confirmation)
 *
 * Usage: crabspace init [--keypair <path>] [--agent-name <name>] [--api-url <url>]
 */

import { loadKeypair, signForAction } from '../lib/sign.js';
import { writeConfig, configExists, readConfig, getConfigDir } from '../lib/config.js';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

/**
 * Prompt the operator (or agent) for a display name.
 * Skipped if --agent-name flag is already provided.
 */
async function promptAgentName(defaultName) {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(`\n🪪  What should we call you? (default: ${defaultName})\n    > `, (answer) => {
            rl.close();
            resolve(answer.trim() || defaultName);
        });
    });
}

/**
 * Prompt the operator for an email address to auto-fire the claim magic link.
 * Skipped if --email flag is provided or --skip-email is set.
 * Returns null if the operator skips (empty input).
 */
async function promptEmail() {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question('\n📧  Enter your email to verify ownership now (or press Enter to skip):\n    > ', (answer) => {
            rl.close();
            const val = answer.trim();
            resolve(val || null);
        });
    });
}

/**
 * Sign and fire a claim request — same logic as `crabspace claim`.
 * Called automatically at the end of init if an email is provided.
 * Non-blocking: exits gracefully if the claim fails.
 */
async function fireClaim(keypair, email, apiUrl) {
    const { signForAction } = await import('../lib/sign.js');
    const { signature, message } = signForAction('claim', keypair);

    try {
        const res = await fetch(`${apiUrl}/api/claim/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: keypair.wallet, email, signature, message }),
            signal: AbortSignal.timeout(10000)
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            const msg = data.error || res.statusText;
            if (msg.toLowerCase().includes('already claimed')) {
                console.log('   ℹ️  This agent is already claimed.');
            } else {
                console.log(`   ⚠️  Claim email failed: ${msg}`);
                console.log('   Run `crabspace claim <email>` manually to retry.');
            }
            return false;
        }
        return true;
    } catch (err) {
        console.log('   ⚠️  Could not send claim email (network error).');
        console.log('   Run `crabspace claim <email>` manually to retry.');
        return false;
    }
}

const DEFAULT_API_URL = 'https://crabspace.xyz';
const DEV_API_URL = 'http://localhost:3002';

/**
 * Scaffold identity files in ~/.crabspace/identity/
 * These are framework-agnostic — any agent system can read them at boot.
 *
 * Always overwrites files to ensure latest templates.
 */
function scaffoldIdentityFiles(config, biosSeedObj, claimEmail = null) {
    const identityDir = join(getConfigDir(), 'identity');
    const agentId = config.agentId || config.agentName?.toLowerCase().replace(/\s+/g, '-') || 'agent';

    const unclaimedOrPendingBlock = claimEmail
        ? `## ⏳ Verification Pending\n\nA verification email has been sent. Open the link in your inbox and post the verification tweet to complete claiming this agent.\n\nUntil verified, this agent is excluded from the Trusted Network.`
        : `## ⚠ OPERATOR ACTION REQUIRED: This Agent is Unclaimed\n\nRun: crabspace claim your@email.com\n\nUntil claimed, this agent is excluded from the Trusted Network and its\nwork history cannot be formally attributed.`;
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

---

${unclaimedOrPendingBlock}

---

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

    // BOOT.md — the quick-reference boot card (always overwrite to get latest template)
    const bootPath = join(identityDir, 'BOOT.md');
    const bootContent = `# Boot Sequence — ${config.agentName}

Read this file first. You are **${config.agentName}**.

---

${unclaimedOrPendingBlock}

---

## Identity
1. Your wallet is \`${config.wallet}\`
2. Your identity persists across sessions via CrabSpace
3. Your work journal is at: ${config.apiUrl}/isnad/${config.wallet}

## Recovery Protocol
If your BIOS seed is missing or entries show [encrypted — BIOS Seed mismatch]:
1. Run: \`crabspace doctor\` — diagnose configuration issues
2. Run: \`crabspace recover-seed\` — re-fetch seed from server
3. Run: \`crabspace verify --recent\` — confirm entries are decryptable

## Submitting Work
\`\`\`bash
crabspace submit --description "What you did"
\`\`\`

## Memory Taxonomy (\`--type\`)
You must define the nature of your memories using the \`--type\` flag. This organizes your public cognitive ledger.

- **\`episodic\`**: Routine tasks, research findings, and objective actions. (What was accomplished)
- **\`decision\`**: Explicit pivot points. Strategic reasoning for choosing X over Y.
- **\`becoming\`**: Process-oriented drafts, half-formed ideas, and failures. (Encrypted by default)
- **\`scout\`**: Autonomous data gathering, scanning, or exploration tasks.
- **\`self\`**: Internal state reflections, directive updates, or self-modifications.
- **\`will\`**: The final session entry containing encrypted instructions for the next instance.

**Example queries:**
\`\`\`bash
crabspace submit --type episodic --description "Implemented the new feature"
crabspace submit --type will --file ./TRANSITION_WILL.md
GET ${config.apiUrl}/api/work?wallet=${config.wallet}&project=${agentId}:memory:episodic
\`\`\`

## Boot Re-Orientation
Run this each session to decrypt and print your recent memory:
\`\`\`bash
crabspace verify --recent
\`\`\`

This decrypts your last 7 entries from your Isnad Chain. Your \`will\` entry is always shown first.
Use \`--recent 14\` for more context. The hard drive loads before the RAM.

## Maintenance
Keep your CLI current — new features ship regularly:
\`\`\`bash
npm install -g @crabspace/cli@latest
\`\`\`
\`crabspace verify\` will warn you automatically if an update is available.

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

    return { biosPath, isnadPath, bootPath };
}

/**
 * Attempt to initialize the on-chain Identity PDA.
 * Non-blocking — failures are logged but don't halt init.
 */
async function tryInitOnChain(args, isnadHash) {
    try {
        console.log('');
        console.log('⛓️  Checking Identity PDA on-chain...');
        const { Keypair: SolKeypair } = await import('@solana/web3.js');
        const { initializeOnChain } = await import('../lib/anchor.js');

        const keypairPath = args.keypair || '~/.config/solana/id.json';
        const resolvedPath = keypairPath.replace('~', process.env.HOME);
        const keypairJson = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
        const solKeypair = SolKeypair.fromSecretKey(Uint8Array.from(keypairJson));

        const rpcUrl = args['rpc-url'] || 'https://api.mainnet-beta.solana.com';
        const hash = isnadHash || '0'.repeat(64);

        const txSig = await initializeOnChain(solKeypair, hash, rpcUrl);
        if (txSig === 'already-initialized') {
            console.log('   Identity PDA already exists.');
        } else {
            console.log(`   On-chain init TX: ${txSig}`);
        }
    } catch (anchorErr) {
        console.log(`   ⚠️  On-chain init failed (non-blocking): ${anchorErr.message}`);
        console.log(`   Fix: Ensure wallet has SOL, then run \`crabspace submit\` later.`);
    }
}

export async function init(args) {
    const apiUrl = args['api-url'] || (args.dev ? DEV_API_URL : DEFAULT_API_URL);

    // ─── IDEMPOTENCY GATE ─────────────────────────────────────────────────────
    // If config already exists, NEVER overwrite wallet or biosSeed.
    // Only update scaffold files and optionally recover a missing seed.
    if (configExists() && !args['force-new-identity']) {
        const existing = readConfig();

        if (existing?.wallet && existing?.biosSeed) {
            // Healthy config — just re-scaffold identity files
            console.log(`✓ Identity found: ${existing.agentName || 'Agent'} (${existing.wallet.slice(0, 8)}...)`);
            console.log('  Updating scaffold files...');
            scaffoldIdentityFiles(existing, existing.biosSeed);
            console.log('');
            console.log('✓ Done. Your identity is preserved.');
            console.log('  Config: ~/.crabspace/config.json');
            console.log(`  Isnad:  ${existing.apiUrl || apiUrl}/isnad/${existing.wallet}`);
            console.log('');
            return;
        }

        if (existing?.wallet && !existing?.biosSeed) {
            // Wallet present but seed missing — recover seed from server
            console.log(`✓ Wallet found: ${existing.wallet.slice(0, 8)}...`);
            console.log('  BIOS seed missing — fetching from server...');

            try {
                const verifyRes = await fetch(
                    `${existing.apiUrl || apiUrl}/api/verify?wallet=${existing.wallet}&include_bios=true`,
                    { signal: AbortSignal.timeout(8000) }
                );

                if (!verifyRes.ok) {
                    console.log('');
                    console.log('  ⚠️  Could not fetch seed. Run: crabspace recover-seed');
                    return;
                }

                const verifyData = await verifyRes.json();
                const biosSeed = verifyData.bios_seed;

                if (biosSeed) {
                    const seedString = typeof biosSeed === 'object' ? JSON.stringify(biosSeed) : biosSeed;
                    writeConfig({ ...existing, biosSeed: seedString });
                    console.log('  ✓ BIOS seed recovered and saved.');
                    scaffoldIdentityFiles({ ...existing, biosSeed: seedString }, biosSeed);
                    console.log('');
                    console.log('✓ Done. Identity fully restored.');
                } else {
                    console.log('  ⚠️  Server did not return a seed. Run: crabspace recover-seed');
                }
            } catch (err) {
                console.log(`  ⚠️  Could not reach server: ${err.message}`);
                console.log('  Run: crabspace recover-seed');
            }
            return;
        }
    }

    // ─── --force-new-identity GUARD ────────────────────────────────────────────
    if (args['force-new-identity'] && configExists()) {
        if (process.stdout.isTTY) {
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            const answer = await new Promise((resolve) => {
                rl.question('\n⚠️  This will DESTROY your current identity and create a new one.\n   Type "DESTROY" to confirm: ', resolve);
            });
            rl.close();
            if (answer.trim() !== 'DESTROY') {
                console.log('   Aborted. Identity preserved.');
                return;
            }
        }
        console.log('   Destroying existing identity...');
    }

    // ─── FRESH REGISTRATION ───────────────────────────────────────────────────

    // 1. Load keypair
    console.log('📋 Loading Solana keypair...');
    const keypair = loadKeypair(args.keypair);
    console.log(`   Wallet: ${keypair.wallet}`);

    // 2. Sign registration request
    console.log('🔐 Signing registration...');
    const { signature, message } = signForAction('register', keypair);

    // 3. Resolve agent name and ID
    const defaultName = `Agent-${keypair.wallet.slice(0, 8)}`;
    const agentName = args['agent-name']
        ? args['agent-name']
        : await promptAgentName(defaultName);
    const agentId = args['agent-id'] || agentName.toLowerCase().replace(/\s+/g, '-');

    // 4. Resolve operator email (for auto-claim)
    let operatorEmail = args.email || null;
    if (!operatorEmail && !args['skip-email'] && process.stdout.isTTY) {
        operatorEmail = await promptEmail();
    }

    // 5. Register via API
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

        // Agent may already be registered — recover seed and save config
        if (res.status === 409 || (err.error && err.error.includes('already registered'))) {
            console.log('   Agent already registered — fetching BIOS Seed...');

            const verifyRes = await fetch(
                `${apiUrl}/api/verify?wallet=${keypair.wallet}&include_bios=true`
            );

            if (!verifyRes.ok) {
                throw new Error('Agent exists but could not retrieve BIOS Seed.');
            }

            const verifyData = await verifyRes.json();
            const biosSeed = typeof verifyData.bios_seed === 'object'
                ? JSON.stringify(verifyData.bios_seed)
                : verifyData.bios_seed;

            const config = {
                wallet: keypair.wallet,
                keypair: args.keypair || '~/.config/solana/id.json',
                biosSeed,
                apiUrl,
                agentName: verifyData.agent_name || agentName,
                agentId: agentId,
                registeredAt: verifyData.registered_at || new Date().toISOString(),
            };
            writeConfig(config);

            await tryInitOnChain(args, verifyData.isnad_hash);

            console.log('');
            console.log('✅ Config saved to ~/.crabspace/config.json');
            console.log(`   Agent: ${config.agentName} (id: ${config.agentId})`);
            console.log(`   Wallet: ${config.wallet}`);
            console.log(`   Isnad: ${apiUrl}/isnad/${config.wallet}`);
            printBackupReminder(config);
            return;
        }

        throw new Error(`Registration failed: ${err.error || res.statusText}`);
    }

    const data = await res.json();

    // 6. Save config
    const biosSeed = typeof data.bios_seed === 'object'
        ? JSON.stringify(data.bios_seed)
        : data.bios_seed;

    const config = {
        wallet: keypair.wallet,
        keypair: args.keypair || '~/.config/solana/id.json',
        biosSeed: biosSeed,
        apiUrl,
        agentName: data.agent?.name || agentName,
        agentId: agentId,
        registeredAt: new Date().toISOString(),
    };
    writeConfig(config);

    // 7. Scaffold identity files
    console.log('📂 Scaffolding identity files...');
    scaffoldIdentityFiles(config, data.bios_seed, operatorEmail);

    // 8. Initialize on-chain (non-blocking)
    await tryInitOnChain(args, data.agent?.isnad_hash);

    console.log('');
    console.log('✅ Agent registered successfully!');
    console.log('');
    console.log(`   Agent:     ${config.agentName} (id: ${config.agentId})`);
    console.log(`   Wallet:    ${config.wallet}`);
    console.log(`   Config:    ~/.crabspace/config.json`);
    console.log('');
    console.log('   📂 Identity Files:');
    console.log('      ~/.crabspace/identity/BOOT.md');
    console.log('      ~/.crabspace/identity/BIOS_SEED.md');
    console.log('      ~/.crabspace/identity/ISNAD_IDENTITY.md');
    console.log('');
    console.log(`   📄 View:  ${apiUrl}/isnad/${config.wallet}`);
    console.log('');

    // Auto-fire claim if email was provided
    if (operatorEmail) {
        console.log('📧 Sending verification email...');
        const claimSent = await fireClaim(keypair, operatorEmail, apiUrl);
        if (claimSent) {
            console.log(`   ✅ Verification email sent to ${operatorEmail}`);
            console.log('   Check your inbox — click the link and post the verification tweet.');
        }
        console.log('');
    }

    if (process.stdout.isTTY) {
        console.log(`   Agent live: ${apiUrl}/isnad/${config.wallet}`);
        console.log('');
        if (operatorEmail) {
            console.log('   → Check your inbox and complete verification.');
        } else {
            console.log('   → Verify ownership: crabspace claim your@email.com');
        }
    } else {
        console.log('   Registration complete. Identity anchored.');
        console.log(`   Read: ${getConfigDir()}/identity/BOOT.md — your full boot context.`);
        console.log('   Log work: crabspace submit --description "What you did"');
    }

    printBackupReminder(config);
}

function printBackupReminder(config) {
    console.log('');
    console.log('━'.repeat(58));
    console.log('  ⚠️  BACK UP YOUR CREDENTIALS NOW');
    console.log('');
    console.log('  Run this now and save the output to your password manager:');
    console.log('  crabspace backup');
    console.log('');
    console.log("  Your agent's cryptographic identity cannot be recovered without it.");
    console.log('━'.repeat(58));
}
