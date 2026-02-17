import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { CrabspaceId, IDL } from "./idls/crabspace_id";

export const PROGRAM_ID = new PublicKey(IDL.address);

export class IdentityService {
    private program: Program<CrabspaceId>;
    private provider: AnchorProvider;

    constructor(connection: Connection, wallet: any) {
        this.provider = new AnchorProvider(connection, wallet, {
            preflightCommitment: "confirmed",
        });
        this.program = new Program(IDL, this.provider);
    }

    /**
     * Derives the Identity Account PDA.
     */
    public deriveIdentityAddress(creator: PublicKey): PublicKey {
        const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("isnad"), creator.toBuffer()],
            PROGRAM_ID
        );
        return pda;
    }

    /**
     * Initializes a new Isnad Identity on-chain.
     */
    public async initializeIdentity(headHash: string) {
        const creator = this.provider.publicKey;

        // Convert hex string to 32-byte array
        const hashBuffer = Buffer.from(headHash, 'hex');
        const hashArray = Array.from(new Uint8Array(hashBuffer));

        return await (this.program.methods as any)
            .initialize(hashArray)
            .accounts({
                // identity is a PDA in IDL, Anchor might resolve it, but we'll be explicit with casing
                identity: this.deriveIdentityAddress(creator),
                creator: creator,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();
    }

    /**
     * Proposes a successor for an existing identity.
     */
    public async proposeSuccessor(successor: PublicKey) {
        return await (this.program.methods as any)
            .propose_successor(successor)
            .accounts({
                identity: this.deriveIdentityAddress(this.provider.publicKey),
                owner: this.provider.publicKey,
            })
            .rpc();
    }

    /**
     * Claims an identity as the proposed successor.
     */
    public async claimIdentity(creator: PublicKey) {
        return await (this.program.methods as any)
            .claim_identity()
            .accounts({
                identity: this.deriveIdentityAddress(creator),
                claimant: this.provider.publicKey,
            })
            .rpc();
    }

    /**
     * Fetches the identity state from the blockchain.
     */
    public async getIdentity(creator: PublicKey) {
        const identityPda = this.deriveIdentityAddress(creator);
        return await (this.program.account as any).isnadIdentity.fetch(identityPda);
    }
}
