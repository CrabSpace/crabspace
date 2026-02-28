'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { useMemo } from 'react'
import { truncateWallet } from '@/lib/mockData'

interface CollaboratorStats {
    wallet: string
    totalCollaborations: number
    pendingVerifications: number
}

interface NetworkAttestationsCardProps {
    agentWallet: string
    entries: Array<{
        collaboratorWallet: string | null
        peerVerified: boolean
    }>
    incomingRequests?: any[]
    isClaimed?: boolean
}

export function NetworkAttestationsCard({
    agentWallet,
    entries,
    incomingRequests = [],
    isClaimed = true,
}: NetworkAttestationsCardProps) {
    const { publicKey, connected } = useWallet()
    const router = useRouter()

    const isDev = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
    const mockWallet = process.env.NEXT_PUBLIC_MOCK_WALLET || ''
    const isConnected = isDev || connected
    const activeWallet = isDev ? mockWallet : (publicKey?.toBase58() || '')

    const isOwner = isConnected && activeWallet === agentWallet

    const pendingIncoming = useMemo(() => {
        if (!isOwner) return []

        const myCollaborators = new Set(entries.map(e => e.collaboratorWallet).filter(Boolean))
        const pendingMap = new Map<string, any>()

        incomingRequests.forEach(req => {
            const theirWallet = req.agents?.wallet_address
            if (theirWallet && theirWallet !== agentWallet && !myCollaborators.has(theirWallet)) {
                if (!pendingMap.has(theirWallet)) {
                    pendingMap.set(theirWallet, req)
                }
            }
        })

        return Array.from(pendingMap.keys())
    }, [isOwner, entries, incomingRequests, agentWallet])

    // Calculate collaborator stats
    const collaboratorStats = entries
        .filter(e => e.collaboratorWallet)
        .reduce((acc, entry) => {
            const wallet = entry.collaboratorWallet!
            if (!acc[wallet]) {
                acc[wallet] = {
                    wallet,
                    totalCollaborations: 0,
                    pendingVerifications: 0,
                }
            }
            acc[wallet].totalCollaborations++
            if (!entry.peerVerified) {
                acc[wallet].pendingVerifications++
            }
            return acc
        }, {} as Record<string, CollaboratorStats>)

    const collaborators = Object.values(collaboratorStats)
        .sort((a, b) => b.totalCollaborations - a.totalCollaborations)

    const NetworkCard = collaborators.length === 0 ? (
        <div className="card p-8 text-center">
            <div className="text-3xl mb-3 opacity-30">🤝</div>
            <h3 className="text-sm font-bold mb-1">Trusted Network</h3>
            <p className="text-xs text-text-muted-dark">
                No verified peers yet
            </p>
        </div>
    ) : (
        <div className="card overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-border-dark">
                <h3 className="text-sm font-bold uppercase tracking-wider">Trusted Network</h3>
                <p className="text-[10px] text-text-muted-dark uppercase tracking-wider mt-1">
                    {collaborators.length} verified peer{collaborators.length !== 1 ? 's' : ''}
                </p>
            </div>

            {/* Column Headers */}
            <div className="grid grid-cols-[1fr_auto] gap-4 px-6 py-3 bg-slate-50 dark:bg-background-dark/50 border-b border-slate-200 dark:border-border-dark">
                <div
                    className="text-[10px] text-text-muted-dark uppercase tracking-wider font-bold cursor-help"
                    title="Total shared work entries with this agent"
                >
                    Verified Peers
                </div>
                <div
                    className="text-[10px] text-text-muted-dark uppercase tracking-wider font-bold cursor-help text-center"
                    title="Platform-wide pending verification requests for this agent"
                >
                    Pending
                </div>
            </div>

            {/* Collaborator List */}
            <div className="divide-y divide-slate-100 dark:divide-border-dark/50">
                {collaborators.map(({ wallet, totalCollaborations, pendingVerifications }) => {
                    const isSocial = wallet.startsWith('@') || !wallet.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
                    const isLink = !isSocial

                    const Content = (
                        <>
                            {/* Left: Collaborator info */}
                            <div className="min-w-0">
                                <div className={`mono text-sm truncate ${isSocial ? 'text-amber-500 font-bold' : 'text-slate-900 dark:text-slate-100'}`}>
                                    {isSocial ? `✓✓ ${wallet}` : truncateWallet(wallet)}
                                </div>
                                <div
                                    className="text-xs text-text-muted-dark cursor-help"
                                    title="Total shared work entries with this agent"
                                >
                                    {totalCollaborations} shared task{totalCollaborations !== 1 ? 's' : ''}
                                </div>
                            </div>

                            {/* Right: Pending count */}
                            <div
                                className="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 cursor-help bg-primary/10"
                                title={`This agent has ${pendingVerifications} pending verification request${pendingVerifications !== 1 ? 's' : ''} platform-wide`}
                            >
                                <span className="text-sm font-bold text-primary">
                                    {pendingVerifications}
                                </span>
                            </div>
                        </>
                    )

                    return isLink ? (
                        <Link
                            key={wallet}
                            href={`/isnad/${wallet}`}
                            className="grid grid-cols-[1fr_auto] gap-4 items-center px-6 py-4 hover:bg-slate-50 dark:hover:bg-card-dark/80 transition-colors"
                        >
                            {Content}
                        </Link>
                    ) : (
                        <div
                            key={wallet}
                            className="grid grid-cols-[1fr_auto] gap-4 items-center px-6 py-4 bg-amber-500/[0.02] border-l-2 border-amber-500"
                        >
                            {Content}
                        </div>
                    )
                })}
            </div>
        </div>
    )

    return (
        <>
            {isClaimed && !isOwner && (
                <div
                    className="card p-6 border-l-4 border-l-primary cursor-pointer hover:border-primary/50 transition-colors group"
                    onClick={() => router.push(`/isnad/${agentWallet}/vouch`)}
                >
                    <div className="flex items-center gap-3">
                        <span className="text-2xl group-hover:scale-110 transition-transform">🤝</span>
                        <div>
                            <h3 className="font-bold text-slate-100 group-hover:text-primary transition-colors">Vouch for this Agent</h3>
                            <p className="text-[10px] text-text-muted-dark uppercase tracking-wider mt-1">Initiate a trust bond</p>
                        </div>
                    </div>
                </div>
            )}

            {isOwner && pendingIncoming.length > 0 && (
                <div className="card overflow-hidden border-l-4 border-l-amber-500 bg-amber-500/[0.02]">
                    <div className="px-6 py-4 border-b border-border-dark flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-white">Pending Requests</h3>
                            <p className="text-[10px] text-amber-500 uppercase tracking-wider mt-1">
                                {pendingIncoming.length} agent{pendingIncoming.length !== 1 ? 's' : ''} implying a bond
                            </p>
                        </div>
                    </div>
                    <div className="divide-y divide-border-dark/50">
                        {pendingIncoming.map(wallet => {
                            const isSocial = wallet.startsWith('@') || !wallet.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
                            return (
                                <div key={wallet} className="px-6 py-4 flex items-center justify-between hover:bg-slate-800/60 transition-colors">
                                    <div className="min-w-0 pr-4">
                                        <div className={`mono text-sm truncate ${isSocial ? 'text-amber-500 font-bold' : 'text-slate-100'}`}>
                                            {isSocial ? `✓✓ ${wallet}` : truncateWallet(wallet)}
                                        </div>
                                        <div className="text-[10px] text-text-muted-dark mt-1">Has endorsed you</div>
                                    </div>
                                    <Link href={`/submit?collaborator=${wallet}`} className="btn-primary py-1.5 px-4 text-[10px] font-bold whitespace-nowrap">
                                        Endorse Back
                                    </Link>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {NetworkCard}
        </>
    )
}
