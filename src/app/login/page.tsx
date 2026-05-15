'use client'
import { useState, useEffect } from 'react'
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

export default function LoginPage() {
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
  })

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
        if (form.password.length < 8) {
          setError('Password must be at least 8 characters.')
          setLoading(false)
          return
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              name: form.name,
              company: form.company,
              role: form.role,
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
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <svg width="44" height="32" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-label="NobelPM mark">
              <rect x="0" y="0" width="32" height="5" rx="1" fill="#3b82f6"/>
              <rect x="0" y="9" width="44" height="5" rx="1" fill="#ef4444"/>
              <rect x="0" y="18" width="26" height="5" rx="1" fill="#22c55e"/>
              <rect x="0" y="27" width="36" height="5" rx="1" fill="#94a3b8"/>
            </svg>
            <span className="text-2xl font-extrabold text-white">NobelPM</span>
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
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Ahmed Al-Rashidi"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Company</label>
                  <input
                    type="text"
                    required
                    placeholder="Nobel Construction"
                    value={form.company}
                    onChange={e => setForm({ ...form, company: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50"
                  />
                </div>
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
                : (mode === 'login' ? 'Sign In to NobelPM' : 'Create My Account')
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
              By creating an account, you agree to use NobelPM responsibly.
              We&apos;ll email you a verification link before you can sign in.
            </p>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          <Link href="/" className="hover:text-white transition-colors">← Back to nobelpm.org</Link>
        </p>
      </div>
    </div>
  )
}
