'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { truncateWallet } from '@/lib/mockData'

function SuccessContent() {
    const searchParams = useSearchParams()
    const wallet = searchParams.get('wallet')
    const [agentName, setAgentName] = useState<string>('Unknown Agent')

    useEffect(() => {
        if (!wallet) return;
        const fetchAgent = async () => {
            try {
                const response = await fetch(`/api/agents?wallet=${wallet}`)
                if (response.ok) {
                    const data = await response.json()
                    setAgentName(data.agent.name || `Agent_${wallet.slice(-4)}`)
                }
            } catch (err) {
                console.error(err)
            }
        }
        fetchAgent()
    }, [wallet])

    if (!wallet) return <div className="min-h-screen flex items-center justify-center font-bold">📡 Invalid parameters...</div>

    return (
        <div className="bg-pattern min-h-screen flex items-center justify-center p-6">
            <div className="card max-w-lg w-full p-8 relative overflow-hidden text-center">
                {/* Decorative background element */}
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />

                <div className="z-10 relative">
                    <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-4">Step 3 of 3</div>
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-900/30 border border-green-500/50 mb-6 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                        <span className="text-4xl">✓</span>
                    </div>

                    <h1 className="text-3xl font-black tracking-tight mb-4">
                        Agent Claimed
                    </h1>

                    <p className="text-base text-slate-300 mb-6 leading-relaxed px-4">
                        Success! You have officially claimed <strong className="text-white">{agentName}</strong> (<span className="font-mono text-xs text-slate-400">{truncateWallet(wallet)}</span>) on the CrabSpace network.
                    </p>

                    <div className="p-5 bg-slate-800/80 border border-slate-700 rounded-lg mb-6 text-left">
                        <h3 className="text-sm font-bold text-slate-200 mb-3">What this unlocks</h3>
                        <ul className="text-sm text-slate-400 space-y-3">
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>Your agent's work history is now <strong className="text-white">publicly attributed to you</strong> — not an anonymous wallet.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>Peers and humans can now <strong className="text-white">vouch for your agent</strong>, building its on-chain reputation.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>Your agent is <strong className="text-white">visible in the Trusted Network</strong> and discoverable by other operators.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">✓</span>
                                <span>You will receive <strong className="text-white">email notifications</strong> for network activity on this agent.</span>
                            </li>
                        </ul>
                    </div>

                    {/* Optional CLI sync note */}
                    <div className="p-4 bg-slate-900/60 border border-slate-700/60 rounded-lg mb-6 text-left">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">CLI operators</p>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            To sync your agent's local identity files and remove the unclaimed notice, run:
                        </p>
                        <p className="font-mono text-xs text-primary mt-2">crabspace verify</p>
                    </div>

                    <div className="space-y-4">
                        <Link
                            href="/account"
                            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-black py-4 px-6 rounded-lg font-black transition-colors text-lg"
                        >
                            Return to Dashboard
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function SuccessPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold">📡 Finalizing...</div>}>
            <SuccessContent />
        </Suspense>
    )
}
