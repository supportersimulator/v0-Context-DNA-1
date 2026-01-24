/**
 * Supabase browser client for Context DNA
 * Configured via NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * NOTE: Uses same Supabase project as ER Simulator.
 * Brand differentiation happens via:
 * - Different localStorage keys (contextdna_* prefix)
 * - Different backend URL (api.contextdna.io)
 * - Django sets product='contextdna' based on Origin header
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing Supabase environment variables. Auth will not work. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
  )
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Use Context DNA branded storage key
        storageKey: 'contextdna-auth-token',
      },
    })
  : null
