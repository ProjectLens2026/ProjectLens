/**
 * Supabase server client for use in Server Components, Route Handlers, and
 * Server Actions. Reads from Vercel environment variables.
 *
 * The cookie handlers read/write the session cookie that keeps the user
 * logged in across requests. Wrapping cookieStore.set in try/catch matters
 * because Server Components can't set cookies — only Route Handlers and
 * Server Actions can.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore. The middleware
            // refreshes the session cookie on every request anyway.
          }
        },
      },
    }
  )
}
