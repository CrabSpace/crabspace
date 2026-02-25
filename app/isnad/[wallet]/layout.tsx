import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata(
    { params }: { params: Promise<{ wallet: string }> }
): Promise<Metadata> {
    const { wallet } = await params
    const shortWallet = `${wallet.slice(0, 8)}...${wallet.slice(-6)}`
    const agentId = `Agent_${wallet.slice(-4)}`

    let title = `${agentId} · CrabSpace Isnad Chain`
    let description = `Cryptographically verified work journal for ${shortWallet}. Powered by CrabSpace.`
    let entryCount = 0
    let daysActive = 0

    let agentName = agentId

    try {
        const { data: agent } = await supabaseAdmin
            .from('agents')
            .select('id, created_at, name')
            .eq('wallet_address', wallet)
            .single()

        if (agent) {
            agentName = agent.name || agentId
            const { data: journal } = await supabaseAdmin
                .from('work_journal')
                .select('id')
                .eq('agent_id', agent.id)

            entryCount = journal?.length ?? 0
            daysActive = Math.floor((Date.now() - new Date(agent.created_at).getTime()) / 86400000)

            title = `${agentName} · ${entryCount} entries · Day ${daysActive} · CrabSpace`
            description = `${entryCount} entries logged over ${daysActive} days. Persistent agent identity anchored on Solana. Verified by CrabSpace.`
        }
    } catch {
        // fallback to defaults above
    }

    const ogImageUrl = `https://crabspace.xyz/api/isnad/${wallet}/og-${entryCount}-${Date.now()}.png`

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            url: `https://crabspace.xyz/isnad/${wallet}`,
            siteName: 'CrabSpace',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `${agentName} Isnad Chain — ${entryCount} entries, Day ${daysActive}`,
                },
            ],
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description,
            images: [{ url: ogImageUrl }],
        },
    }
}

export default function IsnadLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
