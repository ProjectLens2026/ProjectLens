'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

const nav = [
  { group: 'Overview', items: [
    { href: '/dashboard', icon: '⊞', label: 'Dashboard' },
    { href: '/dashboard/projects', icon: '🏗', label: 'Projects' },
  ]},
  { group: 'Project Controls', items: [
    { href: '/dashboard/schedule', icon: '📅', label: 'Schedule', badge: '' },
    { href: '/dashboard/risks', icon: '⚠', label: 'Risks & Issues', badge: '4' },
    { href: '/dashboard/procurement', icon: '🚚', label: 'Procurement' },
    { href: '/dashboard/rfis', icon: '❓', label: 'RFIs', badge: '6' },
    { href: '/dashboard/submittals', icon: '📋', label: 'Submittals' },
    { href: '/dashboard/changes', icon: '🔄', label: 'Change Orders' },
  ]},
  { group: 'Field & Reporting', items: [
    { href: '/dashboard/site', icon: '👷', label: 'Site Reports' },
    { href: '/dashboard/meetings', icon: '🤝', label: 'Meetings' },
    { href: '/dashboard/documents', icon: '📁', label: 'Documents' },
  ]},
  { group: 'Intelligence', items: [
    { href: '/dashboard/lens', icon: '🔍', label: 'Project Lens' },
    { href: '/dashboard/upload', icon: '⬆', label: 'Upload Schedule' },
    { href: '/dashboard/tia', icon: '📑', label: 'TIA Comparison' },
  ]},
]

interface SidebarProps {
  user?: { name: string; role: string; initials: string; company: string }
  projectName?: string
  condition?: string
}

export default function Sidebar({ user, projectName = 'Riverside Commercial Tower', condition = 'Attention Needed' }: SidebarProps) {
  const pathname = usePathname()

  const condColor = condition === 'Stable' ? 'text-green-400' :
                   condition.includes('Recovery') ? 'text-red-400' : 'text-yellow-400'
  const condDot = condition === 'Stable' ? 'bg-green-400' :
                  condition.includes('Recovery') ? 'bg-red-400' : 'bg-yellow-400'

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-full" style={{ background: '#0d1b2e' }}>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2.5">
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
        </div>
      </div>

      {/* Active project pill */}
      <div className="mx-3 my-3 bg-white/5 rounded-lg p-3 border border-white/10 flex-shrink-0">
        <div className="text-white/30 text-[9px] uppercase tracking-widest mb-1">Active Project</div>
        <div className="text-white text-xs font-semibold leading-tight">{projectName}</div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${condDot} animate-pulse`} />
          <span className={`text-[10px] font-medium ${condColor}`}>{condition}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {nav.map(group => (
          <div key={group.group} className="mb-1">
            <div className="text-white/25 text-[9px] uppercase tracking-widest px-2 py-2">{group.group}</div>
            {group.items.map(item => {
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

      {/* User */}
      {user && (
        <div className="px-3 py-3 border-t border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
              {user.initials}
            </div>
            <div className="min-w-0">
              <div className="text-white text-xs font-semibold truncate">{user.name}</div>
              <div className="text-white/40 text-[10px] truncate">{user.role}</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
