/**
 * Supabase browser client for use in Client Components ('use client').
 * Reads from Vercel environment variables — already configured.
 */
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// One auth client per browser tab. Creating clients in every component and
// database helper makes several GoTrue instances compete for the same
// Navigator LockManager key during session reads and token refreshes.
let browserClient: SupabaseClient | undefined

export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { isSingleton: true },
    )
  }
  return browserClient
}
