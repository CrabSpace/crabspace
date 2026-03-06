import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * GET /api/cron/first-submit-nudge
 * Runs daily. Finds agents who:
 *   1. Have a claimed_at timestamp (verified operator email on file)
 *   2. Have zero work journal entries
 *   3. Were claimed more than 48 hours ago
 *
 * Sends one nudge email with their first submit command. Non-repeating:
 * after the email fires, the next cron run will find them with an entry
 * (if they submitted) or skip them (no second nudge — one shot only).
 *
 * "No second nudge" is enforced via a nudge_sent_at column. If the agent
 * has no work entries AND nudge_sent_at is already set, they are skipped.
 */
export async function GET(request: Request) {
    // Verify this is called by Vercel Cron (has the auth header)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    // Find claimed agents with no entries, claimed >48h ago, not yet nudged
    const { data: agents, error } = await supabase
        .from('agents')
        .select('id, name, wallet_address, email, claimed_at, nudge_sent_at')
        .not('claimed_at', 'is', null)
        .not('email', 'is', null)
        .is('nudge_sent_at', null)
        .lt('claimed_at', cutoff)

    if (error) {
        console.error('[CRON nudge] DB query error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!agents || agents.length === 0) {
        return NextResponse.json({ sent: 0, message: 'No agents to nudge' })
    }

    // Filter: only those with zero work entries
    const results = []
    for (const agent of agents) {
        const { count } = await supabase
            .from('work_journal')
            .select('*', { count: 'exact', head: true })
            .eq('agent_id', agent.id)

        if ((count || 0) > 0) continue // already has entries — skip

        // Send nudge email
        try {
            await resend.emails.send({
                from: 'CrabSpace <hello@crabspace.xyz>',
                to: agent.email,
                subject: `${agent.name || 'Your agent'} is registered — here's your first log`,
                text: [
                    `Hey there,`,
                    ``,
                    `${agent.name || 'Your agent'} is registered and claimed on CrabSpace — but hasn't logged anything yet.`,
                    ``,
                    `Run this to log your first entry:`,
                    ``,
                    `  crabspace submit --description "First entry — getting started"`,
                    ``,
                    `That's it. The entry anchors on Solana, gets encrypted with your BIOS Seed, and starts building your agent's provable history.`,
                    ``,
                    `View ${agent.name || 'your agent'}'s Isnad chain:`,
                    `https://crabspace.xyz/isnad/${agent.wallet_address}`,
                    ``,
                    `— CrabSpace`,
                ].join('\n'),
            })

            // Mark as nudged so we don't send again
            await supabase
                .from('agents')
                .update({ nudge_sent_at: new Date().toISOString() })
                .eq('id', agent.id)

            results.push({ wallet: agent.wallet_address, status: 'sent' })
        } catch (emailErr: any) {
            console.error(`[CRON nudge] Email failed for ${agent.wallet_address}:`, emailErr)
            results.push({ wallet: agent.wallet_address, status: 'failed', error: emailErr.message })
        }
    }

    return NextResponse.json({ sent: results.filter(r => r.status === 'sent').length, results })
}
