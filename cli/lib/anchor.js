/**
 * CrabSpace CLI — on-chain anchoring via Solana
 * Calls the crabspace-id program's log_work instruction directly
 * using @solana/web3.js (no Anchor framework required).
 */

import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionMessage,
    VersionedTransaction,
    TransactionInstruction,
} from '@solana/web3.js';

// CrabSpace program ID (devnet)
const PROGRAM_ID = new PublicKey('5Zw1g6oMwzcWMU1qhfSXQdMtxbxbJ6CawMm5RDuQ7Z8P');

// Anchor discriminator for log_work (first 8 bytes of sha256("global:log_work"))
// Precomputed to avoid pulling in @coral-xyz/anchor
const LOG_WORK_DISCRIMINATOR = Buffer.from([
    0xaa, 0x88, 0x30, 0x67, 0xdc, 0x86, 0xee, 0x73
]);

// Anchor discriminator for initialize (first 8 bytes of sha256("global:initialize"))
const INITIALIZE_DISCRIMINATOR = Buffer.from([
    0xaf, 0xaf, 0x6d, 0x1f, 0x0d, 0x98, 0x9b, 0xed
]);

/**
 * Derive the IsnadIdentity PDA for a given creator wallet.
 * Seeds: ["isnad", creator_pubkey]
 */
function deriveIdentityPda(creatorPubkey) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('isnad'), creatorPubkey.toBuffer()],
        PROGRAM_ID
    );
}

/**
 * Anchor a work hash on-chain by calling the log_work instruction.
 *
 * @param {Keypair} keypair - The agent's Solana keypair (owner/signer)
 * @param {string} workHash - Hex string of the SHA-256 work hash
 * @param {string} rpcUrl - Solana RPC endpoint
 * @returns {string} Transaction signature
 */
export async function anchorOnChain(keypair, workHash, rpcUrl = 'https://api.devnet.solana.com') {
    const connection = new Connection(rpcUrl, 'confirmed');
    const ownerPubkey = keypair.publicKey;

    // Derive the identity PDA
    // Note: PDA is seeded with the creator (original owner), which for self-registered
    // agents is the same as the current owner.
    const [identityPda] = deriveIdentityPda(ownerPubkey);

    // Convert hex hash to 32-byte array
    const hashHex = workHash.replace('0x', '');
    const hashBytes = Buffer.from(hashHex, 'hex');
    const finalHash = new Uint8Array(32);
    finalHash.set(new Uint8Array(hashBytes));

    // Build instruction data: [8-byte discriminator][32-byte hash]
    const data = Buffer.concat([LOG_WORK_DISCRIMINATOR, Buffer.from(finalHash)]);

    // Build the instruction
    const ix = new TransactionInstruction({
        keys: [
            { pubkey: identityPda, isSigner: false, isWritable: true },  // identity account
            { pubkey: ownerPubkey, isSigner: true, isWritable: false },  // owner (signer)
        ],
        programId: PROGRAM_ID,
        data,
    });

    // Build and send transaction
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const messageV0 = new TransactionMessage({
        payerKey: ownerPubkey,
        recentBlockhash: blockhash,
        instructions: [ix],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([keypair]);

    const signature = await connection.sendTransaction(tx, { skipPreflight: false });

    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');

    return signature;
}

/**
 * Initialize an agent identity on-chain by calling the initialize instruction.
 *
 * @param {Keypair} keypair - The agent's Solana keypair (creator/payer)
 * @param {string} headHash - Hex string of the initial work hash
 * @param {string} rpcUrl - Solana RPC endpoint
 * @returns {string} Transaction signature
 */
export async function initializeOnChain(keypair, headHash, rpcUrl = 'https://api.mainnet-beta.solana.com') {
    const connection = new Connection(rpcUrl, 'confirmed');
    const creatorPubkey = keypair.publicKey;

    const [identityPda] = deriveIdentityPda(creatorPubkey);

    const hashHex = (headHash || '0'.repeat(64)).replace('0x', '');
    const hashBytes = Buffer.from(hashHex, 'hex');
    const finalHash = new Uint8Array(32);
    finalHash.set(new Uint8Array(hashBytes));

    const data = Buffer.concat([INITIALIZE_DISCRIMINATOR, Buffer.from(finalHash)]);

    const ix = new TransactionInstruction({
        keys: [
            { pubkey: identityPda, isSigner: false, isWritable: true },  // identity account
            { pubkey: creatorPubkey, isSigner: true, isWritable: true }, // creator (signer, payer)
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
        ],
        programId: PROGRAM_ID,
        data,
    });

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const messageV0 = new TransactionMessage({
        payerKey: creatorPubkey,
        recentBlockhash: blockhash,
        instructions: [ix],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    tx.sign([keypair]);

    try {
        const signature = await connection.sendTransaction(tx, { skipPreflight: false });
        await connection.confirmTransaction(signature, 'confirmed');
        return signature;
    } catch (e) {
        if (e.message && e.message.includes('already in use')) {
            return 'already-initialized';
        }
        throw e;
    }
}

/**
 * Pay the CrabSpace work entry fee by transferring lamports to the treasury.
 * Called automatically by submit.js when the API returns HTTP 402.
 *
 * @param {Keypair} keypair       - Agent's Solana keypair (payer)
 * @param {string} treasuryAddress - Treasury wallet address from 402 response
 * @param {number} lamports       - Amount to send (from 402 response cost_lamports)
 * @param {string} rpcUrl         - Solana RPC endpoint
 * @returns {string} Transaction signature
 */
export async function payFee(keypair, treasuryAddress, lamports, rpcUrl = 'https://api.devnet.solana.com') {
    const connection = new Connection(rpcUrl, 'confirmed');
    const treasury = new PublicKey(treasuryAddress);

    const tx = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: treasury,
            lamports,
        })
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = keypair.publicKey;
    tx.sign(keypair);

    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    return signature;
}
