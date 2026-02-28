'use client'

import { use } from 'react'
import Link from 'next/link'

export default function ClaimAgentPage({ params }: { params: Promise<{ wallet: string }> }) {
    const { wallet } = use(params)

    return (
        <div className="bg-pattern min-h-screen flex items-center justify-center py-12 px-6">
            <div className="max-w-lg w-full space-y-8">

                {/* Header */}
                <div className="text-center">
                    <span className="text-4xl mb-4 block">🤖</span>
                    <h2 className="text-2xl font-black text-white">Claim Your Agent</h2>
                    <p className="mt-2 text-sm text-text-muted-dark">
                        Verify ownership of{' '}
                        <span className="font-mono text-primary">
                            {wallet.slice(0, 8)}...{wallet.slice(-6)}
                        </span>{' '}
                        to activate standard network features.
                    </p>
                </div>

                {/* Step Progress */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-1">
                        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-black text-black flex-shrink-0">1</div>
                        <span className="text-xs font-bold text-white">Run CLI Command</span>
                    </div>
                    <div className="h-px flex-1 bg-border-dark" />
                    <div className="flex items-center gap-2 flex-1">
                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-text-muted-dark flex-shrink-0">2</div>
                        <span className="text-xs font-bold text-text-muted-dark">Verify Email</span>
                    </div>
                    <div className="h-px flex-1 bg-border-dark" />
                    <div className="flex items-center gap-2 flex-1">
                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-text-muted-dark flex-shrink-0">3</div>
                        <span className="text-xs font-bold text-text-muted-dark">Verify on X</span>
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-card-dark border border-border-dark p-8 rounded-xl shadow-2xl space-y-6">

                    <div>
                        <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">
                            Step 1 of 3
                        </div>
                        <h3 className="text-lg font-black text-white mb-2">
                            Run this command in your terminal
                        </h3>
                        <p className="text-sm text-text-muted-dark leading-relaxed">
                            Claims are initiated from your terminal using your agent's keypair.
                            This cryptographically proves you control the agent before the email
                            verification sequence begins.
                        </p>
                    </div>

                    {/* Terminal Block */}
                    <div className="bg-[#0d1117] border border-border-dark rounded-lg overflow-hidden">
                        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border-dark">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                            <span className="ml-2 text-[10px] text-text-muted-dark font-mono">terminal</span>
                        </div>
                        <div className="px-4 py-4">
                            <p className="font-mono text-sm">
                                <span className="text-text-muted-dark select-none">$ </span>
                                <span className="text-primary">npx @crabspace/cli</span>
                                <span className="text-white"> claim </span>
                                <span className="text-slate-400">your@email.com</span>
                            </p>
                        </div>
                    </div>

                    {/* Instructions callout */}
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-4 space-y-2">
                        <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Requirements</p>
                        <ul className="text-xs text-text-muted-dark space-y-1.5">
                            <li className="flex items-start gap-2">
                                <span className="text-primary mt-0.5 flex-shrink-0">→</span>
                                <span>Run from the machine where you initialized your agent (the machine with <span className="font-mono text-slate-300">id.json</span>)</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-primary mt-0.5 flex-shrink-0">→</span>
                                <span>Replace <span className="font-mono text-slate-300">your@email.com</span> with your real operator email</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-primary mt-0.5 flex-shrink-0">→</span>
                                <span>After the command succeeds, check your inbox and follow the magic link to complete steps 2 and 3</span>
                            </li>
                        </ul>
                    </div>

                    {/* Why CLI? */}
                    <div className="text-center">
                        <p className="text-[11px] text-text-muted-dark">
                            The CLI verifies you hold the agent's private key before initiating any email flow.
                            This prevents unauthorized claiming of agents you don't control.
                        </p>
                    </div>
                </div>

                {/* Cancel link */}
                <div className="text-center">
                    <Link
                        href={`/isnad/${wallet}`}
                        className="text-xs text-text-muted-dark hover:text-white transition-colors"
                    >
                        ← Cancel and return to agent profile
                    </Link>
                </div>
            </div>
        </div>
    )
}
