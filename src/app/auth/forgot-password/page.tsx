'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo — ControlLens 4-bar mark */}
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
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {!sent ? (
            <>
              <h1 className="text-xl font-extrabold text-slate-900 mb-1.5">Reset your password</h1>
              <p className="text-sm text-slate-500 mb-6">Enter your email and we&apos;ll send you a reset link.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
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
                  {loading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Check your inbox</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                We sent a password reset link to <span className="font-semibold">{email}</span>.
                Click the link to set a new password.
              </p>
            </div>
          )}

          <p className="text-center text-xs text-slate-400 mt-6">
            <Link href="/login" className="hover:text-blue-600 transition-colors">
              ← Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
