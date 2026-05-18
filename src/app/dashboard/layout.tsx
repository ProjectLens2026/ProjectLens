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
        {/* Loading mark — ControlLens Crosshair Lens, pulsing.
            36x36 size feels right for a loading state — large enough to read,
            small enough not to dominate. Same geometry as the auth and sidebar
            marks. */}
        <svg width="36" height="36" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" className="animate-pulse" aria-label="ControlLens mark">
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
