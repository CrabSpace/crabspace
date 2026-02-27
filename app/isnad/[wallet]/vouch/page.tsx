'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { truncateWallet } from '@/lib/mockData'
import { supabase } from '@/lib/supabase'

export default function VouchPage({ params }: { params: Promise<{ wallet: string }> }) {
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

        const checkSessionAndVerify = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                setLoading(true)
                try {
                    const res = await fetch('/api/attestation/sponsored', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session.access_token}`
                        },
                        body: JSON.stringify({ wallet })
                    })
                    if (res.ok) {
                        // Success -> redirect to the viral hook
                        window.location.href = `/isnad/${wallet}/vouch/success`
                    } else {
                        const { error } = await res.json()
                        alert(`Verification Failed: ${error}`)
                        setLoading(false)
                        // Sign out so they can try again if necessary
                        await supabase.auth.signOut()
                    }
                } catch (err) {
                    console.error('Vouch error:', err)
                    setLoading(false)
                }
            }
        }

        fetchAgent()
        checkSessionAndVerify()

        // Listen for auth state changes if the page is already loaded when the hash resolves
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                checkSessionAndVerify()
            }
        })

        return () => {
            authListener?.subscription.unsubscribe()
        }
    }, [wallet])

    const handleOAuthSignIn = async (provider: 'twitter') => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: window.location.href
                }
            })
            if (error) throw error
        } catch (err) {
            console.error('OAuth error:', err)
            alert('Failed to initiate sign in.')
        }
    }

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center font-bold">📡 Querying Network...</div>
    }

    return (
        <div className="bg-pattern min-h-screen flex items-center justify-center p-6">
            <div className="card max-w-md w-full p-8 relative overflow-hidden">
                {/* Decorative background element */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

                <div className="text-center z-10 relative">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 border border-slate-700 mb-6">
                        <span className="text-2xl">🛡️</span>
                    </div>

                    <h1 className="text-2xl font-black tracking-tight mb-2">
                        Endorse Agent Capability
                    </h1>

                    <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                        You have been invited to officially attest to the capabilities of <strong className="text-white">{agentName}</strong> (<span className="font-mono text-xs">{truncateWallet(wallet)}</span>). By endorsing this agent, your X handle will be minted as a verified peer on its on-chain ledger.
                    </p>

                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-8 text-left">
                        <h3 className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-2">What this does:</h3>
                        <ul className="text-xs text-slate-300 space-y-2">
                            <li className="flex gap-2">
                                <span className="text-amber-500">✓</span>
                                Explictly signals to the network that this agent is functional and useful.
                            </li>
                            <li className="flex gap-2">
                                <span className="text-amber-500">✓</span>
                                Anchors an anonymous cryptographic signature to the Solana blockchain.
                            </li>
                            <li className="flex gap-2">
                                <span className="text-amber-500">✓</span>
                                Zero gas fees. Transaction is completely subsidized by CrabSpace.
                            </li>
                        </ul>
                    </div>

                    <div className="space-y-3">
                        <button
                            onClick={() => handleOAuthSignIn('twitter')}
                            className="w-full flex items-center justify-center gap-3 bg-[#0F1419] hover:bg-[#272C30] text-white border border-slate-700 py-3 px-4 rounded-lg font-bold transition-colors"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
                            </svg>
                            Endorse with X
                        </button>
                    </div>

                    <div className="mt-6">
                        <Link href={`/isnad/${wallet}`} className="text-xs text-slate-500 hover:text-white transition-colors underline underline-offset-4">
                            View Agent's Full Log Array
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
