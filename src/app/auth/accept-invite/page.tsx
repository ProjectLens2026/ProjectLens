'use client'
// =============================================================================
// Accept Invitation — Phase 3C / Day 9.
//
// Public page (no auth required) reached from invitation share links.
//
// URL: /auth/accept-invite?token=xxxxx
//
// Flow:
//   1. Read token from URL
//   2. Look up the invitation (lookupInvitationByToken)
//      - If not found / expired / revoked / accepted → show error state
//   3. Show org name + role they'll get + email (fixed from invitation)
//   4. Form: full name + password (8+ chars)
//   5. On submit:
//      a. Call supabase.auth.signUp with the invitation's email + password
//         + emailRedirectTo back to this page (so they end up here after
//         email confirmation if confirmations are required)
//      b. If sign-up creates a session immediately (auto-confirm or already
//         confirmed) → call acceptInvitation() to create profile + join org
//      c. If email confirmation required → show "Check your email" state
//
// Handles edge case: user already has an account with that email (re-invite
// scenario). In that case we attempt to sign them in with the entered password
// instead of signing up, then join the org.
// =============================================================================

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  lookupInvitationByToken, acceptInvitation,
  InvitationLookup,
} from '@/lib/supabase/db'

type ViewState = 'loading' | 'invalid' | 'form' | 'submitting' | 'check_email' | 'success'

export default function AcceptInvitePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') || ''

  const [state, setState] = useState<ViewState>('loading')
  const [invitation, setInvitation] = useState<InvitationLookup | null>(null)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setState('invalid')
      return
    }
    lookupInvitationByToken(token).then(inv => {
      if (!inv) {
        setState('invalid')
      } else {
        setInvitation(inv)
        setState('form')
      }
    }).catch(err => {
      console.error('[accept-invite] lookup failed:', err)
      setState('invalid')
    })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!invitation) return
    if (!fullName.trim()) { setError('Please enter your full name.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }

    setState('submitting')
    const supabase = createClient()

    // Try sign-up first
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: invitation.email,
      password,
      options: {
        data: { name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/accept-invite?token=${encodeURIComponent(token)}`,
      },
    })

    // Case A: user already exists (re-invite or trying to use existing account)
    // Supabase returns either an error or signUpData.user with identities=[]
    const alreadyExists = signUpErr?.message?.toLowerCase().includes('already')
      || (signUpData?.user && signUpData.user.identities && signUpData.user.identities.length === 0)

    if (alreadyExists) {
      // Try to sign them in with the entered password
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
        email: invitation.email,
        password,
      })
      if (signInErr || !signInData?.user) {
        setError(
          `An account already exists for ${invitation.email}, but the password you entered doesn't match. ` +
          `Sign in with your existing password instead, or reset it.`
        )
        setState('form')
        return
      }
      // Signed in — proceed to join org
      await finalizeJoin(signInData.user.id)
      return
    }

    if (signUpErr) {
      setError(signUpErr.message)
      setState('form')
      return
    }

    // Case B: sign-up succeeded
    if (signUpData.session && signUpData.user) {
      // Auto-confirm path — session ready, finalize
      await finalizeJoin(signUpData.user.id)
      return
    }

    if (signUpData.user && !signUpData.session) {
      // Email confirmation required — Supabase sent a confirmation email
      setState('check_email')
      return
    }

    setError('Sign-up returned no user. Please try again.')
    setState('form')
  }

  async function finalizeJoin(userId: string) {
    if (!invitation) return
    const result = await acceptInvitation({
      invitationId: invitation.id,
      orgId: invitation.org_id,
      role: invitation.role,
      userId,
      email: invitation.email,
      fullName: fullName.trim(),
    })

    if (!result.ok) {
      setError(`Joined sign-up but failed to add you to the workspace: ${result.error}`)
      setState('form')
      return
    }

    setState('success')
    // Small delay so user sees success state, then redirect to dashboard
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  // =============================================================================
  // RENDER STATES
  // =============================================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <ControlLensLogo />
            <span className="text-2xl font-extrabold text-white">
              Control<span className="text-blue-500">Lens</span>
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {state === 'loading' && (
            <div className="text-center py-6">
              <div className="text-sm text-slate-500">Loading your invitation...</div>
            </div>
          )}

          {state === 'invalid' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Invitation invalid or expired</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                This invitation link is no longer valid. It may have been:
                <br />• Already accepted
                <br />• Revoked by an admin
                <br />• Expired (invitations are valid for 7 days)
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Ask your workspace admin for a fresh invitation.
              </p>
              <Link href="/login" className="inline-block w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700">
                Go to Sign In
              </Link>
            </div>
          )}

          {state === 'check_email' && invitation && (
            <div className="text-center">
              <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Check your email</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                We've sent a confirmation email to <span className="font-semibold">{invitation.email}</span>. Click the link in that email to confirm your account, then come back here to finish joining.
              </p>
              <Link href="/login" className="inline-block w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700">
                Back to Sign In
              </Link>
            </div>
          )}

          {state === 'success' && invitation && (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Welcome to {invitation.org_name}!</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                You've joined as <span className="font-semibold capitalize">{invitation.role}</span>. Taking you to the dashboard...
              </p>
            </div>
          )}

          {(state === 'form' || state === 'submitting') && invitation && (
            <>
              <h2 className="text-xl font-extrabold text-slate-900 mb-1">You're invited</h2>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                <span className="font-semibold text-slate-700">{invitation.email}</span><br />
                invited to <span className="font-semibold text-slate-700">{invitation.org_name}</span> as <span className="font-semibold capitalize text-blue-600">{invitation.role}</span>
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    disabled={state === 'submitting'}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input
                    type="email"
                    value={invitation.email}
                    disabled
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Set Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    disabled={state === 'submitting'}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-type password"
                    disabled={state === 'submitting'}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2.5 rounded-lg font-semibold">
                    ⚠ {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={state === 'submitting' || !fullName.trim() || !password || password !== confirmPassword}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-3.5 rounded-xl font-bold text-sm transition-colors">
                  {state === 'submitting' ? 'Joining workspace...' : 'Accept & Create Account'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ControlLensLogo() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
      <circle cx="20" cy="20" r="15.3" fill="#0f172a"/>
      <circle cx="20" cy="20" r="13.3" fill="#f8fafc"/>
      <g style={{ clipPath: 'circle(13.3px at 20px 20px)' }}>
        <rect x="8.4" y="13.9" width="16.7" height="2.3" rx="0.4" fill="#2563eb"/>
        <rect x="8.4" y="17.2" width="22.6" height="2.3" rx="0.4" fill="#dc2626"/>
        <rect x="8.4" y="20.5" width="13.8" height="2.3" rx="0.4" fill="#16a34a"/>
        <rect x="8.4" y="23.8" width="18.2" height="2.3" rx="0.4" fill="#1f2937"/>
      </g>
    </svg>
  )
}
