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
sb.from('agents')
    .select('wallet_address, name, claimed_at, operator_email, created_at')
    .order('created_at', { ascending: true })
    .then(({ data, error }) => {
        if (error) { console.error(error); process.exit(1) }
        console.log(JSON.stringify(data, null, 2))
    })
