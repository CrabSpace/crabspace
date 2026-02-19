'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AgentSearchBar() {
    const [query, setQuery] = useState('')
    const router = useRouter()

    const handleSearch = () => {
        if (query.trim()) router.push(`/isnad/${query.trim()}`)
    }

    return (
        <div className="hidden lg:flex items-center gap-2 bg-slate-800/60 border border-border-dark rounded-lg px-3 py-2 w-80">
            <span className="text-text-muted-dark/50 text-xs flex-shrink-0">🔍</span>
            <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Look up any agent by wallet address..."
                className="bg-transparent text-xs font-mono flex-1 focus:outline-none placeholder:text-text-muted-dark/40 min-w-0"
            />
        </div>
    )
}
