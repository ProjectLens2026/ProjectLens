'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  loadProjects, subscribeToProjects,
  setActiveProjectId, setActiveVersionId,
  setProjectStatus, deleteProject, getLatestVersion,
  getProjectStatus,
  Project, ProjectStatus,
} from '@/lib/projectStore'

// =============================================================================
// Archive Projects page — shows projects no longer in active work.
// Includes BOTH 'Archived' AND 'Completed' projects (since Completed projects
// move here too, keeping the sidebar focused on currently-active work).
//
// Each row's Status column shows whether the project is Completed or Archived.
//
// Actions per project:
//   • Open       → sets active project, opens its dashboard (historical view)
//   • Restore    → moves back to 'Active' status (sidebar gets the project back)
//   • Delete     → soft delete (moves to Deleted Items)
// =============================================================================
export default function ArchivePage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [confirmAction, setConfirmAction] = useState<{type: 'restore' | 'delete', projectId: string} | null>(null)

  useEffect(() => {
    setProjects(loadProjects())
    const unsub = subscribeToProjects(() => setProjects(loadProjects()))
    return unsub
  }, [])

  // Both Archived and Completed live here
  const archive = projects.filter(p => {
    const s = getProjectStatus(p)
    return s === 'Archived' || s === 'Completed'
  })

  const completedCount = archive.filter(p => getProjectStatus(p) === 'Completed').length
  const archivedCount = archive.filter(p => getProjectStatus(p) === 'Archived').length

  function handleOpen(p: Project) {
    setActiveProjectId(p.id)
    const latest = getLatestVersion(p)
    if (latest) setActiveVersionId(latest.id)
    router.push('/dashboard')
  }

  function handleRestore(id: string) {
    setProjectStatus(id, 'Active')
    setConfirmAction(null)
    setProjects(loadProjects())
  }

  function handleDelete(id: string) {
    deleteProject(id)
    setConfirmAction(null)
    setProjects(loadProjects())
  }

  function relativeTime(iso?: string) {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`
    if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? '' : 's'} ago`
    return `${Math.floor(days / 365)} year${Math.floor(days / 365) === 1 ? '' : 's'} ago`
  }

  function statusBadge(status: ProjectStatus) {
    if (status === 'Completed') {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
          <span>✓</span> Completed
        </span>
      )
    }
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 inline-flex items-center gap-1">
        <span>📁</span> Archived
      </span>
    )
  }

  // Build subtitle: "5 inactive projects · 2 completed · 3 archived"
  const subtitleParts: string[] = []
  if (archive.length > 0) {
    subtitleParts.push(`${archive.length} inactive project${archive.length === 1 ? '' : 's'}`)
    if (completedCount > 0) subtitleParts.push(`${completedCount} completed`)
    if (archivedCount > 0) subtitleParts.push(`${archivedCount} archived`)
  }
  const subtitle = subtitleParts.join(' · ')

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Archive</span>
          {subtitle && <span className="text-slate-400 text-sm ml-2">· {subtitle}</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {archive.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
                <span className="text-3xl">📁</span>
              </div>
              <div className="text-lg font-bold text-slate-700 mb-2">Archive is empty</div>
              <div className="text-sm text-slate-500 mb-4">
                When you mark a project as <strong>Completed</strong> or <strong>Archived</strong> from the sidebar's ⋮ menu, it moves here so your active sidebar stays focused on current work.
              </div>
              <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
                Back to dashboard
              </Link>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-900 leading-relaxed">
                <strong>Inactive projects</strong> — Completed and Archived projects live here so your sidebar stays focused on active work. You can still open them to view all data. Restore brings any project back to Active.
              </div>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Project</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Status</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Contract #</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Versions</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Updated</th>
                      <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archive.map(p => {
                      const isConfirmingRestore = confirmAction?.type === 'restore' && confirmAction.projectId === p.id
                      const isConfirmingDelete = confirmAction?.type === 'delete' && confirmAction.projectId === p.id
                      const status = getProjectStatus(p)

                      if (isConfirmingRestore) {
                        return (
                          <tr key={p.id} className="border-b border-slate-100 last:border-0 bg-blue-50">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="text-blue-900 text-sm flex-1">
                                  Restore <strong>{p.name}</strong>? It will move back to your active projects.
                                </span>
                                <button onClick={() => handleRestore(p.id)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-1.5 rounded">Restore</button>
                                <button onClick={() => setConfirmAction(null)}
                                  className="bg-white border border-slate-300 text-slate-600 text-xs font-bold px-4 py-1.5 rounded">Cancel</button>
                              </div>
                            </td>
                          </tr>
                        )
                      }
                      if (isConfirmingDelete) {
                        return (
                          <tr key={p.id} className="border-b border-slate-100 last:border-0 bg-amber-50">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="text-amber-900 text-sm flex-1">
                                  Move <strong>{p.name}</strong> to Deleted Items? It can be restored from there.
                                </span>
                                <button onClick={() => handleDelete(p.id)}
                                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-1.5 rounded">Delete</button>
                                <button onClick={() => setConfirmAction(null)}
                                  className="bg-white border border-slate-300 text-slate-600 text-xs font-bold px-4 py-1.5 rounded">Cancel</button>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900 text-sm">{p.name}</div>
                          </td>
                          <td className="px-4 py-3">
                            {statusBadge(status)}
                          </td>
                          <td className="px-4 py-3">
                            {p.projectId ? (
                              <span className="text-blue-700 text-[10px] font-mono">{p.projectId}</span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{p.versions.length}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs italic">{relativeTime(p.updatedAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => handleOpen(p)}
                              className="text-blue-600 hover:text-blue-800 text-xs font-bold mr-3">Open</button>
                            <button onClick={() => setConfirmAction({type: 'restore', projectId: p.id})}
                              className="text-emerald-600 hover:text-emerald-800 text-xs font-bold mr-3">Restore</button>
                            <button onClick={() => setConfirmAction({type: 'delete', projectId: p.id})}
                              className="text-red-600 hover:text-red-800 text-xs font-bold">Delete</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
