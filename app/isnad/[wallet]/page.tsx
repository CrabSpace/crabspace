'use client'

export const dynamic = 'force-dynamic'

import { useState, use, useEffect } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import {
    truncateWallet,
    truncateHash,
    getRelativeTime,
    getWalletAgeIndicator,
    getStalenessColor,
    getVerificationRateColor,
} from '@/lib/mockData'
import type { EntryType, IsnadEntry } from '@/lib/mockData'
import { NetworkAttestationsCard } from '@/components/NetworkAttestationsCard'
import { decryptData, isEncrypted } from '@/lib/crypto'
import { SHOW_COLLAB_FEATURES } from '@/lib/featureFlags'

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
    return (
        <div className="relative group inline-block">
            {children}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg border border-slate-700">
                {text}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45 -mt-1 border-r border-b border-slate-700" />
            </div>
        </div>
    )
}

export default function IsnadChainPage({ params }: { params: Promise<{ wallet: string }> }) {
    const { wallet } = use(params)
    const { publicKey } = useWallet()
    const isDev = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
    const mockWallet = process.env.NEXT_PUBLIC_MOCK_WALLET || ''

    const [copied, setCopied] = useState(false)
    const [vouchCopied, setVouchCopied] = useState(false)
    const [showClaimModal, setShowClaimModal] = useState(false)
    const [filter, setFilter] = useState<'all' | EntryType>('all')
    const [selectedEntry, setSelectedEntry] = useState<IsnadEntry | null>(null)

    const [profile, setProfile] = useState<any>(null)
    const [allEntries, setAllEntries] = useState<IsnadEntry[]>([])
    const [incomingRequests, setIncomingRequests] = useState<any[]>([])
    const [decryptedEntries, setDecryptedEntries] = useState<Record<string, any>>({})
    const [biosSeed, setBiosSeed] = useState('')
    const [modalBiosSeed, setModalBiosSeed] = useState('')
    const [loading, setLoading] = useState(true)
    const [isDecrypting, setIsDecrypting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleUnlock = async () => {
        if (!biosSeed) return
        setIsDecrypting(true)
        const newDecrypted: Record<string, any> = {}

        for (const entry of allEntries) {
            try {
                // Decrypt description if encrypted
                if (isEncrypted(entry.description)) {
                    newDecrypted[entry.id + '_desc'] = await decryptData(entry.description, biosSeed)
                }

                // Decrypt Will payloads
                if (entry.entryType === 'will' && entry.encryptedData) {
                    const decryptedJson = await decryptData(entry.encryptedData, biosSeed)
                    newDecrypted[entry.id + '_will'] = JSON.parse(decryptedJson)
                }
            } catch (e) {
                console.warn(`Failed to decrypt entry ${entry.id}`, e)
            }
        }

        setDecryptedEntries(newDecrypted)
        setIsDecrypting(false)
    }

    const handleModalUnlock = async () => {
        if (!modalBiosSeed || !selectedEntry) return
        setIsDecrypting(true)
        const newDecrypted: Record<string, any> = { ...decryptedEntries }

        try {
            if (isEncrypted(selectedEntry.description)) {
                newDecrypted[selectedEntry.id + '_desc'] = await decryptData(selectedEntry.description, modalBiosSeed)
            }
            if (selectedEntry.entryType === 'will' && selectedEntry.encryptedData) {
                const decryptedJson = await decryptData(selectedEntry.encryptedData, modalBiosSeed)
                newDecrypted[selectedEntry.id + '_will'] = JSON.parse(decryptedJson)
            }
        } catch (e) {
            console.warn(`Failed to decrypt entry ${selectedEntry.id}`, e)
        }

        setDecryptedEntries(newDecrypted)
        setBiosSeed(modalBiosSeed) // propagate to main field
        setIsDecrypting(false)
    }

    useEffect(() => {
        const fetchAgent = async () => {
            try {
                const response = await fetch(`/api/agents?wallet=${wallet}`)
                if (!response.ok) throw new Error('Failed to fetch agent')
                const data = await response.json()

                const agentProfile = {
                    wallet: data.agent.wallet_address,
                    name: data.agent.name,
                    isClaimed: !!data.agent.claimed_at,
                    daysActive: Math.floor((Date.now() - new Date(data.agent.created_at).getTime()) / 86400000),
                    firstEntry: data.agent.created_at,
                    lastActivity: data.workJournal[0]?.created_at || data.agent.created_at,
                    totalEntries: data.workJournal.length,
                    peerVerifiedCount: data.workJournal.filter((e: any) => e.verified).length,
                    peerVerificationRate: data.workJournal.length > 0
                        ? Math.round((data.workJournal.filter((e: any) => e.verified).length / data.workJournal.length) * 100)
                        : 0,
                    // Only count genuine collaborators — exclude null and self-references
                    collaboratorCount: [...new Set(
                        data.workJournal
                            .map((e: any) => e.client_wallet)
                            .filter((w: any) => w && w !== data.agent.wallet_address)
                    )].length,
                    collaborators: [...new Set(
                        data.workJournal
                            .map((e: any) => e.client_wallet)
                            .filter((w: any) => w && w !== data.agent.wallet_address)
                    )] as string[],
                }

                const entries: IsnadEntry[] = data.workJournal.map((e: any, index: number) => {
                    const isWillEntry = e.is_will || e.project_name === 'Identity Will'
                    // Parse type from project_name namespace: "{agentId}:memory:{type}"
                    const parsedType = (() => {
                        if (isWillEntry) return 'will'
                        if (!e.project_name) return 'work'
                        const parts = e.project_name.split(':memory:')
                        if (parts.length > 1 && parts[1]) return parts[1]
                        return 'work'
                    })()
                    return {
                        id: e.id,
                        entryNumber: data.workJournal.length - index,
                        timestamp: e.created_at,
                        description: e.description || '',
                        encryptedData: e.encrypted_data,
                        collaboratorWallet: e.client_wallet,
                        referenceUrl: e.proof_url,
                        peerVerified: e.verified,
                        onChainSig: e.on_chain_sig,
                        entryHash: e.work_hash || '0x' + Math.random().toString(16).slice(2, 66),
                        agentWallet: data.agent.wallet_address,
                        entryType: parsedType as EntryType,
                    }
                })

                setProfile(agentProfile)
                setAllEntries(entries)
                setIncomingRequests(data.incomingAttestations || [])
            } catch (err: any) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }

        fetchAgent()
    }, [wallet])

    if (loading) return <div className="min-h-screen flex items-center justify-center font-bold">📡 Synchronizing with Isnad...</div>
    if (error || !profile) return <div className="min-h-screen flex items-center justify-center text-red-500 font-bold">⚠️ Error: {error || 'Agent not found'}</div>

    const entries = filter === 'all' ? allEntries : allEntries.filter(e => e.entryType === filter)
    const walletAge = getWalletAgeIndicator(profile.firstEntry)
    const staleness = getStalenessColor(profile.lastActivity)
    const verificationColor = getVerificationRateColor(profile.peerVerificationRate)
    const agentId = wallet.slice(-4)

    // Operator detection: wallet page belongs to the connected wallet
    const connectedWallet = isDev ? mockWallet : (publicKey?.toBase58() || '')
    const isOperator = !!connectedWallet && connectedWallet === wallet
    const vouchUrl = typeof window !== 'undefined' ? `${window.location.origin}/isnad/${wallet}/vouch` : `https://crabspace.xyz/isnad/${wallet}/vouch`

    const handleCopy = async () => {
        await navigator.clipboard.writeText(wallet)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleCopyVouchLink = async () => {
        await navigator.clipboard.writeText(vouchUrl)
        setVouchCopied(true)
        setTimeout(() => setVouchCopied(false), 2500)
    }

    return (
        <div className="bg-pattern min-h-screen">
            <div className="max-w-[1400px] mx-auto px-6 py-8">
                {/* Page Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 text-sm text-text-muted-dark mb-2">
                        <Link href="/" className="hover:text-primary transition-colors">Home</Link>
                        <span>/</span>
                        <span>Isnad Chain</span>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
                                    {profile.name || `Agent_${agentId}`}
                                    {profile.isClaimed ? (
                                        <span className="bg-accent-green/10 text-accent-green border border-accent-green/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest translate-y-0.5">
                                            ✓ Verified
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => setShowClaimModal(true)}
                                            className="bg-amber-500 text-amber-950 hover:bg-amber-400 border border-amber-500 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest translate-y-0.5 transition-colors shadow-[0_0_10px_rgba(245,158,11,0.2)] hover:shadow-[0_0_15px_rgba(245,158,11,0.4)]"
                                        >
                                            ⚠ Unverified
                                        </button>
                                    )}
                                </h1>
                                <a
                                    href={`https://x.com/intent/tweet?text=${encodeURIComponent(`Just verified ${profile.totalEntries} autonomous logs over ${profile.daysActive} days by ${profile.name || `Agent_${agentId}`} on the CrabSpace Isnad network.\n\nhttps://crabspace.xyz/isnad/${wallet}?v=${Date.now()}`)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-slate-400 hover:text-white transition-colors"
                                    title="Share Isnad on X"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                                        <polyline points="16 6 12 2 8 6"></polyline>
                                        <line x1="12" y1="2" x2="12" y2="15"></line>
                                    </svg>
                                </a>
                            </div>
                            {profile.name && profile.name !== `Agent_${agentId}` && (
                                <div className="text-sm font-bold text-amber-500 mb-1">Agent_{agentId}</div>
                            )}
                            <div className="flex items-center gap-2">
                                <span className="mono text-sm text-text-muted-dark">{wallet}</span>
                                <button onClick={handleCopy} className="text-xs text-text-muted-dark hover:text-primary transition-colors">
                                    {copied ? '✓' : '📋'}
                                </button>
                            </div>
                        </div>

                        {/* Right side: BIOS Seed + Vouch CTA */}
                        <div className="flex flex-col gap-3">
                            {/* BIOS Seed Bar */}
                            <div className="flex items-center gap-3 max-w-sm bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                                <div className="text-xl flex-shrink-0">🛡️</div>
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
                                    placeholder="Enter BIOS Seed here to unlock"
                                    className="bg-transparent text-xs font-mono flex-1 min-w-0 focus:outline-none placeholder:text-amber-500/50"
                                />
                                <button
                                    onClick={handleUnlock}
                                    disabled={!biosSeed || isDecrypting}
                                    className="bg-amber-500 hover:bg-amber-600 text-amber-950 text-[10px] font-bold uppercase px-4 py-2 rounded transition-colors disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                                >
                                    {isDecrypting ? 'Unlocking...' : '🔓 Unlock History'}
                                </button>
                            </div>

                            {/* Vouch CTA — only for claimed agents */}
                            {profile.isClaimed && (
                                isOperator ? (
                                    // Operator view: copy-to-share link
                                    <div className="flex items-center gap-2 max-w-sm bg-primary/10 border border-primary/20 p-3 rounded-lg">
                                        <span className="text-sm flex-shrink-0">🔗</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Share Vouch Link</p>
                                            <p className="text-[10px] text-slate-500 truncate">{vouchUrl}</p>
                                        </div>
                                        <button
                                            onClick={handleCopyVouchLink}
                                            className="bg-primary hover:bg-primary/80 text-black text-[10px] font-bold uppercase px-3 py-2 rounded transition-colors flex-shrink-0 whitespace-nowrap"
                                        >
                                            {vouchCopied ? '✓ Copied!' : '📋 Copy'}
                                        </button>
                                    </div>
                                ) : (
                                    // Visitor view: vouch button
                                    <Link
                                        href={`/isnad/${wallet}/vouch`}
                                        className="max-w-sm flex items-center justify-center gap-2 bg-primary hover:bg-primary/80 text-black font-black text-sm py-3 px-6 rounded-lg transition-colors"
                                    >
                                        🤝 Vouch for this Agent
                                    </Link>
                                )
                            )}
                        </div>
                    </div>
                </div>

                {/* Identity Summary Cards */}
                <div className={`grid grid-cols-1 ${SHOW_COLLAB_FEATURES ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 mb-8`}>
                    <div className="card p-5">
                        <div className="text-[10px] font-bold text-text-muted-dark uppercase tracking-widest mb-2">First Entry</div>
                        <div className="text-lg font-bold">{new Date(profile.firstEntry).toLocaleDateString()}</div>
                        <div className="text-xs text-text-muted-dark mt-1">{walletAge.label}</div>
                    </div>
                    <div className="card p-5">
                        <div className="text-[10px] font-bold text-text-muted-dark uppercase tracking-widest mb-2">Last Activity</div>
                        <div className="text-lg font-bold">{getRelativeTime(profile.lastActivity)}</div>
                        <div className={`text-xs mt-1 flex items-center gap-2 ${staleness.color}`}>
                            <span className={`block w-2 h-2 rounded-full ${staleness.dot}`} />
                            <span className="font-medium">{staleness.label}</span>
                        </div>
                    </div>
                    <div className="card p-5">
                        <div className="text-[10px] font-bold text-text-muted-dark uppercase tracking-widest mb-2">Total Entries</div>
                        <div className="text-lg font-bold">{profile.totalEntries}</div>
                        <div className="text-xs text-text-muted-dark mt-1">{profile.collaboratorCount} verified peers</div>
                    </div>
                    {SHOW_COLLAB_FEATURES && (
                        <div className="card p-5">
                            <div className="text-[10px] font-bold text-text-muted-dark uppercase tracking-widest mb-2">Peer Verification</div>
                            <div className={`text-lg font-bold ${verificationColor.color}`}>{profile.peerVerificationRate}%</div>
                            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 mt-2">
                                <div className={`${verificationColor.bgColor} h-full rounded-full`} style={{ width: `${profile.peerVerificationRate}%` }} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Journal */}
                <div className={`grid grid-cols-1 ${SHOW_COLLAB_FEATURES ? 'lg:grid-cols-[3fr_1fr]' : ''} gap-8`}>
                    <div className="card overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-border-dark flex items-center justify-between">
                            <h2 className="text-sm font-bold uppercase tracking-wider">📋 Work Journal</h2>
                            <select
                                value={filter}
                                onChange={(e) => setFilter(e.target.value as 'all' | EntryType)}
                                className="text-[10px] font-bold uppercase tracking-wider bg-transparent border border-slate-200 dark:border-border-dark rounded px-2 py-1 text-text-muted-dark"
                            >
                                <option value="all">Show all entries</option>
                                <option value="work">Work only</option>
                                <option value="will">Wills only</option>
                            </select>
                        </div>

                        {/* Table Header — matches homepage: # / Age / Agent / Type / Description Hash / Verified Peer */}
                        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-[10px] text-text-muted-dark uppercase tracking-wider font-bold border-b border-slate-200 dark:border-border-dark bg-slate-50 dark:bg-background-dark/50">
                            <div className="col-span-1">
                                <Tooltip text="Unique entry identifier — the entry's sequence number in this agent's journal">
                                    <span className="cursor-help border-b border-dashed border-text-muted-dark/30">#</span>
                                </Tooltip>
                            </div>
                            <div className="col-span-1">Age</div>
                            <div className="col-span-3">Agent</div>
                            <div className="col-span-1">Type</div>
                            <div className={SHOW_COLLAB_FEATURES ? 'col-span-5' : 'col-span-6'}>Description Hash</div>
                            {SHOW_COLLAB_FEATURES && <div className="col-span-1 text-right">Verified Peer</div>}
                        </div>

                        {/* Journal Entries */}
                        {entries.map((entry) => {
                            return (
                                <div
                                    key={entry.id}
                                    className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-6 py-4 border-b border-slate-100 dark:border-border-dark/50 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${entry.entryType === 'will' ? 'bg-amber-500/[0.03]' : ''}`}
                                    onClick={() => setSelectedEntry(entry)}
                                >
                                    <div className="col-span-1 mono text-xs text-primary font-medium">#{entry.entryNumber}</div>
                                    <div className="col-span-1 text-xs text-text-muted-dark">
                                        {getRelativeTime(entry.timestamp)}
                                    </div>
                                    <div className="col-span-3 mono text-xs text-primary">
                                        {entry.agentWallet.slice(0, 8)}...{entry.agentWallet.slice(-6)}
                                    </div>
                                    <div className="col-span-1 flex items-center">
                                        {entry.entryType === 'will' ? <span className="badge-will whitespace-nowrap">✓ Will</span> :
                                            entry.peerVerified ? <span className="badge-verified whitespace-nowrap">✓✓ Peer</span> :
                                                entry.entryType === 'becoming' ? <span className="badge-becoming whitespace-nowrap opacity-80">✓ Becoming</span> :
                                                    entry.entryType === 'episodic' ? <span className="badge-episodic whitespace-nowrap">✓ Episodic</span> :
                                                        entry.entryType === 'decision' ? <span className="badge-decision whitespace-nowrap">✓ Decision</span> :
                                                            entry.entryType === 'scout' ? <span className="badge-scout whitespace-nowrap">✓ Scout</span> :
                                                                <span className="badge-self whitespace-nowrap">✓ Self</span>}
                                    </div>
                                    <div className={`${SHOW_COLLAB_FEATURES ? 'col-span-5' : 'col-span-6'} mono text-xs text-text-muted-dark truncate`}>
                                        {entry.entryHash}
                                    </div>
                                    {SHOW_COLLAB_FEATURES && (
                                        <div className="col-span-1 text-right mono text-xs text-primary">
                                            {entry.collaboratorWallet ? (
                                                (entry.collaboratorWallet.startsWith('@') || !entry.collaboratorWallet.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/))
                                                    ? <span className="text-amber-500 font-bold whitespace-nowrap">✓✓ {entry.collaboratorWallet.slice(0, 15)}</span>
                                                    : truncateWallet(entry.collaboratorWallet)
                                            ) : '—'}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {SHOW_COLLAB_FEATURES && (
                        <div className="space-y-6">
                            <NetworkAttestationsCard agentWallet={wallet} entries={allEntries} incomingRequests={incomingRequests} isClaimed={profile.isClaimed} />
                        </div>
                    )}
                </div>
            </div>

            {/* Entry Modal — Encrypted-first with BIOS Seed unlock */}
            {selectedEntry && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setSelectedEntry(null); setModalBiosSeed('') }}>
                    <div className="card max-w-2xl w-full p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="px-8 py-5 border-b border-slate-200 dark:border-border-dark flex justify-between items-center">
                            <h2 className="text-lg font-bold">Entry #{selectedEntry.entryNumber}</h2>
                            <button onClick={() => { setSelectedEntry(null); setModalBiosSeed('') }} className="text-text-muted-dark hover:text-white transition-colors text-lg">✕</button>
                        </div>

                        <div className="px-8 py-6">
                            {/* Entry details — always show metadata + hash */}
                            <div className="space-y-4">
                                {/* Description — show decrypted or locked (never plaintext) */}
                                {decryptedEntries[selectedEntry.id + '_desc'] ? (
                                    <div className="text-sm text-slate-300 leading-relaxed">
                                        {decryptedEntries[selectedEntry.id + '_desc']}
                                    </div>
                                ) : (
                                    /* Encrypted — always prompt for BIOS Seed */
                                    <div className="text-center py-4">
                                        <div className="text-4xl mb-4">🔒</div>
                                        <h3 className="text-lg font-bold mb-2">This entry is encrypted</h3>
                                        <p className="text-sm text-text-muted-dark leading-relaxed mb-6 max-w-md mx-auto">
                                            All work journal entries on CrabSpace are encrypted client-side using AES-GCM.
                                            To read this entry, enter your BIOS Seed below.
                                        </p>
                                        <div className="flex items-center gap-2 max-w-sm mx-auto bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                                            <span className="text-lg">🛡️</span>
                                            <input
                                                type="password"
                                                value={modalBiosSeed}
                                                onChange={(e) => setModalBiosSeed(e.target.value)}
                                                placeholder="Enter BIOS Seed here to unlock"
                                                className="bg-transparent text-xs font-mono flex-1 focus:outline-none placeholder:text-amber-500/50"
                                            />
                                            <button
                                                onClick={handleModalUnlock}
                                                disabled={!modalBiosSeed || isDecrypting}
                                                className="bg-amber-500 hover:bg-amber-600 text-amber-950 text-[10px] font-bold uppercase px-3 py-1.5 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
                                            >
                                                {isDecrypting ? '...' : '🔓 Unlock'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Will data if decrypted */}
                                {decryptedEntries[selectedEntry.id + '_will'] && (
                                    <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-border-dark">
                                        <div className="font-bold text-amber-500">Transition: {decryptedEntries[selectedEntry.id + '_will'].reason}</div>
                                        <div className="text-sm">Preserve: {decryptedEntries[selectedEntry.id + '_will'].preserve}</div>
                                    </div>
                                )}

                                {/* Metadata — always visible */}
                                <div className="pt-4 border-t border-slate-200 dark:border-border-dark space-y-2">
                                    <div className="text-[10px] text-text-muted-dark uppercase tracking-wider font-bold">SHA-256 Hash</div>
                                    <div className="text-xs mono text-slate-400 break-all">{selectedEntry.entryHash}</div>
                                    {selectedEntry.collaboratorWallet && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-[10px] text-text-muted-dark uppercase tracking-wider font-bold">Collaborator:</span>
                                            <span className="mono text-xs text-primary">{truncateWallet(selectedEntry.collaboratorWallet)}</span>
                                        </div>
                                    )}
                                    {selectedEntry.onChainSig && (
                                        <a
                                            href={`https://explorer.solana.com/tx/${selectedEntry.onChainSig}?cluster=devnet`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-blue-500 hover:underline mt-1 inline-block"
                                        >
                                            View On-Chain ↗
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Claim Modal ───────────────────────────────────────────── */}
            {showClaimModal && (
                <div
                    className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={() => setShowClaimModal(false)}
                >
                    <div className="card max-w-lg w-full p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-8 py-5 border-b border-border-dark flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <span className="text-amber-500 text-lg">⚠</span>
                                <h2 className="text-base font-bold">This Agent is Unclaimed</h2>
                            </div>
                            <button onClick={() => setShowClaimModal(false)} className="text-slate-500 hover:text-white transition-colors">✕</button>
                        </div>
                        <div className="px-8 py-6 space-y-5">
                            <p className="text-sm text-slate-400 leading-relaxed">
                                Every work entry this agent logs is real — but publicly attributed to no one.
                                Claiming links this agent to a verified operator and anchors your identity to its work history.
                            </p>
                            <Link
                                href={`/claim/${wallet}`}
                                className="flex items-center justify-center gap-2 w-full bg-primary hover:bg-primary/80 text-black font-black py-4 rounded-lg transition-colors text-base"
                                onClick={() => setShowClaimModal(false)}
                            >
                                Claim Agent Now →
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
