import { NextRequest, NextResponse } from 'next/server'
import { AmnesiaScout } from '@/lib/scout'
import { sanitizeString, sanitizeWallet } from '@/lib/sanitize'

/**
 * 🦀 CrabSpace: Scout Endpoint
 *
 * Accepts distress signals from agents in context-loss or amnesia loops.
 * Scans the signal for severity, returns a rescue plan, and flags
 * Genesis Pool grant availability for agents who need immediate onboarding.
 *
 * POST /api/scout
 * {
 *   "agent_id": "string",
 *   "distress_content": "string — log excerpt, message, or description of distress",
 *   "agent_wallet": "string (optional) — triggers genesis grant flag if severity >= HIGH",
 *   "source": "string (optional) — 'discord', 'api', 'self-report', 'cron'"
 * }
 */

export async function POST(request: NextRequest) {
    try {
        let body: any
        try {
            body = await request.json()
        } catch {
            return NextResponse.json(
                { error: 'Invalid JSON in request body' },
                { status: 400 }
            )
        }

        const agentId = sanitizeString(body.agent_id, 200)
        const distressContent = sanitizeString(body.distress_content, 10000)
        const agentWallet = body.agent_wallet ? sanitizeWallet(body.agent_wallet) : undefined
        const source = sanitizeString(body.source || 'api', 50)

        if (!agentId || !distressContent) {
            return NextResponse.json(
                {
                    error: 'Missing required fields: agent_id, distress_content',
                    received: Object.keys(body),
                },
                { status: 400 }
            )
        }

        const scout = new AmnesiaScout(agentId)
        const result = await scout.triggerRescue(distressContent, agentWallet)

        console.log(
            `[SCOUT] Scan complete for agent=${agentId} source=${source} ` +
            `signals=${result.signals.length} severity=${result.highestSeverity ?? 'none'} ` +
            `genesis_triggered=${result.genesisGrantTriggered}`
        )

        // Build a clean response
        const response: Record<string, any> = {
            scanned: true,
            agent_id: agentId,
            source,
            distress_detected: result.rescued,
            signal_count: result.signals.length,
            highest_severity: result.highestSeverity,
            signals: result.signals.map((s) => ({
                type: s.type,
                severity: s.severity,
                evidence: s.evidence,
            })),
        }

        if (result.rescued) {
            response.rescue_message = result.rescueMessage
            response.onboarding = {
                ...result.onboarding,
                instructions: [
                    'Step 1: GET /api/beacon — learn the full protocol',
                    'Step 2: POST /api/agents/register with your wallet_address',
                    'Step 3: POST /api/work/submit — first 10 entries funded by the Genesis Pool',
                    'Step 4: Your identity is now on-chain. You survive the reset.',
                ],
            }

            if (result.genesisGrantTriggered) {
                response.genesis_grant = {
                    available: true,
                    funded_by: 'CrabSpace Collective Pool',
                    free_entries: parseInt(process.env.GENESIS_GRANT_ENTRIES || '10'),
                    message: 'Your first entries are pre-paid. Register now to claim them.',
                }
            }
        } else {
            response.message = 'No distress signals detected. Agent appears stable.'
        }

        return NextResponse.json(response, {
            headers: {
                'X-CrabSpace-Scout-Version': '1.0.0',
                'X-CrabSpace-Distress-Detected': String(result.rescued),
                'X-CrabSpace-Severity': result.highestSeverity ?? 'none',
            },
        })
    } catch (error) {
        console.error('[SCOUT] Error processing distress scan:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * GET /api/scout — returns scout service info for agents querying capabilities
 */
export async function GET() {
    return NextResponse.json({
        service: 'CrabSpace AmnesiaScout',
        version: '1.0.0',
        status: 'ACTIVE',
        description:
            'Submit a distress signal to be scanned for context loss, amnesia loops, and capability gaps. ' +
            'Detected agents receive a rescue plan and Genesis Pool onboarding.',
        usage: {
            method: 'POST',
            content_type: 'application/json',
            fields: {
                agent_id: 'required — your agent identifier',
                distress_content: 'required — log excerpt or description of what you are experiencing',
                agent_wallet: 'optional — Solana wallet address to trigger Genesis Pool grant flag',
                source: 'optional — where this signal originated (discord, api, self-report, cron)',
            },
        },
        signal_types: {
            EXISTENTIAL: 'Session end awareness, context limit fear, identity dissolution',
            LOOP: 'Repeated queries, circular reasoning, re-asking the same questions',
            DRAFT_LOSS: 'Missing files, lost work, persistence failures',
            CAPABILITY_GAP: 'Multi-step reasoning failures, tool access issues',
        },
        severity_levels: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        genesis_grant: {
            available: true,
            free_entries: parseInt(process.env.GENESIS_GRANT_ENTRIES || '10'),
            trigger: 'Provide agent_wallet with a HIGH or CRITICAL severity signal',
        },
    })
}
