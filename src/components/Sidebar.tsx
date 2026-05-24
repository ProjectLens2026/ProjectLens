'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'
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
  function selectVersion(projectId: string, versionId: string) {
    setActiveProjectId(projectId)
    setActiveVersionId(versionId)
    refresh()
    maybeNavigateToDashboard()
  }
  function openProjectLatest(projectId: string) {
    const project = projects.find(p => p.id === projectId)
    if (!project) return
    const latest = getLatestVersion(project)
    setActiveProjectId(projectId)
    if (latest) {
      setActiveVersionId(latest.id)
      refresh()
      maybeNavigateToDashboard()
    } else {
      // Phase 3B — empty shell. No baseline yet. Send to upload page so the
      // PM can put one in. Dashboard would have nothing to render.
      setActiveVersionId(null)
      refresh()
      router.push('/dashboard/upload')
    }
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
  function handleDeleteVersion(projectId: string, versionId: string) {
    if (!perms.can.deleteVersion) {
      console.warn('[Sidebar] handleDeleteVersion blocked — no deleteVersion permission')
      setConfirmDeleteVersionId(null)
      return
    }
    deleteVersion(projectId, versionId)
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
    if (!perms.can.archiveProject) {
      console.warn('[Sidebar] handleSetStatus blocked — no archiveProject permission')
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
  function shortDate(d?: string) {
    if (!d) return ''
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch { return '' }
  }
  // v14 — format a snapshot date row value. Returns '—' if missing.
  function fmtSnap(d?: string): string {
    if (!d) return '—'
    return d.slice(0, 10)  // YYYY-MM-DD as-is, no locale conversion
  }
  // Per-project views — order is what the user sees in the sidebar.
  // v13: Earned Value link added between Schedule Analysis and Risks & Issues.
  // Page lives at /dashboard/evm (standalone, not a tab inside Lens).
  const views = activeProject ? [
    { href: '/dashboard', icon: '⊞', label: 'Overview' },
    { href: '/dashboard/report', icon: '📄', label: 'Complete Report' },
    { href: '/dashboard/lens', icon: '🔍', label: 'Schedule Analysis' },
    { href: '/dashboard/evm', icon: '💰', label: 'Earned Value' },
    { href: '/dashboard/risks', icon: '⚠', label: 'Risks & Issues' },
    { href: '/dashboard/procurement', icon: '🚚', label: 'Procurement' },
    { href: '/dashboard/rfis', icon: '❓', label: 'RFIs', badge: activeProject.rfis.length > 0 ? String(activeProject.rfis.length) : null },
    { href: '/dashboard/submittals', icon: '📋', label: 'Submittals' },
    { href: '/dashboard/changes', icon: '🔄', label: 'Change Orders' },
    { href: '/dashboard/upload', icon: '⬆', label: 'Upload Version' },
    { href: '/dashboard/trend', icon: '📈', label: 'Trend Analysis' },
    { href: '/dashboard/tia', icon: '📑', label: 'TIA Comparison' },
  ] : []
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
            <svg width="28" height="20" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
              <rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/>
              <rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/>
              <rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/>
              <rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/>
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
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search projects or versions"
          className="w-full bg-white/5 border border-white/10 text-white text-xs placeholder-white/40 pl-7 pr-2 py-1.5 rounded-md outline-none focus:border-blue-500/50"
        />
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40 text-[11px] pointer-events-none">🔍</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {projects.length === 0 && (
          <div className="text-center py-4 text-white/40 text-xs">No projects yet</div>
        )}
        {searchQuery && filteredProjects.length === 0 && (
          <div className="text-center py-4 text-white/40 text-xs">
            No matches for "{searchQuery}"
          </div>
        )}
        {searchQuery && filteredProjects.length > 0 && (
          <div className="px-2 pt-1 pb-2 text-[9px] text-white/40 uppercase tracking-widest">
            {filteredProjects.length} match{filteredProjects.length !== 1 ? 'es' : ''}
          </div>
        )}
        {filteredProjects.map(p => {
          const isExpanded = isProjectExpanded(p.id)
          const isActive = activeProject?.id === p.id
          const isEditing = editingProjectId === p.id
          const isConfirmingDelete = confirmDeleteProjectId === p.id
          const isConfirmingStatusChange = confirmStatusChange?.projectId === p.id
          const isActionMenuOpen = openActionMenu === `project:${p.id}`
          const latest = getLatestVersion(p)
          const condition = latest?.analysis?.condition
          const status = getProjectStatus(p)
          const isCompleted = status === 'Completed'
          const isOnHold = status === 'On Hold'
          const isActiveStatus = status === 'Active'
          // Phase 3B — project shell with no uploaded baseline yet. Created by
          // an Admin via the Create Project modal. PM uploads baseline next.
          const isAwaitingBaseline = p.versions.length === 0
          return (
            <div key={p.id} className="mb-0.5">
              {isEditing ? (
                <div className="bg-white/5 rounded-md p-2 mx-0.5">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Project Name"
                    autoFocus
                    className="w-full bg-white/10 border border-blue-500/50 text-white text-xs px-2 py-1 rounded mb-1.5 outline-none"
                  />
                  <input
                    value={editProjectIdField}
                    onChange={e => setEditProjectIdField(e.target.value)}
                    placeholder="Contract # (optional)"
                    className="w-full bg-white/10 border border-white/15 text-white text-[10px] font-mono px-2 py-1 rounded mb-1.5 outline-none"
                  />
                  <div className="flex gap-1">
                    <button onClick={saveRename}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-1 rounded">Save</button>
                    <button onClick={() => setEditingProjectId(null)}
                      className="flex-1 bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold py-1 rounded">Cancel</button>
                  </div>
                </div>
              ) : isConfirmingStatusChange && confirmStatusChange ? (
                (() => {
                  const msg = statusChangeMessage(confirmStatusChange.newStatus)
                  return (
                    <div className="bg-blue-500/15 border border-blue-500/40 rounded-md p-2 mx-0.5">
                      <div className="text-blue-200 text-[10px] font-semibold mb-1">{msg.headline}</div>
                      <div className="text-blue-300/80 text-[9px] mb-2 truncate" title={p.name}>
                        {p.name} · {msg.body}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={applyStatusChange}
                          className={clsx('flex-1 text-white text-[10px] font-bold py-1 rounded', msg.confirmBg)}>Confirm</button>
                        <button onClick={() => setConfirmStatusChange(null)}
                          className="flex-1 bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold py-1 rounded">Cancel</button>
                      </div>
                    </div>
                  )
                })()
              ) : isConfirmingDelete ? (
                <div className="bg-amber-500/15 border border-amber-500/40 rounded-md p-2 mx-0.5">
                  <div className="text-amber-200 text-[10px] font-semibold mb-1">Move to Deleted Items?</div>
                  <div className="text-amber-300/80 text-[9px] mb-2 truncate" title={p.name}>
                    {p.name} · restorable from Deleted Items
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleDeleteProject(p.id)}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold py-1 rounded">Delete</button>
                    <button onClick={() => setConfirmDeleteProjectId(null)}
                      className="flex-1 bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold py-1 rounded">Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  className={clsx(
                    'group flex items-center gap-1 px-1.5 py-1.5 rounded-md transition-colors',
                    isActive ? 'bg-white/5' : 'hover:bg-white/5'
                  )}
                >
                  <button
                    onClick={(e) => toggleExpand(p.id, e)}
                    className="w-4 text-white/40 text-[10px] flex-shrink-0 text-center"
                    title={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? '▾' : '▸'}
                  </button>
                  <div
                    onClick={() => openProjectLatest(p.id)}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    {/* v14 — Project ID is now the primary identifier (mono,
                        prominent at top). Project name moves to a smaller
                        line below. Both are LOCKED — rename via ⋮ menu only. */}
                    <div className="flex items-center gap-1.5">
                      {condition && (
                        <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', getConditionDotColor(condition))} title={condition} />
                      )}
                      <span className={clsx(
                        'text-sm font-semibold font-mono truncate tracking-tight',
                        isCompleted ? 'text-white/60' : 'text-white'
                      )} title={p.projectId || '(no Project ID)'}>{p.projectId || '— no ID —'}</span>
                      {isAwaitingBaseline && isActiveStatus && (
                        <span className="text-[8px] font-bold px-1.5 py-px rounded-full bg-amber-500/30 text-amber-300 uppercase tracking-wide flex-shrink-0" title="No baseline uploaded yet — open the project to upload">
                          Awaiting Baseline
                        </span>
                      )}
                      {!isAwaitingBaseline && isActiveStatus && (
                        <span className="text-[8px] font-bold px-1.5 py-px rounded-full bg-green-500/25 text-green-300 uppercase tracking-wide flex-shrink-0">Active</span>
                      )}
                      {isOnHold && (
                        <span className="text-[8px] font-bold px-1.5 py-px rounded-full bg-amber-500/25 text-amber-300 uppercase tracking-wide flex-shrink-0">On Hold</span>
                      )}
                      {isCompleted && (
                        <span className="text-[8px] font-bold px-1.5 py-px rounded-full bg-slate-500/30 text-white/60 uppercase tracking-wide flex-shrink-0">✓ Done</span>
                      )}
                    </div>
                    <div className={clsx(
                      'text-[10px] mt-0.5 truncate leading-tight',
                      isCompleted ? 'text-white/40' : 'text-white/70'
                    )} title={p.name}>{p.name}</div>
                  </div>
                  <span className="text-white/40 text-[9px] flex-shrink-0 font-mono">{p.versions.length}</span>
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenActionMenu(isActionMenuOpen ? null : `project:${p.id}`)
                      }}
                      className={clsx(
                        'text-white/40 hover:text-white px-1 transition-opacity text-xs',
                        isActionMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      )}
                      title="More actions"
                    >⋮</button>
                    {isActionMenuOpen && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className="absolute right-0 top-7 z-30 bg-slate-800 border border-white/10 rounded-md shadow-xl py-1 min-w-[155px]"
                      >
                        {perms.can.renameProject && (
                          <button
                            onClick={() => startRename(p)}
                            className="w-full text-left px-3 py-1.5 text-[11px] text-white hover:bg-white/10 flex items-center gap-2"
                          ><span>✏️</span> Rename</button>
                        )}
                        <button
                          onClick={() => { setTeamModalForProject(p); setOpenActionMenu(null) }}
                          className="w-full text-left px-3 py-1.5 text-[11px] text-white hover:bg-white/10 flex items-center gap-2"
                        ><span>👥</span> Team</button>
                        {perms.can.archiveProject && (
                          <>
                            <div className="my-1 border-t border-white/8" />
                            <div className="px-3 py-1 text-[8px] font-bold text-white/40 uppercase tracking-widest">Status</div>
                            {STATUS_OPTIONS.map(s => {
                              const isCurrent = status === s
                              return (
                                <button
                                  key={s}
                                  onClick={() => handleSetStatus(p.id, s)}
                                  className={clsx(
                                    'w-full text-left px-3 py-1.5 text-[11px] hover:bg-white/10 flex items-center gap-2',
                                    isCurrent ? 'text-white' : 'text-white/70'
                                  )}
                                >
                                  <span className={clsx(
                                    'w-3 h-3 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                                    isCurrent ? 'border-blue-500' : 'border-white/30'
                                  )}>
                                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                  </span>
                                  {s}
                                </button>
                              )
                            })}
                          </>
                        )}
                        {perms.can.softDeleteProject && (
                          <>
                            <div className="my-1 border-t border-white/8" />
                            <button
                              onClick={() => {
                                setConfirmDeleteProjectId(p.id)
                                setOpenActionMenu(null)
                              }}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-white/10 flex items-center gap-2"
                            ><span>🗑️</span> Delete</button>
                          </>
                        )}
                        {!perms.can.archiveProject && !perms.can.softDeleteProject && (
                          <>
                            <div className="my-1 border-t border-white/8" />
                            <div className="px-3 py-1.5 text-[10px] text-white/40 italic">
                              🔒 Status & delete are Admin-only
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {isExpanded && !isEditing && !isConfirmingDelete && !isConfirmingStatusChange && p.versions.length > 0 && (() => {
                // v14 — compute snapshot + duplicate set once per project expand.
                const dupeIds = findDuplicateVersionIds(p)
                // Find which version's snapshot to show in the dates block:
                // active version if this project is active, else latest.
                const visibleVersion = isActive && activeVersion
                  ? activeVersion
                  : getLatestVersion(p)
                const snap = visibleVersion ? getVersionSnapshot(p, visibleVersion) : null
                const isCustomizingDates = dateTogglesOpenForId === p.id
                return (
                <>
                {/* v14 — toggleable date rows. PM picks which of NTP / Contract /
                    Revised / Data Date appear in the sidebar. Dates come from
                    the active version's snapshot (or latest if no active). */}
                <div className="ml-5 pl-2 border-l border-white/5 mb-1 mt-0.5">
                  <div className="flex items-center justify-between px-1 py-0.5">
                    <div className="text-[8px] uppercase tracking-widest text-white/30">
                      {isActive && activeVersion && activeVersion.versionLabel
                        ? `Dates · ${activeVersion.versionLabel.split('-').slice(-3).join('-')}`
                        : 'Dates · latest'}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDateTogglesOpenForId(isCustomizingDates ? null : p.id) }}
                      className="text-white/30 hover:text-white text-[10px] px-1 leading-none"
                      title="Customize which dates show"
                    >⚙</button>
                  </div>
                  {isCustomizingDates && (
                    <div className="bg-white/5 rounded-md p-1.5 mb-1 mx-0.5" onClick={e => e.stopPropagation()}>
                      <div className="text-[8px] uppercase tracking-widest text-white/40 px-1 pb-1">Show date</div>
                      {([
                        ['ntp', 'NTP'],
                        ['contract', 'Contract'],
                        ['revised', 'Revised'],
                        ['dataDate', 'Data Date'],
                      ] as Array<['ntp'|'contract'|'revised'|'dataDate', string]>).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 px-1 py-0.5 text-[10px] text-white/80 cursor-pointer hover:bg-white/5 rounded">
                          <input
                            type="checkbox"
                            checked={dateToggles[key]}
                            onChange={() => updateDateToggle(key)}
                            className="w-3 h-3 accent-blue-500 cursor-pointer"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  )}
                  {snap && (
                    <div className="px-1 pb-1 text-[10px] leading-snug">
                      {dateToggles.ntp && (
                        <div className="flex justify-between text-white/60">
                          <span className="text-white/35">NTP</span>
                          <span className="font-mono">{fmtSnap(snap.ntp)}</span>
                        </div>
                      )}
                      {dateToggles.contract && (
                        <div className="flex justify-between text-white/60">
                          <span className="text-white/35">Contract</span>
                          <span className="font-mono">{fmtSnap(snap.contractEnd)}</span>
                        </div>
                      )}
                      {dateToggles.revised && (
                        <div className="flex justify-between text-white/60">
                          <span className="text-white/35">Revised</span>
                          <span className="font-mono">{fmtSnap(snap.revisedEnd)}</span>
                        </div>
                      )}
                      {dateToggles.dataDate && (
                        <div className="flex justify-between text-white/85">
                          <span className="text-white/35">Data Date</span>
                          <span className="font-mono font-semibold text-blue-300">{fmtSnap(snap.dataDate)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="ml-5 pl-2 border-l border-white/5 py-0.5">
                  {[...p.versions]
                    .sort((a, b) => {
                      // v14 — sort newest at top. Prefer dataDate, fall back
                      // to uploadedAt for versions that don't have one.
                      const at = new Date(b.dataDate || b.uploadedAt).getTime()
                      const bt = new Date(a.dataDate || a.uploadedAt).getTime()
                      return at - bt
                    })
                    .map(v => {
                      const isActiveVersion = activeVersion?.id === v.id && isActive
                      const isConfirmingVerDelete = confirmDeleteVersionId === v.id
                      const isMovingThisVer = movePickerForVersionId === v.id
                      // v14 — determine if this version is part of a duplicate
                      // group (data-date match with at least one other version)
                      // and whether it's a baseline (BL pill).
                      const isDuplicate = dupeIds.has(v.id)
                      const isBaseline = v.scheduleType === 'baseline' || v.scheduleType === 'rebaseline'
                      const isVerActionMenuOpen = openActionMenu === `version:${v.id}`
                      const versionLabel = v.versionLabel || v.fileName || 'unnamed'
                      const dateStr = shortDate(v.dataDate || v.uploadedAt)
                      if (isConfirmingVerDelete) {
                        return (
                          <div key={v.id} className="bg-red-500/15 border border-red-500/40 rounded-md p-1.5 my-0.5">
                            <div className="text-red-200 text-[10px] font-semibold mb-0.5">Delete version?</div>
                            <div className="text-red-300/80 text-[9px] mb-1.5 truncate" title={versionLabel}>{versionLabel}</div>
                            <div className="flex gap-1">
                              <button onClick={() => handleDeleteVersion(p.id, v.id)}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold py-0.5 rounded">Delete</button>
                              <button onClick={() => setConfirmDeleteVersionId(null)}
                                className="flex-1 bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold py-0.5 rounded">Cancel</button>
                            </div>
                          </div>
                        )
                      }
                      if (isMovingThisVer) {
                        const otherProjects = projects.filter(op => op.id !== p.id && getProjectStatus(op) !== 'Deleted')
                        return (
                          <div key={v.id} className="bg-blue-500/15 border border-blue-500/40 rounded-md p-1.5 my-0.5">
                            <div className="text-blue-200 text-[10px] font-semibold mb-0.5">Move to project:</div>
                            <div className="text-blue-300/80 text-[9px] mb-1.5 truncate" title={versionLabel}>{versionLabel}</div>
                            {otherProjects.length === 0 ? (
                              <div className="text-blue-300/70 text-[10px] mb-1.5">No other projects available</div>
                            ) : (
                              <div className="max-h-40 overflow-y-auto mb-1">
                                {otherProjects.map(target => (
                                  <button
                                    key={target.id}
                                    onClick={() => handleMoveVersion(p.id, v.id, target.id)}
                                    className="w-full text-left px-2 py-1 hover:bg-white/10 rounded text-[10px] text-white truncate"
                                  >{target.name}</button>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => setMovePickerForVersionId(null)}
                              className="w-full bg-white/10 hover:bg-white/15 text-white text-[10px] py-0.5 rounded"
                            >Cancel</button>
                          </div>
                        )
                      }
                      return (
                        <div
                          key={v.id}
                          className={clsx(
                            'group flex items-center gap-1 pl-1.5 pr-1 py-1 rounded text-[11px] cursor-pointer transition-colors my-0.5 border-l-2',
                            isActiveVersion
                              ? 'bg-blue-600/20 border-blue-500'
                              : 'border-transparent hover:bg-white/5'
                          )}
                          onClick={() => selectVersion(p.id, v.id)}
                        >
                          <span className={clsx('w-3 flex-shrink-0 text-[10px]', isActiveVersion ? 'text-blue-400' : 'text-transparent')}>✓</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className={clsx('truncate flex-1 min-w-0 font-mono text-[11px]', isActiveVersion ? 'text-white font-semibold' : isBaseline ? 'text-white/85' : 'text-white/70')}>
                                {versionLabel}
                              </span>
                              {isDuplicate && (
                                <span className="text-[10px] text-amber-400 flex-shrink-0" title="Same Data Date as another version — possible duplicate">🔁</span>
                              )}
                              {isBaseline && (
                                <span className="text-[8px] font-bold px-1 py-px rounded bg-blue-500/25 text-blue-300 flex-shrink-0 font-sans tracking-wide">BL</span>
                              )}
                              {isActiveVersion && (
                                <span className="text-[8px] font-bold px-1 py-px rounded bg-blue-500/40 text-blue-200 flex-shrink-0 font-sans tracking-wide">NOW</span>
                              )}
                            </div>
                            {dateStr && (
                              <div className="text-white/30 text-[9px]">{dateStr}</div>
                            )}
                          </div>
                          <div className="relative flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenActionMenu(isVerActionMenuOpen ? null : `version:${v.id}`)
                              }}
                              className={clsx(
                                'text-white/40 hover:text-white px-1 transition-opacity',
                                isVerActionMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              )}
                              title="More actions"
                            >⋮</button>
                            {isVerActionMenuOpen && (
                              <div
                                onClick={e => e.stopPropagation()}
                                className="absolute right-0 top-6 z-30 bg-slate-800 border border-white/10 rounded-md shadow-xl py-1 min-w-[140px]"
                              >
                                {perms.can.hardDeleteProject && projects.filter(op => op.id !== p.id && getProjectStatus(op) !== 'Deleted').length > 0 && (
                                  <button
                                    onClick={() => {
                                      setMovePickerForVersionId(v.id)
                                      setOpenActionMenu(null)
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[11px] text-white hover:bg-white/10"
                                  >⇄ Move to…</button>
                                )}
                                {perms.can.deleteVersion && p.versions.length > 1 && (
                                  <button
                                    onClick={() => {
                                      setConfirmDeleteVersionId(v.id)
                                      setOpenActionMenu(null)
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-white/10"
                                  >🗑️ Delete</button>
                                )}
                                {!perms.can.deleteVersion && (
                                  <div className="px-3 py-1.5 text-[10px] text-white/40 italic">
                                    🔒 Viewer only — cannot delete
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  }
                </div>
                </>
                )
              })()}
            </div>
          )
        })}
        {!searchQuery && perms.can.createProject && (
          <button
            onClick={() => setCreateProjectModalOpen(true)}
            className="w-full flex items-center gap-1.5 px-2 py-2 mt-2 text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded-md text-xs font-medium text-left"
          >
            <span className="text-base leading-none">+</span> New project
          </button>
        )}
        {!searchQuery && !perms.can.createProject && perms.user && (
          <div className="px-2 py-2 mt-2 text-white/30 text-[10px] italic">
            Only Admins can create new projects
          </div>
        )}
      </div>
      {activeProject && (
        <>
          {/* v14 — resize handle. Drag UP to grow the Views section, DOWN
              to give the projects list more room. */}
          <div
            onMouseDown={startDragViews}
            className={`h-1.5 cursor-row-resize transition-colors flex-shrink-0 ${
              isDraggingViews ? 'bg-blue-500/60' : 'bg-white/10 hover:bg-blue-500/40'
            }`}
            title="Drag up/down to resize"
          />
          <div
            className="px-2 py-2 flex-shrink-0 flex flex-col"
            style={{ height: `${viewsHeight}px` }}
          >
            <div className="text-white/30 text-[9px] uppercase tracking-widest px-2 py-1 truncate" title={activeProject.name}>
              Views · {activeProject.name}
            </div>
            <div className="overflow-y-auto flex-1 min-h-0">
              {views.map(item => {
                const active = pathname === item.href
                return (
                  <Link key={item.href} href={item.href}
                    className={clsx(
                      'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[11px] font-medium border-l-2',
                      active
                        ? 'bg-blue-600/20 text-white border-blue-500'
                        : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
                    )}>
                    <span className="text-sm w-4 text-center">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {(item as any).badge && (
                      <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{(item as any).badge}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}
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
