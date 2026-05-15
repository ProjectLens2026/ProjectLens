'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function VerifySuccessPage() {
  const router = useRouter()
  const [verifying, setVerifying] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    // Confirm the session was created by the callback handler
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || null)
      }
      setVerifying(false)
    })
  }, [])

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
          {verifying ? (
            <>
              <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Verifying...</h2>
              <p className="text-sm text-slate-500">Confirming your email address.</p>
            </>
          ) : userEmail ? (
            <>
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Email verified!</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                Welcome to NobelPM, <span className="font-semibold">{userEmail}</span>.<br />
                Your account is active.
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
                Continue to Dashboard →
              </button>
            </>
          ) : (
            <>
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">Verification link expired</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                This link is no longer valid. It may have already been used or expired.
              </p>
              <Link
                href="/login"
                className="inline-block w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
                Go to Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
