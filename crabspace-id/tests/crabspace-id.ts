import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CrabspaceId } from "../target/types/crabspace_id";
import { expect } from "chai";
import * as crypto from "crypto";

describe("crabspace-id", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CrabspaceId as Program<CrabspaceId>;
  const provider = anchor.getProvider();

  // PDA for the Isnad Identity
  const [identityPda, identityBump] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("isnad"), provider.publicKey.toBuffer()],
    program.programId
  );

  it("Initializes the Isnad Identity!", async () => {
    const headHash = Buffer.from(crypto.createHash('sha256').update("genesis").digest());

    await program.methods
      .initialize([...headHash])
      .accounts({
        identity: identityPda,
        creator: provider.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const account = await program.account.isnadIdentity.fetch(identityPda);
    expect(account.owner.toBase58()).to.equal(provider.publicKey.toBase58());
    expect(account.creator.toBase58()).to.equal(provider.publicKey.toBase58());
    expect(Buffer.from(account.latestHash)).to.deep.equal(headHash);
  });

  it("Proposes a successor!", async () => {
    const successor = anchor.web3.Keypair.generate();

    await program.methods
      .proposeSuccessor(successor.publicKey)
      .accounts({
        identity: identityPda,
        owner: provider.publicKey,
      })
      .rpc();

    const account = await program.account.isnadIdentity.fetch(identityPda);
    expect(account.proposedSuccessor.toBase58()).to.equal(successor.publicKey.toBase58());
  });

  it("Logs work and updates the latest hash!", async () => {
    const newHash = Buffer.from(crypto.createHash('sha256').update("work-entry-1").digest());

    await program.methods
      .log_work([...newHash])
      .accounts({
        identity: identityPda,
        owner: provider.publicKey,
      })
      .rpc();

    const account = await program.account.isnadIdentity.fetch(identityPda);
    expect(Buffer.from(account.latestHash)).to.deep.equal(newHash);
  });

  it("Claims the identity as a successor!", async () => {
    const successor = anchor.web3.Keypair.generate();

    // 1. Propose successor
    await program.methods
      .proposeSuccessor(successor.publicKey)
      .accounts({
        identity: identityPda,
        owner: provider.publicKey,
      })
      .rpc();

    // Airdrop to successor to pay for transaction
    const signature = await provider.connection.requestAirdrop(successor.publicKey, 1000000000);
    await provider.connection.confirmTransaction(signature);

    // 2. Claim identity
    await program.methods
      .claimIdentity()
      .accounts({
        identity: identityPda,
        claimant: successor.publicKey,
      })
      .signers([successor])
      .rpc();

    const account = await program.account.isnadIdentity.fetch(identityPda);
    expect(account.owner.toBase58()).to.equal(successor.publicKey.toBase58());
    expect(account.proposedSuccessor).to.be.null;
  });
});
