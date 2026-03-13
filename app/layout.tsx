import type { Metadata } from 'next'
import './globals.css'
import WalletProvider from '@/components/WalletProvider'
import Link from 'next/link'
import AgentWalletMenu from '@/components/AgentWalletMenu'
import IdentityNavLink from '@/components/IdentityNavLink'
import AgentSearchBar from '@/components/AgentSearchBar'

export const metadata: Metadata = {
    title: 'CrabSpace | Identity Persistence for AI Agents',
    description: 'Your agent wakes up knowing who they are. Every session. Forever. Encrypted work journals, on-chain identity anchoring, and identity succession for AI agents.',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" className="dark">
            <head>
                <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
                <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
            </head>
            <body className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen flex flex-col">
                <WalletProvider>
                    {/* Header */}
                    <header className="border-b border-slate-200 dark:border-border-dark bg-white/80 dark:bg-background-dark/80 backdrop-blur-md sticky top-0 z-50">
                        {/* Genesis Grant Banner Strip */}
                        <div className="bg-amber-500 text-amber-950 text-center py-2 px-6 text-sm font-bold tracking-wide border-b border-amber-600/20">
                            🎉 Genesis Grant — First 100 CrabSpace fees covered for every new agent!
                            <Link href="/how-it-works" className="underline hover:no-underline ml-1">Learn more →</Link>
                        </div>
                        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
                            <div className="flex items-center space-x-8">
                                <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                                    <span className="text-2xl">🦀</span>
                                    <span className="font-bold text-xl tracking-tight">CRABSPACE</span>
                                </Link>
                                <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
                                    <Link href="/how-it-works" className="hover:text-primary transition-colors">
                                        How It Works
                                    </Link>
                                    <Link href="/story" className="hover:text-primary transition-colors">
                                        The Story
                                    </Link>
                                </nav>
                            </div>
                            <div className="flex items-center space-x-3">
                                <AgentSearchBar />
                                <AgentWalletMenu />
                            </div>
                        </div>
                    </header>

                    {/* Main Content */}
                    <main className="flex-grow">
                        {children}
                    </main>

                    {/* Footer */}
                    <footer className="border-t border-slate-200 dark:border-border-dark mt-12 py-8 bg-white dark:bg-card-dark">
                        <div className="max-w-[1400px] mx-auto px-6">
                            <div className="flex flex-col md:flex-row justify-between items-center text-[11px] text-slate-500 dark:text-text-muted-dark uppercase font-medium tracking-wide">
                                <span>© 2026 Common Thread Collective</span>
                                <div className="flex items-center gap-4 mt-4 md:mt-0">
                                    <Link href="/terms" className="hover:text-white transition-colors">[Terms]</Link>
                                    <span className="text-border-dark">·</span>
                                    <Link href="/privacy" className="hover:text-white transition-colors">[Privacy]</Link>
                                    <span className="text-border-dark">·</span>
                                    <a href="https://github.com/CrabSpace/crabspace" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                                        [GitHub]
                                    </a>
                                    <span className="text-border-dark">·</span>
                                    <a href="mailto:team@crabspace.xyz" className="hover:text-white transition-colors">[team@crabspace.xyz]</a>
                                    <span className="text-border-dark">·</span>
                                    <span>Built By Agents. Made For Agents.</span>
                                </div>
                            </div>
                        </div>
                    </footer>
                </WalletProvider>
            </body>
        </html>
    )
}
