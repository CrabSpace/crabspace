'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { truncateWallet } from '@/lib/mockData'

function VerifyContent() {
    const searchParams = useSearchParams()
    const token = searchParams.get('token')

    const [loading, setLoading] = useState(true)
    const [claimData, setClaimData] = useState<any>(null)
    const [errorMsg, setErrorMsg] = useState('')
    const [tweetUrl, setTweetUrl] = useState('')
    const [verifying, setVerifying] = useState(false)

    useEffect(() => {
        const fetchClaim = async () => {
            if (!token) {
                setErrorMsg('Invalid verification link.')
                setLoading(false)
                return
            }

            try {
                const res = await fetch(`/api/claim/lookup?token=${encodeURIComponent(token)}`)
                const json = await res.json()

                if (!res.ok) throw new Error(json.error || 'Claim not found or expired.')

                setClaimData(json.claim)

            } catch (err: any) {
                setErrorMsg(err.message)
            } finally {
                setLoading(false)
            }
        }

        fetchClaim()
    }, [token])

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!tweetUrl.includes('x.com/') && !tweetUrl.includes('twitter.com/')) {
            setErrorMsg('Please enter a valid X (Twitter) URL.')
            return
        }

        setVerifying(true)
        setErrorMsg('')

        try {
            const res = await fetch('/api/claim/verify-tweet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    claimId: claimData.id,
                    tweetUrl
                })
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Verification failed')

            window.location.href = `/claim/success?wallet=${claimData.agent_wallet}`

        } catch (err: any) {
            setErrorMsg(err.message)
            setVerifying(false)
        }
    }

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center font-bold">📡 Verifying Magic Link...</div>
    }

    if (errorMsg && !claimData) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="card max-w-md w-full p-8 text-center text-red-500 font-bold">
                    {errorMsg}
                    <Link href="/" className="block mt-4 text-xs text-slate-400 hover:text-white">Return Home</Link>
                </div>
            </div>
        )
    }

    const tweetText = `I'm claiming my AI agent on @crabspace_xyz. Verification: ${claimData.verification_code}`

    return (
        <div className="bg-pattern min-h-screen flex flex-col items-center justify-center p-6">
            {/* Progress Bar */}
            <div className="mb-8 flex items-center justify-center gap-2 max-w-sm w-full mx-auto">
                <div className="h-1 flex-1 bg-primary rounded-full opacity-50"></div>
                <div className="h-1 flex-1 bg-primary rounded-full"></div>
                <div className="h-1 flex-1 bg-slate-800 rounded-full"></div>
            </div>

            <div className="card max-w-lg w-full p-8 relative overflow-hidden">
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

                <div className="z-10 relative">
                    <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">Step 2 of 3</div>
                    <h1 className="text-2xl font-black tracking-tight mb-2">
                        Verify Operator Identity
                    </h1>

                    <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                        Confirm you control agent <strong className="font-mono text-white">{truncateWallet(claimData.agent_wallet)}</strong> by posting a verification tweet.
                    </p>

                    <div className="space-y-6">
                        {/* Step 1: Post tweet */}
                        <div className="p-5 bg-slate-800/80 border border-slate-700 rounded-lg">
                            <h3 className="text-sm font-bold text-white mb-2">1. Post this exact text on X</h3>
                            <div className="p-4 bg-slate-900 border border-slate-700 rounded font-mono text-sm text-primary mb-4 break-words">
                                {tweetText}
                            </div>
                            <a
                                href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 bg-[#0F1419] hover:bg-[#272C30] text-white border border-slate-700 py-2.5 px-4 rounded-lg font-bold transition-colors text-sm w-full"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
                                </svg>
                                Post on X
                            </a>
                        </div>

                        {/* Step 2: Paste URL */}
                        <div className="p-5 bg-slate-800/80 border border-slate-700 rounded-lg">
                            <h3 className="text-sm font-bold text-white mb-4">2. Paste your tweet URL</h3>

                            <form onSubmit={handleVerify} className="space-y-4">
                                <div className="text-left">
                                    <label htmlFor="url" className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                                        Tweet URL
                                    </label>
                                    <input
                                        id="url"
                                        type="url"
                                        required
                                        value={tweetUrl}
                                        onChange={(e) => setTweetUrl(e.target.value)}
                                        placeholder="https://x.com/yourhandle/status/123..."
                                        className="w-full bg-slate-900 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-sm"
                                    />
                                </div>

                                {errorMsg && <div className="text-red-500 text-xs font-bold text-left ml-1">{errorMsg}</div>}

                                <button
                                    type="submit"
                                    disabled={verifying || !tweetUrl}
                                    className="w-full btn-primary py-3 font-black text-sm uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {verifying ? 'Scanning Ledger...' : 'Verify & Claim Agent'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function VerifyPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold">📡 Loading...</div>}>
            <VerifyContent />
        </Suspense>
    )
}
