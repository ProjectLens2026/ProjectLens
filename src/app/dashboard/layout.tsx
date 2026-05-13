'use client'
import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { migrateLegacyData, loadProjects, getActiveProjectId, setActiveProjectId } from '@/lib/projectStore'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Auth check
    const stored = localStorage.getItem('pl_user')
    if (!stored) {
      router.replace('/login')
      return
    }
    try {
      setUser(JSON.parse(stored))
    } catch {
      router.replace('/login')
      return
    }

    // Migrate any legacy data into project store
    migrateLegacyData()

    // If user has projects but no active project ID, set first one
    const projects = loadProjects()
    if (projects.length > 0 && !getActiveProjectId()) {
      setActiveProjectId(projects[0].id)
    }

    setChecking(false)
  }, [router])

  // Show loading state while checking auth
  if (checking || !user) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center animate-pulse">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <circle cx="11" cy="11" r="4"/><circle cx="11" cy="11" r="8.5"/>
          </svg>
        </div>
        <div className="text-white/40 text-sm">Loading ProjectLens...</div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar user={user} />
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}
