/**
 * CrabSpace Sovereign Encryption Utility
 * Powered by Web Crypto API (AES-GCM)
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_DERIVATION_ALGORITHM = 'PBKDF2';
const HASH_ALGORITHM = 'SHA-256';
const ITERATIONS = 100000;

/**
 * Derives a cryptographic key from a BIOS Seed or secret string.
 */
async function deriveKey(seed: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(seed)
    const keyBuffer = new ArrayBuffer(keyData.byteLength)
    new Uint8Array(keyBuffer).set(keyData)
    const baseKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: KEY_DERIVATION_ALGORITHM },
        false,
        ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
        {
            name: KEY_DERIVATION_ALGORITHM,
            salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
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
 * Encrypts cleartext using a seed. 
 * Returns a base64 string containing: salt(16b) + iv(12b) + ciphertext
 */
export async function encryptData(cleartext: string, seed: string): Promise<string> {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const key = await deriveKey(seed, salt);

    const ciphertext = await crypto.subtle.encrypt(
        { name: ENCRYPTION_ALGORITHM, iv },
        key,
        encoder.encode(cleartext).buffer.slice(0) as ArrayBuffer
    );

    // Combine salt, iv, and ciphertext into a single buffer
    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

    // Return as base64 string
    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts ciphertext using a seed.
 */
export async function decryptData(encryptedBase64: string, seed: string): Promise<string> {
    const combined = new Uint8Array(
        atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
    );

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const key = await deriveKey(seed, salt);

    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: ENCRYPTION_ALGORITHM, iv },
            key,
            ciphertext.buffer.slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength) as ArrayBuffer
        );

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        throw new Error('Decryption failed. Invalid seed or corrupted data.');
    }
}

/**
 * Checks if a string looks like it might be encrypted (base64 and long enough).
 * Useful for the UI to decide whether to show a decryption prompt.
 */
export function isEncrypted(data: string): boolean {
    if (!data || data.length < 40) return false;
    // Simple base64 regex check
    const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    return base64Regex.test(data);
}
