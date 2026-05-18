'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import HelpWidget from '@/components/HelpWidget'
import { migrateLegacyData, loadProjects, getActiveProjectId, setActiveProjectId } from '@/lib/projectStore'
import { createClient } from '@/lib/supabase/client'

interface AppUser {
  name: string
  email: string
  company: string
  role: string
  initials: string
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<AppUser | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }

      // Email must be verified before they can access the dashboard
      if (!session.user.email_confirmed_at) {
        await supabase.auth.signOut()
        router.replace('/login?error=email_not_verified')
        return
      }

      // Load profile data (name, company, role) from the profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      const name = profile?.name || session.user.email || 'User'
      const initials = name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

      setUser({
        name,
        email: session.user.email || '',
        company: profile?.company || '',
        role: profile?.role || 'Project Manager',
        initials,
      })

      // Local project data setup. Phase 3 will migrate these to Supabase.
      migrateLegacyData()
      const projects = loadProjects()
      if (projects.length > 0 && !getActiveProjectId()) {
        setActiveProjectId(projects[0].id)
      }

      setChecking(false)
    }

    checkAuth()

    // React to sign-out from any tab
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
    })

    return () => {
      subscription.subscription.unsubscribe()
    }
  }, [router])

  if (checking || !user) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        {/* Loading mark — ControlLens 4-bar mark, pulsing.
            44x32 dimensions match the other inline marks across the app
            (login, auth pages, sidebar). The animate-pulse class gives the
            soft fade in/out during the brief auth-check window. */}
        <svg width="44" height="32" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" className="animate-pulse" aria-label="ControlLens mark">
          <rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/>
          <rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/>
          <rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/>
          <rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/>
        </svg>
        <div className="text-white/40 text-sm">Loading ControlLens...</div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar user={user} />
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {children}
      </div>
      <HelpWidget />
    </div>
  )
}
