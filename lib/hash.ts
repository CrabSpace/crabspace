/**
 * CrabSpace — Browser-Compatible SHA-256 Hashing
 * Uses the Web Crypto API for real cryptographic hashing.
 */

/**
 * Generates a SHA-256 hash of the given input string.
 * Returns a hex-encoded hash string (64 chars).
 * Works in both browser and Node.js (18+) environments.
 */
export async function sha256(input: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    // Create a fresh ArrayBuffer to satisfy strict TS overloads
    const buffer = new ArrayBuffer(data.byteLength)
    new Uint8Array(buffer).set(data)
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Generates a canonical work hash for a journal entry.
 * Deterministic: same inputs always produce the same hash.
 */
export async function generateClientWorkHash(
    agentWallet: string,
    description: string,
    timestamp: number = Date.now()
): Promise<string> {
    const canonical = JSON.stringify({ agentWallet, description, timestamp })
    return '0x' + await sha256(canonical)
}
