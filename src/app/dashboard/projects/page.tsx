'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  loadProjects, deleteProject, renameProject, deleteVersion,
  moveVersionToProject,
  setActiveProjectId, setActiveVersionId, getLatestVersion,
  migrateLegacyData, Project
} from '@/lib/projectStore'

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null)  // versionId for which menu is open
  const [editName, setEditName] = useState('')
  const [editProjectId, setEditProjectId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmDeleteVersion, setConfirmDeleteVersion] = useState<string | null>(null)
  const [confirmMoveTarget, setConfirmMoveTarget] = useState<{versionId: string, targetId: string} | null>(null)

  useEffect(() => {
    migrateLegacyData()
    setProjects(loadProjects())
  }, [])

  function refresh() {
    setProjects(loadProjects())
  }

  function openProject(id: string, versionId?: string) {
    setActiveProjectId(id)
    if (versionId) setActiveVersionId(versionId)
    router.push('/dashboard')
  }

  function handleDelete(id: string) {
    deleteProject(id)
    refresh()
    setConfirmDelete(null)
  }

  function handleDeleteVersion(projectId: string, versionId: string) {
    deleteVersion(projectId, versionId)
    refresh()
  }

  function startRename(p: Project) {
    setEditingId(p.id)
    setEditName(p.name)
    setEditProjectId(p.projectId || '')
  }

  function saveRename() {
    if (editingId && editName.trim()) {
      renameProject(editingId, editName.trim(), editProjectId.trim() || undefined)
      refresh()
    }
    setEditingId(null)
  }

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    return `${Math.floor(days / 30)} months ago`
  }

  function shortDate(d?: string) {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch { return d.slice(0, 10) }
  }

  function conditionStyle(condition?: string) {
    if (condition === 'Recovery Required') return { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500' }
    if (condition === 'Attention Needed') return { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' }
    if (condition === 'Monitor Closely') return { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-500' }
    return { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500' }
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <div>
            <span className="font-bold text-slate-900 text-base">Projects</span>
            <span className="text-slate-400 text-sm ml-2">· All your active jobs</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">🏗</span>
            </div>
            <div className="text-lg font-bold text-slate-700 mb-2">Welcome to ProjectLens</div>
            <div className="text-sm text-slate-500 mb-6">Upload your first schedule to create a project. Every analysis, RFI, and TIA will be saved under it.</div>
            <Link href="/dashboard/upload"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
              + Create First Project
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Projects</span>
          <span className="text-slate-400 text-sm ml-2">· {projects.length} active project{projects.length > 1 ? 's' : ''}</span>
        </div>
        <Link href="/dashboard/upload" className="ml-auto text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-semibold">
          + New Project
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-6xl mx-auto">
          {projects.map(p => {
            const latest = getLatestVersion(p)
            const analysis = latest?.analysis
            const cond = conditionStyle(analysis?.condition)
            const isExpanded = expandedId === p.id
            const isEditing = editingId === p.id
            const isDeleting = confirmDelete === p.id

            return (
              <div key={p.id} className={`bg-white border rounded-2xl p-5 hover:shadow-lg transition-all ${cond.border}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Project Name"
                          className="text-base font-bold border border-blue-400 rounded px-2 py-1 w-full"
                          autoFocus
                        />
                        <input
                          value={editProjectId}
                          onChange={e => setEditProjectId(e.target.value)}
                          placeholder="Project ID (optional, e.g. USACE-CT-2024-001)"
                          className="text-xs border border-slate-300 rounded px-2 py-1 w-full"
                        />
                        <div className="flex gap-1">
                          <button onClick={saveRename} className="text-xs bg-blue-600 text-white px-3 py-1 rounded font-bold">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs bg-slate-200 px-3 py-1 rounded font-bold">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="font-bold text-slate-900 text-base truncate">{p.name}</div>
                        {p.projectId && (
                          <div className="text-[10px] font-mono text-blue-600 mt-0.5">{p.projectId}</div>
                        )}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {p.versions.length} version{p.versions.length > 1 ? 's' : ''} ·
                          {' '}{p.rfis.length} RFI{p.rfis.length !== 1 ? 's' : ''} ·
                          {' '}Updated {relativeTime(p.updatedAt)}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2 flex-shrink-0">
                    {!isEditing && !isDeleting && (
                      <>
                        <button onClick={() => startRename(p)} title="Rename"
                          className="text-slate-400 hover:text-blue-600 text-xs p-1">✏️</button>
                        <button onClick={() => setConfirmDelete(p.id)} title="Delete"
                          className="text-slate-400 hover:text-red-600 text-xs p-1">🗑️</button>
                      </>
                    )}
                  </div>
                </div>

                {isDeleting && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <div className="text-xs text-red-900 font-semibold mb-2">Delete this project?</div>
                    <div className="text-[10px] text-red-700 mb-2">All versions, RFIs, and analyses will be permanently removed.</div>
                    <div className="flex gap-2">
                      <button onClick={() => handleDelete(p.id)} className="text-[10px] bg-red-600 text-white px-3 py-1 rounded font-bold">Delete</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-[10px] bg-white border border-slate-200 text-slate-600 px-3 py-1 rounded font-bold">Cancel</button>
                    </div>
                  </div>
                )}

                {analysis ? (
                  <>
                    <div className={`${cond.bg} rounded-lg p-2.5 flex items-center gap-2 mb-3`}>
                      <div className={`w-2 h-2 rounded-full ${cond.dot} animate-pulse`} />
                      <span className={`text-xs font-bold ${cond.color}`}>{analysis.condition}</span>
                      <span className={`text-xs ${cond.color} opacity-70 ml-auto`}>{analysis.healthScore}/100</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                      <div className="bg-slate-50 rounded-lg p-2">
                        <div className="text-base font-bold text-slate-900">{analysis.totalActivities || 0}</div>
                        <div className="text-[9px] text-slate-500 uppercase">Activities</div>
                      </div>
                      <div className={`rounded-lg p-2 ${analysis.delayDays > 30 ? 'bg-red-50' : analysis.delayDays > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                        <div className={`text-base font-bold ${analysis.delayDays > 30 ? 'text-red-700' : analysis.delayDays > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                          {analysis.delayDays > 0 ? '+' : ''}{analysis.delayDays || 0}d
                        </div>
                        <div className="text-[9px] text-slate-500 uppercase">Behind</div>
                      </div>
                      <div className={`rounded-lg p-2 ${analysis.negativeFloat > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                        <div className={`text-base font-bold ${analysis.negativeFloat > 0 ? 'text-red-700' : 'text-slate-900'}`}>
                          {analysis.negativeFloat || 0}
                        </div>
                        <div className="text-[9px] text-slate-500 uppercase">Neg Float</div>
                      </div>
                    </div>

                    {/* Version history toggle */}
                    {p.versions.length > 1 && (
                      <button onClick={() => setExpandedId(isExpanded ? null : p.id)}
                        className="w-full text-[10px] text-slate-500 hover:text-blue-600 mb-2 font-semibold">
                        {isExpanded ? '▼ Hide version history' : `▶ Show ${p.versions.length} versions`}
                      </button>
                    )}

                    {/* Version list */}
                    {isExpanded && (
                      <div className="space-y-1 mb-3 bg-slate-50 rounded-lg p-2 max-h-64 overflow-y-auto">
                        {p.versions.map((v, i) => {
                          const isDeletingVer = confirmDeleteVersion === v.id
                          const isMovingVer = confirmMoveTarget?.versionId === v.id
                          const targetProj = isMovingVer ? projects.find(pr => pr.id === confirmMoveTarget?.targetId) : null

                          // Confirmation row — delete version
                          if (isDeletingVer) {
                            return (
                              <div key={v.id} className="bg-red-50 border border-red-300 rounded-lg p-2">
                                <div className="text-[10px] text-red-900 font-bold mb-1">Delete this version?</div>
                                <div className="text-[9px] text-red-700 mb-2 truncate" title={v.fileName}>
                                  {v.fileName || 'untitled.xer'} · {shortDate(v.uploadedAt)}
                                </div>
                                <div className="text-[9px] text-red-700 mb-2">This will permanently remove the version and its analysis. This cannot be undone.</div>
                                <div className="flex gap-2">
                                  <button onClick={() => { handleDeleteVersion(p.id, v.id); setConfirmDeleteVersion(null); }}
                                    className="text-[10px] bg-red-600 text-white px-3 py-1 rounded font-bold">Delete</button>
                                  <button onClick={() => setConfirmDeleteVersion(null)}
                                    className="text-[10px] bg-white border border-slate-200 text-slate-600 px-3 py-1 rounded font-bold">Cancel</button>
                                </div>
                              </div>
                            )
                          }

                          // Confirmation row — move version
                          if (isMovingVer && targetProj) {
                            return (
                              <div key={v.id} className="bg-blue-50 border border-blue-300 rounded-lg p-2">
                                <div className="text-[10px] text-blue-900 font-bold mb-1">Move this version?</div>
                                <div className="text-[9px] text-blue-700 mb-2">
                                  <div className="truncate"><span className="font-semibold">Moving:</span> {v.fileName || 'untitled.xer'}</div>
                                  <div><span className="font-semibold">From:</span> {p.name}</div>
                                  <div className="truncate"><span className="font-semibold">To:</span> {targetProj.name}</div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => {
                                    moveVersionToProject(p.id, v.id, targetProj.id)
                                    setConfirmMoveTarget(null)
                                    refresh()
                                  }} className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded font-bold">Move</button>
                                  <button onClick={() => setConfirmMoveTarget(null)}
                                    className="text-[10px] bg-white border border-slate-200 text-slate-600 px-3 py-1 rounded font-bold">Cancel</button>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={v.id} className="flex items-center gap-2 text-[10px] py-1 px-2 hover:bg-white rounded relative">
                              <span className="font-mono text-slate-400 flex-shrink-0">v{p.versions.length - i}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-slate-700 truncate">{v.fileName || 'untitled.xer'}</div>
                                <div className="text-slate-400 text-[9px]">{shortDate(v.uploadedAt)}</div>
                              </div>
                              <span className="text-slate-500 flex-shrink-0">{v.analysis?.totalActivities || 0} acts</span>
                              {v.analysis?.condition && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${conditionStyle(v.analysis.condition).bg} ${conditionStyle(v.analysis.condition).color}`}>
                                  {v.analysis.healthScore}/100
                                </span>
                              )}
                              <button onClick={() => openProject(p.id, v.id)}
                                className="text-blue-600 font-bold hover:underline flex-shrink-0">Open</button>
                              {projects.length > 1 && (
                                <button onClick={() => setMoveMenuFor(moveMenuFor === v.id ? null : v.id)}
                                  title="Move to different project"
                                  className="text-slate-400 hover:text-blue-600 font-bold px-1">⇄</button>
                              )}
                              {p.versions.length > 1 && (
                                <button onClick={() => setConfirmDeleteVersion(v.id)}
                                  title="Delete this version"
                                  className="text-slate-300 hover:text-red-500">×</button>
                              )}

                              {/* Move To dropdown */}
                              {moveMenuFor === v.id && (
                                <div className="absolute right-0 top-6 z-20 bg-white border border-slate-300 rounded-lg shadow-lg py-1 min-w-[260px] max-h-64 overflow-y-auto">
                                  <div className="px-3 py-2 border-b border-slate-100">
                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Moving:</div>
                                    <div className="text-[10px] font-semibold text-slate-700 truncate" title={v.fileName}>{v.fileName || 'untitled.xer'}</div>
                                  </div>
                                  <div className="px-3 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Move to project:</div>
                                  {projects.filter(target => target.id !== p.id).length === 0 ? (
                                    <div className="px-3 py-2 text-[10px] text-slate-400">No other projects available</div>
                                  ) : (
                                    projects.filter(target => target.id !== p.id).map(target => (
                                      <button
                                        key={target.id}
                                        onClick={() => {
                                          setMoveMenuFor(null)
                                          setConfirmMoveTarget({ versionId: v.id, targetId: target.id })
                                        }}
                                        className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-[10px] text-slate-700 hover:text-blue-700 flex items-center justify-between gap-2">
                                        <span className="font-semibold truncate">{target.name}</span>
                                        <span className="text-[9px] text-slate-400 flex-shrink-0">{target.versions.length}v</span>
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <button onClick={() => openProject(p.id)}
                      className="w-full bg-slate-900 text-white text-xs font-semibold py-2 rounded-lg hover:bg-slate-700 transition-colors">
                      Open Latest Version →
                    </button>
                  </>
                ) : (
                  <div className="text-xs text-slate-400 text-center py-4">No schedule uploaded yet</div>
                )}
              </div>
            )
          })}

          <Link href="/dashboard/upload"
            className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-5 hover:border-blue-400 hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center min-h-[200px] cursor-pointer">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-2">
              <span className="text-2xl">+</span>
            </div>
            <div className="text-sm font-bold text-slate-700">Add New Project</div>
            <div className="text-xs text-slate-400 mt-1">Upload an XER to begin</div>
          </Link>
        </div>
      </div>
    </div>
  )
}
