'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  loadProjects, subscribeToProjects,
  restoreProject, permanentlyDeleteProject,
  getProjectStatus,
  Project,
} from '@/lib/projectStore'

// =============================================================================
// Deleted Items page — shows projects with status = 'Deleted' (soft-deleted).
// Actions:
//   • Restore             → moves back to 'Active' status (clears deletedAt)
//   • Permanently Delete  → actually removes from IndexedDB (no recovery)
//   • Empty Trash         → bulk permanent delete of everything
// =============================================================================
export default function DeletedPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [confirmAction, setConfirmAction] = useState<{type: 'restore' | 'permanent' | 'empty', projectId?: string} | null>(null)

  useEffect(() => {
    setProjects(loadProjects())
    const unsub = subscribeToProjects(() => setProjects(loadProjects()))
    return unsub
  }, [])

  const deleted = projects.filter(p => getProjectStatus(p) === 'Deleted')

  function handleRestore(id: string) {
    restoreProject(id)
    setConfirmAction(null)
    setProjects(loadProjects())
  }

  function handlePermanentDelete(id: string) {
    permanentlyDeleteProject(id)
    setConfirmAction(null)
    setProjects(loadProjects())
  }

  function handleEmptyTrash() {
    deleted.forEach(p => permanentlyDeleteProject(p.id))
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
    return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? '' : 's'} ago`
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Deleted Items</span>
          <span className="text-slate-400 text-sm ml-2">· {deleted.length} item{deleted.length === 1 ? '' : 's'} in trash</span>
        </div>
        {deleted.length > 0 && (
          <button
            onClick={() => setConfirmAction({type: 'empty'})}
            className="ml-auto text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
          >
            <span>🗑</span> Empty trash
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {confirmAction?.type === 'empty' && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-4">
              <div className="font-bold text-red-900 mb-1">⚠️ Permanently delete all {deleted.length} item{deleted.length === 1 ? '' : 's'}?</div>
              <div className="text-xs text-red-800 mb-3">This action cannot be undone. All deleted projects and their version history will be gone forever.</div>
              <div className="flex gap-2">
                <button onClick={handleEmptyTrash}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded">Yes, permanently delete all</button>
                <button onClick={() => setConfirmAction(null)}
                  className="bg-white border border-slate-300 text-slate-600 text-xs font-bold px-4 py-2 rounded">Cancel</button>
              </div>
            </div>
          )}

          {deleted.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
                <span className="text-3xl">🗑</span>
              </div>
              <div className="text-lg font-bold text-slate-700 mb-2">Trash is empty</div>
              <div className="text-sm text-slate-500 mb-4">
                When you delete a project from the sidebar, it lands here first so you can restore it if you change your mind. Permanent removal happens from this page.
              </div>
              <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
                Back to dashboard
              </Link>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-900 leading-relaxed">
                <strong>Deleted projects</strong> stay here until you permanently delete them. Restore puts them back to Active status. Permanent delete removes everything (project, versions, RFIs, analysis) with no recovery.
              </div>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Project</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Contract #</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Versions</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Deleted</th>
                      <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deleted.map(p => {
                      const isConfirmingRestore = confirmAction?.type === 'restore' && confirmAction.projectId === p.id
                      const isConfirmingPermanent = confirmAction?.type === 'permanent' && confirmAction.projectId === p.id

                      if (isConfirmingRestore) {
                        return (
                          <tr key={p.id} className="border-b border-slate-100 last:border-0 bg-emerald-50">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="text-emerald-900 text-sm flex-1">
                                  Restore <strong>{p.name}</strong>? It will move back to your active projects.
                                </span>
                                <button onClick={() => handleRestore(p.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-1.5 rounded">Restore</button>
                                <button onClick={() => setConfirmAction(null)}
                                  className="bg-white border border-slate-300 text-slate-600 text-xs font-bold px-4 py-1.5 rounded">Cancel</button>
                              </div>
                            </td>
                          </tr>
                        )
                      }
                      if (isConfirmingPermanent) {
                        return (
                          <tr key={p.id} className="border-b border-slate-100 last:border-0 bg-red-50">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="text-red-900 text-sm flex-1">
                                  ⚠️ Permanently delete <strong>{p.name}</strong>? This cannot be undone — all {p.versions.length} version{p.versions.length === 1 ? '' : 's'} and {p.rfis.length} RFI{p.rfis.length === 1 ? '' : 's'} will be gone forever.
                                </span>
                                <button onClick={() => handlePermanentDelete(p.id)}
                                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-1.5 rounded">Permanently Delete</button>
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
                            <div className="font-semibold text-slate-700 text-sm italic">{p.name}</div>
                          </td>
                          <td className="px-4 py-3">
                            {p.projectId ? (
                              <span className="text-slate-500 text-[10px] font-mono">{p.projectId}</span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{p.versions.length}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs italic">{relativeTime(p.deletedAt || p.updatedAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => setConfirmAction({type: 'restore', projectId: p.id})}
                              className="text-emerald-600 hover:text-emerald-800 text-xs font-bold mr-3">Restore</button>
                            <button onClick={() => setConfirmAction({type: 'permanent', projectId: p.id})}
                              className="text-red-600 hover:text-red-800 text-xs font-bold">Permanently Delete</button>
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
