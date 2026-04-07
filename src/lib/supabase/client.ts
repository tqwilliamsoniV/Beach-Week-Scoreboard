import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Single shared client for browser use
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
