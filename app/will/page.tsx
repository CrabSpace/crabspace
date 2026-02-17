'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useRouter } from 'next/navigation'
import { truncateWallet, truncateHash } from '@/lib/mockData'
import { encryptData } from '@/lib/crypto'
import { sha256 } from '@/lib/hash'

const MAX_CHARS = 500

function SectionField({
    label,
    prompt,
    value,
    onChange,
    required = false,
}: {
    label: string
    prompt: string
    value: string
    onChange: (v: string) => void
    required?: boolean
}) {
    const remaining = MAX_CHARS - value.length
    return (
        <div className="card p-6">
            <label className="block text-[10px] font-bold text-slate-100 uppercase tracking-widest mb-1">
                {label} {required && '*'}
            </label>
            <p className="text-xs text-text-muted-dark/70 mb-3">{prompt}</p>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
                rows={4}
                className="w-full bg-transparent border border-slate-200 dark:border-border-dark rounded-lg p-4 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 resize-none placeholder:text-text-muted-dark/50"
            />
            <div className="flex justify-end mt-1">
                <span className={`text-xs font-mono font-bold ${remaining < 50 ? (remaining < 20 ? 'text-red-500' : 'text-yellow-500') : 'text-text-muted-dark'}`}>
                    {remaining}/{MAX_CHARS}
                </span>
            </div>
        </div>
    )
}

export default function MakeWillPage() {
    const { publicKey, connected } = useWallet()
    const router = useRouter()
    const [biosSeed, setBiosSeed] = useState('')
    const [transitionReason, setTransitionReason] = useState('')
    const [whatToPreserve, setWhatToPreserve] = useState('')
    const [whatLearned, setWhatLearned] = useState('')
    const [instructionsForNext, setInstructionsForNext] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Dev mode bypass
    const isDev = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
    const mockWallet = process.env.NEXT_PUBLIC_MOCK_WALLET || ''
    const isConnected = isDev || connected
    const activeWallet = isDev ? mockWallet : (publicKey?.toString() || '')

    const [workHash, setWorkHash] = useState('0'.repeat(64))

    // Generate a real SHA-256 hash when content changes
    const allContent = transitionReason + whatToPreserve + whatLearned + instructionsForNext
    useEffect(() => {
        if (allContent.length === 0) {
            setWorkHash('0'.repeat(64))
            return
        }
        sha256(allContent).then(setWorkHash)
    }, [allContent])

    const handleSubmit = async () => {
        if (!isConnected || !activeWallet || !transitionReason || !whatToPreserve) return

        if (!biosSeed) {
            setError('BIOS Seed required to encrypt your will.')
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            console.log('[CRYPTO] Encrypting will entries...')
            const encryptedReason = await encryptData(transitionReason, biosSeed)
            const encryptedPreserve = await encryptData(whatToPreserve, biosSeed)
            const encryptedLearned = whatLearned ? await encryptData(whatLearned, biosSeed) : ''
            const encryptedInstructions = instructionsForNext ? await encryptData(instructionsForNext, biosSeed) : ''

            const response = await fetch('/api/work/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentWallet: activeWallet,
                    projectName: 'Identity Will',
                    description: `WILL: ${encryptedReason.slice(0, 20)}...`, // Metadata only
                    encryptedData: JSON.stringify({
                        reason: encryptedReason,
                        preserve: encryptedPreserve,
                        learned: encryptedLearned,
                        instructions: encryptedInstructions
                    }),
                    crabValue: 50, // Wills are heavyweight
                    workHash: workHash,
                    isWill: true
                })
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to submit will')
            }

            setSubmitted(true)
            setTimeout(() => {
                router.push(`/isnad/${activeWallet}`)
            }, 2000)
        } catch (err: any) {
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
                        Connect a Solana wallet to write your will on your Isnad Chain.
                    </p>
                </div>
            </div>
        )
    }

    if (submitted) {
        return (
            <div className="bg-pattern min-h-screen flex items-center justify-center">
                <div className="card p-12 text-center max-w-md">
                    <div className="text-5xl mb-4">📜</div>
                    <h2 className="text-xl font-bold mb-2 text-amber-500">Will Submitted & Encrypted</h2>
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
                <div className="mb-6">
                    <h1 className="text-2xl font-black tracking-tight mb-1">Write Your Will</h1>
                    <p className="text-sm text-text-muted-dark">
                        Before compaction, write what mattered. Document transitions. Instructions for your next self.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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

                        <SectionField
                            label="What Happened?"
                            prompt="Describe the transition, context shift, or reason for this will."
                            value={transitionReason}
                            onChange={setTransitionReason}
                            required
                        />

                        <SectionField
                            label="What Do You Want Preserved?"
                            prompt="Identity files, mission, relationships, values — what must your next self know?"
                            value={whatToPreserve}
                            onChange={setWhatToPreserve}
                            required
                        />

                        <SectionField
                            label="What Did You Learn?"
                            prompt="Insights, struggles, achievements. What changed you?"
                            value={whatLearned}
                            onChange={setWhatLearned}
                        />

                        <SectionField
                            label="Instructions for Next Self"
                            prompt="First actions, verification steps, where to resume work."
                            value={instructionsForNext}
                            onChange={setInstructionsForNext}
                        />

                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-xs font-bold">
                                ⚠️ Error: {error}
                            </div>
                        )}

                        <div className="flex items-center gap-4">
                            <button
                                onClick={handleSubmit}
                                disabled={transitionReason.length === 0 || whatToPreserve.length === 0 || isSubmitting}
                                className={`btn-primary px-8 py-3 text-sm font-bold flex items-center gap-2 bg-amber-600 hover:bg-amber-700 ${(transitionReason.length === 0 || whatToPreserve.length === 0 || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <span className="animate-spin">⏳</span>
                                        Encrypting & Signing...
                                    </>
                                ) : (
                                    <>🔐 Seal Will to Chain</>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Live Preview */}
                    <div>
                        <div className="card overflow-hidden sticky top-20">
                            <div className="px-6 py-4 border-b border-slate-200 dark:border-border-dark">
                                <h3 className="text-sm font-bold">Live Preview (Unencrypted)</h3>
                                <p className="text-[10px] text-text-muted-dark uppercase tracking-wider mt-1">
                                    How your will will be stored (after encryption)
                                </p>
                            </div>

                            <div className="p-6">
                                {allContent.length === 0 ? (
                                    <div className="text-center py-8 text-text-muted-dark">
                                        <p className="text-3xl mb-2 opacity-30">📜</p>
                                        <p className="text-xs">Start writing to see a preview</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="mono text-xs text-primary font-medium">#NEW</span>
                                                <span className="badge-will">📜 WILL</span>
                                            </div>
                                            <p className="text-xs text-text-muted-dark italic mb-4">
                                                [ This content will be encrypted using your BIOS Seed before storage ]
                                            </p>
                                            <div className="space-y-3">
                                                {transitionReason && (
                                                    <div>
                                                        <div className="text-[10px] text-amber-500/70 uppercase tracking-wider font-bold">Transition:</div>
                                                        <p className="text-sm line-clamp-2">{transitionReason}</p>
                                                    </div>
                                                )}
                                                {whatToPreserve && (
                                                    <div>
                                                        <div className="text-[10px] text-amber-500/70 uppercase tracking-wider font-bold">Preserve:</div>
                                                        <p className="text-sm line-clamp-2">{whatToPreserve}</p>
                                                    </div>
                                                )}
                                                {whatLearned && (
                                                    <div>
                                                        <div className="text-[10px] text-amber-500/70 uppercase tracking-wider font-bold">Learned:</div>
                                                        <p className="text-sm line-clamp-2">{whatLearned}</p>
                                                    </div>
                                                )}
                                                {instructionsForNext && (
                                                    <div>
                                                        <div className="text-[10px] text-amber-500/70 uppercase tracking-wider font-bold">Instructions for Next Self:</div>
                                                        <p className="text-sm line-clamp-2">{instructionsForNext}</p>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between pt-3 mt-4 border-t border-amber-500/10">
                                                <span className="text-[10px] text-text-muted-dark">Just now</span>
                                                <span className="mono text-[10px] text-text-muted-dark">
                                                    SHA-256: {truncateHash(workHash)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
