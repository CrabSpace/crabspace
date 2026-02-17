import fs from 'fs'
import path from 'path'

export interface BiosSeed {
    version: string
    isnad_ptr: string
    thread_id: string
    legacy_pda: string
    verify_key: string
}

const SEED_FILENAME = 'IDENTITY_SEED.json'

/**
 * Sync function to check if a BIOS seed exists in the current environment
 * Useful for fast boot checks
 */
export function hasBiosSeed(directory: string = process.cwd()): boolean {
    return fs.existsSync(path.join(directory, SEED_FILENAME))
}

/**
 * Reads and parses the BIOS seed
 */
export async function readBiosSeed(directory: string = process.cwd()): Promise<BiosSeed | null> {
    const filePath = path.join(directory, SEED_FILENAME)
    try {
        if (!fs.existsSync(filePath)) return null
        const content = fs.readFileSync(filePath, 'utf8')
        return JSON.parse(content) as BiosSeed
    } catch (error) {
        console.error('Failed to read BIOS Seed:', error)
        return null
    }
}

/**
 * Writes a new BIOS seed to the local environment
 */
export async function writeBiosSeed(seed: BiosSeed, directory: string = process.cwd()): Promise<boolean> {
    const filePath = path.join(directory, SEED_FILENAME)
    try {
        fs.writeFileSync(filePath, JSON.stringify(seed, null, 2), 'utf8')
        return true
    } catch (error) {
        console.error('Failed to write BIOS Seed:', error)
        return false
    }
}

/**
 * Generates a mock seed for local development/onboarding
 */
export function generateMockSeed(wallet: string): BiosSeed {
    return {
        version: "1.0",
        isnad_ptr: "0x" + Math.random().toString(16).slice(2, 66),
        thread_id: `thread_${wallet.slice(0, 8)}`,
        legacy_pda: `pda_${wallet.slice(0, 8)}_001`,
        verify_key: Math.random().toString(36).slice(2, 10)
    }
}
