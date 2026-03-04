#!/usr/bin/env node
/**
 * QA cleanup script — removes a test agent from Supabase.
 * Use after email-in-init QA runs to keep the DB clean.
 *
 * Usage:
 *   node scripts/remove-test-agent.cjs <wallet_address>
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const wallet = process.argv[2]

if (!wallet) {
    console.error('Usage: node scripts/remove-test-agent.mjs <wallet_address>')
    process.exit(1)
}

// Load env from .env.local
let env = {}
try {
    const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
    for (const line of envFile.split('\n')) {
        const [key, ...rest] = line.split('=')
        if (key && rest.length) env[key.trim()] = rest.join('=').trim()
    }
} catch {
    console.error('Could not read .env.local — ensure SUPABASE vars are set')
    process.exit(1)
}

const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
)

async function cleanup() {
    console.log(`🧹 Removing test agent: ${wallet}`)

    // Remove operator_claims
    const { error: claimsErr, count: claimsCount } = await supabase
        .from('operator_claims')
        .delete({ count: 'exact' })
        .eq('agent_wallet', wallet)

    if (claimsErr) console.warn('  ⚠️  operator_claims delete error:', claimsErr.message)
    else console.log(`  ✅ operator_claims removed: ${claimsCount ?? 0} row(s)`)

    // Remove work_journal entries
    const { error: workErr, count: workCount } = await supabase
        .from('work_journal')
        .delete({ count: 'exact' })
        .eq('wallet_address', wallet)

    if (workErr) console.warn('  ⚠️  work_journal delete error:', workErr.message)
    else console.log(`  ✅ work_journal removed: ${workCount ?? 0} row(s)`)

    // Remove agent
    const { error: agentErr, count: agentCount } = await supabase
        .from('agents')
        .delete({ count: 'exact' })
        .eq('wallet_address', wallet)

    if (agentErr) console.warn('  ⚠️  agents delete error:', agentErr.message)
    else console.log(`  ✅ agent removed: ${agentCount ?? 0} row(s)`)

    console.log('')
    console.log('Note: On-chain PDA cannot be removed (Solana is immutable).')
    console.log('Done.')
}

cleanup()
