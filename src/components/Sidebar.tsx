'use client'
// CONTROL_LENS_PROJECT_NAV_V2
// Simplified project navigation: five direct destinations only.
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'
import { useVersionNavigation } from '@/components/VersionNavigation'
import { compareScheduleVersions, scheduleDataDate, browserDate } from '@/lib/versionBrowser'
import {
  getActiveProject, getActiveVersion, loadProjects,
  setActiveProjectId, setActiveVersionId,
  deleteProject, renameProject, deleteVersion, moveVersionToProject,
  getLatestVersion, migrateLegacyData,
  getProjectStatus, setProjectStatus,
  findDuplicateVersionIds, getVersionSnapshot,
  Project, ScheduleVersion, ProjectStatus,
} from '@/lib/projectStore'
import { createClient } from '@/lib/supabase/client'
import { usePermissions, roleLabel, roleBadgeColor } from '@/lib/usePermissions'
import CreateProjectModal from '@/components/CreateProjectModal'
import ProjectTeamModal from '@/components/ProjectTeamModal'
interface SidebarProps {
  user?: { name: string; role: string; initials: string; company: string }
}

// =============================================================================
// As of Day 9 (Phase 3A), the sidebar reads the actual signed-in user from
// Supabase via usePermissions(). The DEMO_MODE / DEMO_USER (Mike Anderson)
// scaffolding is gone. The `user` prop is still accepted for backward
// compatibility but is ignored when a real signed-in user is available.
// =============================================================================

const STATUS_OPTIONS: ProjectStatus[] = ['Active', 'Completed', 'On Hold', 'Archived']
export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [activeVersion, setActiveVersion] = useState<ScheduleVersion | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set())
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editProjectIdField, setEditProjectIdField] = useState('')
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(null)
  const [confirmDeleteVersionId, setConfirmDeleteVersionId] = useState<string | null>(null)
  const [confirmStatusChange, setConfirmStatusChange] = useState<{projectId: string, newStatus: ProjectStatus} | null>(null)
  const [movePickerForVersionId, setMovePickerForVersionId] = useState<string | null>(null)
  // Phase 3B — modal state for "Create New Project" (Owner/Admin only)
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false)
  // Phase 3D — Project Team modal (Owner/Admin/PM)
  const [teamModalForProject, setTeamModalForProject] = useState<Project | null>(null)

  // v14 — resizable sidebar. Default ~300px (was 256px / w-64 — too narrow
  // once version labels like DCDGS-CU-20240315-12 became standard). PM can
  // drag the right edge to anywhere between 240 and 520px. Width persists
  // in localStorage per user.
  const [sidebarWidth, setSidebarWidth] = useState<number>(300)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pl_sidebar_width')
      if (saved) {
        const n = parseInt(saved, 10)
        if (!isNaN(n) && n >= 240 && n <= 520) setSidebarWidth(n)
      }
    } catch {}
  }, [])

  // Drag handlers — attached to window during a drag so we keep tracking
  // even when the cursor exits the small handle div.
  useEffect(() => {
    if (!isDragging) return
    function onMove(e: MouseEvent) {
      const w = Math.max(240, Math.min(520, e.clientX))
      setSidebarWidth(w)
    }
    function onUp() {
      setIsDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    // Lock the cursor + prevent text selection while dragging
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging])

  // Persist width when drag ends (separate effect so it fires after the
  // setIsDragging(false) state update). Skip when dragging in progress.
  useEffect(() => {
    if (isDragging) return
    try { localStorage.setItem('pl_sidebar_width', String(sidebarWidth)) } catch {}
  }, [sidebarWidth, isDragging])

  // v14 — resizable Views section. Default 288px (matches the old max-h-72).
  // Drag the handle above "Views · {project}" to give it more or less room.
  // Projects list above auto-shrinks/grows via flex-1.
  const [viewsHeight, setViewsHeight] = useState<number>(288)
  const [isDraggingViews, setIsDraggingViews] = useState(false)
  const viewsDragStart = useRef<{ y: number; h: number } | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pl_sidebar_views_height')
      if (saved) {
        const n = parseInt(saved, 10)
        if (!isNaN(n) && n >= 100 && n <= 800) setViewsHeight(n)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!isDraggingViews) return
    function onMove(e: MouseEvent) {
      if (!viewsDragStart.current) return
      // Drag UP = positive delta = views section grows taller
      const delta = viewsDragStart.current.y - e.clientY
      const maxH = Math.max(200, Math.floor(window.innerHeight * 0.65))
      const newH = Math.max(100, Math.min(maxH, viewsDragStart.current.h + delta))
      setViewsHeight(newH)
    }
    function onUp() {
      setIsDraggingViews(false)
      viewsDragStart.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDraggingViews])

  useEffect(() => {
    if (isDraggingViews) return
    try { localStorage.setItem('pl_sidebar_views_height', String(viewsHeight)) } catch {}
  }, [viewsHeight, isDraggingViews])

  function startDragViews(e: React.MouseEvent) {
    e.preventDefault()
    viewsDragStart.current = { y: e.clientY, h: viewsHeight }
    setIsDraggingViews(true)
  }

  // v14 — per-user toggle state for the 4 date rows shown on each project
  // (NTP, Contract End, Revised End, Data Date). Stored in localStorage so
  // it persists across sessions and projects. Default = all ON.
  const [dateToggles, setDateToggles] = useState<{ ntp: boolean; contract: boolean; revised: boolean; dataDate: boolean }>({
    ntp: true, contract: true, revised: true, dataDate: true,
  })
  const [dateTogglesOpenForId, setDateTogglesOpenForId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pl_sidebar_date_toggles')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          setDateToggles(prev => ({ ...prev, ...parsed }))
        }
      }
    } catch {}
  }, [])

  function updateDateToggle(key: 'ntp' | 'contract' | 'revised' | 'dataDate') {
    setDateToggles(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('pl_sidebar_date_toggles', JSON.stringify(next)) } catch {}
      return next
    })
  }

  // Real signed-in user from Supabase (Day 9). Falls back to the prop if
  // provided by a parent (legacy) and there's no auth yet.
  const perms = usePermissions()
  const displayUser = perms.user
    ? {
        name: perms.user.displayName,
        role: roleLabel(perms.user.orgRole),
        initials: perms.user.initials,
        company: perms.user.company || perms.user.orgName || '',
        email: perms.user.email,
        roleKey: perms.user.orgRole,
      }
    : user
      ? { ...user, email: '', roleKey: null as any }
      : null
  const showTeamMode = !!displayUser?.company
  useEffect(() => {
    migrateLegacyData()
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [pathname])
  useEffect(() => {
    if (activeProject && !expandedProjectIds.has(activeProject.id)) {
      setExpandedProjectIds(prev => new Set([...Array.from(prev), activeProject.id]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id])
  useEffect(() => {
    if (!openActionMenu) return
    function handleClick() { setOpenActionMenu(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openActionMenu])
  function refresh() {
    const p = getActiveProject()
    setActiveProject(p)
    setActiveVersion(p ? getActiveVersion(p) : null)
    setProjects(loadProjects())
  }
  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('pl_')) localStorage.removeItem(key)
    })
    router.push('/login')
  }
  function maybeNavigateToDashboard() {
    if (!pathname.startsWith('/dashboard') || pathname === '/dashboard/projects') {
      router.push('/dashboard')
    }
  }
  const versionNavigation = useVersionNavigation()
  function selectVersion(projectId: string, versionId: string) {
    versionNavigation.request(projectId, versionId)
  }
  function openProjectLatest(projectId: string) {
    router.push(`/dashboard/projects?projectId=${encodeURIComponent(projectId)}`)
  }
  function toggleExpand(projectId: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation()
    setExpandedProjectIds(prev => {
      const next = new Set(Array.from(prev))
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }
  function startRename(project: Project) {
    setEditingProjectId(project.id)
    setEditName(project.name)
    setEditProjectIdField(project.projectId || '')
    setOpenActionMenu(null)
  }
  function saveRename() {
    if (editingProjectId && editName.trim()) {
      renameProject(editingProjectId, editName.trim(), editProjectIdField.trim() || undefined)
      refresh()
    }
    setEditingProjectId(null)
  }
  function handleDeleteProject(id: string) {
    if (!perms.can.softDeleteProject) {
      console.warn('[Sidebar] handleDeleteProject blocked — no softDeleteProject permission')
      setConfirmDeleteProjectId(null)
      return
    }
    deleteProject(id)
    refresh()
    setConfirmDeleteProjectId(null)
  }
  async function handleDeleteVersion(projectId: string, versionId: string) {
    if (!perms.can.deleteVersion) {
      console.warn('[Sidebar] handleDeleteVersion blocked — no deleteVersion permission')
      setConfirmDeleteVersionId(null)
      return
    }
    // Day 10 — deleteVersion now returns { ok, error } since it's soft-delete
    // with rules (can't delete last version on project).
    const result = await deleteVersion(projectId, versionId)
    if (!result.ok) {
      alert(result.error || 'Failed to delete version.')
      setConfirmDeleteVersionId(null)
      return
    }
    refresh()
    setConfirmDeleteVersionId(null)
  }
  function handleMoveVersion(fromProjectId: string, versionId: string, toProjectId: string) {
    if (!perms.can.hardDeleteProject) {
      console.warn('[Sidebar] handleMoveVersion blocked — no hardDeleteProject permission')
      setMovePickerForVersionId(null)
      return
    }
    moveVersionToProject(fromProjectId, versionId, toProjectId)
    setMovePickerForVersionId(null)
    refresh()
  }
  function handleSetStatus(projectId: string, status: ProjectStatus) {
    // Phase 3D — defense in depth: block if no permission, even if UI was bypassed
    if (!perms.can.changeProjectStatus) {
      console.warn('[Sidebar] handleSetStatus blocked — no changeProjectStatus permission')
      setOpenActionMenu(null)
      return
    }
    // PMs can't directly pick "Archived" — UI filters it out, but block at
    // function level too (defense in depth).
    if (status === 'Archived' && !perms.can.archiveProject) {
      console.warn('[Sidebar] handleSetStatus blocked — PMs cannot Archive directly')
      setOpenActionMenu(null)
      return
    }
    if (status === 'Active') {
      setProjectStatus(projectId, status)
      setOpenActionMenu(null)
      refresh()
      return
    }
    setConfirmStatusChange({ projectId, newStatus: status })
    setOpenActionMenu(null)
  }
  function applyStatusChange() {
    if (!confirmStatusChange) return
    setProjectStatus(confirmStatusChange.projectId, confirmStatusChange.newStatus)
    setConfirmStatusChange(null)
    refresh()
  }
  function statusChangeMessage(status: ProjectStatus): { headline: string; body: string; confirmBg: string } {
    if (status === 'Completed') return {
      headline: 'Mark as Completed?',
      body: 'Project moves to the Archive page. Restorable any time.',
      confirmBg: 'bg-emerald-600 hover:bg-emerald-700',
    }
    if (status === 'On Hold') return {
      headline: 'Set to On Hold?',
      body: 'Project stays in sidebar with an "On Hold" badge. Schedule work is paused.',
      confirmBg: 'bg-amber-600 hover:bg-amber-700',
    }
    if (status === 'Archived') return {
      headline: 'Archive this project?',
      body: 'Project moves to the Archive page. Restorable any time.',
      confirmBg: 'bg-slate-600 hover:bg-slate-700',
    }
    return { headline: 'Change status?', body: '', confirmBg: 'bg-blue-600 hover:bg-blue-700' }
  }
  const archivedCount = projects.filter(p => {
    const s = getProjectStatus(p)
    return s === 'Archived' || s === 'Completed'
  }).length
  const deletedCount = projects.filter(p => getProjectStatus(p) === 'Deleted').length
  const filteredProjects = (() => {
    const q = searchQuery.trim().toLowerCase()
    let pool = projects.filter(p => {
      const s = getProjectStatus(p)
      return s !== 'Archived' && s !== 'Deleted' && s !== 'Completed'
    })
    if (!q) return pool
    return pool.filter(p => {
      if (p.name.toLowerCase().includes(q)) return true
      if (p.projectId?.toLowerCase().includes(q)) return true
      return p.versions.some(v =>
        v.fileName?.toLowerCase().includes(q) ||
        v.versionLabel?.toLowerCase().includes(q)
      )
    })
  })()
  const isProjectExpanded = (projectId: string) => {
    if (searchQuery.trim()) return true
    return expandedProjectIds.has(projectId)
  }
  function getConditionDotColor(condition?: string): string {
    if (condition === 'Recovery Required') return 'bg-red-400'
    if (condition === 'Attention Needed') return 'bg-amber-400'
    if (condition === 'Monitor Closely') return 'bg-yellow-400'
    if (condition === 'Stable') return 'bg-green-400'
    return 'bg-slate-500'
  }
  function formatDisplayDate(d?: string): string {
    if (!d) return '—'
    const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`
    try {
      const dt = new Date(d)
      if (isNaN(dt.getTime())) return '—'
      const mm = String(dt.getMonth() + 1).padStart(2, '0')
      const dd = String(dt.getDate()).padStart(2, '0')
      return `${mm}/${dd}/${dt.getFullYear()}`
    } catch { return '—' }
  }
  function shortDate(d?: string) {
    if (!d) return ''
    return formatDisplayDate(d)
  }
  // v14 — user-facing snapshot dates use U.S. MM/DD/YYYY format.
  // Stored values remain unchanged for sorting/calculation.
  function fmtSnap(d?: string): string {
    return formatDisplayDate(d)
  }
  // Per-project navigation intentionally exposes only the core workspaces that
  // answer the user's real questions. Detailed tools remain available inside
  // Full CPM Analysis, Review Schedule, Project Controls, Reports, and
  // Schedules & Versions.
  // Workspace-level navigation (Enterprise, Archive, Deleted, Settings,
  // Portfolio) remains separate and unchanged below.
  const allViews = activeProject ? [
    { href: '/dashboard', icon: '⊞', label: 'Overview', group: 'PROJECT WORKSPACE', requires: 'view' as const },
    { href: '/dashboard/approval', icon: '✅', label: 'Review Schedule', group: 'PROJECT WORKSPACE', requires: 'view' as const },
    { href: '/dashboard/lens', icon: '⌕', label: 'Full CPM Analysis', group: 'PROJECT WORKSPACE', requires: 'view' as const },
    { href: '/dashboard/controls', icon: '⚙', label: 'Project Controls', group: 'PROJECT WORKSPACE', requires: 'view' as const },
    { href: '/dashboard/reports', icon: '📄', label: 'Reports', group: 'PROJECT WORKSPACE', requires: 'view' as const },
    { href: '/dashboard/projects', icon: '▤', label: 'Schedules & Versions', group: 'PROJECT WORKSPACE', requires: 'view' as const },
  ] : []
  // All destinations are available to anyone who can view the active
  // project. Permission checks remain inside the destination pages/actions.
  const views = allViews
  const isEnterpriseActive = pathname.startsWith('/dashboard/enterprise')
  const isArchiveActive = pathname.startsWith('/dashboard/archive')
  const isDeletedActive = pathname.startsWith('/dashboard/deleted')
  const isSettingsActive = pathname.startsWith('/dashboard/settings')
  return (
    <aside
      className="flex-shrink-0 flex flex-col h-full no-print relative"
      style={{ background: '#0d1b2e', width: `${sidebarWidth}px` }}
    >
      <div className="px-4 py-4 border-b border-white/10 flex-shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex-shrink-0">
            <svg width="28" height="20" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-label="CPMreview mark">
              <rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/>
              <rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/>
              <rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/>
              <rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/>
            </svg>
          </div>
          <div>
            <div className="text-white font-extrabold text-sm tracking-tight">
              CPM<span className="text-blue-500">review</span>
            </div>
            <div className="text-white/30 text-[9px]">Construction Schedule Review</div>
          </div>
        </Link>
      </div>
      {showTeamMode && (
        <div className="px-4 py-2.5 border-b border-white/5 flex-shrink-0">
          <div className="text-white/30 text-[9px] uppercase tracking-widest mb-0.5">Workspace</div>
          <div className="text-white text-xs font-semibold leading-tight">{displayUser!.company}</div>
        </div>
      )}
      {displayUser && (
        <div className="px-4 py-2.5 border-b border-white/5 flex-shrink-0 flex items-center gap-2.5" title={(displayUser as any).email || ''}>
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            {displayUser.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white text-xs font-semibold truncate">{displayUser.name}</div>
            <div className="flex items-center gap-1.5">
              {(displayUser as any).roleKey ? (
                <span className={clsx(
                  'text-[8px] font-bold px-1.5 py-px rounded-full uppercase tracking-wide flex-shrink-0',
                  roleBadgeColor((displayUser as any).roleKey)
                )}>
                  {displayUser.role}
                </span>
              ) : (
                <span className="text-white/40 text-[10px] truncate">{displayUser.role}</span>
              )}
              {(displayUser as any).email && (
                <span className="text-white/40 text-[10px] truncate flex-1 min-w-0">{(displayUser as any).email}</span>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0 relative">
        <Link href="/dashboard/projects" className="block rounded-lg bg-blue-600/20 border border-blue-400/30 text-white text-sm font-semibold px-3 py-3">Projects & Versions →</Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {activeProject && !['/dashboard/projects', '/dashboard/enterprise'].includes(pathname) && <>
          <div className="px-2 pb-3 border-b border-white/10 mb-3">
            <div className="text-white font-semibold text-sm break-words">{activeProject.name}</div>
            <div className="text-blue-300 text-xs mt-1">Data date: {activeVersion ? browserDate(scheduleDataDate(activeVersion)) : 'Not selected'}</div>
            <div className="text-slate-400 text-xs mt-1 break-words">{activeVersion?.versionLabel || activeVersion?.fileName}</div>
            <Link className="inline-block text-blue-300 text-xs mt-2" href={`/dashboard/projects?projectId=${encodeURIComponent(activeProject.id)}`}>Change version →</Link>
          </div>
          {views.filter(item => item.href !== '/dashboard/projects').map(item => {
            const active = item.href === '/dashboard' ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')
            return <Link key={item.href} href={item.href} className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm my-1', active ? 'bg-blue-600/25 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white')}><span>{item.icon}</span>{item.label}</Link>
          })}
        </>}
      </div>
      {/* WORKSPACE NAV — Enterprise / Archive / Deleted / Settings */}
      <div className="border-t border-white/10 px-2 py-2 flex-shrink-0">
        <div className="text-white/30 text-[9px] uppercase tracking-widest px-2 py-1">
          Workspace
        </div>
        {/* NEW: Enterprise Dashboard link */}
        <Link href="/dashboard/enterprise"
          className={clsx(
            'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[11px] font-medium border-l-2',
            isEnterpriseActive
              ? 'bg-blue-600/20 text-white border-blue-500'
              : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
          )}>
          <span className="text-sm w-4 text-center">📊</span>
          <span className="flex-1">Enterprise Dashboard</span>
        </Link>
        <Link href="/dashboard/archive"
          className={clsx(
            'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[11px] font-medium border-l-2',
            isArchiveActive
              ? 'bg-blue-600/20 text-white border-blue-500'
              : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
          )}>
          <span className="text-sm w-4 text-center">📁</span>
          <span className="flex-1">Archive Projects</span>
          {archivedCount > 0 && (
            <span className="bg-white/10 text-white/60 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {archivedCount}
            </span>
          )}
        </Link>
        <Link href="/dashboard/deleted"
          className={clsx(
            'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[11px] font-medium border-l-2',
            isDeletedActive
              ? 'bg-blue-600/20 text-white border-blue-500'
              : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
          )}>
          <span className="text-sm w-4 text-center">🗑</span>
          <span className="flex-1">Deleted Items</span>
          {deletedCount > 0 && (
            <span className="bg-red-500/30 text-red-300 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {deletedCount}
            </span>
          )}
        </Link>
        <Link href="/dashboard/settings"
          className={clsx(
            'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[11px] font-medium border-l-2',
            isSettingsActive
              ? 'bg-blue-600/20 text-white border-blue-500'
              : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
          )}>
          <span className="text-sm w-4 text-center">⚙</span>
          <span className="flex-1">Settings</span>
        </Link>
        <Link href="/dashboard/settings?tab=workspace#help"
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[11px] font-medium border-l-2 text-slate-400 border-transparent hover:text-white hover:bg-white/5">
          <span className="text-sm w-4 text-center">❓</span>
          <span className="flex-1">Help & Support</span>
        </Link>
        {/* Day 10 — Platform owner only. Sidebar link hidden for everyone
            else. Page enforces same check (3 layers of protection). */}
        {perms.isPlatformOwner && (
          <Link href="/dashboard/portfolio"
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[11px] font-medium border-l-2 text-purple-300 border-transparent hover:text-white hover:bg-purple-500/10 mt-1 border-t border-white/10 pt-2"
            title="CPMreview staff only — cross-org view">
            <span className="text-sm w-4 text-center">🌐</span>
            <span className="flex-1">Portfolio</span>
            <span className="text-[8px] bg-purple-500/30 text-purple-200 px-1 rounded font-bold">STAFF</span>
          </Link>
        )}
      </div>
      <div className="px-3 py-2.5 border-t border-white/10 flex-shrink-0">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs border border-white/10 hover:border-white/20">
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>

      {/* v14 — resize handle on the right edge. Sits over the border, narrow
          enough to not block content. Hover/drag state lights up blue. */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setIsDragging(true) }}
        className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize transition-colors ${
          isDragging ? 'bg-blue-500/60' : 'hover:bg-blue-500/40'
        }`}
        title="Drag to resize sidebar"
      />

      {/* Phase 3B — Create Project modal (visible only to Owner/Admin via the
          button gate above; modal itself is always mounted but invisible) */}
      <CreateProjectModal
        open={createProjectModalOpen}
        onClose={() => setCreateProjectModalOpen(false)}
        redirectTo="upload"
      />

      {/* Phase 3D — Project Team modal (Owner/Admin/PM manage who has access) */}
      {teamModalForProject && (
        <ProjectTeamModal
          open={!!teamModalForProject}
          onClose={() => setTeamModalForProject(null)}
          projectId={teamModalForProject.id}
          projectName={teamModalForProject.name}
          projectCode={teamModalForProject.projectId || ''}
        />
      )}
    </aside>
  )
}
