'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

// Day 10 — light theme + correct ControlLens horizontal-bars logo
// (4 bars blue/red/green/slate + "Control" slate + "Lens" blue wordmark).

export default function ResetPasswordPage() {
  const router = useRouter()
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setHasSession(!!user)
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }
    setSuccess(true)
    setLoading(false)
    await supabase.auth.signOut()
    setTimeout(() => router.push('/login'), 2000)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3">
            <svg width="44" height="36" viewBox="0 0 44 36" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
              <rect x="2"  y="6"  width="28" height="4" rx="1" fill="#2563eb"/>
              <rect x="2"  y="13" width="40" height="4" rx="1" fill="#dc2626"/>
              <rect x="2"  y="20" width="22" height="4" rx="1" fill="#16a34a"/>
              <rect x="2"  y="27" width="34" height="4" rx="1" fill="#1f2937"/>
            </svg>
            <span className="text-2xl font-extrabold tracking-tight">
              <span className="text-slate-800">Control</span><span className="text-blue-600">Lens</span>
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-xl border border-slate-200">
          {hasSession === null ? (
            <div className="text-center py-4 text-sm text-slate-500">Loading...</div>
          ) : !hasSession ? (
            <div className="text-center">
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Link expired or invalid</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Password reset links are valid for one hour. Request a new one to continue.
              </p>
              <Link
                href="/auth/forgot-password"
                className="inline-block w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
                Request a new link
              </Link>
            </div>
          ) : success ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Password updated</h2>
              <p className="text-sm text-slate-600 mb-2">
                Redirecting you to sign in with your new password...
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-extrabold text-slate-900 mb-1">Set a new password</h2>
              <p className="text-sm text-slate-500 mb-6">
                Choose a strong password - at least 8 characters.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
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
                  className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60">
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
