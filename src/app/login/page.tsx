'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const ROLES = [
  'Project Manager',
  'Senior PM',
  'Owner Representative',
  'Scheduler',
  'Project Executive',
  'Superintendent',
  'CEO / Executive',
]

// Account types — mandatory selection at signup.
// Each maps to a different downstream onboarding flow once multi-tenancy ships:
//   personal    → solo workspace, any email accepted, self-pay
//   business    → company workspace, prefers company email, self-serve checkout
//   government  → agency workspace, contact-sales path, compliance messaging
const ACCOUNT_TYPES = [
  { value: 'personal',   label: 'Personal',           desc: 'Solo work, any email' },
  { value: 'business',   label: 'Business',           desc: 'Company use, team features' },
  { value: 'government', label: 'Government Agency',  desc: 'Public sector, contact sales' },
]

// Common personal email providers. If a user picks Business or Government but
// signs up with one of these domains, we show a non-blocking inline warning so
// they can double-check their selection. They can still proceed if intentional.
const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'icloud.com', 'aol.com', 'protonmail.com', 'live.com',
  'msn.com', 'me.com', 'mac.com',
]

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    password: '',
    role: 'Project Manager',
    // account_type starts empty — user must explicitly choose at signup.
    // Empty value blocks submission via the mandatory check in handleSubmit.
    account_type: '',
  })

  // Derived: should we show the company field?
  // Personal users don't have a company to name. Business and Government do.
  const showCompanyField = form.account_type === 'business' || form.account_type === 'government'

  // Derived: should we show the soft email-domain warning?
  // Only relevant during signup, only for Business/Government, only when the
  // entered email domain matches a common personal-email provider. The user
  // can still proceed — this is a gentle nudge, not a block.
  const emailDomain = form.email.toLowerCase().split('@')[1] || ''
  const usingPersonalEmail = PERSONAL_EMAIL_DOMAINS.includes(emailDomain)
  const showEmailMismatchWarning =
    mode === 'signup' &&
    showCompanyField &&
    emailDomain.length > 0 &&
    usingPersonalEmail

  // Show error if redirected here with one (e.g. unverified email, failed callback)
  useEffect(() => {
    const errParam = searchParams.get('error')
    if (errParam === 'email_not_verified') {
      setError('Please verify your email first. Check your inbox for the link.')
    } else if (errParam === 'auth_callback_error') {
      setError('That verification link is invalid or expired. Try signing in or request a new link.')
    } else if (errParam === 'session_expired') {
      setError('Your session expired. Please sign in again.')
    }
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    try {
      if (mode === 'signup') {
        // Account type is mandatory at signup. Empty string means the user
        // hasn't picked Personal/Business/Government — block submission.
        if (!form.account_type) {
          setError('Please select an account type before signing up.')
          setLoading(false)
          return
        }

        if (form.password.length < 8) {
          setError('Password must be at least 8 characters.')
          setLoading(false)
          return
        }

        // Business and Government accounts must provide a company/agency name.
        // Personal accounts skip this entirely (field is hidden in the UI).
        const requiresCompany = form.account_type === 'business' || form.account_type === 'government'
        if (requiresCompany && !form.company.trim()) {
          setError(
            form.account_type === 'government'
              ? 'Please enter your agency name.'
              : 'Please enter your company name.'
          )
          setLoading(false)
          return
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              name: form.name,
              // For Personal accounts we deliberately store an empty company string
              // rather than skipping the field — keeps the user_metadata shape stable.
              company: requiresCompany ? form.company.trim() : '',
              role: form.role,
              // account_type is stored on user_metadata so the profiles-table
              // trigger (created in the Phase 2 auth setup) can pick it up.
              // When multi-tenancy ships, this drives the org-creation flow.
              account_type: form.account_type,
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })

        if (signUpError) {
          setError(signUpError.message)
          setLoading(false)
          return
        }

        // Account created — redirect to "check your email" page
        router.push(`/auth/check-email?email=${encodeURIComponent(form.email)}`)
      } else {
        // Login
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        })

        if (signInError) {
          setError(signInError.message)
          setLoading(false)
          return
        }

        // Email verification check
        if (data.user && !data.user.email_confirmed_at) {
          await supabase.auth.signOut()
          setError('Please verify your email before signing in. Check your inbox.')
          setLoading(false)
          return
        }

        router.push('/dashboard')
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo — ControlLens Crosshair Lens mark + wordmark.
            Inline SVG keeps the brand mark crisp at any size and avoids an
            extra HTTP request. Same geometry as the favicon and asset-pack
            files, just expressed at viewBox 40x40 for inline use. */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
              {/* Lens body — outer ring + inner face */}
              <circle cx="20" cy="20" r="15.3" fill="#0f172a"/>
              <circle cx="20" cy="20" r="13.3" fill="#f8fafc"/>
              {/* Schedule bars (the original 4-bar metaphor, now seen "through" the lens) */}
              <g style={{ clipPath: 'circle(13.3px at 20px 20px)' }}>
                <rect x="8.4" y="13.9" width="16.7" height="2.3" rx="0.4" fill="#2563eb"/>
                <rect x="8.4" y="17.2" width="22.6" height="2.3" rx="0.4" fill="#dc2626"/>
                <rect x="8.4" y="20.5" width="13.8" height="2.3" rx="0.4" fill="#16a34a"/>
                <rect x="8.4" y="23.8" width="18.2" height="2.3" rx="0.4" fill="#1f2937"/>
              </g>
              {/* Crosshair — clipped to inner face. Gap around center keeps the
                  bars readable. Slate at 0.55 opacity reads as a subtle overlay
                  rather than dominating the bars. */}
              <g style={{ clipPath: 'circle(13.3px at 20px 20px)' }} opacity="0.55">
                <line x1="4.7" y1="20" x2="16.4" y2="20" stroke="#0f172a" strokeWidth="0.5"/>
                <line x1="23.6" y1="20" x2="35.3" y2="20" stroke="#0f172a" strokeWidth="0.5"/>
                <line x1="20" y1="4.7" x2="20" y2="16.4" stroke="#0f172a" strokeWidth="0.5"/>
                <line x1="20" y1="23.6" x2="20" y2="35.3" stroke="#0f172a" strokeWidth="0.5"/>
                <circle cx="20" cy="20" r="0.6" fill="#0f172a"/>
              </g>
            </svg>
            <span className="text-2xl font-extrabold text-white">
              Control<span className="text-blue-500">Lens</span>
            </span>
          </div>
          <p className="text-slate-400 text-sm">Visibility. Insight. Control.</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {/* Toggle */}
          <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(null) }}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}>
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null) }}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
                mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}>
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                {/* Account type — mandatory selection. Drives whether the Company
                    field shows below, and (post multi-tenancy) which org flow
                    the user lands in after verification. */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Sign up as <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={form.account_type}
                    onChange={e => setForm({ ...form, account_type: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 bg-white">
                    <option value="" disabled>Select one...</option>
                    {ACCOUNT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>
                        {t.label} — {t.desc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Full name"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50"
                  />
                </div>

                {/* Company / agency name — only required for Business and Government.
                    Personal users skip this entirely (hidden, not just disabled). */}
                {showCompanyField && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      {form.account_type === 'government' ? 'Agency Name' : 'Company'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={form.account_type === 'government' ? 'Agency or department name' : 'Company name'}
                      value={form.company}
                      onChange={e => setForm({ ...form, company: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Your Role</label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 bg-white">
                    {ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50"
              />
              {/* Soft warning — non-blocking. Surfaces when the user picked a
                  Business/Government account type but entered a personal-domain
                  email. They can still proceed if intentional (e.g. a consultant
                  using personal email for client work). */}
              {showEmailMismatchWarning && (
                <p className="mt-1.5 text-[11px] text-amber-700 leading-relaxed">
                  This looks like a personal email. {form.account_type === 'government'
                    ? 'Government accounts usually use a .gov or .mil address.'
                    : 'Business accounts usually use a company email.'} You can continue if this is what you meant.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
              <input
                type="password"
                required
                placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                minLength={mode === 'signup' ? 8 : undefined}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60 mt-2">
              {loading
                ? (mode === 'signup' ? 'Creating your account...' : 'Signing you in...')
                : (mode === 'login' ? 'Sign In to ControlLens' : 'Create My Account')
              }
            </button>
          </form>

          {mode === 'login' && (
            <p className="text-center text-xs text-slate-500 mt-4">
              <Link href="/auth/forgot-password" className="hover:text-blue-600 transition-colors">
                Forgot your password?
              </Link>
            </p>
          )}

          {mode === 'signup' && (
            <p className="text-center text-xs text-slate-400 mt-4 leading-relaxed">
              By creating an account, you agree to use ControlLens responsibly.
              We&apos;ll email you a verification link before you can sign in.
            </p>
          )}
        </div>

        {/* Footer link to marketing site removed during rebrand. Will be added
            back when the marketing site at www.control-lens.com is live. */}
      </div>
    </div>
  )
}

// Next.js 14 requires useSearchParams() to be inside a Suspense boundary.
// Wrap the actual login UI in Suspense; the fallback matches the dark login
// background so there's no flash of unstyled content.
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />}>
      <LoginInner />
    </Suspense>
  )
}
