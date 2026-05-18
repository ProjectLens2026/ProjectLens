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
        {/* Logo — ControlLens Crosshair Lens */}
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
                Welcome to ControlLens, <span className="font-semibold">{userEmail}</span>.<br />
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
