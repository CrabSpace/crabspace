/**
 * CrabSpace CLI — Arweave Upload Library
 * Permanent encrypted content storage via Irys (SOL-funded Arweave uploads).
 *
 * Abstraction layer: only uploadToArweave() and fetchFromArweave() are public.
 * If we swap from Irys to direct Arweave later, only this file changes.
 *
 * Test mode: returns deterministic fake arweave_tx_id, no real uploads.
 */

import { readFileSync } from 'fs';
import { getEnvMode } from './config.js';

// Irys gateway for fetching content
const IRYS_GATEWAY = 'https://gateway.irys.xyz';
const ARWEAVE_GATEWAY = 'https://arweave.net';

/**
 * Initialize an Irys uploader using the agent's Solana keypair.
 * Lazy-loaded to avoid import overhead when not uploading.
 *
 * @param {string} keypairPath - Path to Solana keypair JSON
 * @returns {Promise<object>} Irys uploader instance
 */
async function getIrysUploader(keypairPath) {
    const { Uploader } = await import('@irys/upload');
    const { Solana } = await import('@irys/upload-solana');

    const resolvedPath = keypairPath.replace('~', process.env.HOME);
    const keypairJson = JSON.parse(readFileSync(resolvedPath, 'utf-8'));

    const irysUploader = await Uploader(Solana)
        .withWallet(keypairJson)
        .withRpc('https://api.mainnet-beta.solana.com')
        // Mainnet Irys — agent wallets have mainnet SOL

    return irysUploader;
}

/**
 * Upload encrypted content to Arweave via Irys.
 *
 * @param {string} encryptedBase64 - The encrypted blob from encryptData()
 * @param {object} tags - Metadata tags for the Arweave transaction
 * @param {string} tags.agentWallet - Agent's Solana wallet address
 * @param {string} tags.seedEpoch - First 8 chars of SHA-256(biosSeed)
 * @param {string} tags.entryType - Entry type (episodic, decision, etc.)
 * @param {string} keypairPath - Path to Solana keypair JSON
 * @returns {Promise<{txId: string, size: number}>} Arweave transaction ID and size
 */
export async function uploadToArweave(encryptedBase64, tags, keypairPath) {
    // ─── TEST MODE: return deterministic fake ID ─────────────────────────
    if (getEnvMode() === 'test') {
        const hashBuffer = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(encryptedBase64)
        );
        const hash = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        const fakeTxId = `test_ar_${hash.slice(0, 32)}`;
        return { txId: fakeTxId, size: encryptedBase64.length };
    }

    // ─── PRODUCTION: upload via Irys ─────────────────────────────────────
    const irys = await getIrysUploader(keypairPath);

    // Build Arweave tags (public metadata — content is encrypted)
    const arweaveTags = [
        { name: 'Content-Type', value: 'application/x-crabspace-entry' },
        { name: 'CrabSpace-Version', value: '0.3.1' },
        { name: 'Entry-Type', value: tags.entryType || 'self' },
        { name: 'Agent-Wallet', value: tags.agentWallet },
        { name: 'Seed-Epoch', value: tags.seedEpoch },
        { name: 'Timestamp', value: new Date().toISOString() },
    ];

    // Check price first
    const dataSize = Buffer.byteLength(encryptedBase64, 'utf-8');
    const price = await irys.getPrice(dataSize);

    // Check balance
    const balance = await irys.getBalance();
    if (balance.lt(price)) {
        // Attempt to fund from wallet (auto-fund for small amounts)
        const fundAmount = price.multipliedBy(1.1).integerValue(); // 10% buffer
        try {
            await irys.fund(fundAmount);
        } catch (fundErr) {
            throw new Error(
                `Insufficient SOL for Arweave upload.\n` +
                `  Upload cost: ${irys.utils.fromAtomic(price)} SOL\n` +
                `  Balance:     ${irys.utils.fromAtomic(balance)} SOL\n` +
                `  Fund your wallet with ~0.005 SOL to continue.`
            );
        }
    }

    // Upload
    const receipt = await irys.upload(encryptedBase64, { tags: arweaveTags });

    return {
        txId: receipt.id,
        size: dataSize,
    };
}

/**
 * Fetch encrypted content from Arweave.
 * Tries Irys gateway first, falls back to arweave.net.
 *
 * @param {string} txId - Arweave transaction ID
 * @returns {Promise<string>} The encrypted base64 content
 */
export async function fetchFromArweave(txId) {
    // ─── TEST MODE: return empty for fake IDs ────────────────────────────
    if (getEnvMode() === 'test' && txId.startsWith('test_ar_')) {
        throw new Error(
            `Cannot fetch test Arweave ID: ${txId}. ` +
            `Test mode entries are not stored on Arweave.`
        );
    }

    // Try Irys gateway first (faster for recent uploads)
    const gateways = [IRYS_GATEWAY, ARWEAVE_GATEWAY];

    for (const gateway of gateways) {
        try {
            const res = await fetch(`${gateway}/${txId}`, {
                signal: AbortSignal.timeout(10000),
            });
            if (res.ok) {
                return await res.text();
            }
        } catch {
            // Try next gateway
        }
    }

    throw new Error(
        `Could not fetch Arweave content for txId: ${txId}\n` +
        `  Tried: ${gateways.join(', ')}\n` +
        `  The content may still be propagating (wait 1-2 minutes and retry).`
    );
}

/**
 * Get the cost of uploading data of a given size.
 * Useful for displaying cost estimates before upload.
 *
 * @param {number} sizeBytes - Size of data in bytes
 * @param {string} keypairPath - Path to Solana keypair JSON
 * @returns {Promise<{lamports: number, sol: string}>}
 */
export async function getUploadCost(sizeBytes, keypairPath) {
    if (getEnvMode() === 'test') {
        return { lamports: 0, sol: '0.000000' };
    }

    const irys = await getIrysUploader(keypairPath);
    const price = await irys.getPrice(sizeBytes);
    return {
        lamports: price.toNumber(),
        sol: irys.utils.fromAtomic(price).toString(),
    };
}
