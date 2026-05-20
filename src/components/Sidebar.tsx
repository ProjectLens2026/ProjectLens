'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import clsx from 'clsx'
import {
  getActiveProject, getActiveVersion, loadProjects,
  setActiveProjectId, setActiveVersionId,
  deleteProject, renameProject, deleteVersion, moveVersionToProject,
  getLatestVersion, migrateLegacyData,
  getProjectStatus, setProjectStatus,
  Project, ScheduleVersion, ProjectStatus,
} from '@/lib/projectStore'
import { createClient } from '@/lib/supabase/client'

interface SidebarProps {
  user?: { name: string; role: string; initials: string; company: string }
}

const DEMO_MODE = true
const DEMO_USER = {
  name: 'Mike Anderson',
  role: 'Admin',
  initials: 'MA',
  company: 'Nobel Project Control Services, LLC',
}
const DEMO_TEAM_MEMBER_COUNT = 4

const STATUS_OPTIONS: ProjectStatus[] = ['Active', 'Completed', 'On Hold', 'Archived']

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [activeVersion, setActiveVersion] = useState<ScheduleVersion | null>(null)
  const [projects, setProjects] = useState<Project[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active')
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set())

  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null)

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editProjectIdField, setEditProjectIdField] = useState('')
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<string | null>(null)
  const [confirmDeleteVersionId, setConfirmDeleteVersionId] = useState<string | null>(null)
  const [movePickerForVersionId, setMovePickerForVersionId] = useState<string | null>(null)

  const displayUser = DEMO_MODE ? DEMO_USER : user
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
    if (latest) setActiveVersionId(latest.id)
    refresh()
    maybeNavigateToDashboard()
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
    deleteProject(id)
    refresh()
    setConfirmDeleteProjectId(null)
  }

  function handleDeleteVersion(projectId: string, versionId: string) {
    deleteVersion(projectId, versionId)
    refresh()
    setConfirmDeleteVersionId(null)
  }

  function handleMoveVersion(fromProjectId: string, versionId: string, toProjectId: string) {
    moveVersionToProject(fromProjectId, versionId, toProjectId)
    setMovePickerForVersionId(null)
    refresh()
  }

  function handleSetStatus(projectId: string, status: ProjectStatus) {
    setProjectStatus(projectId, status)
    setOpenActionMenu(null)
    refresh()
  }

  const activeCount = projects.filter(p => getProjectStatus(p) !== 'Archived').length
  const archivedCount = projects.filter(p => getProjectStatus(p) === 'Archived').length

  const filteredProjects = (() => {
    const q = searchQuery.trim().toLowerCase()
    let pool: Project[]
    if (q) {
      pool = projects
    } else {
      pool = projects.filter(p => {
        const status = getProjectStatus(p)
        if (statusFilter === 'archived') return status === 'Archived'
        return status !== 'Archived'
      })
    }
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

  const views = activeProject ? [
    { href: '/dashboard', icon: '⊞', label: 'Overview' },
    { href: '/dashboard/lens', icon: '🔍', label: 'Schedule Analysis' },
    { href: '/dashboard/risks', icon: '⚠', label: 'Risks & Issues' },
    { href: '/dashboard/procurement', icon: '🚚', label: 'Procurement' },
    { href: '/dashboard/rfis', icon: '❓', label: 'RFIs', badge: activeProject.rfis.length > 0 ? String(activeProject.rfis.length) : null },
    { href: '/dashboard/submittals', icon: '📋', label: 'Submittals' },
    { href: '/dashboard/changes', icon: '🔄', label: 'Change Orders' },
    { href: '/dashboard/upload', icon: '⬆', label: 'Upload Version' },
    { href: '/dashboard/trend', icon: '📈', label: 'Trend Analysis' },
    { href: '/dashboard/tia', icon: '📑', label: 'TIA Comparison' },
  ] : []

  // Helper for highlighting settings tab nav
  const isSettingsActive = pathname.startsWith('/dashboard/settings')

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col h-full no-print" style={{ background: '#0d1b2e' }}>
      {/* Brand */}
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

      {/* Workspace */}
      {showTeamMode && (
        <div className="px-4 py-2.5 border-b border-white/5 flex-shrink-0">
          <div className="text-white/30 text-[9px] uppercase tracking-widest mb-0.5">Workspace</div>
          <div className="text-white text-xs font-semibold leading-tight">{displayUser!.company}</div>
        </div>
      )}

      {/* User */}
      {displayUser && (
        <div className="px-4 py-2.5 border-b border-white/5 flex-shrink-0 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            {displayUser.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white text-xs font-semibold truncate">{displayUser.name}</div>
            <div className="text-white/40 text-[10px] truncate">{displayUser.role}</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0 relative">
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search projects or versions"
          className="w-full bg-white/5 border border-white/10 text-white text-xs placeholder-white/40 pl-7 pr-2 py-1.5 rounded-md outline-none focus:border-blue-500/50"
        />
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40 text-[11px] pointer-events-none">🔍</span>
      </div>

      {/* Filter tabs */}
      {!searchQuery.trim() && (
        <div className="flex gap-1 px-2.5 py-1.5 border-b border-white/5 flex-shrink-0">
          <button
            onClick={() => setStatusFilter('active')}
            className={clsx(
              'flex-1 text-[10px] font-semibold py-1.5 rounded border transition-colors',
              statusFilter === 'active'
                ? 'bg-blue-600/20 text-white border-blue-500/50'
                : 'bg-transparent text-white/50 border-white/8 hover:text-white/70'
            )}
          >
            Active <span className="ml-1 text-[9px] opacity-60">{activeCount}</span>
          </button>
          <button
            onClick={() => setStatusFilter('archived')}
            className={clsx(
              'flex-1 text-[10px] font-semibold py-1.5 rounded border transition-colors',
              statusFilter === 'archived'
                ? 'bg-blue-600/20 text-white border-blue-500/50'
                : 'bg-transparent text-white/50 border-white/8 hover:text-white/70'
            )}
          >
            Archived <span className="ml-1 text-[9px] opacity-60">{archivedCount}</span>
          </button>
        </div>
      )}

      {/* Scrollable projects tree */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {projects.length === 0 && (
          <div className="text-center py-4 text-white/40 text-xs">No projects yet</div>
        )}

        {searchQuery && filteredProjects.length === 0 && (
          <div className="text-center py-4 text-white/40 text-xs">
            No matches for "{searchQuery}"
          </div>
        )}

        {!searchQuery && statusFilter === 'archived' && filteredProjects.length === 0 && projects.length > 0 && (
          <div className="text-center py-4 text-white/40 text-xs italic">No archived projects</div>
        )}

        {searchQuery && filteredProjects.length > 0 && (
          <div className="px-2 pt-1 pb-2 text-[9px] text-white/40 uppercase tracking-widest">
            {filteredProjects.length} match{filteredProjects.length !== 1 ? 'es' : ''}
          </div>
        )}

        {!searchQuery && statusFilter === 'archived' && filteredProjects.length > 0 && (
          <div className="px-2 pt-1 pb-2 text-[9px] text-white/40 uppercase tracking-widest italic">
            Archived projects · read-only history
          </div>
        )}

        {filteredProjects.map(p => {
          const isExpanded = isProjectExpanded(p.id)
          const isActive = activeProject?.id === p.id
          const isEditing = editingProjectId === p.id
          const isConfirmingDelete = confirmDeleteProjectId === p.id
          const isActionMenuOpen = openActionMenu === `project:${p.id}`
          const latest = getLatestVersion(p)
          const condition = latest?.analysis?.condition
          const status = getProjectStatus(p)
          const isCompleted = status === 'Completed'
          const isArchived = status === 'Archived'
          const isOnHold = status === 'On Hold'

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
              ) : isConfirmingDelete ? (
                <div className="bg-red-500/15 border border-red-500/40 rounded-md p-2 mx-0.5">
                  <div className="text-red-200 text-[10px] font-semibold mb-1">Delete project?</div>
                  <div className="text-red-300/80 text-[9px] mb-2 truncate" title={p.name}>
                    {p.name} · {p.versions.length} version{p.versions.length !== 1 ? 's' : ''} removed
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleDeleteProject(p.id)}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold py-1 rounded">Delete</button>
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
                    <div className="flex items-center gap-1.5">
                      {condition && (
                        <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', getConditionDotColor(condition))} title={condition} />
                      )}
                      <span className={clsx(
                        'text-xs font-medium truncate',
                        isArchived ? 'text-white/45 italic' : isCompleted ? 'text-white/60' : 'text-white'
                      )}>{p.name}</span>
                      {isOnHold && (
                        <span className="text-[8px] font-bold px-1.5 py-px rounded-full bg-amber-500/25 text-amber-300 uppercase tracking-wide flex-shrink-0">On Hold</span>
                      )}
                      {isCompleted && (
                        <span className="text-[8px] font-bold px-1.5 py-px rounded-full bg-slate-500/30 text-white/60 uppercase tracking-wide flex-shrink-0">✓ Done</span>
                      )}
                    </div>
                    {p.projectId && (
                      <div className={clsx(
                        'text-[9px] font-mono mt-0.5 truncate',
                        isArchived ? 'text-white/30' : 'text-white/40'
                      )}>{p.projectId}</div>
                    )}
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
                        <button
                          onClick={() => startRename(p)}
                          className="w-full text-left px-3 py-1.5 text-[11px] text-white hover:bg-white/10 flex items-center gap-2"
                        ><span>✏️</span> Rename</button>
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
                        <div className="my-1 border-t border-white/8" />
                        <button
                          onClick={() => {
                            setConfirmDeleteProjectId(p.id)
                            setOpenActionMenu(null)
                          }}
                          className="w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-white/10 flex items-center gap-2"
                        ><span>🗑️</span> Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* VERSIONS */}
              {isExpanded && !isEditing && !isConfirmingDelete && p.versions.length > 0 && (
                <div className="ml-5 pl-2 border-l border-white/5 py-0.5">
                  {[...p.versions]
                    .sort((a, b) =>
                      new Date(b.dataDate || b.uploadedAt).getTime() -
                      new Date(a.dataDate || a.uploadedAt).getTime()
                    )
                    .map(v => {
                      const isActiveVersion = activeVersion?.id === v.id && isActive
                      const isConfirmingVerDelete = confirmDeleteVersionId === v.id
                      const isMovingThisVer = movePickerForVersionId === v.id
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
                        const otherProjects = projects.filter(op => op.id !== p.id)
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
                            <div className={clsx('truncate', isActiveVersion ? 'text-white font-semibold' : 'text-white/70')}>
                              {versionLabel}
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
                                {projects.length > 1 && (
                                  <button
                                    onClick={() => {
                                      setMovePickerForVersionId(v.id)
                                      setOpenActionMenu(null)
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[11px] text-white hover:bg-white/10"
                                  >⇄ Move to…</button>
                                )}
                                {p.versions.length > 1 && (
                                  <button
                                    onClick={() => {
                                      setConfirmDeleteVersionId(v.id)
                                      setOpenActionMenu(null)
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[11px] text-red-400 hover:bg-white/10"
                                  >🗑️ Delete</button>
                                )}
                                {projects.length <= 1 && p.versions.length <= 1 && (
                                  <div className="px-3 py-1.5 text-[10px] text-white/40">No actions available</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  }
                </div>
              )}
            </div>
          )
        })}

        {statusFilter === 'active' && !searchQuery && (
          <Link href="/dashboard/upload"
            className="flex items-center gap-1.5 px-2 py-2 mt-2 text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded-md text-xs font-medium"
          >
            <span className="text-base leading-none">+</span> New project
          </Link>
        )}
      </div>

      {/* Views for active project */}
      {activeProject && (
        <div className="border-t border-white/10 px-2 py-2 flex-shrink-0">
          <div className="text-white/30 text-[9px] uppercase tracking-widest px-2 py-1 truncate" title={activeProject.name}>
            Views · {activeProject.name}
          </div>
          <div className="max-h-72 overflow-y-auto">
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
      )}

      {/* ====================================================================== */}
      {/* WORKSPACE NAV — Members / Invite / Settings (restored from earlier demo) */}
      {/* ====================================================================== */}
      <div className="border-t border-white/10 px-2 py-2 flex-shrink-0">
        <div className="text-white/30 text-[9px] uppercase tracking-widest px-2 py-1">
          Workspace
        </div>
        {showTeamMode && (
          <>
            <Link href="/dashboard/settings?tab=members"
              className={clsx(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[11px] font-medium border-l-2',
                pathname === '/dashboard/settings'
                  ? 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
                  : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
              )}>
              <span className="text-sm w-4 text-center">👥</span>
              <span className="flex-1">Members</span>
              <span className="bg-white/10 text-white/60 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {DEMO_TEAM_MEMBER_COUNT}
              </span>
            </Link>
            <Link href="/dashboard/settings?tab=invitations"
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[11px] font-medium border-l-2 text-slate-400 border-transparent hover:text-white hover:bg-white/5">
              <span className="text-sm w-4 text-center">✉</span>
              <span className="flex-1">Invite people</span>
            </Link>
          </>
        )}
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

      {/* Sign out */}
      <div className="px-3 py-2.5 border-t border-white/10 flex-shrink-0">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs border border-white/10 hover:border-white/20">
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
