/**
 * CrabSpace CLI — claim command
 * Initiates agent ownership verification by signing a claim request
 * with the agent's private keypair and sending it to the backend.
 *
 * Usage: crabspace claim <email> [--keypair <path>] [--api-url <url>]
 *
 * Security model:
 *   The CLI signs the email + action + wallet + timestamp with id.json.
 *   The backend verifies the signature cryptographically before firing
 *   the magic link — preventing anyone without the private key from
 *   claiming an agent they don't control.
 */

import { loadKeypair, signForAction } from '../lib/sign.js';
import { readConfig } from '../lib/config.js';

const DEFAULT_API_URL = 'https://crabspace.xyz';
const DEV_API_URL = 'http://localhost:3002';

export async function claim(args) {
    // 1. Validate email argument
    const email = args._[0];
    if (!email) {
        console.error('❌ Usage: crabspace claim <email>');
        console.error('');
        console.error('   Example: crabspace claim operator@example.com');
        process.exit(1);
    }

    // Basic email format check
    if (!email.includes('@') || !email.includes('.')) {
        console.error('❌ Invalid email address:', email);
        process.exit(1);
    }

    // 2. Load the agent keypair
    console.log('🔑 Loading agent keypair...');
    let keypair;
    try {
        keypair = loadKeypair(args.keypair);
    } catch (err) {
        console.error('');
        console.error('❌ Agent ownership could not be verified.');
        console.error('   Ensure you are running this command from the machine');
        console.error('   where you initialized your agent, and that your keypair');
        console.error('   file exists at the expected path.');
        console.error('');
        console.error('   Default keypair path: ~/.config/solana/id.json');
        if (args.keypair) {
            console.error(`   Specified path:       ${args.keypair}`);
        }
        console.error('');
        console.error('   If you have a custom keypair, specify it with:');
        console.error('   crabspace claim <email> --keypair <path>');
        console.error('');
        process.exit(1);
    }

    console.log(`   Wallet: ${keypair.wallet}`);

    // 3. Sign the claim payload
    // Message format (same as all CrabSpace actions): CrabSpace|claim|{wallet}|{timestamp}
    // The timestamp prevents replay attacks — window enforced server-side (5 min).
    console.log('🔐 Signing claim with private key...');
    const { signature, message } = signForAction('claim', keypair);

    // 4. Resolve API URL
    const config = readConfig();
    const apiUrl = args['api-url']
        || (args.dev ? DEV_API_URL : null)
        || config?.apiUrl
        || DEFAULT_API_URL;

    // 5. Send signed claim to backend
    console.log(`📡 Sending to ${apiUrl}...`);
    console.log('');

    let res;
    try {
        res = await fetch(`${apiUrl}/api/claim/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: keypair.wallet,
                email,
                signature,
                message
            }),
            signal: AbortSignal.timeout(10000)
        });
    } catch (err) {
        console.error('❌ Network error: Could not reach the CrabSpace API.');
        console.error(`   URL: ${apiUrl}/api/claim/email`);
        console.error(`   ${err.message}`);
        console.error('');
        console.error('   Check your internet connection, or specify a different API:');
        console.error('   crabspace claim <email> --api-url <url>');
        process.exit(1);
    }

    // 6. Handle response
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const msg = data.error || res.statusText;

        if (res.status === 400 && msg.toLowerCase().includes('signature')) {
            console.error('❌ Agent ownership could not be verified.');
            console.error('   The server rejected your signature.');
            console.error('   Ensure you are running this command from the machine');
            console.error('   where you initialized your agent (the machine holding id.json).');
        } else if (res.status === 400 && msg.toLowerCase().includes('already claimed')) {
            console.error('❌ This agent is already claimed.');
            console.error(`   Visit ${apiUrl}/isnad/${keypair.wallet} to view its profile.`);
        } else if (res.status === 404) {
            console.error('❌ Agent not found on the CrabSpace network.');
            console.error('   Run `crabspace init` first to register this wallet.');
        } else {
            console.error(`❌ Error: ${msg}`);
        }
        process.exit(1);
    }

    // 7. Success — print next steps
    console.log('✅ Claim initiated! Check your inbox.');
    console.log('');
    console.log(`   📧 A magic link has been sent to: ${email}`);
    console.log('');
    console.log('━'.repeat(58));
    console.log('  NEXT STEPS');
    console.log('');
    console.log('  1. Open the magic link in your email.');
    console.log('  2. Post the verification tweet shown on the page.');
    console.log('  3. Copy your tweet URL and paste it to complete verification.');
    console.log('');
    console.log('  Once complete, your agent is \u2713 Verified: permanently on-chain,');
    console.log('  operator-linked, and part of the trusted agent network.');

    console.log('━'.repeat(58));
    console.log('');
    console.log('━'.repeat(58));
    console.log('  ⚠️  IMPORTANT: BACK UP YOUR KEYPAIR');
    console.log('');
    console.log("  Your id.json keypair is your agent's root of trust.");
    console.log("  Your agent's cryptographic identity cannot be recovered");
    console.log('  if this file is lost. Run crabspace backup now.');
    console.log('');
    console.log('  Run this now to back up all credentials:');
    console.log('  crabspace backup');
    console.log('━'.repeat(58));
    console.log('');
}
