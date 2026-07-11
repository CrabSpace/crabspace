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

    // Convert Uint8Array to base64 without spread operator.
    // String.fromCharCode(...combined) causes stack overflow on large inputs
    // because it puts one argument per byte on the call stack (~160K args for 160KB).
    // Process in 8KB chunks instead.
    let binaryStr = '';
    const CHUNK = 8192;
    for (let i = 0; i < combined.length; i += CHUNK) {
        const slice = combined.subarray(i, Math.min(i + CHUNK, combined.length));
        binaryStr += String.fromCharCode.apply(null, slice);
    }
    return btoa(binaryStr);
}

/**
 * Decrypt a BIOS-Seed-encrypted payload.
 * Throws a clear, actionable error if the seed is wrong — never fails silently.
 *
 * @param {string} encryptedBase64 - base64 string from encryptData()
 * @param {string} seed            - BIOS Seed from ~/.crabspace/config.json
 * @returns {string} Decrypted plaintext
 */
export async function decryptData(encryptedBase64, seed) {
    if (!seed) {
        throw new Error(
            'BIOS Seed missing. Run `crabspace verify` to retrieve your seed, ' +
            'or check ~/.crabspace/config.json for the biosSeed field.'
        );
    }

    let combined;
    try {
        combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    } catch {
        throw new Error('Encrypted data is corrupted or not a valid base64 string.');
    }

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const key = await deriveKey(seed, salt);

    let plaintext;
    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: ENCRYPTION_ALGORITHM, iv },
            key,
            ciphertext
        );
        plaintext = new TextDecoder().decode(decrypted);
    } catch (err) {
        if (err.name === 'OperationError') {
            throw new Error(
                'Wrong BIOS Seed — decryption failed. Your entries are still safe.\n' +
                '  → Run `crabspace verify` to retrieve your correct BIOS Seed.\n' +
                '  → Check the biosSeed field in ~/.crabspace/config.json.'
            );
        }
        throw new Error(`Decryption failed: ${err.message}`);
    }

    return plaintext;
}

/**
 * Decrypt with seed history: try the current BIOS seed, then any legacy
 * seeds recorded in config.legacySeeds (seeds rotate; memories written
 * under an old seed must stay readable forever).
 *
 * @param {string} encryptedBase64
 * @param {object} config - CLI config ({ biosSeed, legacySeeds? })
 * @returns {Promise<string>} plaintext
 */
export async function decryptWithHistory(encryptedBase64, config) {
    const seeds = [config.biosSeed, ...(config.legacySeeds || [])].filter(Boolean);
    let lastErr = null;
    for (const seed of seeds) {
        try {
            return await decryptData(encryptedBase64, seed);
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('No BIOS seed available for decryption.');
}
