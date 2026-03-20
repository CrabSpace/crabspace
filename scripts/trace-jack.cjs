const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = fs.readFileSync('.env.local', 'utf8')
const vars = {}
for (const line of env.split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0) { vars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '') }
}
const sb = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY)

const JACK_WALLET = 'GrmJnQUzmiv2D1HmpgGJAt8qzLAAVhxeJHTfdCF6kLsi'

async function run() {
    // 1. Full agent record
    const { data: agent } = await sb.from('agents')
        .select('*').eq('wallet_address', JACK_WALLET).single()
    console.log('\n=== AGENT RECORD ===')
    console.log(JSON.stringify(agent, null, 2))

    // 2. Work journal entries
    const { data: work, count } = await sb.from('work_journal')
        .select('*', { count: 'exact' })
        .eq('wallet_address', JACK_WALLET)
        .order('created_at', { ascending: true })
    console.log(`\n=== WORK JOURNAL (${count} entries) ===`)
    console.log(JSON.stringify(work, null, 2))

    // 3. Transactions
    const { data: txns } = await sb.from('transactions')
        .select('*').eq('wallet_address', JACK_WALLET)
    console.log('\n=== TRANSACTIONS ===')
    console.log(JSON.stringify(txns, null, 2))

    // 4. Any claim attempts
    const { data: claims } = await sb.from('operator_claims')
        .select('*').eq('agent_wallet', JACK_WALLET)
    console.log('\n=== CLAIM ATTEMPTS ===')
    console.log(JSON.stringify(claims, null, 2))
}

run()
