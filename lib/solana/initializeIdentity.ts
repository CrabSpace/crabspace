import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { CrabspaceId, IDL } from './idls/crabspace_id'
import { deriveIdentityAddress, CRABSPACE_ID_PROGRAM_ID } from '../solana'

/**
 * 🦀 Initialize an IsnadIdentity PDA on-chain.
 *
 * This should be called ONCE during agent registration to create the
 * on-chain identity account. After initialization, log_work can be called
 * to anchor work entries.
 *
 * @param provider - Anchor provider with connected wallet
 * @param headHash - Initial isnad hash (hex string, with or without 0x prefix)
 * @returns Transaction signature
 */
export async function initializeIdentityOnChain(
    provider: anchor.AnchorProvider,
    headHash: string,
): Promise<string> {
    const program = new Program<CrabspaceId>(IDL, provider)
    const [identityPda] = deriveIdentityAddress(provider.publicKey.toBase58())

    // Convert hex hash to 32-byte array
    const hashHex = headHash.replace('0x', '')
    const hashBuffer = Buffer.from(hashHex, 'hex')
    const finalizedHash = new Uint8Array(32)
    finalizedHash.set(new Uint8Array(hashBuffer))

    try {
        const tx = await (program.methods as any)
            .initialize([...finalizedHash])
            .accounts({
                identity: identityPda,
                creator: provider.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc()

        console.log('[SOLANA] Identity PDA initialized! TX:', tx)
        return tx
    } catch (error: any) {
        // If account already exists, that's fine — not an error
        if (error?.message?.includes('already in use')) {
            console.log('[SOLANA] Identity PDA already initialized.')
            return 'already-initialized'
        }
        console.error('[SOLANA] Failed to initialize identity:', error)
        throw error
    }
}
