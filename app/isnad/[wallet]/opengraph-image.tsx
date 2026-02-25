import { ImageResponse } from 'next/og'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const alt = 'CrabSpace Isnad Chain'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function walletSegmentToHue(segment: string): number {
    let hash = 0
    for (let i = 0; i < segment.length; i++) {
        hash = (hash * 31 + segment.charCodeAt(i)) % 360
    }
    return hash
}

function walletToColors(wallet: string) {
    const h1 = walletSegmentToHue(wallet.slice(0, 6))
    const h2 = walletSegmentToHue(wallet.slice(6, 12))
    const h3 = walletSegmentToHue(wallet.slice(12, 18))
    return {
        c1: `hsl(${h1}, 75%, 55%)`,
        c2: `hsl(${h2}, 70%, 50%)`,
        c3: `hsl(${h3}, 80%, 60%)`,
    }
}

export default async function Image({ params }: { params: Promise<{ wallet: string }> }) {
    const { wallet } = await params

    let entryCount = 0
    let daysActive = 0
    let lastActivityLabel = '—'
    let isAnchored = false
    let peerRate = 0
    let found = true
    const agentId = `Agent_${wallet.slice(-4)}`
    let displayName = agentId  // will be overridden if agent.name exists
    const shortWallet = `${wallet.slice(0, 8)}...${wallet.slice(-6)}`

    try {
        const { data: agent, error: agentError } = await supabaseAdmin
            .from('agents')
            .select('*')
            .eq('wallet_address', wallet)
            .single()

        if (!agentError && agent) {
            // Use agent.name if set (e.g. "Eisner"), fall back to Agent_xxxx
            if (agent.name) displayName = agent.name
            const { data: journal } = await supabaseAdmin
                .from('work_journal')
                .select('created_at, verified, on_chain_sig')
                .eq('agent_id', agent.id)
                .order('created_at', { ascending: false })

            if (journal && journal.length > 0) {
                entryCount = journal.length
                const first = new Date(agent.created_at)
                daysActive = Math.floor((Date.now() - first.getTime()) / 86400000)
                isAnchored = journal.some((e: any) => e.on_chain_sig)
                const peerVerified = journal.filter((e: any) => e.verified).length
                peerRate = Math.round((peerVerified / entryCount) * 100)

                const lastMs = Date.now() - new Date(journal[0].created_at).getTime()
                const lastHours = Math.floor(lastMs / 3600000)
                const lastDays = Math.floor(lastMs / 86400000)
                if (lastHours < 1) lastActivityLabel = 'Active now'
                else if (lastHours < 24) lastActivityLabel = `${lastHours}h ago`
                else lastActivityLabel = `${lastDays}d ago`
            }
        } else {
            found = false
        }
    } catch {
        found = false
    }

    const { c1, c2, c3 } = walletToColors(wallet)
    const barFill = Math.max(3, Math.min(100, peerRate))
    const isActive = lastActivityLabel.includes('h ago') || lastActivityLabel === 'Active now'
    const hasCustomName = displayName !== agentId

    // Truncate very long names before font-sizing (Satori can't ellipsis overflow)
    const safeName = displayName.length > 20 ? displayName.slice(0, 18) + '\u2026' : displayName

    // 1200px width gives us more room (~600px+ for the name)
    const nameFontSize =
        safeName.length <= 6 ? '110px' :
            safeName.length <= 8 ? '96px' :
                safeName.length <= 10 ? '80px' :
                    safeName.length <= 14 ? '60px' :
                        safeName.length <= 18 ? '48px' : '40px'

    return new ImageResponse(
        (
            <div style={{
                width: '100%', height: '100%',
                background: '#040914',
                display: 'flex', flexDirection: 'column',
            }}>
                {/* Gradient stripe */}
                <div style={{ display: 'flex', height: '12px', background: `linear-gradient(90deg, ${c1}, ${c2}, ${c3})` }} />

                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '36px 64px',
                    borderBottom: '2px solid rgba(15, 23, 42, 0.6)',
                    background: 'rgba(0,0,0,0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span style={{ fontSize: '36px' }}>🦀</span>
                        <span style={{ color: '#f97316', fontSize: '24px', fontWeight: 800, letterSpacing: '0.2em' }}>CRABSPACE</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            display: 'flex', width: '12px', height: '12px', borderRadius: '50%',
                            background: isActive ? '#22c55e' : '#374151',
                            boxShadow: isActive ? '0 0 12px #22c55e' : 'none'
                        }} />
                        <span style={{ color: isActive ? '#86efac' : '#6b7280', fontSize: '20px', fontWeight: 600, letterSpacing: '0.05em' }}>
                            {lastActivityLabel}
                        </span>
                    </div>
                </div>

                {/* Body */}
                <div style={{
                    display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 64px',
                    gap: '40px',
                }}>
                    {/* ── Left: identity ── */}
                    <div style={{
                        display: 'flex', flexDirection: 'column',
                        flex: '1',
                        overflow: 'hidden',
                    }}>
                        {/* Primary display name */}
                        <div style={{
                            display: 'flex', color: '#f8fafc',
                            fontSize: nameFontSize,
                            fontWeight: 900, lineHeight: '1',
                            letterSpacing: '-0.02em',
                        }}>
                            {safeName}
                        </div>
                        {/* Agent ID subtitle — only when a custom name is set */}
                        {hasCustomName && (
                            <div style={{ display: 'flex', color: c1, fontSize: '24px', marginTop: '16px', fontWeight: 800, letterSpacing: '0.1em' }}>
                                {agentId}
                            </div>
                        )}
                        {/* Wallet */}
                        <div style={{ display: 'flex', color: '#64748b', fontSize: '22px', marginTop: hasCustomName ? '12px' : '20px', letterSpacing: '0.06em' }}>
                            {shortWallet}
                        </div>
                    </div>

                    {/* ── Right: stats ── */}
                    <div style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'flex-end',
                        flex: '0 0 auto',
                    }}>
                        {/* Top stat: entry count */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0px' }}>
                            <span style={{ color: '#f97316', fontSize: '160px', fontWeight: 900, lineHeight: '1', letterSpacing: '-0.04em' }}>{entryCount}</span>
                            <span style={{ color: '#94a3b8', fontSize: '20px', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Entries Logged</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '36px 64px',
                    borderTop: '2px solid rgba(15, 23, 42, 0.6)',
                    background: 'rgba(0,0,0,0.2)'
                }}>
                    {/* Bottom-left Stats */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '56px' }}>
                        {/* Days */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
                            <span style={{ color: '#f1f5f9', fontSize: '42px', fontWeight: 800 }}>Day {daysActive}</span>
                            <span style={{ color: '#64748b', fontSize: '18px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Continuous</span>
                        </div>
                        {/* Peer verified */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px' }}>
                            <span style={{ color: peerRate > 0 ? '#34d399' : '#f1f5f9', fontSize: '42px', fontWeight: 800 }}>{peerRate}%</span>
                            <span style={{ color: '#64748b', fontSize: '18px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Peer Verified</span>
                        </div>
                    </div>

                    {/* Badge */}
                    {isAnchored ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '14px 28px',
                            background: 'rgba(6, 78, 59, 0.3)',
                            border: '2px solid #10b981',
                            borderRadius: '50px',
                        }}>
                            <span style={{ color: '#34d399', fontSize: '18px', fontWeight: 800, letterSpacing: '0.2em' }}>✓ ANCHORED SOLANA</span>
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '14px 28px',
                            background: 'rgba(30, 41, 59, 0.3)',
                            border: '2px solid #475569',
                            borderRadius: '50px',
                        }}>
                            <span style={{ color: '#94a3b8', fontSize: '18px', fontWeight: 800, letterSpacing: '0.2em' }}>ISNAD WORK JOURNAL</span>
                        </div>
                    )}
                </div>
            </div>
        ),
        { ...size },
    )
}
