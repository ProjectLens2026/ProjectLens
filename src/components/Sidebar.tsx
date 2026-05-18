'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'
import { getActiveProject, loadProjects, Project } from '@/lib/projectStore'
import { createClient } from '@/lib/supabase/client'

interface SidebarProps {
  user?: { name: string; role: string; initials: string; company: string }
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [totalProjects, setTotalProjects] = useState(0)

  useEffect(() => {
    refreshProject()
    // Poll for changes (when user uploads new project, switches projects, etc.)
    const interval = setInterval(refreshProject, 1000)
    return () => clearInterval(interval)
  }, [pathname])

  function refreshProject() {
    const p = getActiveProject()
    setActiveProject(p)
    setTotalProjects(loadProjects().length)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Clear any local project data so the next user on this browser starts clean.
    // Phase 3 (data migration to Supabase) will make this unnecessary.
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('pl_')) localStorage.removeItem(key)
    })
    router.push('/login')
  }

  const latest = activeProject?.versions?.[0]
  const analysis = latest?.analysis
  const condition = analysis?.condition || 'No data'
  const condColor = condition === 'Stable' ? 'text-green-400' :
                   condition.includes('Recovery') ? 'text-red-400' :
                   condition.includes('Attention') ? 'text-amber-400' :
                   condition.includes('Monitor') ? 'text-yellow-400' : 'text-slate-400'
  const condDot = condition === 'Stable' ? 'bg-green-400' :
                  condition.includes('Recovery') ? 'bg-red-400' :
                  condition.includes('Attention') ? 'bg-amber-400' :
                  condition.includes('Monitor') ? 'bg-yellow-400' : 'bg-slate-400'

  // Build nav based on whether there's an active project
  const overviewItems = [
    { href: '/dashboard/projects', icon: '🏗', label: 'Projects', badge: totalProjects > 0 ? String(totalProjects) : null },
  ]

  const projectScopedNav = activeProject ? [
    {
      group: 'Active Project',
      items: [
        { href: '/dashboard', icon: '⊞', label: 'Dashboard' },
        // Was "NobelPM Analysis" — renamed to "Schedule Analysis" during rebrand.
        // Clearer label that describes what the page actually does.
        { href: '/dashboard/lens', icon: '🔍', label: 'Schedule Analysis' },
      ]
    },
    {
      group: 'Project Controls',
      items: [
        { href: '/dashboard/risks', icon: '⚠', label: 'Risks & Issues' },
        { href: '/dashboard/procurement', icon: '🚚', label: 'Procurement' },
        { href: '/dashboard/rfis', icon: '❓', label: 'RFIs', badge: activeProject.rfis.length > 0 ? String(activeProject.rfis.length) : null },
        { href: '/dashboard/submittals', icon: '📋', label: 'Submittals' },
        { href: '/dashboard/changes', icon: '🔄', label: 'Change Orders' },
      ]
    },
    {
      group: 'Schedule Tools',
      items: [
        { href: '/dashboard/upload', icon: '⬆', label: 'Upload New Version' },
        { href: '/dashboard/trend', icon: '📈', label: 'Trend Analysis' },
        { href: '/dashboard/tia', icon: '📑', label: 'TIA Comparison' },
      ]
    },
  ] : []

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-full no-print" style={{ background: '#0d1b2e' }}>
      {/* Logo — ControlLens Crosshair Lens.
          Sidebar uses a slightly smaller mark (28x28) so it fits the compact
          left-rail layout. Same lens geometry as the auth pages. */}
      <div className="px-4 py-5 border-b border-white/10 flex-shrink-0">
        <Link href="/dashboard/projects" className="flex items-center gap-2.5">
          <div className="flex-shrink-0">
            <svg width="28" height="28" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
              {/* Lens body */}
              <circle cx="20" cy="20" r="15.3" fill="#0f172a"/>
              <circle cx="20" cy="20" r="13.3" fill="#f8fafc"/>
              {/* Schedule bars clipped to lens face */}
              <g style={{ clipPath: 'circle(13.3px at 20px 20px)' }}>
                <rect x="8.4" y="13.9" width="16.7" height="2.3" rx="0.4" fill="#2563eb"/>
                <rect x="8.4" y="17.2" width="22.6" height="2.3" rx="0.4" fill="#dc2626"/>
                <rect x="8.4" y="20.5" width="13.8" height="2.3" rx="0.4" fill="#16a34a"/>
                <rect x="8.4" y="23.8" width="18.2" height="2.3" rx="0.4" fill="#1f2937"/>
              </g>
              {/* Crosshair overlay */}
              <g style={{ clipPath: 'circle(13.3px at 20px 20px)' }} opacity="0.55">
                <line x1="4.7" y1="20" x2="16.4" y2="20" stroke="#0f172a" strokeWidth="0.5"/>
                <line x1="23.6" y1="20" x2="35.3" y2="20" stroke="#0f172a" strokeWidth="0.5"/>
                <line x1="20" y1="4.7" x2="20" y2="16.4" stroke="#0f172a" strokeWidth="0.5"/>
                <line x1="20" y1="23.6" x2="20" y2="35.3" stroke="#0f172a" strokeWidth="0.5"/>
                <circle cx="20" cy="20" r="0.6" fill="#0f172a"/>
              </g>
            </svg>
          </div>
          <div>
            <div className="text-white font-extrabold text-sm tracking-tight">
              Control<span className="text-blue-500">Lens</span>
            </div>
            <div className="text-white/30 text-[9px]">Construction Intelligence</div>
          </div>
        </Link>
      </div>

      {/* Active project pill */}
      <div className="mx-3 my-3 bg-white/5 rounded-lg p-3 border border-white/10 flex-shrink-0">
        <div className="text-white/30 text-[9px] uppercase tracking-widest mb-1">Active Project</div>
        {activeProject ? (
          <>
            <div className="text-white text-xs font-semibold leading-tight truncate" title={activeProject.name}>
              {activeProject.name}
            </div>
            {analysis ? (
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${condDot} animate-pulse`} />
                <span className={`text-[10px] font-medium ${condColor}`}>{condition}</span>
              </div>
            ) : (
              <div className="text-[10px] text-white/40 mt-1.5">No schedule uploaded</div>
            )}
          </>
        ) : (
          <>
            <div className="text-white/60 text-xs italic">No active project</div>
            <Link href="/dashboard/projects" className="text-[10px] text-blue-400 hover:underline mt-1 inline-block">
              Select a project →
            </Link>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {/* Overview - always shown */}
        <div className="mb-1">
          <div className="text-white/25 text-[9px] uppercase tracking-widest px-2 py-2">Overview</div>
          {overviewItems.map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                className={clsx(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 transition-all text-xs font-medium border-l-2',
                  active
                    ? 'bg-blue-600/20 text-white border-blue-500'
                    : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
                )}>
                <span className="text-sm w-4 text-center">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{item.badge}</span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Project-scoped nav - only shown when a project is active */}
        {projectScopedNav.map(group => (
          <div key={group.group} className="mb-1">
            <div className="text-white/25 text-[9px] uppercase tracking-widest px-2 py-2">{group.group}</div>
            {group.items.map((item: any) => {
              const active = pathname === item.href
              return (
                <Link key={item.href} href={item.href}
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 transition-all text-xs font-medium border-l-2',
                    active
                      ? 'bg-blue-600/20 text-white border-blue-500'
                      : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
                  )}>
                  <span className="text-sm w-4 text-center">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{item.badge}</span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* User + Sign Out */}
      {user && (
        <div className="px-3 py-3 border-t border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              {user.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white text-xs font-semibold truncate">{user.name}</div>
              <div className="text-white/40 text-[10px] truncate">{user.role}</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs border border-white/10 hover:border-white/20">
            <span>🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </aside>
  )
}
