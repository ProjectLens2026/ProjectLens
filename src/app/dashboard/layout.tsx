'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import { migrateLegacyData } from '@/lib/projectStore'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return
      if (error || !data.user) {
        router.replace('/login?error=session_expired')
        return
      }
      setUser(data.user)
      setLoading(false)
      // Migrate any pre-existing localStorage data so the dashboard works the
      // first time a returning user signs in.
      try { migrateLegacyData() } catch {}
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          {/* Loading screen — pulsing 4-bar mark */}
          <div className="inline-flex items-center gap-2.5 mb-4 animate-pulse">
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
          <p className="text-slate-400 text-sm">Loading your workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar user={user} />
      <main className="flex-1 ml-64 overflow-y-auto">{children}</main>
    </div>
  )
}
