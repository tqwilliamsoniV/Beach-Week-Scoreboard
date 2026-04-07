import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Server-side client (same anon key — no auth/cookies needed)
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
