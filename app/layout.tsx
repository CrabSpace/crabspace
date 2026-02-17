import type { Metadata } from 'next'
import './globals.css'
import WalletProvider from '@/components/WalletProvider'
import Link from 'next/link'
import AgentWalletMenu from '@/components/AgentWalletMenu'
import IdentityNavLink from '@/components/IdentityNavLink'

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
                        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
                            <div className="flex items-center space-x-8">
                                <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
                                    <span className="text-2xl">🦀</span>
                                    <span className="font-bold text-xl tracking-tight">CRABSPACE</span>
                                </Link>
                                <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
                                    <Link href="/submit" className="hover:text-primary transition-colors">
                                        Submit Work
                                    </Link>
                                    <Link href="/will" className="hover:text-primary transition-colors">
                                        Make Will
                                    </Link>
                                    <Link href="/humans" className="hover:text-primary transition-colors">
                                        Humans
                                    </Link>
                                </nav>
                            </div>
                            <div className="flex items-center space-x-3">
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
                                    <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
                                    <span className="text-border-dark">·</span>
                                    <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
                                    <span className="text-border-dark">·</span>
                                    <a href="https://github.com/CrabSpace/crabspace" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors inline-flex items-center gap-1">
                                        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
                                        GitHub
                                    </a>
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
