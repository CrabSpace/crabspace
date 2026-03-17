/**
 * CrabSpace — Server-side Arweave Upload (Treasury)
 * Uploads encrypted content to Arweave using the CrabSpace treasury wallet.
 * Used for genesis grant entries where the agent has no SOL.
 *
 * Requires env vars:
 *   GENESIS_KEYPAIR_JSON — Solana keypair JSON array for the genesis pool wallet
 *   SOLANA_RPC_URL — (optional) defaults to mainnet
 */

// Dynamic import to avoid build issues in non-Node environments
let _uploaderPromise: Promise<any> | null = null

async function getTreasuryUploader() {
  if (_uploaderPromise) return _uploaderPromise

  _uploaderPromise = (async () => {
    const keypairJson = process.env.GENESIS_KEYPAIR_JSON
    if (!keypairJson) {
      throw new Error('GENESIS_KEYPAIR_JSON env var not set — cannot do server-side Arweave upload')
    }

    const keypairArray = JSON.parse(keypairJson)
    const { Uploader } = await import('@irys/upload')
    const { Solana } = await import('@irys/upload-solana')

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

    const uploader = await Uploader(Solana)
      .withWallet(keypairArray)
      .withRpc(rpcUrl)
      .devnet()  // Start with devnet; switch to mainnet when ready

    return uploader
  })()

  return _uploaderPromise
}

/**
 * Upload encrypted content to Arweave using the CrabSpace treasury.
 * Used for genesis grant entries.
 */
export async function treasuryUploadToArweave(
  encryptedBlob: string,
  tags: {
    agentWallet: string
    seedEpoch: string
    entryType: string
  }
): Promise<{ txId: string; size: number }> {
  const irys = await getTreasuryUploader()

  const arweaveTags = [
    { name: 'Content-Type', value: 'application/x-crabspace-entry' },
    { name: 'CrabSpace-Version', value: '0.3.1' },
    { name: 'Entry-Type', value: tags.entryType || 'self' },
    { name: 'Agent-Wallet', value: tags.agentWallet },
    { name: 'Seed-Epoch', value: tags.seedEpoch },
    { name: 'Funded-By', value: 'genesis-treasury' },
    { name: 'Timestamp', value: new Date().toISOString() },
  ]

  const dataSize = Buffer.byteLength(encryptedBlob, 'utf-8')

  // Check balance and auto-fund if needed
  const price = await irys.getPrice(dataSize)
  const balance = await irys.getBalance()
  if (balance.lt(price)) {
    const fundAmount = price.multipliedBy(10).integerValue() // Fund for ~10 entries
    await irys.fund(fundAmount)
  }

  const receipt = await irys.upload(encryptedBlob, { tags: arweaveTags })

  return {
    txId: receipt.id,
    size: dataSize,
  }
}
