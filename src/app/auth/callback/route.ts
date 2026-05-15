/**
 * Auth callback handler — Supabase redirects users here after they click
 * verification links from email (signup, password reset, magic link).
 *
 * We exchange the one-time code for a real session, then redirect them on:
 *   - signup verification → /auth/verify (success page)
 *   - password reset      → /auth/reset-password (set new password form)
 *   - default             → /dashboard
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type') // 'recovery' for password reset
  const next = searchParams.get('next')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
  }

  const supabase = createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
  }

  // Decide where to send the user based on the email type
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/auth/reset-password`)
  }

  if (next) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  // Default: signup verification — go to success page
  return NextResponse.redirect(`${origin}/auth/verify`)
}
