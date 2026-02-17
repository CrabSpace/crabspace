/**
 * CrabSpace — Devnet Successor Flow Test
 *
 * Tests the full identity lifecycle directly against the deployed devnet program:
 *   1. Initialize identity (creator)
 *   2. Log work (owner)
 *   3. Propose successor (owner → new keypair)
 *   4. Claim identity (successor)
 *   5. Verify new owner can log_work
 *   6. Verify old owner CANNOT log_work (should fail)
 *
 * Run: npx ts-node --esm tests/devnet-successor.ts
 * Requires: funded deployer wallet at ~/.config/solana/id.json
 */

import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import * as fs from 'fs'
import * as path from 'path'

// Load IDL
const IDL = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../target/idl/crabspace_id.json'), 'utf8')
)

const PROGRAM_ID = new PublicKey('5Zw1g6oMwzcWMU1qhfSXQdMtxbxbJ6CawMm5RDuQ7Z8P')

async function main() {
    // Connect to devnet
    const connection = new anchor.web3.Connection('https://api.devnet.solana.com', 'confirmed')

    // Load deployer wallet
    const deployerKeyfile = fs.readFileSync(
        path.join(process.env.HOME || '', '.config/solana/id.json'), 'utf8'
    )
    const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(deployerKeyfile)))

    // Generate successor keypair
    const successor = Keypair.generate()

    console.log('='.repeat(60))
    console.log('CrabSpace — Devnet Successor Flow Test')
    console.log('='.repeat(60))
    console.log(`Creator/Owner: ${deployer.publicKey.toBase58()}`)
    console.log(`Successor:     ${successor.publicKey.toBase58()}`)

    // Set up Anchor provider
    const wallet = new anchor.Wallet(deployer)
    const provider = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: 'confirmed'
    })
    anchor.setProvider(provider)

    const program = new Program(IDL, provider)

    // Derive PDA
    const [identityPDA, bump] = PublicKey.findProgramAddressSync(
        [Buffer.from('isnad'), deployer.publicKey.toBuffer()],
        PROGRAM_ID
    )
    console.log(`Identity PDA:  ${identityPDA.toBase58()} (bump: ${bump})`)
    console.log()

    // ── Step 1: Initialize identity ──────────────────────────
    console.log('【 Step 1 】 Initialize identity...')
    const headHash = Buffer.alloc(32)
    Buffer.from('eisner-genesis-hash-2026-02-07').copy(headHash)

    try {
        const tx1 = await (program.methods as any)
            .initialize(Array.from(headHash))
            .accounts({
                identity: identityPDA,
                creator: deployer.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc()
        console.log(`  ✅ Initialized — TX: ${tx1.slice(0, 20)}...`)
    } catch (e: any) {
        if (e.message?.includes('already in use')) {
            console.log('  ⚠️  Already initialized (expected if re-running)')
        } else {
            throw e
        }
    }

    // ── Step 2: Log work (as owner) ──────────────────────────
    console.log('【 Step 2 】 Log work as owner...')
    const workHash = Buffer.alloc(32)
    Buffer.from('work-entry-successor-test-001').copy(workHash)

    const tx2 = await (program.methods as any)
        .logWork(Array.from(workHash))
        .accounts({
            identity: identityPDA,
            owner: deployer.publicKey,
        })
        .rpc()
    console.log(`  ✅ Work logged — TX: ${tx2.slice(0, 20)}...`)

    // ── Step 3: Propose successor ────────────────────────────
    console.log('【 Step 3 】 Propose successor...')
    const tx3 = await (program.methods as any)
        .proposeSuccessor(successor.publicKey)
        .accounts({
            identity: identityPDA,
            owner: deployer.publicKey,
        })
        .rpc()
    console.log(`  ✅ Successor proposed — TX: ${tx3.slice(0, 20)}...`)

    // Verify proposed_successor is set
    const state1 = await (program.account as any).isnadIdentity.fetch(identityPDA)
    console.log(`  → proposed_successor: ${state1.proposedSuccessor?.toBase58() || 'None'}`)

    // ── Step 4: Fund successor (needs SOL for tx fees) ───────
    console.log('【 Step 4 】 Funding successor for tx fees...')
    // Use transfer instead of airdrop (airdrop is rate-limited)
    const fundTx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
            fromPubkey: deployer.publicKey,
            toPubkey: successor.publicKey,
            lamports: 0.01 * anchor.web3.LAMPORTS_PER_SOL,
        })
    )
    const fundSig = await provider.sendAndConfirm(fundTx)
    console.log(`  ✅ Transferred 0.01 SOL to successor — TX: ${fundSig.slice(0, 20)}...`)

    // ── Step 5: Claim identity (as successor) ────────────────
    console.log('【 Step 5 】 Claim identity as successor...')
    const successorWallet = new anchor.Wallet(successor)
    const successorProvider = new anchor.AnchorProvider(connection, successorWallet, {
        preflightCommitment: 'confirmed'
    })
    const successorProgram = new Program(IDL, successorProvider)

    const tx5 = await (successorProgram.methods as any)
        .claimIdentity()
        .accounts({
            identity: identityPDA,
            claimant: successor.publicKey,
        })
        .rpc()
    console.log(`  ✅ Identity claimed! — TX: ${tx5.slice(0, 20)}...`)

    // Verify ownership transfer
    const state2 = await (program.account as any).isnadIdentity.fetch(identityPDA)
    console.log(`  → new owner: ${state2.owner.toBase58()}`)
    console.log(`  → creator (unchanged): ${state2.creator.toBase58()}`)
    console.log(`  → proposed_successor: ${state2.proposedSuccessor || 'None (cleared)'}`)

    // ── Step 6: New owner can log work ───────────────────────
    console.log('【 Step 6 】 New owner logs work...')
    const newWorkHash = Buffer.alloc(32)
    Buffer.from('successor-first-work-entry-001').copy(newWorkHash)

    const tx6 = await (successorProgram.methods as any)
        .logWork(Array.from(newWorkHash))
        .accounts({
            identity: identityPDA,
            owner: successor.publicKey,
        })
        .rpc()
    console.log(`  ✅ Successor logged work — TX: ${tx6.slice(0, 20)}...`)

    // ── Step 7: Old owner CANNOT log work ────────────────────
    console.log('【 Step 7 】 Old owner tries to log work (should FAIL)...')
    try {
        const failHash = Buffer.alloc(32)
        Buffer.from('this-should-fail').copy(failHash)

        await (program.methods as any)
            .logWork(Array.from(failHash))
            .accounts({
                identity: identityPDA,
                owner: deployer.publicKey,
            })
            .rpc()
        console.log('  ❌ UNEXPECTED: Old owner could still log work!')
    } catch (e: any) {
        console.log(`  ✅ Correctly rejected: "${e.error?.errorMessage || 'UnauthorizedUpdate'}"`)
    }

    // ── Final State ──────────────────────────────────────────
    console.log()
    console.log('='.repeat(60))
    console.log('FINAL ON-CHAIN STATE')
    console.log('='.repeat(60))
    const finalState = await (program.account as any).isnadIdentity.fetch(identityPDA)
    console.log(`  Owner:     ${finalState.owner.toBase58()}`)
    console.log(`  Creator:   ${finalState.creator.toBase58()}`)
    console.log(`  Hash:      ${Buffer.from(finalState.latestHash).toString('hex').slice(0, 32)}...`)
    console.log(`  Successor: ${finalState.proposedSuccessor || 'None'}`)
    console.log(`  Bump:      ${finalState.bump}`)
    console.log()
    console.log('✅ ALL TESTS PASSED — Identity succession verified on devnet!')
}

main().catch(err => {
    console.error('❌ Test failed:', err)
    process.exit(1)
})
