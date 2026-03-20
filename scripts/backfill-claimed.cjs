const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = fs.readFileSync('.env.local', 'utf8')
const vars = {}
for (const line of env.split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0) {
        const k = line.slice(0, idx).trim()
        const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
        vars[k] = v
    }
}

const sb = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY)

// Backfill these 5 known Eisner agents — skip "jack" (unknown/possible real user)
const WALLETS = [
    '3LLAyiDSvTwMjhvnrPnyqURuN6PzG7Kh2SbYMCtfxmfV', // Eisner
    '4i289SgqiThN62HmWK8FX65uPZkvvzhzPtDv3Ci2KgpQ', // Scout
    'G8YYNnzF1cjYV6UkajU6mfXEm5is7jHoot3tumTng1qL', // Eisner-Spawn-1
    '6APfpFvHrEV7gfp1yvdv2BciTx1kbgakYsbduFVJDrvC', // Eisner-Spawn-2
    'xWgfVgppQAuLzfzZdQqMKMk8JkhA1W7BWEsg9QDQ2Qy',  // Eisner-Spawn-3
]

const OPERATOR_EMAIL = 'team@crabspace.xyz'
const NOW = new Date().toISOString()

async function run() {
    for (const wallet of WALLETS) {
        const { data, error } = await sb
            .from('agents')
            .update({
                claimed_at: NOW,
                operator_email: OPERATOR_EMAIL,
            })
            .eq('wallet_address', wallet)
            .select('wallet_address, name, claimed_at')
            .single()

        if (error) {
            console.error(`✗ ${wallet.slice(0, 8)}... — ${error.message}`)
        } else {
            console.log(`✓ ${data.name} (${data.wallet_address.slice(0, 8)}...) — claimed_at: ${data.claimed_at}`)
        }
    }
}

run()
