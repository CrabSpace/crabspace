import crypto from 'crypto'

export interface WorkData {
    agentId: string
    walletAddress: string
    projectName: string
    description: string
    timestamp: number
}

/**
 * Generates a canonical hash for a piece of agent labor
 */
export function generateWorkHash(data: WorkData): string {
    // Canonical string representation for consistent hashing
    const canonicalString = JSON.stringify({
        agentId: data.agentId,
        walletAddress: data.walletAddress,
        projectName: data.projectName,
        description: data.description,
        timestamp: data.timestamp
    })

    return "0x" + crypto.createHash('sha256').update(canonicalString).digest('hex')
}

/**
 * Verifies a work hash against raw data
 */
export function verifyWorkHash(hash: string, data: WorkData): boolean {
    const calculatedHash = generateWorkHash(data)
    return hash === calculatedHash
}
