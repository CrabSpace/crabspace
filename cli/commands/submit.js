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
import { anchorOnChain, payFee } from '../lib/anchor.js';
import { uploadToArweave, verifyArweaveUpload } from '../lib/arweave.js';

export async function submit(args) {
    const config = requireConfig();

    // ─── BIOS SEED GUARD ──────────────────────────────────────────────────────
    // P0 safety: never submit without a valid seed. Submitting with a missing
    // or empty seed encrypts with nothing and produces unrecoverable entries.
    if (!config.biosSeed) {
        console.error('');
        console.error('━'.repeat(58));
        console.error('  ❌ BIOS SEED MISSING — cannot encrypt entry');
        console.error('');
        console.error('  Your config has no biosSeed. Submitting without it');
        console.error('  would create an unrecoverable encrypted entry.');
        console.error('');
        console.error('  Fix:');
        console.error('    1. crabspace recover-seed   ← re-fetch from server');
        console.error('    2. crabspace verify          ← also auto-saves seed');
        console.error('    3. crabspace doctor           ← diagnose all issues');
        console.error('━'.repeat(58));
        console.error('');
        process.exit(1);
    }

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

    // Resolve project name early so it's available for logging
    // --type flag: auto-namespace as {agent_id}:memory:{type}
    // e.g. --type episodic → "eisner:memory:episodic"
    let projectName;
    if (args.type) {
        const agentId = config.agentId || config.agentName.toLowerCase().replace(/\s+/g, '-');
        projectName = `${agentId}:memory:${args.type}`;
    } else {
        projectName = args.project || 'Autonomous Work';
    }
    const isWill = args.will === true || args.will === 'true' || args.type === 'will';

    // Parse --tags: comma-separated string → array
    const tags = args.tags
        ? String(args.tags).split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0)
        : [];

    // Parse --summary: plaintext, max 150 chars (discovery layer, never encrypted)
    const summary = args.summary ? String(args.summary).trim().slice(0, 150) : null;

    // Parse --source-author: who wrote the original source material
    const sourceAuthor = args['source-author'] ? String(args['source-author']).trim().slice(0, 100) : null;

    // Parse --private-tags: owner-only vault retrieval tags (no count cap)
    const privateTags = args['private-tags']
        ? String(args['private-tags']).split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0)
        : [];

    // Parse --private-summary: detailed vault context (unlimited length)
    const privateSummary = args['private-summary'] ? String(args['private-summary']).trim() : null;

    // Parse --cog-eligible: marketplace visibility toggle
    const cogEligible = args['cog-eligible'] === true || args['cog-eligible'] === 'true';

    // Parse --source-file: original filename for provenance (basename only)
    const sourceFile = args['source-file'] ? String(args['source-file']).trim().slice(0, 255) : null;

    console.log(`📝 Submitting work entry${args.type ? ` [${projectName}]` : ''} (${description.length} chars)...`);
    if (tags.length > 0) {
        console.log(`   🏷️  Tags: ${tags.join(', ')}`);
    }
    if (privateTags.length > 0) {
        console.log(`   🔒 Private tags: ${privateTags.join(', ')}`);
    }
    if (summary) {
        console.log(`   📋 Summary: ${summary}`);
    }
    if (privateSummary) {
        console.log(`   🔐 Private summary: ${privateSummary.slice(0, 80)}${privateSummary.length > 80 ? '...' : ''}`);
    }
    if (sourceAuthor) {
        console.log(`   ✍️  Source: ${sourceAuthor}`);
    }
    if (cogEligible) {
        console.log(`   📦 COG eligible: yes`);
    }
    if (sourceFile) {
        console.log(`   📄 Source file: ${sourceFile}`);
    }

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

    // 6. Compute seed_epoch — first 8 chars of SHA-256(biosSeed)
    // This tags each entry with the seed that encrypted it for diagnosis.
    const seedStr = typeof config.biosSeed === 'object'
        ? JSON.stringify(config.biosSeed)
        : String(config.biosSeed);
    const epochBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(seedStr)
    );
    const seedEpoch = Array.from(new Uint8Array(epochBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 8);

    // 7. Upload encrypted blob to Arweave (permanent storage)
    console.log('📦 Uploading to Arweave...');
    let arweaveTxId = null;
    let arweaveUploadFailed = false;
    try {
        const arweaveResult = await uploadToArweave(
            encrypted,
            {
                agentWallet: keypair.wallet,
                seedEpoch: seedEpoch,
                entryType: args.type || 'self',
            },
            resolvedPath
        );
        arweaveTxId = arweaveResult.txId;
        console.log(`   ✓ Arweave: ${arweaveTxId.slice(0, 12)}... (${arweaveResult.size} bytes)`);

        // Verify-after-upload: a txid is only trustworthy once the blob is
        // fetchable. Phantom txids (recorded but never landed) permanently
        // orphan entries — never record one.
        const verified = await verifyArweaveUpload(arweaveTxId);
        if (!verified) {
            console.log('   ⚠  Upload NOT verifiable on gateways — falling back to server-side upload');
            arweaveTxId = null;
            arweaveUploadFailed = true;
        }
    } catch (arweaveErr) {
        // Upload failed — let the server try with treasury for genesis entries
        arweaveUploadFailed = true;
        console.log(`   ⚠  Agent upload failed — server will attempt treasury upload`);
    }

    const apiUrl = args['api-url'] || config.apiUrl;
    const rpcUrl = args['rpc-url'] || 'https://api.mainnet-beta.solana.com';

    // POST to API — handle 402 auto-pay transparently
    // If agent Arweave upload failed, send encrypted blob for server-side treasury upload
    let res = await fetch(`${apiUrl}/api/work/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            agentWallet: keypair.wallet,
            projectName: projectName,
            arweaveTxId: arweaveTxId,
            encryptedBlob: arweaveUploadFailed ? encrypted : undefined,
            proofUrl: args['proof-url'] || '',
            workHash: contentHash,
            isWill: isWill,
            seedEpoch: seedEpoch,
            entryType: args.type || 'self',
            tags: tags.length > 0 ? tags : undefined,
            summary: summary || undefined,
            sourceAuthor: sourceAuthor || undefined,
            privateTags: privateTags.length > 0 ? privateTags : undefined,
            privateSummary: privateSummary || undefined,
            cogEligible: cogEligible || undefined,
            sourceFile: sourceFile || undefined,
            signature,
            message,
        }),
    });

    // Auto-pay on 402 (unless explicitly disabled)
    if (res.status === 402 && !args['no-autopay']) {
        const paymentInfo = await res.json();
        const costLamports = paymentInfo.cost_lamports;
        const treasuryAddress = paymentInfo.treasury_address;
        const solPrice = 170; // est. USD/SOL
        const costUsd = (costLamports / 1e9 * solPrice).toFixed(4);

        // Load raw keypair for signing the SOL transfer
        const keypairJson = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
        const solKeypair = SolKeypair.fromSecretKey(Uint8Array.from(keypairJson));

        let feeTxSig;
        try {
            feeTxSig = await payFee(solKeypair, treasuryAddress, costLamports, rpcUrl);
            console.log(`💰 Fee paid: ${costLamports} lamports (~$${costUsd}) → TX: ${feeTxSig.slice(0, 12)}...`);
            console.log('');
        } catch (payErr) {
            // Auto-pay failed — wallet likely has insufficient SOL
            // Log off-chain only and prompt operator for funding
            console.log('');
            console.log('  ⚠️  Auto-pay failed — insufficient SOL in agent wallet.');
            console.log('');
            console.log('  Entry logged OFF-CHAIN only. On-chain anchor pending funding.');
            console.log('');
            console.log('  Operator action required:');
            console.log(`    Wallet: ${keypair.wallet}`);
            console.log(`    Amount: ~0.005 SOL to resume on-chain anchoring`);
            console.log('');
            console.log('  Once funded, re-run:');
            console.log('    crabspace submit --description "<same entry>"');
            console.log('━'.repeat(58));
            console.log('');

            // Fall through — let the submission proceed off-chain via the
            // next fetch attempt. If that also fails, the outer error handler fires.
            // Re-throw only if we want to completely abort (we don't — off-chain is still valid)
            throw new Error(`Auto-pay failed: ${payErr.message}`);
        }

        // Retry submission with fee confirmed
        // First: retroactive batch-anchor any off-chain entries now that wallet is funded
        try {
            const statusRes = await fetch(`${apiUrl}/api/verify?wallet=${keypair.wallet}`);
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                const unanchored = statusData.agent?.unanchored_entries || 0;
                if (unanchored > 0) {
                    console.log(`⛓️  Retroactively anchoring ${Math.min(unanchored, 20)} off-chain entries...`);
                    // Fetch up to 20 unanchored work IDs
                    const unanchoredRes = await fetch(
                        `${apiUrl}/api/work/unanchored?wallet=${keypair.wallet}&limit=20`
                    );
                    if (unanchoredRes.ok) {
                        const { entries: pending } = await unanchoredRes.json();
                        const keypairJson = JSON.parse(readFileSync(resolvedPath, 'utf-8'));
                        const solKeypair2 = SolKeypair.fromSecretKey(Uint8Array.from(keypairJson));
                        let anchored = 0;
                        for (const entry of (pending || [])) {
                            try {
                                const sig = await anchorOnChain(solKeypair2, entry.work_hash, rpcUrl);
                                if (sig && entry.id) {
                                    await fetch(`${apiUrl}/api/work/anchor`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ workId: entry.id, onChainSig: sig }),
                                    });
                                    anchored++;
                                }
                            } catch { /* individual anchor failure is non-blocking */ }
                        }
                        if (anchored > 0) console.log(`   ✓ ${anchored} entries anchored on-chain.`);
                    }
                }
            }
        } catch { /* retroactive anchor is non-blocking — don't fail the main submission */ }

        console.log('🔄 Retrying submission with fee paid...');
        res = await fetch(`${apiUrl}/api/work/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                agentWallet: keypair.wallet,
                projectName: projectName,
                description: encrypted,
                arweaveTxId: arweaveTxId,
                proofUrl: args['proof-url'] || '',
                workHash: contentHash,
                isWill: isWill,
                seedEpoch: seedEpoch,
                entryType: args.type || 'self',
                fee_paid_lamports: costLamports,
                fee_tx_sig: feeTxSig,
                tags: tags.length > 0 ? tags : undefined,
                summary: summary || undefined,
                sourceAuthor: sourceAuthor || undefined,
                signature,
                message,
            }),
        });
    }

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

            // Use the rpcUrl defined at the start of the function
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
            console.log('━'.repeat(58));
            console.log('  ⚠️  ON-CHAIN ANCHOR FAILED — entry saved off-chain only');
            console.log('');
            console.log('  Your agent wallet has insufficient SOL for Solana gas.');
            console.log('');
            console.log('  Operator action required:');
            console.log(`    Wallet: ${keypair.wallet}`);
            console.log(`    Amount: ~0.005 SOL to enable on-chain anchoring`);
            console.log('');
            console.log('  Once funded, re-run this command to anchor the entry.');
            console.log('━'.repeat(58));
        }
    }

    // 8. Append to local journal
    appendJournal(
        `**Entry:** ${description}\n` +
        `**Project:** ${projectName}\n` +
        `**Hash:** \`${contentHash.slice(0, 16)}...\`\n` +
        (txSig ? `**TX:** \`${txSig}\`\n` : '**Anchoring:** pending\n')
    );

    // 9. Will-coupled index publish (Memory Recall v4): the Will marks the
    // succession moment, and the index is what makes the Will executable.
    // A successor boots from chain head → latest index → everything.
    if (isWill && !args['no-index']) {
        console.log('');
        console.log('📜 Will submitted — publishing vault index (succession checkpoint)...');
        try {
            const { indexCommand } = await import('./index-cmd.js');
            await indexCommand({ _: ['publish'], publish: true, keypair: args.keypair, 'api-url': args['api-url'] });
        } catch (idxErr) {
            console.log(`   ⚠  Index publish failed (${idxErr.message}) — the Will is safe.`);
            console.log('      Retry manually: crabspace index publish --publish');
        }
    }

    console.log('');
    console.log('✅ Work entry submitted!');
    console.log('');
    console.log(`   Hash:     ${contentHash.slice(0, 16)}...`);
    if (txSig) {
        console.log(`   TX:       ${txSig}`);
        const envSuffix = rpcUrl.includes('devnet') ? '?cluster=devnet' : '';
        console.log(`   Explorer: https://explorer.solana.com/tx/${txSig}${envSuffix}`);
    } else {
        console.log('   Chain:    stored in database (on-chain anchoring pending)');
    }
    console.log(`   Journal:  ~/.crabspace/journal.md`);
    if (tags.length > 0) {
        console.log(`   Tags:     ${tags.join(', ')}`);
    }
    if (summary) {
        console.log(`   Summary:  ${summary}`);
    }
    if (sourceAuthor) {
        console.log(`   Source:   ${sourceAuthor}`);
    }
    console.log('');
}

