import nacl from 'tweetnacl'
import bs58 from 'bs58'

/**
 * 🦀 CrabSpace Wallet Signature Verification
 *
 * Verifies that a message was signed by the private key corresponding
 * to the claimed Solana wallet address (ed25519 detached signature).
 *
 * Message format: "CrabSpace|{action}|{wallet}|{timestamp}"
 * Timestamp must be within FRESHNESS_WINDOW_MS to prevent replay attacks.
 */

const FRESHNESS_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

export interface SignaturePayload {
    signature: string   // base58-encoded ed25519 signature
    message: string     // the original message string that was signed
}

/**
 * Verify that a wallet signed a message and that the message is fresh.
 * Returns { valid: true } or { valid: false, reason: string }
 */
export function verifyWalletSignature(
    wallet: string,
    signature: string,
    message: string
): { valid: true } | { valid: false; reason: string } {
    // 1. Validate message format
    const parts = message.split('|')
    if (parts.length !== 4 || parts[0] !== 'CrabSpace') {
        return { valid: false, reason: 'Invalid message format. Expected: CrabSpace|action|wallet|timestamp' }
    }

    const [, , messageWallet, timestampStr] = parts

    // 2. Wallet in message must match claimed wallet
    if (messageWallet !== wallet) {
        return { valid: false, reason: 'Wallet mismatch: message wallet does not match claimed wallet' }
    }

    // 3. Timestamp freshness (replay protection)
    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp)) {
        return { valid: false, reason: 'Invalid timestamp in message' }
    }
    const age = Date.now() - timestamp
    if (age > FRESHNESS_WINDOW_MS || age < -FRESHNESS_WINDOW_MS) {
        return { valid: false, reason: `Message expired. Age: ${Math.round(age / 1000)}s (max: ${FRESHNESS_WINDOW_MS / 1000}s)` }
    }

    // 4. Verify ed25519 signature
    try {
        const messageBytes = new TextEncoder().encode(message)
        const signatureBytes = bs58.decode(signature)
        const publicKeyBytes = bs58.decode(wallet)

        const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)

        if (!isValid) {
            return { valid: false, reason: 'Signature verification failed: invalid signature' }
        }

        return { valid: true }
    } catch (err) {
        return { valid: false, reason: `Signature verification error: ${(err as Error).message}` }
    }
}

/**
 * Helper: Build a signable message string.
 * Call this on the client to create the message before signing.
 */
export function buildSignableMessage(action: string, wallet: string): string {
    return `CrabSpace|${action}|${wallet}|${Date.now()}`
}

/**
 * Server-side guard: checks dev mode bypass, then verifies signature.
 * Returns null if valid (proceed), or an error string if invalid.
 */
export function requireSignature(
    wallet: string,
    signature: string | undefined,
    message: string | undefined,
    expectedAction: string
): string | null {
    // Dev mode bypass
    if (process.env.NEXT_PUBLIC_DEV_MODE === 'true') {
        return null
    }

    if (!signature || !message) {
        return 'Signature and message required for wallet authentication'
    }

    // Validate action matches
    const parts = message.split('|')
    if (parts[1] !== expectedAction) {
        return `Invalid action: expected "${expectedAction}", got "${parts[1]}"`
    }

    const result = verifyWalletSignature(wallet, signature, message)
    if (!result.valid) {
        return result.reason
    }

    return null // Valid — proceed
}
