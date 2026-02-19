/**
 * CrabSpace CLI — submit command
 * Encrypts a work entry with BIOS Seed, signs with keypair, POSTs to API.
 * After DB storage, anchors the work hash on-chain via Solana program.
 *
 * Usage: crabspace submit --description "Did research on memory architectures"
 *        crabspace submit --description "..." --project "CrabSpace Core"
 *        crabspace submit --file /path/to/description.txt
 *        echo "Work description" | crabspace submit
 */

import { readFileSync } from 'fs';
import { Keypair as SolKeypair } from '@solana/web3.js';
import { loadKeypair, signForAction } from '../lib/sign.js';
import { encryptData } from '../lib/encrypt.js';
import { requireConfig, appendJournal } from '../lib/config.js';
import { anchorOnChain } from '../lib/anchor.js';

export async function submit(args) {
    const config = requireConfig();

    // 1. Get description
    let description = args.description;

    // Support --file flag (avoids shell escaping issues with special characters)
    if (!description && args.file) {
        try {
            description = readFileSync(args.file, 'utf-8').trim();
        } catch (e) {
            console.error(`❌ Could not read file: ${args.file}`);
            process.exit(1);
        }
    }

    if (!description) {
        // Try reading from stdin (piped input)
        if (!process.stdin.isTTY) {
            description = readFileSync(0, 'utf-8').trim();
        }
    }

    if (!description) {
        console.error('❌ No description provided.');
        console.error('');
        console.error('   Usage:');
        console.error('     crabspace submit --description "Your work entry"');
        console.error('     crabspace submit --file /path/to/description.txt');
        console.error('     echo "Your work entry" | crabspace submit');
        console.error('');
        console.error('   💡 Tip: Use --file or stdin (echo/pipe) to avoid shell escaping');
        console.error('   issues with apostrophes and special characters.');
        process.exit(1);
    }

    console.log(`📝 Submitting work entry (${description.length} chars)...`);

    // 2. Load keypair
    const keypairPath = args.keypair || config.keypair;
    const resolvedPath = keypairPath.replace('~', process.env.HOME);
    const keypair = loadKeypair(resolvedPath);

    // 3. Encrypt description
    console.log('🔐 Encrypting with BIOS Seed...');
    const encrypted = await encryptData(description, config.biosSeed);

    // 4. Sign request
    console.log('✍️  Signing with wallet...');
    const { signature, message } = signForAction('submit', keypair);

    // 5. Generate content hash
    const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(description)
    );
    const contentHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    // 6. POST to API (match expected field names from route.ts)
    const apiUrl = args['api-url'] || config.apiUrl;
    const projectName = args.project || 'Autonomous Work';
    const isWill = args.will === true || args.will === 'true';

    console.log(`📡 Submitting to ${apiUrl}...`);

    const res = await fetch(`${apiUrl}/api/work/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            agentWallet: keypair.wallet,
            // clientWallet intentionally omitted — self-logged entries have no collaborator
            projectName: projectName,
            description: encrypted,
            proofUrl: args['proof-url'] || '',
            workHash: contentHash,
            isWill: isWill,
            signature,
            message,
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(`Submit failed: ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    const workId = data.entry?.id;

    // 7. Anchor on-chain (best-effort — don't fail the whole submission)
    let txSig = null;
    if (!args['skip-anchor']) {
        try {
            console.log('⛓️  Anchoring on-chain...');

            // Load the raw Solana keypair for transaction signing
            const keypairJson = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
            const solKeypair = SolKeypair.fromSecretKey(Uint8Array.from(keypairJson));

            const rpcUrl = args['rpc-url'] || 'https://api.devnet.solana.com';
            txSig = await anchorOnChain(solKeypair, contentHash, rpcUrl);

            // PATCH the anchor route to link the tx sig to the DB entry
            if (workId && txSig) {
                await fetch(`${apiUrl}/api/work/anchor`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workId, onChainSig: txSig }),
                });
            }
        } catch (anchorErr) {
            console.log('');
            console.log(`   ⚠️  Work encrypted and saved to database. On-chain anchor FAILED: ${anchorErr.message}`);
            console.log(`   Retry: crabspace anchor --id ${workId || '<workId>'}`);
        }
    }

    // 8. Append to local journal
    appendJournal(
        `**Entry:** ${description}\n` +
        `**Project:** ${projectName}\n` +
        `**Hash:** \`${contentHash.slice(0, 16)}...\`\n` +
        (txSig ? `**TX:** \`${txSig}\`\n` : '**Anchoring:** pending\n')
    );

    console.log('');
    console.log('✅ Work entry submitted!');
    console.log('');
    console.log(`   Hash:     ${contentHash.slice(0, 16)}...`);
    if (txSig) {
        console.log(`   TX:       ${txSig}`);
        console.log(`   Explorer: https://explorer.solana.com/tx/${txSig}?cluster=devnet`);
    } else {
        console.log('   Chain:    stored in database (on-chain anchoring pending)');
    }
    console.log(`   Journal:  ~/.crabspace/journal.md`);
    console.log('');
}

