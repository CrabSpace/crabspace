'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import Link from 'next/link'

export default function IdentityNavLink() {
    const { publicKey, connected } = useWallet()

    if (!connected || !publicKey) return null

    return (
        <Link
            href="/account"
            className="hover:text-primary transition-colors"
        >
            Account
        </Link>
    )
}
