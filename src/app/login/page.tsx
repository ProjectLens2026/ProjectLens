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

const ACCOUNT_TYPES = [
  { value: 'personal',   label: 'Personal',           desc: 'Solo work, any email' },
  { value: 'business',   label: 'Business',           desc: 'Company use, team features' },
  { value: 'government', label: 'Government Agency',  desc: 'Public sector, contact sales' },
]

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
    account_type: '',
  })

  const showCompanyField = form.account_type === 'business' || form.account_type === 'government'

  const emailDomain = form.email.toLowerCase().split('@')[1] || ''
  const usingPersonalEmail = PERSONAL_EMAIL_DOMAINS.includes(emailDomain)
  const showEmailMismatchWarning =
    mode === 'signup' &&
    showCompanyField &&
    emailDomain.length > 0 &&
    usingPersonalEmail

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
              company: requiresCompany ? form.company.trim() : '',
              role: form.role,
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

        router.push(`/auth/check-email?email=${encodeURIComponent(form.email)}`)
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        })

        if (signInError) {
          setError(signInError.message)
          setLoading(false)
          return
        }

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
        {/* Logo — ControlLens 4-bar mark + wordmark.
            Same 4 bars from the NobelPM brand (now in the saturated palette);
            "Control" in white, "Lens" in blue for accent. Clean and simple
            at every size. */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <svg width="44" height="32" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
              <rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/>
              <rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/>
              <rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/>
              <rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/>
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

        {/* Back-to-marketing link. Points to nobelpm.org for now since that's
            where the live Wix marketing site lives. When the Wix site moves
            to www.control-lens.com, update this href accordingly. */}
        <p className="text-center text-slate-500 text-xs mt-6">
          <Link href="https://nobelpm.org" className="hover:text-white transition-colors">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />}>
      <LoginInner />
    </Suspense>
  )
}
