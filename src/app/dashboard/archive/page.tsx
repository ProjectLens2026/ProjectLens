'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  loadProjects, subscribeToProjects,
  setActiveProjectId, setActiveVersionId,
  setProjectStatus, deleteProject, getLatestVersion,
  getProjectStatus,
  Project,
} from '@/lib/projectStore'

// =============================================================================
// Archive Projects page — shows all projects with status = 'Archived'.
// Actions per project:
//   • Open       → sets active project, opens its dashboard (historical view)
//   • Unarchive  → moves back to 'Active' status
//   • Delete     → soft delete (moves to Deleted Items)
// =============================================================================
export default function ArchivePage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [confirmAction, setConfirmAction] = useState<{type: 'unarchive' | 'delete', projectId: string} | null>(null)

  useEffect(() => {
    setProjects(loadProjects())
    const unsub = subscribeToProjects(() => setProjects(loadProjects()))
    return unsub
  }, [])

  const archived = projects.filter(p => getProjectStatus(p) === 'Archived')

  function handleOpen(p: Project) {
    setActiveProjectId(p.id)
    const latest = getLatestVersion(p)
    if (latest) setActiveVersionId(latest.id)
    router.push('/dashboard')
  }

  function handleUnarchive(id: string) {
    setProjectStatus(id, 'Active')
    setConfirmAction(null)
    setProjects(loadProjects())
  }

  function handleDelete(id: string) {
    deleteProject(id)  // Soft delete — moves to Deleted Items
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

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Archive Projects</span>
          <span className="text-slate-400 text-sm ml-2">· {archived.length} archived project{archived.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {archived.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
                <span className="text-3xl">📁</span>
              </div>
              <div className="text-lg font-bold text-slate-700 mb-2">No archived projects</div>
              <div className="text-sm text-slate-500 mb-4">
                When you finish a project and want to keep it for reference without cluttering your active list, archive it from the sidebar's ⋮ menu.
              </div>
              <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
                Back to dashboard
              </Link>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-900 leading-relaxed">
                <strong>Archived projects</strong> are kept for historical reference. You can still open them to view all data, but they're hidden from your main project list. Unarchive any time to bring them back to active.
              </div>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Project</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Contract #</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Versions</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Archived</th>
                      <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archived.map(p => {
                      const isConfirmingUnarchive = confirmAction?.type === 'unarchive' && confirmAction.projectId === p.id
                      const isConfirmingDelete = confirmAction?.type === 'delete' && confirmAction.projectId === p.id

                      if (isConfirmingUnarchive) {
                        return (
                          <tr key={p.id} className="border-b border-slate-100 last:border-0 bg-blue-50">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="text-blue-900 text-sm flex-1">
                                  Unarchive <strong>{p.name}</strong>? It will move back to your active projects.
                                </span>
                                <button onClick={() => handleUnarchive(p.id)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-1.5 rounded">Unarchive</button>
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
                            <td colSpan={5} className="px-4 py-3">
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
                            <button onClick={() => setConfirmAction({type: 'unarchive', projectId: p.id})}
                              className="text-emerald-600 hover:text-emerald-800 text-xs font-bold mr-3">Unarchive</button>
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
