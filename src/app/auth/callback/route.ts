/**
 * Auth callback handler — Supabase redirects users here after they click
 * verification links from email (signup, password reset, invitation, magic link).
 *
 * MODERN SUPABASE FLOWS (current default):
 *   Email links look like:  /auth/callback?token_hash=xxx&type=invite
 *   Types: 'signup' | 'invite' | 'recovery' | 'magiclink' | 'email_change' | 'email'
 *
 *   We use verifyOtp({ token_hash, type }) to validate the link AND create a
 *   session in one step.
 *
 * LEGACY OAUTH / PKCE FLOW:
 *   Email links look like:  /auth/callback?code=xxx
 *   We exchange the code for a session.
 *
 * Routing after success:
 *   - invite     → /auth/reset-password  (so user can set their first password)
 *   - recovery   → /auth/reset-password  (user resets forgotten password)
 *   - signup/email → /auth/verify        (success page, then continue to dashboard)
 *   - default    → /dashboard
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  // Both formats — try modern first, fall back to legacy
  const token_hash = searchParams.get('token_hash')
  const typeParam = searchParams.get('type')
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  const supabase = createClient()

  // ============================================================================
  // MODERN FLOW — token_hash + type (invite, recovery, signup confirmation)
  // ============================================================================
  if (token_hash && typeParam) {
    const type = typeParam as EmailOtpType
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (error) {
      console.error('[auth/callback] verifyOtp failed:', error.message, 'type=', type)
      return NextResponse.redirect(
        `${origin}/login?error=auth_invalid_link&reason=${encodeURIComponent(error.message)}`
      )
    }
    console.log('[auth/callback] verifyOtp succeeded, type=', type)

    // Invitations + recovery both end at the set-password screen
    if (type === 'invite' || type === 'recovery') {
      return NextResponse.redirect(`${origin}/auth/reset-password`)
    }
    // Signup / email confirmation
    if (type === 'signup' || type === 'email' || type === 'email_change') {
      return NextResponse.redirect(`${origin}${next || '/auth/verify'}`)
    }
    // Magic link or anything else — straight to dashboard if next not specified
    return NextResponse.redirect(`${origin}${next || '/dashboard'}`)
  }

  // ============================================================================
  // LEGACY FLOW — OAuth code exchange (kept for backward compatibility)
  // ============================================================================
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
      return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
    }
    if (typeParam === 'recovery') {
      return NextResponse.redirect(`${origin}/auth/reset-password`)
    }
    if (next) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    return NextResponse.redirect(`${origin}/auth/verify`)
  }

  // ============================================================================
  // NEITHER FORMAT — invalid link
  // ============================================================================
  console.error('[auth/callback] no token_hash and no code in query string')
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error&reason=no_token`)
}
