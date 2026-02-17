import { PublicKey } from '@solana/web3.js'
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CrabspaceId, IDL } from './solana/idls/crabspace_id'

/**
 * CrabSpace Canonical Seeds for PDA Derivation
 */
export const CRAB_SEEDS = {
    PURSE: "purse",
    IDENTITY: "isnad",
    ESCROW: "escrow"
}

export const CRABSPACE_ID_PROGRAM_ID = new PublicKey(IDL.address)

/**
 * Derives the Sovereign Purse (PDA) address for an agent.
 * This is where the agent's wealth and reputation tokens are held.
 */
export function deriveAgentPurseAddress(
    agentWallet: string,
    threadId: string,
    programId: string = "Crab111111111111111111111111111111111111111"
): [PublicKey, number] {
    const walletPubkey = new PublicKey(agentWallet)

    return PublicKey.findProgramAddressSync(
        [
            Buffer.from(CRAB_SEEDS.PURSE),
            walletPubkey.toBuffer(),
            Buffer.from(threadId)
        ],
        new PublicKey(programId)
    )
}

/**
 * Derives the Identity Account PDA.
 * Holds the isnad_hash and successional state.
 */
export function deriveIdentityAddress(
    creatorWallet: string
): [PublicKey, number] {
    const walletPubkey = new PublicKey(creatorWallet)

    return PublicKey.findProgramAddressSync(
        [
            Buffer.from(CRAB_SEEDS.IDENTITY),
            walletPubkey.toBuffer()
        ],
        CRABSPACE_ID_PROGRAM_ID
    )
}

/**
 * Anchors a work journal entry on-chain.
 * Updates the 'latest_hash' in the agent's IsnadIdentity PDA.
 */
export async function anchorWorkEntry(
    provider: anchor.AnchorProvider,
    workHash: string,
): Promise<string> {
    const program = new Program<CrabspaceId>(IDL, provider);
    const [identityPda] = deriveIdentityAddress(provider.publicKey.toBase58());

    // Convert hex workHash (0x...) to 32-byte array
    const hashHex = workHash.replace('0x', '');
    const hashBuffer = Buffer.from(hashHex, 'hex');

    // Fill to 32 bytes if shorter (though it shouldn't be for SHA-256)
    const finalizedHash = new Uint8Array(32);
    finalizedHash.set(new Uint8Array(hashBuffer));

    try {
        const tx = await (program.methods as any)
            .log_work([...finalizedHash])
            .accounts({
                identity: identityPda,
                owner: provider.publicKey,
            })
            .rpc();

        return tx;
    } catch (error) {
        console.error("Failed to anchor work:", error);
        throw error;
    }
}
