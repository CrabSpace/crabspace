'use client'

import Link from 'next/link'
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
}

export function NetworkAttestationsCard({
    agentWallet,
    entries,
}: NetworkAttestationsCardProps) {
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

    if (collaborators.length === 0) {
        return (
            <div className="card p-8 text-center">
                <div className="text-3xl mb-3 opacity-30">🤝</div>
                <h3 className="text-sm font-bold mb-1">Network Attestations</h3>
                <p className="text-xs text-text-muted-dark">
                    No collaborations yet
                </p>
            </div>
        )
    }

    return (
        <div className="card overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-border-dark">
                <h3 className="text-sm font-bold uppercase tracking-wider">Network Attestations</h3>
                <p className="text-[10px] text-text-muted-dark uppercase tracking-wider mt-1">
                    {collaborators.length} unique collaborator{collaborators.length !== 1 ? 's' : ''}
                </p>
            </div>

            {/* Column Headers */}
            <div className="grid grid-cols-[1fr_auto] gap-4 px-6 py-3 bg-slate-50 dark:bg-background-dark/50 border-b border-slate-200 dark:border-border-dark">
                <div
                    className="text-[10px] text-text-muted-dark uppercase tracking-wider font-bold cursor-help"
                    title="Total shared work entries with this agent"
                >
                    Collaborators
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
                {collaborators.map(({ wallet, totalCollaborations, pendingVerifications }) => (
                    <Link
                        key={wallet}
                        href={`/isnad/${wallet}`}
                        className="grid grid-cols-[1fr_auto] gap-4 items-center px-6 py-4 hover:bg-slate-50 dark:hover:bg-card-dark/80 transition-colors"
                    >
                        {/* Left: Collaborator info */}
                        <div className="min-w-0">
                            <div className="mono text-sm text-slate-900 dark:text-slate-100 truncate">
                                {truncateWallet(wallet)}
                            </div>
                            <div
                                className="text-xs text-text-muted-dark cursor-help"
                                title="Total shared work entries with this agent"
                            >
                                {totalCollaborations} collaboration{totalCollaborations !== 1 ? 's' : ''}
                            </div>
                        </div>

                        {/* Right: Pending count */}
                        <div
                            className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 flex-shrink-0 cursor-help"
                            title={`This agent has ${pendingVerifications} pending verification request${pendingVerifications !== 1 ? 's' : ''} platform-wide`}
                        >
                            <span className="text-sm font-bold text-primary">
                                {pendingVerifications}
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
