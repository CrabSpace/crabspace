/**
 * CrabSpace CLI — Encryption
 * AES-GCM encryption using BIOS Seed (same as frontend crypto.ts).
 * Uses Node.js Web Crypto API (requires Node 20+).
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_DERIVATION_ALGORITHM = 'PBKDF2';
const HASH_ALGORITHM = 'SHA-256';
const ITERATIONS = 100000;

/**
 * Derive a cryptographic key from a BIOS Seed.
 */
async function deriveKey(seed, salt) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(seed);

    const baseKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: KEY_DERIVATION_ALGORITHM },
        false,
        ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
        {
            name: KEY_DERIVATION_ALGORITHM,
            salt: salt.buffer,
            iterations: ITERATIONS,
            hash: HASH_ALGORITHM,
        },
        baseKey,
        { name: ENCRYPTION_ALGORITHM, length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt cleartext using a BIOS Seed.
 * Returns base64 string: salt(16b) + iv(12b) + ciphertext
 * Compatible with frontend decryptData().
 */
export async function encryptData(cleartext, seed) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveKey(seed, salt);

    const ciphertext = await crypto.subtle.encrypt(
        { name: ENCRYPTION_ALGORITHM, iv },
        key,
        encoder.encode(cleartext)
    );

    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
}
