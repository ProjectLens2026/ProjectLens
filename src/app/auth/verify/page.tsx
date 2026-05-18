'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function VerifyInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState('Verifying your email...')

  useEffect(() => {
    async function doVerify() {
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')

      if (!token_hash || !type) {
        setStatus('error')
        setMessage('Invalid verification link. Try requesting a new one.')
        return
      }

      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as any,
      })

      if (error) {
        setStatus('error')
        setMessage(error.message || 'That link is invalid or expired.')
        return
      }

      setStatus('success')
      setMessage('Your email is verified. Redirecting you to ControlLens...')
      setTimeout(() => router.push('/dashboard'), 1500)
    }

    doVerify()
  }, [searchParams, router])

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

        <div className="bg-white rounded-2xl p-8 shadow-2xl text-center">
          {status === 'verifying' && (
            <>
              <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
              <h2 className="text-lg font-extrabold text-slate-900 mb-2">Verifying...</h2>
              <p className="text-sm text-slate-600">{message}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-lg font-extrabold text-slate-900 mb-2">You&apos;re in.</h2>
              <p className="text-sm text-slate-600">{message}</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <h2 className="text-lg font-extrabold text-slate-900 mb-2">Verification failed</h2>
              <p className="text-sm text-slate-600 mb-4">{message}</p>
              <Link href="/login" className="inline-block w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors">
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />}>
      <VerifyInner />
    </Suspense>
  )
}
