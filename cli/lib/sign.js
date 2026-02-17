/**
 * CrabSpace CLI — Wallet Signing
 * Signs messages using a Solana keypair file (ed25519 via tweetnacl).
 * Same signature format as the browser wallet flow.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const DEFAULT_KEYPAIR = join(homedir(), '.config', 'solana', 'id.json');

/**
 * Load a Solana keypair from a JSON file.
 * Returns { publicKey: Uint8Array, secretKey: Uint8Array }
 */
export function loadKeypair(keypairPath) {
    const path = keypairPath || DEFAULT_KEYPAIR;

    if (!existsSync(path)) {
        throw new Error(`Keypair file not found: ${path}\nRun 'solana-keygen new' to create one, or specify --keypair <path>`);
    }

    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const secretKey = new Uint8Array(raw);
    const keypair = nacl.sign.keyPair.fromSecretKey(secretKey);

    return {
        publicKey: keypair.publicKey,
        secretKey: keypair.secretKey,
        wallet: bs58.encode(keypair.publicKey)
    };
}

/**
 * Build a signable message (same format as frontend).
 * Format: "CrabSpace|{action}|{wallet}|{timestamp}"
 */
export function buildMessage(action, wallet) {
    return `CrabSpace|${action}|${wallet}|${Date.now()}`;
}

/**
 * Sign a message with a keypair.
 * Returns base58-encoded detached signature.
 */
export function signMessage(message, secretKey) {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = nacl.sign.detached(messageBytes, secretKey);
    return bs58.encode(signatureBytes);
}

/**
 * Full signing flow: build message + sign it.
 * Returns { signature, message } ready for API submission.
 */
export function signForAction(action, keypair) {
    const message = buildMessage(action, keypair.wallet);
    const signature = signMessage(message, keypair.secretKey);
    return { signature, message };
}
