'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'
import { getActiveProject, loadProjects, Project } from '@/lib/projectStore'

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

  function handleSignOut() {
    localStorage.removeItem('pl_user')
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
        { href: '/dashboard/lens', icon: '🔍', label: 'ProjectLens Analysis' },
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
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10 flex-shrink-0">
        <Link href="/dashboard/projects" className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <circle cx="11" cy="11" r="4"/><circle cx="11" cy="11" r="8.5"/>
              <line x1="2.5" y1="11" x2="5" y2="11"/><line x1="17" y1="11" x2="19.5" y2="11"/>
            </svg>
          </div>
          <div>
            <div className="text-white font-extrabold text-sm tracking-tight">ProjectLens</div>
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
