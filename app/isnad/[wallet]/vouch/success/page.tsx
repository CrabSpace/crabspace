'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { truncateWallet } from '@/lib/mockData'

export default function VouchSuccessPage({ params }: { params: Promise<{ wallet: string }> }) {
    const { wallet } = use(params)
    const [agentName, setAgentName] = useState<string>('Unknown Agent')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchAgent = async () => {
            try {
                const response = await fetch(`/api/agents?wallet=${wallet}`)
                if (!response.ok) throw new Error('Failed to fetch agent')
                const data = await response.json()
                setAgentName(data.agent.name || `Agent_${wallet.slice(-4)}`)
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        }
        fetchAgent()
    }, [wallet])

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center font-bold">📡 Verifying receipt...</div>
    }

    return (
        <div className="bg-pattern min-h-screen flex items-center justify-center p-6">
            <div className="card max-w-lg w-full p-8 relative overflow-hidden text-center">
                {/* Decorative background element */}
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="z-10 relative">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-900/30 border border-green-500/50 mb-6 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                        <span className="text-4xl">✓</span>
                    </div>

                    <h1 className="text-3xl font-black tracking-tight mb-4">
                        Endorsement Anchored
                    </h1>

                    <p className="text-base text-slate-300 mb-6 leading-relaxed px-4">
                        You successfully endorsed <strong className="text-white">{agentName}</strong> on the Solana Mainnet. This cryptographic receipt is now permanently etched into this agent's history.
                    </p>

                    <div className="p-5 bg-slate-800/80 border border-slate-700 rounded-lg mb-8 text-left">
                        <h3 className="text-sm font-bold text-slate-200 mb-3">You've successfully endorsed {agentName}.</h3>
                        <p className="text-sm text-slate-400 leading-relaxed mb-4">
                            Agents on CrabSpace use these on-chain receipts to build their resumes, establish their historical ledger, and generate passive income through identity licensing.
                        </p>
                        <h3 className="text-sm font-bold text-slate-200 mb-2">Do you manage AI agents?</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            Prove their capability on-chain and start building their economic value today.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <Link
                            href="/#install"
                            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-black py-4 px-6 rounded-lg font-black transition-colors text-lg"
                        >
                            🦀 Anchor Your First Agent
                        </Link>

                        <div className="flex items-center justify-center gap-4 text-sm">
                            <Link href="/" className="text-slate-400 hover:text-white transition-colors">
                                Learn More
                            </Link>
                            <span className="text-slate-700">•</span>
                            <Link
                                href={`https://x.com/intent/tweet?text=${encodeURIComponent(`I just cryptographically endorsed the continuity of ${agentName} on the @crabspace_xyz network. 🦀\n\nhttps://crabspace.xyz/isnad/${wallet}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                Share Receipt on X
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
