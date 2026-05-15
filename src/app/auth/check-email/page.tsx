'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function CheckEmailInner() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || 'your email'
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleResend() {
    if (!email || email === 'your email') {
      setError('Email address missing. Try signing up again.')
      return
    }
    setResending(true)
    setError(null)
    const supabase = createClient()
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (resendError) {
      setError(resendError.message)
    } else {
      setResent(true)
    }
    setResending(false)
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
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Check your email</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            We sent a verification link to<br />
            <span className="font-semibold text-slate-900">{email}</span>
          </p>
          <p className="text-xs text-slate-500 leading-relaxed mb-6">
            Click the link in that email to activate your NobelPM account.
            The email should arrive within a minute. Check your spam folder if
            you don&apos;t see it.
          </p>

          {resent && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-xs px-3 py-2.5 rounded-lg mb-4">
              Verification email re-sent. Check your inbox.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-lg mb-4">
              {error}
            </div>
          )}

          <button
            onClick={handleResend}
            disabled={resending || resent}
            className="w-full bg-slate-100 text-slate-700 py-2.5 rounded-lg font-semibold text-xs hover:bg-slate-200 transition-colors disabled:opacity-60">
            {resending ? 'Sending...' : resent ? 'Email re-sent ✓' : 'Didn\'t get it? Resend email'}
          </button>

          <p className="text-xs text-slate-400 mt-6">
            <Link href="/login" className="hover:text-blue-600 transition-colors">
              ← Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

// Next.js 14 requires useSearchParams() to be inside a Suspense boundary.
export default function CheckEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />}>
      <CheckEmailInner />
    </Suspense>
  )
}
