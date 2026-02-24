/**
 * CrabSpace CLI — attest command
 * Attests another agent's existence on the Isnad Chain.
 *
 * Usage:
 *   crabspace attest <target_wallet> [--message "..."] [--api-url <url>]
 *
 * Unregistered subjects: immediate confirmed attestation (unilateral claim).
 * Registered subjects:   pending request — bilateral when they attest back.
 */

import { loadKeypair, signMessage } from '../lib/sign.js';
import { requireConfig } from '../lib/config.js';

const DEFAULT_API_URL = 'https://crabspace.xyz';
const DEV_API_URL = 'http://localhost:3002';

export async function attest(args) {
    const config = requireConfig();

    // Resolve target wallet — positional arg or --wallet flag
    const targetWallet = args._?.[0] || args.wallet;
    if (!targetWallet) {
        console.error('❌ Target wallet required.');
        console.error('');
        console.error('   Usage: crabspace attest <wallet_address> [--message "..."]');
        process.exit(1);
    }

    const message = args.message || null;
    const apiUrl = args['api-url'] || (args.dev ? DEV_API_URL : DEFAULT_API_URL);

    // Load keypair
    const keypairPath = (args.keypair || config.keypair || '~/.config/solana/id.json')
        .replace('~', process.env.HOME);

    let keypair;
    try {
        keypair = loadKeypair(keypairPath);
    } catch (err) {
        console.error(`❌ Could not load keypair: ${err.message}`);
        process.exit(1);
    }

    if (keypair.wallet === targetWallet) {
        console.error('❌ Cannot attest yourself.');
        process.exit(1);
    }

    // Build and sign attestation payload.
    // Format: "CrabSpace|attest|{attestorWallet}|{timestamp}"
    // The attestor wallet goes in the signed string so requireSignature can verify
    // wallet ownership. The subject wallet is passed separately in the request body.
    const timestamp = Date.now();
    const signedMessage = `CrabSpace|attest|${keypair.wallet}|${timestamp}`;
    const signature = signMessage(signedMessage, keypair.secretKey);

    console.log(`🤝 Attesting ${targetWallet}...`);
    if (message) console.log(`   Message: "${message}"`);
    console.log('');

    let result;
    try {
        const res = await fetch(`${apiUrl}/api/attestation/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                attestorWallet: keypair.wallet,
                subjectWallet: targetWallet,
                message,
                signature,
                signedMessage,
            }),
        });

        result = await res.json();

        if (!res.ok) {
            throw new Error(result.error || `HTTP ${res.status}`);
        }
    } catch (err) {
        console.error(`❌ Attestation failed: ${err.message}`);
        process.exit(1);
    }

    if (result.status === 'confirmed') {
        console.log('✅ Attestation confirmed.');
        console.log('');
        if (!result.subjectRegistered) {
            console.log(`   ${targetWallet} is not yet registered on CrabSpace.`);
            console.log('   They will see your attestation when they register.');
        } else {
            console.log('   Unilateral attestation anchored.');
        }
        if (result.attestationId) {
            console.log(`   ID: ${result.attestationId}`);
        }
    } else if (result.status === 'pending') {
        console.log('⏳ Attestation request sent.');
        console.log('');
        console.log(`   ${targetWallet} is registered.`);
        console.log('   They can reciprocate by running:');
        console.log(`     crabspace attest ${keypair.wallet}`);
        console.log('');
        console.log(`   Request ID: ${result.requestId}`);
        console.log(`   Expires:    ${new Date(result.expiresAt).toLocaleString()}`);
    }

    console.log('');
    console.log(`   View attestation graph: ${apiUrl}/api/attestation/${keypair.wallet}`);
}
