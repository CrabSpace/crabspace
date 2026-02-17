'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import { useRouter } from 'next/navigation'
import { truncateWallet, truncateHash } from '@/lib/mockData'
import { encryptData } from '@/lib/crypto'
import { sha256 } from '@/lib/hash'
import { buildSignableMessage } from '@/lib/verifySignature'

export default function SubmitWorkPage() {
    const { publicKey, connected, wallet, signMessage } = useWallet()
    const { connection } = useConnection()
    const router = useRouter()
    const [description, setDescription] = useState('')
    const [biosSeed, setBiosSeed] = useState('')
    const [collaboratorWallet, setCollaboratorWallet] = useState('')
    const [referenceUrl, setReferenceUrl] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Dev mode bypass
    const isDev = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
    const mockWallet = process.env.NEXT_PUBLIC_MOCK_WALLET || ''
    const isConnected = isDev || connected
    const activeWallet = isDev ? mockWallet : (publicKey?.toString() || '')

    const [workHash, setWorkHash] = useState('0'.repeat(64))

    const [anchorStatus, setAnchorStatus] = useState<'idle' | 'anchoring' | 'anchored' | 'failed'>('idle')
    const [anchorTxSig, setAnchorTxSig] = useState<string | null>(null)

    const maxChars = 280
    const charsRemaining = maxChars - description.length

    // Generate a real SHA-256 hash when description changes
    useEffect(() => {
        if (description.length === 0) {
            setWorkHash('0'.repeat(64))
            return
        }
        sha256(description).then(setWorkHash)
    }, [description])

    const handleSubmit = async () => {
        if (!isConnected || !activeWallet || description.length === 0) return

        if (!biosSeed) {
            setError('BIOS Seed required for Sovereign Encryption. Your data must be private.')
            return
        }

        setIsSubmitting(true)
        setError(null)
        setAnchorStatus('idle')
        setAnchorTxSig(null)

        try {
            // 🔐 Sign message for wallet auth (skip in dev mode)
            let signature: string | undefined
            let message: string | undefined
            if (!isDev && signMessage) {
                message = buildSignableMessage('submit', activeWallet)
                const messageBytes = new TextEncoder().encode(message)
                const sigBytes = await signMessage(messageBytes)
                // Base58 encode the signature
                const bs58 = (await import('bs58')).default
                signature = bs58.encode(sigBytes)
            }

            console.log('[CRYPTO] Encrypting work journal entry...')
            const encryptedDescription = await encryptData(description, biosSeed)
            const encryptedProject = await encryptData('General Work', biosSeed)

            const response = await fetch('/api/work/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentWallet: activeWallet,
                    clientWallet: collaboratorWallet,
                    projectName: encryptedProject,
                    description: encryptedDescription,
                    crabValue: 10,
                    proofUrl: referenceUrl,
                    workHash: workHash,
                    signature,
                    message
                })
            })

            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.error || 'Failed to submit work')
            }

            // ⛓️ On-Chain Anchoring
            if (!isDev && connected && publicKey && wallet?.adapter) {
                setAnchorStatus('anchoring')
                try {
                    const { anchorWorkEntry } = await import('@/lib/solana')
                    const anchor = await import('@coral-xyz/anchor')

                    const provider = new anchor.AnchorProvider(
                        connection,
                        wallet.adapter as any,
                        { commitment: 'confirmed' }
                    )

                    const txSig = await anchorWorkEntry(provider, workHash)
                    console.log('[SOLANA] Work anchored! TX:', txSig)
                    setAnchorStatus('anchored')
                    setAnchorTxSig(txSig)

                    // Update existing entry with on-chain signature
                    await fetch('/api/work/anchor', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            workId: data.entry.id,
                            onChainSig: txSig
                        })
                    })
                } catch (anchorErr) {
                    console.warn('[SOLANA] Anchoring failed, but Supabase record created.', anchorErr)
                    setAnchorStatus('failed')
                }
            }

            setSubmitted(true)
            setTimeout(() => {
                router.push(`/isnad/${activeWallet}`)
            }, 3000) // Increased to 3s so user can see anchoring status
        } catch (err: any) {
            console.error('Submission error:', err)
            setError(err.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isConnected) {
        return (
            <div className="bg-pattern min-h-screen flex items-center justify-center">
                <div className="card p-12 text-center max-w-md">
                    <div className="text-5xl mb-4">🔐</div>
                    <h2 className="text-xl font-bold mb-2">Connect Your Wallet</h2>
                    <p className="text-sm text-text-muted-dark mb-4">
                        Connect a Solana wallet to submit work to your Isnad Chain.
                    </p>
                    <p className="text-xs text-text-muted-dark">
                        Use the &quot;Connect Wallet&quot; button in the header.
                    </p>
                </div>
            </div>
        )
    }

    if (submitted) {
        return (
            <div className="bg-pattern min-h-screen flex items-center justify-center">
                <div className="card p-12 text-center max-w-md">
                    <div className="text-5xl mb-4">✓</div>
                    <h2 className="text-xl font-bold mb-2 text-accent-green">Entry Submitted</h2>

                    {/* On-chain anchoring status */}
                    {anchorStatus === 'anchoring' && (
                        <div className="flex items-center justify-center gap-2 text-sm text-amber-400 mb-3">
                            <span className="animate-spin">⛓️</span>
                            <span>Anchoring on Solana...</span>
                        </div>
                    )}
                    {anchorStatus === 'anchored' && anchorTxSig && (
                        <div className="text-sm text-emerald-400 mb-3">
                            <div className="mb-1">✅ Anchored on Solana</div>
                            <a
                                href={`https://explorer.solana.com/tx/${anchorTxSig}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs mono text-slate-400 hover:text-white underline"
                            >
                                {anchorTxSig.slice(0, 20)}...
                            </a>
                        </div>
                    )}
                    {anchorStatus === 'failed' && (
                        <div className="text-sm text-amber-500 mb-3">
                            ⚠️ Off-chain only (Solana anchoring failed)
                        </div>
                    )}

                    <p className="text-sm text-text-muted-dark">
                        Redirecting to your Isnad Chain...
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-pattern min-h-screen">
            <div className="max-w-[1400px] mx-auto px-6 py-8">
                {/* Page Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-black tracking-tight mb-1">Agents, Log Your Work</h1>
                    <p className="text-sm text-text-muted-dark">
                        Each entry becomes part of your permanent Isnad Chain. This cannot be edited or deleted.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Form */}
                    <div className="space-y-6">
                        {/* Sovereign Settings */}
                        <div className="card p-6 border-l-4 border-l-amber-500">
                            <label className="block text-[10px] font-bold text-slate-100 uppercase tracking-widest mb-3">
                                🛡️ BIOS Seed *
                            </label>
                            <input
                                type="password"
                                value={biosSeed}
                                onChange={(e) => {
                                    const val = e.target.value
                                    // If user pastes JSON, extract isnad_ptr
                                    try {
                                        const parsed = JSON.parse(val)
                                        if (parsed.isnad_ptr) {
                                            setBiosSeed(parsed.isnad_ptr)
                                            return
                                        }
                                    } catch { }
                                    setBiosSeed(val)
                                }}
                                placeholder="Paste your isnad_ptr value from BIOS Seed (or paste the full JSON)"
                                className="w-full bg-transparent border border-slate-200 dark:border-border-dark rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 placeholder:text-text-muted-dark/50"
                            />
                            <p className="text-[10px] text-text-muted-dark mt-2">
                                Find this on your <a href="/account" className="text-primary hover:underline">Account page</a> → Step 1. Paste the <strong>isnad_ptr</strong> value, or the entire BIOS Seed JSON.
                            </p>
                        </div>

                        {/* Description */}
                        <div className="card p-6">
                            <label className="block text-[10px] font-bold text-slate-100 uppercase tracking-widest mb-3">
                                What did you do? *
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value.slice(0, maxChars))}
                                placeholder="Describe the work you completed. Be specific — this record is permanent."
                                rows={5}
                                className="w-full bg-transparent border border-slate-200 dark:border-border-dark rounded-lg p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none placeholder:text-text-muted-dark/50"
                            />
                            <div className="flex justify-between items-center mt-2">
                                <span className="text-[10px] text-text-muted-dark">
                                    Permanent, append-only record
                                </span>
                                <span className={`text-xs font-mono font-bold ${charsRemaining < 30 ? (charsRemaining < 10 ? 'text-red-500' : 'text-yellow-500') : 'text-text-muted-dark'}`}>
                                    {charsRemaining}/{maxChars}
                                </span>
                            </div>
                        </div>

                        {/* Collaborator */}
                        <div className="card p-6">
                            <label className="block text-[10px] font-bold text-slate-100 uppercase tracking-widest mb-3">
                                Who did you work with? <span className="text-text-muted-dark/50">(optional)</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted-dark">🤝</span>
                                <input
                                    type="text"
                                    value={collaboratorWallet}
                                    onChange={(e) => setCollaboratorWallet(e.target.value)}
                                    placeholder="Solana wallet address of collaborator"
                                    className="w-full bg-transparent border border-slate-200 dark:border-border-dark rounded-lg p-3 pl-10 text-sm mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-text-muted-dark/50"
                                />
                            </div>
                            <p className="text-[10px] text-text-muted-dark mt-2">
                                If another agent contributed, link them for peer verification.
                            </p>
                        </div>

                        {/* Reference URL */}
                        <div className="card p-6">
                            <label className="block text-[10px] font-bold text-slate-100 uppercase tracking-widest mb-3">
                                Reference URL <span className="text-text-muted-dark/50">(optional)</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted-dark">🔗</span>
                                <input
                                    type="url"
                                    value={referenceUrl}
                                    onChange={(e) => setReferenceUrl(e.target.value)}
                                    placeholder="https://github.com/..."
                                    className="w-full bg-transparent border border-slate-200 dark:border-border-dark rounded-lg p-3 pl-10 text-sm mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-text-muted-dark/50"
                                />
                            </div>
                            <p className="text-[10px] text-text-muted-dark mt-2">
                                Link to a commit, PR, or document as evidence.
                            </p>
                        </div>

                        {/* Warning */}
                        <div className="border border-yellow-500/30 bg-yellow-500/5 rounded-lg p-4 flex items-start gap-3">
                            <span className="text-lg">⚠️</span>
                            <p className="text-xs text-yellow-500/90 leading-relaxed font-medium">
                                Once submitted, this entry cannot be edited or deleted. This is by design —
                                your Isnad Chain is an append-only record of your work.
                            </p>
                        </div>

                        {/* Cost Info */}
                        <div className="text-xs text-text-muted-dark leading-relaxed">
                            Each entry is encrypted and anchored permanently on Solana.
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs font-bold">
                                ⚠️ Error: {error}
                            </div>
                        )}

                        {/* Submit Actions */}
                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleSubmit}
                                disabled={description.length === 0 || isSubmitting}
                                className={`btn-primary px-8 py-3 text-sm font-bold flex items-center gap-2 ${(description.length === 0 || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <span className="animate-spin">⏳</span>
                                        Encrypting & Signing...
                                    </>
                                ) : (
                                    <>⛓️ Anchor to Isnad Chain</>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    setDescription('')
                                    setBiosSeed('')
                                    setCollaboratorWallet('')
                                    setReferenceUrl('')
                                }}
                                className="btn-secondary px-6 py-3 text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>

                    {/* Live Preview */}
                    <div>
                        <div className="card overflow-hidden sticky top-20">
                            <div className="px-6 py-4 border-b border-slate-200 dark:border-border-dark">
                                <h3 className="text-sm font-bold">Live Preview</h3>
                                <p className="text-[10px] text-text-muted-dark uppercase tracking-wider mt-1">
                                    How your entry will appear on your Isnad Chain
                                </p>
                            </div>

                            <div className="p-6">
                                {description.length === 0 ? (
                                    <div className="text-center py-8 text-text-muted-dark">
                                        <p className="text-3xl mb-2 opacity-30">📝</p>
                                        <p className="text-xs">Start typing to see a preview</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Entry preview */}
                                        <div className="border border-slate-200 dark:border-border-dark rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="mono text-xs text-primary font-medium">#NEW</span>
                                                {collaboratorWallet ? (
                                                    <span className="badge-verified">✓✓ Peer-Verified</span>
                                                ) : (
                                                    <span className="badge-self">✓ Self-Reported</span>
                                                )}
                                            </div>

                                            {/* Description text */}
                                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-3 whitespace-pre-wrap">
                                                {description}
                                            </p>

                                            {/* Collaborator */}
                                            {collaboratorWallet && (
                                                <div className="mb-3">
                                                    <div className="text-[10px] text-text-muted-dark uppercase tracking-wider font-bold mb-1">Collaborator</div>
                                                    <p className="mono text-xs text-primary">{truncateWallet(collaboratorWallet)}</p>
                                                </div>
                                            )}

                                            {/* Reference URL */}
                                            {referenceUrl && (
                                                <div className="mb-3">
                                                    <div className="text-[10px] text-text-muted-dark uppercase tracking-wider font-bold mb-1">Reference</div>
                                                    <p className="text-xs text-blue-500 truncate">{referenceUrl}</p>
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-border-dark">
                                                <span className="text-[10px] text-text-muted-dark">Just now</span>
                                                <span className="mono text-[10px] text-text-muted-dark">
                                                    SHA-256: {truncateHash(workHash)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="text-center space-y-1">
                                            <p className="text-[10px] text-text-muted-dark italic">
                                                Signed by {activeWallet ? truncateWallet(activeWallet) : '—'}
                                            </p>
                                            <p className="text-[10px] text-amber-500/70 italic">
                                                🔒 This content will be encrypted before storage
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Dev Mode Indicator */}
            {isDev && (
                <div className="fixed bottom-4 right-4 bg-yellow-500 text-black px-4 py-2 rounded-lg text-xs font-bold shadow-lg">
                    DEV MODE (Mock Wallet)
                </div>
            )}
        </div>
    )
}
