'use client'

import { useState, useRef, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import Link from 'next/link'
import { truncateWallet } from '@/lib/mockData'

export default function AgentWalletMenu() {
    const { publicKey, connected, disconnect } = useWallet()
    const isDev = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
    const mockWallet = process.env.NEXT_PUBLIC_MOCK_WALLET || ''

    const isConnected = isDev || connected
    const displayWallet = isDev ? mockWallet : (publicKey?.toBase58() || '')

    const [open, setOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    if (!isConnected || !displayWallet) {
        return (
            <WalletMultiButton className="!bg-crab-600 hover:!bg-crab-700">
                Manage Agent
            </WalletMultiButton>
        )
    }

    return (
        <div className="relative" ref={menuRef}>
            {/* Connected badge — clickable */}
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/50 rounded-lg px-3 py-2 transition-colors cursor-pointer"
            >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-bold text-emerald-400">Connected</span>
                <span className="text-xs mono text-slate-400">
                    {truncateWallet(displayWallet)}
                </span>
                <svg
                    className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown menu */}
            {open && (
                <div className="absolute right-0 mt-2 w-48 bg-card-dark border border-border-dark rounded-lg shadow-xl overflow-hidden z-50">
                    <Link
                        href="/account"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-800/50 hover:text-white transition-colors"
                    >
                        <span className="text-base">👤</span>
                        Account
                    </Link>
                    <Link
                        href={`/isnad/${displayWallet}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-800/50 hover:text-white transition-colors"
                    >
                        <span className="text-base">📋</span>
                        Isnad Chain
                    </Link>
                    <div className="border-t border-border-dark"></div>
                    {!isDev && (
                        <button
                            onClick={() => { disconnect(); setOpen(false) }}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                        >
                            <span className="text-base">🚪</span>
                            Sign Out
                        </button>
                    )}
                    {isDev && (
                        <div className="flex items-center gap-3 px-4 py-3 text-[10px] text-slate-600 uppercase tracking-wider">
                            <span className="text-base">🔧</span>
                            Dev Mode
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
