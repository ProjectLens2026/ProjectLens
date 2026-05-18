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
        {/* Logo — ControlLens Crosshair Lens. Same SVG as the login page so
            the brand mark is consistent across all auth screens. */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
              <circle cx="20" cy="20" r="15.3" fill="#0f172a"/>
              <circle cx="20" cy="20" r="13.3" fill="#f8fafc"/>
              <g style={{ clipPath: 'circle(13.3px at 20px 20px)' }}>
                <rect x="8.4" y="13.9" width="16.7" height="2.3" rx="0.4" fill="#2563eb"/>
                <rect x="8.4" y="17.2" width="22.6" height="2.3" rx="0.4" fill="#dc2626"/>
                <rect x="8.4" y="20.5" width="13.8" height="2.3" rx="0.4" fill="#16a34a"/>
                <rect x="8.4" y="23.8" width="18.2" height="2.3" rx="0.4" fill="#1f2937"/>
              </g>
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
            Click the link in that email to activate your ControlLens account.
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
