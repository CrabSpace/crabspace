import { createClient } from '@supabase/supabase-js'

// Service role client — server-side only, NEVER expose to client.
// Used for all write operations (INSERT, UPDATE, DELETE) so RLS
// can be set to read-only for the anon key.
// SUPABASE_SERVICE_ROLE_KEY must be in .env.local (no NEXT_PUBLIC_ prefix).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (never prefix with NEXT_PUBLIC_).')
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
})
