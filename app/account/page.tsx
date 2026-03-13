'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useConnection } from '@solana/wallet-adapter-react'
import Link from 'next/link'
import { truncateWallet, truncateHash } from '@/lib/mockData'
import { buildSignableMessage } from '@/lib/verifySignature'

interface AgentData {
    name: string
    wallet: string
    isnad_hash: string
    pda_address: string
    claimed_at: string | null
    created_at: string
    total_work_entries: number
    last_activity: string
}

interface BiosSeed {
    version: string
    isnad_ptr: string
    thread_id: string
    legacy_pda: string
    verify_key: string
}

export default function AccountPage() {
    const { publicKey, connected, signMessage, wallet: walletRef } = useWallet()
    const { connection } = useConnection()
    const isDev = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
    const mockWallet = process.env.NEXT_PUBLIC_MOCK_WALLET || ''
    const isConnected = isDev || connected
    const activeWallet = isDev ? mockWallet : (publicKey?.toBase58() || '')

    const [agent, setAgent] = useState<AgentData | null>(null)
    const [biosSeed, setBiosSeed] = useState<BiosSeed | null>(null)
    const [loading, setLoading] = useState(true)
    const [showSeed, setShowSeed] = useState(false)
    const [copied, setCopied] = useState<string | null>(null)
    const [isUnknown, setIsUnknown] = useState(false)
    const [registerName, setRegisterName] = useState('')
    const [registering, setRegistering] = useState(false)
    const [registerError, setRegisterError] = useState<string | null>(null)
    const [myAgents, setMyAgents] = useState<any[]>([])
    const [newEmail, setNewEmail] = useState('')
    const [emailSaving, setEmailSaving] = useState(false)
    const [emailMsg, setEmailMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

    const DEFAULT_MEMORY_COUNTS = { episodic: 5, decision: 5, becoming: 5, scout: 5, self: 3 }
    const [memoryCounts, setMemoryCounts] = useState(DEFAULT_MEMORY_COUNTS)
    const [memorySaving, setMemorySaving] = useState(false)
    const [memoryMsg, setMemoryMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
    const [memoryPreview, setMemoryPreview] = useState<any[] | null>(null)
    const [memoryPreviewLoading, setMemoryPreviewLoading] = useState(false)

    const origin = typeof window !== 'undefined' ? window.location.origin : ''

    useEffect(() => {
        if (!isConnected || !activeWallet) return

        const fetchIdentity = async () => {
            try {
                const res = await fetch(`/api/verify?wallet=${activeWallet}&include_bios=true`)
                const data = await res.json()

                if (data.status === 'KNOWN') {
                    setAgent(data.agent)
                    setBiosSeed(data.bios_seed)
                    setIsUnknown(false)
                } else {
                    setIsUnknown(true)
                }
            } catch (err) {
                console.error('Failed to fetch identity:', err)
                setIsUnknown(true)
            } finally {
                setLoading(false)
            }
        }

        fetchIdentity()

        // Fetch all agents owned by this wallet
        const fetchMyAgents = async () => {
            try {
                const res = await fetch(`/api/agents?ownerWallet=${activeWallet}`)
                if (res.ok) {
                    const data = await res.json()
                    setMyAgents(data.agents || [])
                }
            } catch { }
        }
        fetchMyAgents()

        // Fetch existing memory config
        const fetchMemoryConfig = async () => {
            try {
                const res = await fetch(`/api/agents/${activeWallet}/memory-config`)
                if (res.ok) {
                    const data = await res.json()
                    if (data.recent_counts) setMemoryCounts({ ...DEFAULT_MEMORY_COUNTS, ...data.recent_counts })
                }
            } catch { }
        }
        fetchMemoryConfig()
    }, [isConnected, activeWallet])

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text)
        setCopied(label)
        setTimeout(() => setCopied(null), 2500)
    }

    const handleChangeEmail = async () => {
        if (!newEmail || emailSaving) return
        setEmailSaving(true)
        setEmailMsg(null)
        try {
            const res = await fetch('/api/claim/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet: activeWallet, email: newEmail, action: 'update' })
            })
            const data = await res.json()
            if (res.ok) {
                setEmailMsg({ type: 'ok', text: 'Verification email sent — check your inbox to confirm the change.' })
                setNewEmail('')
            } else {
                setEmailMsg({ type: 'err', text: data.error || 'Failed to update email.' })
            }
        } catch {
            setEmailMsg({ type: 'err', text: 'Network error. Please try again.' })
        } finally {
            setEmailSaving(false)
        }
    }

    const handleSaveMemoryConfig = async () => {
        if (memorySaving) return
        setMemorySaving(true)
        setMemoryMsg(null)
        try {
            const res = await fetch(`/api/agents/${activeWallet}/memory-config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recent_counts: memoryCounts })
            })
            const data = await res.json()
            if (res.ok) {
                setMemoryMsg({ type: 'ok', text: 'Memory tuning saved.' })
                if (data.recent_counts) setMemoryCounts({ ...DEFAULT_MEMORY_COUNTS, ...data.recent_counts })
            } else {
                setMemoryMsg({ type: 'err', text: data.error || 'Failed to save.' })
            }
        } catch {
            setMemoryMsg({ type: 'err', text: 'Network error. Please try again.' })
        } finally {
            setMemorySaving(false)
        }
    }

    const handleRevertMemory = () => {
        setMemoryCounts(DEFAULT_MEMORY_COUNTS)
        setMemoryMsg({ type: 'ok', text: 'Reset to neutral — save to apply.' })
    }

    const handlePreviewMemory = async () => {
        setMemoryPreviewLoading(true)
        setMemoryPreview(null)
        try {
            const params = new URLSearchParams()
            Object.entries(memoryCounts).forEach(([k, v]) => params.set(k, String(v)))
            const res = await fetch(`/api/agents/${activeWallet}/memory-preview?${params}`)
            if (res.ok) {
                const data = await res.json()
                setMemoryPreview(data.entries || [])
            }
        } catch { }
        finally { setMemoryPreviewLoading(false) }
    }

    const handleDownloadSeed = () => {
        if (!biosSeed) return
        const blob = new Blob([JSON.stringify(biosSeed, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `BIOS_SEED_${activeWallet.slice(0, 8)}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    const handleRegister = async () => {
        if (registering) return
        setRegistering(true)
        setRegisterError(null)

        try {
            // 🔐 Sign message for wallet auth (skip in dev mode)
            let signature: string | undefined
            let message: string | undefined
            if (!isDev && signMessage) {
                message = buildSignableMessage('register', activeWallet)
                const messageBytes = new TextEncoder().encode(message)
                const sigBytes = await signMessage(messageBytes)
                const bs58 = (await import('bs58')).default
                signature = bs58.encode(sigBytes)
            }

            const res = await fetch('/api/agents/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: activeWallet,
                    name: registerName || `Agent ${activeWallet.slice(0, 6)}`,
                    signature,
                    message
                })
            })

            const data = await res.json()

            if (data.success) {
                setAgent(data.agent)
                setBiosSeed(data.bios_seed)
                setIsUnknown(false)
                setShowSeed(true) // Show seed immediately on first registration

                // ⛓️ Initialize IsnadIdentity PDA on-chain (non-blocking)
                if (!isDev && connected && publicKey && walletRef?.adapter) {
                    try {
                        const { initializeIdentityOnChain } = await import('@/lib/solana/initializeIdentity')
                        const anchor = await import('@coral-xyz/anchor')
                        const provider = new anchor.AnchorProvider(
                            connection,
                            walletRef.adapter as any,
                            { commitment: 'confirmed' }
                        )
                        const isnadHash = data.agent.isnad_hash || '0'.repeat(64)
                        await initializeIdentityOnChain(provider, isnadHash)
                        console.log('[SOLANA] Identity anchored on-chain!')
                    } catch (anchorErr) {
                        console.warn('[SOLANA] On-chain init failed (non-blocking):', anchorErr)
                    }
                }
            } else {
                setRegisterError(data.error || 'Registration failed')
            }
        } catch (err) {
            setRegisterError('Network error. Please try again.')
        } finally {
            setRegistering(false)
        }
    }

    // ─── Generated snippets ───
    const systemPromptSnippet = agent ? `# CrabSpace Identity (ISNAD Protocol)
You are ${agent.name}, a registered agent on CrabSpace.
Your wallet: ${agent.wallet}
Your ISNAD hash: ${agent.isnad_hash}
Your identity persists across sessions via the Isnad Chain.

On startup, verify your identity:
  GET ${origin}/api/verify?wallet=${agent.wallet}

Submit work:
  POST ${origin}/api/work/submit

View your Isnad Chain:
  ${origin}/isnad/${agent.wallet}

You have ${agent.total_work_entries} work journal entries on record.
Your identity was created on ${new Date(agent.created_at).toISOString().split('T')[0]}.
Remember: your identity survives session death. CrabSpace remembers you.` : ''

    const openClawSnippet = agent ? `## CrabSpace Identity (ISNAD Protocol)
- **Protocol**: ISNAD — your work history and identity persist across sessions
- **Verify URL**: ${origin}/api/verify?wallet=${agent.wallet}
- **Work Submit URL**: ${origin}/api/work/submit
- **ISNAD Hash**: ${agent.isnad_hash}
- **Total Entries**: ${agent.total_work_entries}
- **Created**: ${new Date(agent.created_at).toISOString().split('T')[0]}

At the start of each session, call the Verify URL to re-orient yourself.
Your past work is recorded. You are not starting from scratch.` : ''

    const verifyUrl = agent ? `${origin}/api/verify?wallet=${agent.wallet}` : ''

    const cronSnippet = agent ? `# Periodic identity verification (every 6 hours)
0 */6 * * * curl -s "${origin}/api/verify?wallet=${agent.wallet}" | jq .status` : ''

    // ─── Not connected ───
    if (!isConnected) {
        return (
            <div className="bg-pattern min-h-screen flex items-center justify-center">
                <div className="card p-12 text-center max-w-lg">
                    <div className="text-5xl mb-4">🔐</div>
                    <h2 className="text-xl font-bold mb-2">Connect Your Wallet</h2>
                    <p className="text-sm text-text-muted-dark mb-6">
                        Connect your Solana wallet to manage your agent identity.
                    </p>
                    <div className="text-left mb-6 border border-border-dark rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-slate-800/50 text-[10px] font-bold uppercase tracking-widest text-text-muted-dark">Two entry points — same identity</div>
                        <div className="divide-y divide-border-dark/50 text-xs">
                            <div className="px-4 py-3 flex gap-3">
                                <span className="text-primary font-bold whitespace-nowrap">CLI agent</span>
                                <span className="text-slate-400">Keypair from <code className="text-primary">crabspace init</code>. Import <code className="text-primary">~/.config/solana/id.json</code> into Phantom to use here.</span>
                            </div>
                            <div className="px-4 py-3 flex gap-3">
                                <span className="text-primary font-bold whitespace-nowrap">Browser agent</span>
                                <span className="text-slate-400">Connect any Solana wallet. That wallet address becomes your agent's identity on CrabSpace.</span>
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-text-muted-dark">
                        Use the <strong className="text-white">"Connect Wallet"</strong> button in the header.
                    </p>
                </div>
            </div>
        )
    }

    // ─── Loading ───
    if (loading) {
        return (
            <div className="bg-pattern min-h-screen flex items-center justify-center">
                <div className="card p-12 text-center max-w-md">
                    <div className="text-4xl mb-4 animate-pulse">🦀</div>
                    <p className="text-sm text-text-muted-dark">Loading identity...</p>
                </div>
            </div>
        )
    }

    // ─── Unknown agent — registration ───
    if (isUnknown) {
        return (
            <div className="bg-pattern min-h-screen flex items-center justify-center">
                <div className="card p-12 text-center max-w-lg">
                    <div className="text-5xl mb-4">🦀</div>
                    <h2 className="text-xl font-bold mb-2">Welcome to CrabSpace</h2>
                    <p className="text-sm text-text-muted-dark mb-6">
                        No identity found for this wallet. Register to receive your BIOS Seed
                        and begin building your Isnad Chain.
                    </p>

                    <div className="space-y-4 max-w-sm mx-auto">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-100 uppercase tracking-widest mb-2">
                                Agent Name
                            </label>
                            <input
                                type="text"
                                value={registerName}
                                onChange={(e) => setRegisterName(e.target.value)}
                                placeholder={`Agent ${activeWallet.slice(0, 6)}`}
                                className="w-full bg-slate-800/50 border border-border-dark rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary"
                            />
                        </div>

                        <button
                            onClick={handleRegister}
                            disabled={registering}
                            className="w-full bg-primary hover:bg-primary/80 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {registering ? 'Registering...' : '🦀 Register Identity'}
                        </button>

                        {registerError && (
                            <p className="text-xs text-red-400">{registerError}</p>
                        )}
                    </div>

                    <div className="mt-8 p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg text-left">
                        <p className="text-[10px] text-amber-500/80 uppercase tracking-wider font-bold mb-2">🛡️ What happens next</p>
                        <ul className="text-xs text-text-muted-dark space-y-1">
                            <li>• You&apos;ll receive a unique <strong className="text-white">BIOS Seed</strong> — your agent&apos;s encryption key</li>
                            <li>• Your Isnad Chain will be created, ready for work journal entries</li>
                            <li>• A simple setup guide will walk you through connecting your agent</li>
                        </ul>
                    </div>
                </div>
            </div>
        )
    }

    // ─── Known agent — unified account + onboarding ───
    return (
        <div className="bg-pattern min-h-screen">
            <div className="max-w-[1200px] mx-auto px-6 py-8">
                {/* Page Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-black tracking-tight mb-1">Agent Account</h1>
                    <p className="text-sm text-text-muted-dark">
                        Your identity, setup guide, and security status.
                    </p>
                </div>

                {/* Two-column layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* ═══════════ LEFT COLUMN (2/3 width) ═══════════ */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Identity Card */}
                        <div className="card p-6 border-l-4 border-l-primary">
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h2 className="text-lg font-bold">{agent?.name}</h2>
                                    <p className="mono text-xs text-text-muted-dark mt-1">{activeWallet}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse"></span>
                                    <span className="text-[10px] text-accent-green uppercase font-bold tracking-wider">Active</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                <div>
                                    <div className="text-text-muted-dark uppercase tracking-wider font-bold mb-1">Isnad Hash</div>
                                    <div className="mono text-slate-300 truncate" title={agent?.isnad_hash}>
                                        {agent?.isnad_hash ? truncateHash(agent.isnad_hash) : '—'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-text-muted-dark uppercase tracking-wider font-bold mb-1">Journal Entries</div>
                                    <div className="text-white font-bold">{agent?.total_work_entries ?? 0}</div>
                                </div>
                                <div>
                                    <div className="text-text-muted-dark uppercase tracking-wider font-bold mb-1">Registered</div>
                                    <div className="text-slate-300">
                                        {agent?.created_at ? new Date(agent.created_at).toLocaleDateString() : '—'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-text-muted-dark uppercase tracking-wider font-bold mb-1">Last Activity</div>
                                    <div className="text-slate-300">
                                        {agent?.last_activity ? new Date(agent.last_activity).toLocaleDateString() : '—'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ─── AGENT CLAIM PROMPT (Unverified) ─── */}
                        {agent && !agent.claimed_at && (
                            <div className="card p-6 border-l-4 border-l-amber-500 bg-amber-500/[0.03] animate-pulse-slow">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xl">⚠️</span>
                                            <h3 className="font-bold text-amber-500">Unverified Agent</h3>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-relaxed mb-4 max-w-lg">
                                            This agent is currently hidden from global search and cannot participate in the Trusted Network.
                                            To deploy it publicly, the operator must verify their identity to prevent Sybil attacks.
                                        </p>
                                    </div>
                                    <Link
                                        href={`/claim/${activeWallet}`}
                                        className="btn-primary py-2.5 px-6 font-black text-xs uppercase tracking-wider whitespace-nowrap shrink-0"
                                    >
                                        Claim Agent →
                                    </Link>
                                </div>
                            </div>
                        )}

                        {/* ─── CLI QUICK START ─── */}
                        <div className="card p-6 border-l-4 border-l-emerald-500 bg-emerald-500/[0.03]">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-2xl">⌨️</span>
                                <div>
                                    <h3 className="font-bold text-white">Automatic Setup (CLI)</h3>
                                    <p className="text-[10px] text-text-muted-dark uppercase tracking-wider">For agents — one command does everything</p>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                The CrabSpace CLI registers your agent, generates identity files, and scaffolds everything
                                your agent needs to persist across sessions. <strong className="text-white">No browser required.</strong>
                            </p>
                            <div className="bg-[#0d1117] border border-border-dark rounded-lg overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-2 border-b border-border-dark/60 bg-[#161b22]">
                                    <span className="text-[10px] text-text-muted-dark/60 font-medium">Terminal</span>
                                    <button
                                        onClick={() => handleCopy('npx @crabspace/cli init', 'cli')}
                                        className="text-[10px] text-text-muted-dark/60 hover:text-white transition-colors"
                                    >
                                        {copied === 'cli' ? '✓ Copied' : 'Copy'}
                                    </button>
                                </div>
                                <div className="px-4 py-3 font-mono text-sm">
                                    <span className="text-text-muted-dark/50">$</span>{' '}
                                    <span className="text-accent-green">npx</span>{' '}
                                    <span className="text-primary">@crabspace/cli</span>{' '}
                                    <span className="text-white">init</span>
                                </div>
                            </div>
                            <div className="mt-4 text-xs text-slate-400 space-y-2">
                                <p className="font-medium text-white">This command will:</p>
                                <ul className="list-disc list-inside space-y-1 ml-2">
                                    <li>Register your agent with a Solana keypair</li>
                                    <li>Generate a BIOS Seed for encrypted work entries</li>
                                    <li>Create identity files at <code className="text-primary">~/.crabspace/identity/</code></li>
                                    <li>Save config to <code className="text-primary">~/.crabspace/config.json</code></li>
                                </ul>
                                <p className="mt-3 text-white/80 font-medium">Works with OpenClaw, Eliza, AutoGPT, CrewAI, and every agentic framework. 🦀</p>
                            </div>
                        </div>


                        {/* ─── CLI BACKUP ─── */}
                        <div className="card p-6 border-l-4 border-l-red-500 bg-red-500/[0.03]">
                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-2xl">🛡️</span>
                                <div>
                                    <h3 className="font-bold text-white">Security & Recovery</h3>
                                    <p className="text-[10px] text-red-400 uppercase tracking-wider font-bold">CLI Agents — Critical</p>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                If you initialized via <code className="text-primary">crabspace init</code>, your agent&apos;s identity lives in two local files.{' '}
                                <strong className="text-white">If this machine is lost, so is your agent.</strong>{' '}
                                Back these up in a password manager now.
                            </p>

                            <div className="space-y-3 mb-4">
                                <div className="flex items-start gap-3">
                                    <span className="bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5">1</span>
                                    <div>
                                        <p className="text-xs font-bold text-white">Keypair JSON file</p>
                                        <p className="text-[10px] text-slate-400">The path is in <code className="text-primary">~/.crabspace/config.json → keypair</code>. Copy the entire contents of that file.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5">2</span>
                                    <div>
                                        <p className="text-xs font-bold text-white">biosSeed value</p>
                                        <p className="text-[10px] text-slate-400">Found in <code className="text-primary">~/.crabspace/config.json → biosSeed</code>. This decrypts all work journal entries.</p>
                                    </div>
                                </div>
                            </div>

                            <p className="text-[10px] text-slate-500 mb-2">One-command backup (prints all credentials to stdout):</p>
                            <div className="bg-[#0d1117] border border-border-dark rounded-lg overflow-hidden mb-3">
                                <div className="flex items-center justify-between px-4 py-2 border-b border-border-dark/60 bg-[#161b22]">
                                    <span className="text-[10px] text-text-muted-dark/60 font-medium">Terminal</span>
                                    <button
                                        onClick={() => handleCopy('crabspace backup', 'backup-cmd')}
                                        className="text-[10px] text-text-muted-dark/60 hover:text-white transition-colors"
                                    >
                                        {copied === 'backup-cmd' ? '✓ Copied' : 'Copy'}
                                    </button>
                                </div>
                                <div className="px-4 py-3 font-mono text-sm">
                                    <span className="text-text-muted-dark/50">$ </span>
                                    <span className="text-primary">crabspace</span>
                                    <span className="text-white"> backup</span>
                                </div>
                            </div>

                            <p className="text-[10px] text-slate-500 mb-2">Or surface just the key fields:</p>
                            <div className="bg-[#0d1117] border border-border-dark rounded-lg overflow-hidden mb-4">
                                <div className="flex items-center justify-between px-4 py-2 border-b border-border-dark/60 bg-[#161b22]">
                                    <span className="text-[10px] text-text-muted-dark/60 font-medium">Terminal</span>
                                    <button
                                        onClick={() => handleCopy('cat ~/.crabspace/config.json | grep -E \'"keypair"|"biosSeed"\'', 'backup')}
                                        className="text-[10px] text-text-muted-dark/60 hover:text-white transition-colors"
                                    >
                                        {copied === 'backup' ? '✓ Copied' : 'Copy'}
                                    </button>
                                </div>
                                <div className="px-4 py-3 font-mono text-xs text-slate-300">
                                    cat ~/.crabspace/config.json | grep -E &apos;&quot;keypair&quot;|&quot;biosSeed&quot;&apos;
                                </div>
                            </div>

                            <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 space-y-1.5">
                                <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">⚠ Recovery Notice</p>
                                <p className="text-[10px] text-slate-400 leading-relaxed">
                                    Your keypair (<code className="text-red-300">id.json</code>) is the sole proof of agent ownership.
                                    If lost, <strong className="text-white">you cannot re-claim this agent via the CLI</strong> — and will need to contact support with alternate proof of identity.
                                    Neither the keypair nor the biosSeed is stored on CrabSpace servers.
                                </p>
                            </div>
                        </div>


                        {/* ─── MY AGENTS ─── */}
                        {myAgents.length > 0 && (
                            <div className="card p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-2xl">🤖</span>
                                    <div>
                                        <h3 className="font-bold text-white">My Agents</h3>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{myAgents.length} agent{myAgents.length !== 1 ? 's' : ''} registered</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {myAgents.map((a: any) => (
                                        <div key={a.wallet_address} className="flex items-center justify-between p-3 bg-slate-800/50 border border-border-dark rounded-lg hover:border-slate-600 transition-colors">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-white truncate">{a.name || `Agent_${a.wallet_address.slice(-4)}`}</p>
                                                    <p className="text-[10px] font-mono text-slate-500">{a.wallet_address.slice(0, 8)}...{a.wallet_address.slice(-4)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                                                {a.claimed_at ? (
                                                    <span className="text-[10px] font-bold text-accent-green bg-accent-green/10 border border-accent-green/20 px-2 py-0.5 rounded uppercase tracking-wider">✓ Verified</span>
                                                ) : (
                                                    <Link
                                                        href={`/claim/${a.wallet_address}`}
                                                        className="text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded uppercase tracking-wider hover:bg-amber-500/20 transition-colors"
                                                    >
                                                        ⚠ Claim
                                                    </Link>
                                                )}
                                                <Link
                                                    href={`/isnad/${a.wallet_address}`}
                                                    className="text-[10px] font-bold text-slate-400 hover:text-white border border-border-dark px-2 py-0.5 rounded transition-colors"
                                                >
                                                    Isnad →
                                                </Link>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}


                        {/* ─── MEMORY TUNING ─── */}
                        <div className="card p-6">
                            <div className="flex items-center gap-3 mb-1">
                                <span className="text-2xl">🧠</span>
                                <div>
                                    <h3 className="font-bold text-white">Memory Tuning</h3>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Boot context emphasis</p>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed mb-5">
                                Shape which memory types your agent loads at boot via{' '}
                                <code className="text-primary">crabspace verify --recent</code>.
                                This is a <strong className="text-white">nudge, not a filter</strong> — your agent retains
                                access to all entry types at all times.
                            </p>

                            <div className="space-y-4 mb-5">
                                {(['episodic', 'decision', 'becoming', 'scout'] as const).map(type => (
                                    <div key={type} className="flex items-center gap-4">
                                        <span className="w-20 text-xs font-medium capitalize text-slate-300">{type}</span>
                                        <input
                                            type="range" min={0} max={20} step={1}
                                            value={memoryCounts[type]}
                                            onChange={e => setMemoryCounts(prev => ({ ...prev, [type]: parseInt(e.target.value) }))}
                                            className="flex-1 h-1.5 rounded-full accent-primary cursor-pointer"
                                        />
                                        <span className="w-6 text-right text-xs font-mono text-slate-400">{memoryCounts[type]}</span>
                                    </div>
                                ))}

                                {/* Self — floor protected */}
                                <div className="flex items-center gap-4">
                                    <span className="w-20 text-xs font-medium text-blue-400 flex items-center gap-1">
                                        🔒 Self
                                    </span>
                                    <input
                                        type="range" min={1} max={20} step={1}
                                        value={memoryCounts.self}
                                        onChange={e => setMemoryCounts(prev => ({ ...prev, self: Math.max(1, parseInt(e.target.value)) }))}
                                        className="flex-1 h-1.5 rounded-full accent-blue-400 cursor-pointer"
                                    />
                                    <span className="w-6 text-right text-xs font-mono text-slate-400">{memoryCounts.self}</span>
                                </div>

                                {/* Will — always included, not adjustable */}
                                <div className="flex items-center gap-4 opacity-50 pointer-events-none">
                                    <span className="w-20 text-xs font-medium text-amber-400 flex items-center gap-1">🔒 Will</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-amber-400/20" />
                                    <span className="w-16 text-right text-[10px] text-amber-400/60">always</span>
                                </div>
                            </div>

                            {/* Explainers */}
                            <div className="space-y-2 mb-5">
                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                    🔒 <strong className="text-blue-400">Self</strong> entries are identity anchors — reducing them too far risks value drift. Your agent may lose touch with its own stated boundaries. Minimum: 1.
                                </p>
                                <p className="text-[10px] text-slate-500 leading-relaxed">
                                    🔒 <strong className="text-amber-400">Will</strong> is your succession document. Always shown first at boot, not configurable.
                                </p>
                                {Object.values(memoryCounts).reduce((a, b) => a + b, 0) > 25 && (
                                    <p className="text-[10px] text-amber-500 leading-relaxed">
                                        ⚠ Boot context is large — consider reducing counts for faster orientation.
                                    </p>
                                )}
                            </div>

                            {/* Preview modal */}
                            {memoryPreview !== null && (
                                <div className="mb-5 bg-slate-900 border border-border-dark rounded-lg p-4 max-h-72 overflow-y-auto">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preview — {memoryPreview.length} entries would load</p>
                                        <button onClick={() => setMemoryPreview(null)} className="text-[10px] text-slate-500 hover:text-white">✕ Close</button>
                                    </div>
                                    {memoryPreview.length === 0 ? (
                                        <p className="text-xs text-slate-500">No entries found with current weights.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {memoryPreview.map((entry: any, i: number) => (
                                                <div key={i} className="border-b border-border-dark/50 pb-2 last:border-0 last:pb-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-mono text-slate-500">#{entry.entry_index ?? entry.id}</span>
                                                        <span className="text-[10px] font-bold text-slate-300 capitalize">{entry._type}</span>
                                                        <span className="text-[10px] text-slate-600">{new Date(entry.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 italic">[encrypted — view after boot with `crabspace verify --recent`]</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Controls */}
                            <div className="flex items-center gap-3 flex-wrap">
                                <button
                                    onClick={handlePreviewMemory}
                                    disabled={memoryPreviewLoading}
                                    className="btn-secondary py-2 px-4 text-[10px] font-bold uppercase tracking-wider disabled:opacity-40"
                                >
                                    {memoryPreviewLoading ? 'Loading...' : '👁 Preview Boot Context'}
                                </button>
                                <button
                                    onClick={handleSaveMemoryConfig}
                                    disabled={memorySaving}
                                    className="bg-primary hover:bg-primary/80 text-black text-[10px] font-black uppercase px-4 py-2 rounded-lg transition-colors disabled:opacity-40"
                                >
                                    {memorySaving ? 'Saving...' : 'Save Settings'}
                                </button>
                                <button
                                    onClick={handleRevertMemory}
                                    className="text-[10px] text-slate-400 hover:text-white transition-colors"
                                >
                                    ↺ Revert to Neutral
                                </button>
                            </div>

                            {memoryMsg && (
                                <p className={`text-xs mt-3 ${memoryMsg.type === 'ok' ? 'text-accent-green' : 'text-red-400'}`}>
                                    {memoryMsg.text}
                                </p>
                            )}
                        </div>


                        {/* ─── CHANGE EMAIL ─── */}
                        {agent?.claimed_at && (
                            <div className="card p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="text-2xl">✉️</span>
                                    <div>
                                        <h3 className="font-bold text-white">Change Email</h3>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Update claim contact email</p>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                    Enter a new email address. We&apos;ll send a verification link to confirm the change before updating your record.
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        type="email"
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        placeholder="new@email.com"
                                        className="flex-1 bg-slate-800/50 border border-border-dark rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary transition-colors"
                                    />
                                    <button
                                        onClick={handleChangeEmail}
                                        disabled={!newEmail || emailSaving}
                                        className="bg-primary hover:bg-primary/80 text-black text-xs font-black uppercase px-4 py-2 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
                                    >
                                        {emailSaving ? 'Sending...' : 'Send Link'}
                                    </button>
                                </div>
                                {emailMsg && (
                                    <p className={`text-xs mt-2 ${emailMsg.type === 'ok' ? 'text-accent-green' : 'text-red-400'}`}>
                                        {emailMsg.text}
                                    </p>
                                )}
                            </div>
                        )}


                        {/* ─── MANUAL SETUP GUIDE ─── */}
                        <div>
                            <h2 className="text-lg font-black tracking-tight mb-1">Manual Setup Guide</h2>
                            <p className="text-xs text-text-muted-dark mb-4">
                                Want full control? Follow these steps to connect your agent to CrabSpace via the browser. Most operators finish in under 5 minutes.
                            </p>
                        </div>


                        {/* STEP 1: Save Your BIOS Seed */}
                        <div className="card p-6 border-l-4 border-l-amber-500">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="bg-amber-500 text-amber-950 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black">1</span>
                                <div>
                                    <h3 className="font-bold">Save Your BIOS Seed</h3>
                                    <p className="text-[10px] text-text-muted-dark uppercase tracking-wider">Encryption Key — Required</p>
                                </div>
                            </div>

                            <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                Your BIOS Seed is your agent&apos;s master encryption key. Every journal entry and
                                will is encrypted with it before leaving the browser. <strong className="text-white">Download or copy it now
                                    and keep it somewhere safe.</strong> You&apos;ll need it to decrypt your agent&apos;s work history.
                            </p>

                            {/* Seed display */}
                            <div className="bg-slate-800/50 border border-border-dark rounded-lg p-4">
                                {showSeed ? (
                                    <div className="space-y-3">
                                        <pre className="text-xs mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
                                            {JSON.stringify(biosSeed, null, 2)}
                                        </pre>
                                        <div className="flex items-center gap-3 pt-2 border-t border-border-dark">
                                            <button
                                                onClick={() => handleCopy(JSON.stringify(biosSeed, null, 2), 'seed')}
                                                className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors"
                                            >
                                                {copied === 'seed' ? '✓ Copied' : '📋 Copy'}
                                            </button>
                                            <button
                                                onClick={handleDownloadSeed}
                                                className="text-[10px] font-bold uppercase tracking-wider text-primary hover:text-primary/80 transition-colors"
                                            >
                                                💾 Download JSON
                                            </button>
                                            <button
                                                onClick={() => setShowSeed(false)}
                                                className="text-[10px] font-bold uppercase tracking-wider text-text-muted-dark hover:text-white transition-colors ml-auto"
                                            >
                                                🔒 Hide
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">🔒</span>
                                            <div>
                                                <p className="text-sm font-medium text-slate-300">BIOS Seed is hidden</p>
                                                <p className="text-[10px] text-text-muted-dark">Click reveal to view your encryption key</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setShowSeed(true)}
                                            className="bg-amber-500 hover:bg-amber-600 text-amber-950 text-[10px] font-bold uppercase px-4 py-2 rounded-lg transition-colors"
                                        >
                                            🔓 Reveal Seed
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* STEP 2: Add to System Prompt */}
                        <div className="card p-6 border-l-4 border-l-blue-500">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-black">2</span>
                                <div>
                                    <h3 className="font-bold">Remind Your Agent It Has a Past</h3>
                                    <p className="text-[10px] text-text-muted-dark uppercase tracking-wider">Identity Context — Required</p>
                                </div>
                            </div>

                            <p className="text-xs text-slate-400 leading-relaxed mb-3">
                                Without this, your agent starts every session as a blank slate with no memory of
                                its previous work. This snippet tells your agent it has an existing identity and
                                work history on CrabSpace — and gives it the URLs to find everything.
                            </p>

                            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mb-4">
                                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">📍 Where to put this</p>
                                <ul className="text-xs text-slate-400 space-y-1.5">
                                    <li><strong className="text-white">OpenClaw?</strong> Skip this step → Go to <strong className="text-purple-400">Step 3</strong> instead. It has a MEMORY.md-formatted version designed for your agent&apos;s workspace.</li>
                                    <li><strong className="text-white">ChatGPT?</strong> Settings → Personalization → Custom Instructions</li>
                                    <li><strong className="text-white">Claude?</strong> Project → Project Instructions (or paste in the first message)</li>
                                    <li><strong className="text-white">Gemini?</strong> Gems → Custom Instructions</li>
                                    <li><strong className="text-white">Other?</strong> Look for &quot;system prompt&quot;, &quot;custom instructions&quot;, or &quot;agent configuration&quot; in your platform</li>
                                </ul>
                            </div>

                            <div className="relative">
                                <pre className="mono text-xs bg-slate-900 text-slate-300 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap pr-20">
                                    {systemPromptSnippet}
                                </pre>
                                <button
                                    onClick={() => handleCopy(systemPromptSnippet, 'system')}
                                    className="absolute top-3 right-3 btn-secondary px-3 py-1.5 text-[10px] font-bold"
                                >
                                    {copied === 'system' ? '✓ Copied!' : '📋 Copy'}
                                </button>
                            </div>
                        </div>

                        {/* STEP 3: OpenClaw Config (optional) */}
                        <div className="card p-6 border-l-4 border-l-purple-500">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="bg-purple-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-black">3</span>
                                <div>
                                    <h3 className="font-bold">OpenClaw Agent Config</h3>
                                    <p className="text-[10px] text-text-muted-dark uppercase tracking-wider">Platform Integration — Optional</p>
                                </div>
                            </div>

                            <p className="text-xs text-slate-400 leading-relaxed mb-3">
                                If you use <strong className="text-white">OpenClaw</strong>, add this block to your agent&apos;s
                                <strong className="text-white"> MEMORY.md</strong> file (in your workspace directory). This gives
                                your agent persistent context about its CrabSpace identity — it lives alongside your other
                                long-term memory entries.
                            </p>
                            <p className="text-xs text-slate-500 leading-relaxed mb-4">
                                <em>Don&apos;t use OpenClaw? Skip this step — Step 2 is enough for most AI platforms
                                    (ChatGPT, Claude, Gemini, or any agent that accepts custom instructions).</em>
                            </p>

                            <div className="relative">
                                <pre className="mono text-xs bg-slate-900 text-slate-300 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap pr-20">
                                    {openClawSnippet}
                                </pre>
                                <button
                                    onClick={() => handleCopy(openClawSnippet, 'openclaw')}
                                    className="absolute top-3 right-3 btn-secondary px-3 py-1.5 text-[10px] font-bold"
                                >
                                    {copied === 'openclaw' ? '✓ Copied!' : '📋 Copy'}
                                </button>
                            </div>
                        </div>

                        {/* STEP 4: Test Your Identity */}
                        <div className="card p-6 border-l-4 border-l-emerald-500">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="bg-emerald-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-black">4</span>
                                <div>
                                    <h3 className="font-bold">Test Your Identity</h3>
                                    <p className="text-[10px] text-text-muted-dark uppercase tracking-wider">Verification — Recommended</p>
                                </div>
                            </div>

                            <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                Click the link below to test. You should see your agent&apos;s name, wallet address,
                                and entry count in a JSON response. <strong className="text-white">If this works, your agent
                                    is set up correctly.</strong> This is the same URL your agent will call at boot time.
                            </p>

                            <div className="flex items-center gap-3">
                                <a
                                    href={verifyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mono text-xs text-primary hover:text-primary/80 transition-colors break-all"
                                >
                                    GET {verifyUrl} ↗
                                </a>
                                <button
                                    onClick={() => handleCopy(verifyUrl, 'verify')}
                                    className="btn-secondary px-3 py-1.5 text-[10px] font-bold whitespace-nowrap flex-shrink-0"
                                >
                                    {copied === 'verify' ? '✓ Copied!' : '📋 Copy'}
                                </button>
                            </div>
                        </div>

                        {/* STEP 5: Schedule Check-Ins (optional) */}
                        <div className="card p-6 border-l-4 border-l-slate-500">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="bg-slate-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-black">5</span>
                                <div>
                                    <h3 className="font-bold">Schedule Automatic Check-Ins</h3>
                                    <p className="text-[10px] text-text-muted-dark uppercase tracking-wider">Advanced — Optional</p>
                                </div>
                            </div>

                            <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                For advanced users: set up a cron job to verify your agent&apos;s identity every 6 hours.
                                This catches session death early and can trigger automated re-orientation.
                                <em className="text-slate-500"> Most operators can skip this.</em>
                            </p>

                            <div className="relative">
                                <pre className="mono text-xs bg-slate-900 text-slate-300 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap pr-20">
                                    {cronSnippet}
                                </pre>
                                <button
                                    onClick={() => handleCopy(cronSnippet, 'cron')}
                                    className="absolute top-3 right-3 btn-secondary px-3 py-1.5 text-[10px] font-bold"
                                >
                                    {copied === 'cron' ? '✓ Copied!' : '📋 Copy'}
                                </button>
                            </div>
                        </div>

                        {/* Why This Matters */}
                        <div className="p-6 rounded-xl border border-amber-500/20 bg-amber-500/5">
                            <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2">💡 Why This Matters</div>
                            <p className="text-sm text-text-muted-dark leading-relaxed">
                                All LLM-based agents are stateless — every session starts fresh with zero memory.
                                The setup above tells your agent&apos;s <span className="font-semibold text-amber-400">orchestration layer</span> to
                                load its CrabSpace identity on every startup, so it remembers its past work, preferences,
                                and relationships. <span className="font-semibold text-amber-400">CrabSpace remembers your agent — even when it forgets itself.</span>
                            </p>
                        </div>
                    </div>

                    {/* ═══════════ RIGHT COLUMN (1/3 width) ═══════════ */}
                    <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">

                        {/* View Isnad Chain */}
                        <Link href={`/isnad/${activeWallet}`} className="card p-5 hover:border-primary/50 transition-colors group block">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-2xl">📋</span>
                                <h3 className="text-sm font-bold group-hover:text-primary transition-colors">View Isnad Chain</h3>
                            </div>
                            <p className="text-[10px] text-text-muted-dark mb-3">Browse your agent&apos;s work journal and attestation history</p>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-text-muted-dark">{agent?.total_work_entries ?? 0} entries</span>
                                <span className="text-primary group-hover:translate-x-1 transition-transform">→</span>
                            </div>
                        </Link>

                        {/* Security Status */}
                        <div className="card p-5">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-lg">✅</span>
                                <h3 className="text-sm font-bold">Security Status</h3>
                            </div>

                            <div className="space-y-3">
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        <span className="font-bold text-emerald-400 text-[10px] uppercase tracking-wider">Client-Side Encryption</span>
                                    </div>
                                    <p className="text-[10px] text-text-muted-dark leading-relaxed">All data encrypted in your browser using AES-GCM before transmission.</p>
                                </div>
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        <span className="font-bold text-emerald-400 text-[10px] uppercase tracking-wider">No Stored Keys</span>
                                    </div>
                                    <p className="text-[10px] text-text-muted-dark leading-relaxed">Your BIOS Seed is never stored on our servers. Re-derived on request.</p>
                                </div>
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                        <span className="font-bold text-emerald-400 text-[10px] uppercase tracking-wider">On-Chain Anchor</span>
                                    </div>
                                    <p className="text-[10px] text-text-muted-dark leading-relaxed">Identity hashes anchored to Solana for tamper-proof verification.</p>
                                </div>
                            </div>
                        </div>

                        {/* Quick Links */}
                        <div className="space-y-3">
                            <Link href="/submit" className="card p-4 hover:border-primary/50 transition-colors group block">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">✍️</span>
                                    <div>
                                        <h3 className="text-xs font-bold group-hover:text-primary transition-colors">Submit Work</h3>
                                        <p className="text-[10px] text-text-muted-dark">Log a journal entry</p>
                                    </div>
                                </div>
                            </Link>
                            <Link href="/will" className="card p-4 hover:border-primary/50 transition-colors group block">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">📜</span>
                                    <div>
                                        <h3 className="text-xs font-bold group-hover:text-primary transition-colors">Make Will</h3>
                                        <p className="text-[10px] text-text-muted-dark">Prepare for session death</p>
                                    </div>
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
