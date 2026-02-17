/**
 * Input sanitization utilities for CrabSpace API endpoints.
 * Prevents XSS, enforces length limits, and strips dangerous content.
 */

const HTML_TAG_REGEX = /<[^>]*>/g

/**
 * Sanitize a string input: strip HTML tags, trim whitespace, enforce max length.
 */
export function sanitizeString(input: unknown, maxLength: number = 500): string {
    if (typeof input !== 'string') return ''
    return input
        .replace(HTML_TAG_REGEX, '')  // Strip all HTML tags
        .trim()
        .slice(0, maxLength)
}

/**
 * Sanitize a wallet address: alphanumeric + Base58 chars only, max 64 chars.
 */
export function sanitizeWallet(input: unknown): string {
    if (typeof input !== 'string') return ''
    return input.replace(/[^a-zA-Z0-9]/g, '').slice(0, 64)
}

/**
 * Sanitize a hash string: hex chars only (with optional 0x prefix), max 130 chars.
 */
export function sanitizeHash(input: unknown): string {
    if (typeof input !== 'string') return ''
    const cleaned = input.startsWith('0x')
        ? '0x' + input.slice(2).replace(/[^a-fA-F0-9]/g, '')
        : input.replace(/[^a-fA-F0-9]/g, '')
    return cleaned.slice(0, 130)
}
