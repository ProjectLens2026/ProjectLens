'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  loadProjects, subscribeToProjects,
  restoreProject, permanentlyDeleteProject,
  restoreVersion, permanentlyDeleteVersion,
  getProjectStatus,
  Project, ScheduleVersion,
} from '@/lib/projectStore'
import { usePermissions } from '@/lib/usePermissions'

// =============================================================================
// Deleted Items page — Day 10. Two tabs:
//   - Projects: soft-deleted whole projects (status = 'Deleted')
//   - Versions: soft-deleted individual schedule versions (deletedAt set)
//
// Permissions:
//   Owner/Admin:  Restore + Permanently Delete on both tabs
//   PM:           Restore on Versions tab; Permanently Delete is hidden
//                 ("🔒 Admin only" text instead). Projects tab visible but
//                 inert for PMs (they can't soft-delete projects to begin with).
// =============================================================================

interface DeletedVersionRow {
  projectId: string
  projectName: string
  projectCode: string
  version: ScheduleVersion
}

export default function DeletedPage() {
  const router = useRouter()
  const perms = usePermissions()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeTab, setActiveTab] = useState<'projects' | 'versions'>('projects')
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'restore-project'; projectId: string }
    | { kind: 'permanent-project'; projectId: string }
    | { kind: 'empty-projects' }
    | { kind: 'restore-version'; projectId: string; versionId: string }
    | { kind: 'permanent-version'; projectId: string; versionId: string }
    | null
  >(null)

  const canHardDelete = perms.can.hardDeleteProject              // Owner + Admin
  const canRestore = perms.can.restoreProject                     // Owner + Admin
  const canPermDeleteVersion = perms.can.permanentDeleteVersion   // Owner + Admin
  const canRestoreVersion = perms.can.deleteVersion               // Owner + Admin + PM

  useEffect(() => {
    setProjects(loadProjects())
    const unsub = subscribeToProjects(() => setProjects(loadProjects()))
    return unsub
  }, [])

  const deletedProjects = projects.filter(p => getProjectStatus(p) === 'Deleted')

  const deletedVersions: DeletedVersionRow[] = projects
    .filter(p => getProjectStatus(p) !== 'Deleted')
    .flatMap(p =>
      p.versions
        .filter(v => v.deletedAt)
        .map(v => ({
          projectId: p.id,
          projectName: p.name,
          projectCode: p.projectId || '—',
          version: v,
        }))
    )
    .sort((a, b) => new Date(b.version.deletedAt || 0).getTime() - new Date(a.version.deletedAt || 0).getTime())

  function handleRestoreProject(id: string) {
    if (!canRestore) return
    restoreProject(id)
    setConfirmAction(null)
    setProjects(loadProjects())
  }

  function handlePermanentDeleteProject(id: string) {
    if (!canHardDelete) return
    permanentlyDeleteProject(id)
    setConfirmAction(null)
    setProjects(loadProjects())
  }

  function handleEmptyProjectTrash() {
    if (!canHardDelete) return
    deletedProjects.forEach(p => permanentlyDeleteProject(p.id))
    setConfirmAction(null)
    setProjects(loadProjects())
  }

  function handleRestoreVersion(projectId: string, versionId: string) {
    if (!canRestoreVersion) return
    const result = restoreVersion(projectId, versionId)
    if (!result.ok) {
      alert(result.error || 'Failed to restore version.')
      return
    }
    setConfirmAction(null)
    setProjects(loadProjects())
  }

  function handlePermanentDeleteVersion(projectId: string, versionId: string) {
    if (!canPermDeleteVersion) return
    const result = permanentlyDeleteVersion(projectId, versionId)
    if (!result.ok) {
      alert(result.error || 'Failed to permanently delete version.')
      return
    }
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

  const projectCount = deletedProjects.length
  const versionCount = deletedVersions.length

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Deleted Items</span>
          <span className="text-slate-400 text-sm ml-2">· {projectCount + versionCount} item{projectCount + versionCount === 1 ? '' : 's'} in trash</span>
        </div>
        {activeTab === 'projects' && projectCount > 0 && canHardDelete && (
          <button
            onClick={() => setConfirmAction({ kind: 'empty-projects' })}
            className="ml-auto text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5"
          ><span>🗑</span> Empty project trash</button>
        )}
      </div>

      <div className="bg-white border-b border-slate-200 px-6 flex gap-0">
        <button
          onClick={() => setActiveTab('projects')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'projects' ? 'text-blue-600 border-blue-600' : 'text-slate-500 hover:text-slate-900 border-transparent'
          }`}>
          Projects {projectCount > 0 && <span className="ml-1.5 bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded-full">{projectCount}</span>}
        </button>
        <button
          onClick={() => setActiveTab('versions')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'versions' ? 'text-blue-600 border-blue-600' : 'text-slate-500 hover:text-slate-900 border-transparent'
          }`}>
          Versions {versionCount > 0 && <span className="ml-1.5 bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded-full">{versionCount}</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'projects' && !canHardDelete && deletedProjects.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs text-blue-900 leading-relaxed">
              <strong>🔒 Admin-only action:</strong> Restoring or permanently deleting projects requires Admin or Owner role.
            </div>
          )}

          {confirmAction?.kind === 'empty-projects' && canHardDelete && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-4">
              <div className="font-bold text-red-900 mb-1">⚠️ Permanently delete all {projectCount} project{projectCount === 1 ? '' : 's'}?</div>
              <div className="text-xs text-red-800 mb-3">This action cannot be undone. All deleted projects and their version history will be gone forever.</div>
              <div className="flex gap-2">
                <button onClick={handleEmptyProjectTrash}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded">Yes, permanently delete all</button>
                <button onClick={() => setConfirmAction(null)}
                  className="bg-white border border-slate-300 text-slate-600 text-xs font-bold px-4 py-2 rounded">Cancel</button>
              </div>
            </div>
          )}

          {activeTab === 'projects' && (
            deletedProjects.length === 0 ? (
              <EmptyTrash
                icon="🗑"
                title="No projects in trash"
                subtitle={canHardDelete
                  ? 'When you delete a project from the sidebar, it lands here first so you can restore it if you change your mind.'
                  : 'You don\'t have access to deleted projects. Only Admins/Owners can soft-delete projects.'}
              />
            ) : (
              <DeletedTable headers={['Project', 'Contract #', 'Versions', 'Deleted', 'Actions']}>
                {deletedProjects.map(p => {
                  const isConfirmingRestore = confirmAction?.kind === 'restore-project' && confirmAction.projectId === p.id
                  const isConfirmingPermanent = confirmAction?.kind === 'permanent-project' && confirmAction.projectId === p.id

                  if (isConfirmingRestore && canRestore) {
                    return (
                      <ConfirmRow key={p.id} bg="emerald" colSpan={5}
                        message={<>Restore <strong>{p.name}</strong>? It will move back to your active projects.</>}
                        confirmLabel="Restore"
                        confirmColor="emerald"
                        onConfirm={() => handleRestoreProject(p.id)}
                        onCancel={() => setConfirmAction(null)}
                      />
                    )
                  }
                  if (isConfirmingPermanent && canHardDelete) {
                    return (
                      <ConfirmRow key={p.id} bg="red" colSpan={5}
                        message={<>⚠️ Permanently delete <strong>{p.name}</strong>? This cannot be undone — all {p.versions.length} version{p.versions.length === 1 ? '' : 's'} and {p.rfis.length} RFI{p.rfis.length === 1 ? '' : 's'} will be gone forever.</>}
                        confirmLabel="Permanently Delete"
                        confirmColor="red"
                        onConfirm={() => handlePermanentDeleteProject(p.id)}
                        onCancel={() => setConfirmAction(null)}
                      />
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
                        {canRestore && (
                          <button onClick={() => setConfirmAction({ kind: 'restore-project', projectId: p.id })}
                            className="text-emerald-600 hover:text-emerald-800 text-xs font-bold mr-3">Restore</button>
                        )}
                        {canHardDelete ? (
                          <button onClick={() => setConfirmAction({ kind: 'permanent-project', projectId: p.id })}
                            className="text-red-600 hover:text-red-800 text-xs font-bold">Permanently Delete</button>
                        ) : (
                          <span className="text-slate-300 text-[10px] italic">🔒 Admin only</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </DeletedTable>
            )
          )}

          {activeTab === 'versions' && (
            deletedVersions.length === 0 ? (
              <EmptyTrash
                icon="📂"
                title="No versions in trash"
                subtitle="When you delete a schedule version from the sidebar, it lands here. You can restore it any time. Only Admins/Owners can permanently remove versions from the trash."
              />
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-900 leading-relaxed">
                  <strong>Deleted versions</strong> are kept in case you need them back. Click <strong>Restore</strong> to bring a version back to its project sidebar. {canPermDeleteVersion ? <>Click <strong>Permanently Delete</strong> to remove forever — no recovery.</> : <>Only Admins/Owners can permanently remove versions from the trash.</>}
                </div>
                <DeletedTable headers={['Version', 'Project', 'File', 'Deleted', 'Actions']}>
                  {deletedVersions.map(row => {
                    const v = row.version
                    const versionKey = row.projectId + ':' + v.id
                    const isConfirmingRestore = confirmAction?.kind === 'restore-version' && confirmAction.projectId === row.projectId && confirmAction.versionId === v.id
                    const isConfirmingPermanent = confirmAction?.kind === 'permanent-version' && confirmAction.projectId === row.projectId && confirmAction.versionId === v.id

                    if (isConfirmingRestore && canRestoreVersion) {
                      return (
                        <ConfirmRow key={versionKey} bg="emerald" colSpan={5}
                          message={<>Restore version <strong>{v.versionLabel || v.fileName}</strong> back to <strong>{row.projectName}</strong>?</>}
                          confirmLabel="Restore"
                          confirmColor="emerald"
                          onConfirm={() => handleRestoreVersion(row.projectId, v.id)}
                          onCancel={() => setConfirmAction(null)}
                        />
                      )
                    }
                    if (isConfirmingPermanent && canPermDeleteVersion) {
                      return (
                        <ConfirmRow key={versionKey} bg="red" colSpan={5}
                          message={<>⚠️ Permanently delete <strong>{v.versionLabel || v.fileName}</strong>? This removes the version and its uploaded XER file forever. No recovery.</>}
                          confirmLabel="Permanently Delete"
                          confirmColor="red"
                          onConfirm={() => handlePermanentDeleteVersion(row.projectId, v.id)}
                          onCancel={() => setConfirmAction(null)}
                        />
                      )
                    }
                    return (
                      <tr key={versionKey} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-700 text-sm font-mono italic">{v.versionLabel || '(no label)'}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Uploaded {relativeTime(v.uploadedAt)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-slate-700">{row.projectName}</div>
                          <div className="text-[10px] font-mono text-slate-400">{row.projectCode}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs italic truncate max-w-[180px]" title={v.fileName}>{v.fileName}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs italic">{relativeTime(v.deletedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {canRestoreVersion && (
                            <button onClick={() => setConfirmAction({ kind: 'restore-version', projectId: row.projectId, versionId: v.id })}
                              className="text-emerald-600 hover:text-emerald-800 text-xs font-bold mr-3">Restore</button>
                          )}
                          {canPermDeleteVersion ? (
                            <button onClick={() => setConfirmAction({ kind: 'permanent-version', projectId: row.projectId, versionId: v.id })}
                              className="text-red-600 hover:text-red-800 text-xs font-bold">Permanently Delete</button>
                          ) : (
                            <span className="text-slate-300 text-[10px] italic" title="Only Owners/Admins can permanently delete">🔒 Admin only</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </DeletedTable>
              </>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyTrash({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
      <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-2xl flex items-center justify-center">
        <span className="text-3xl">{icon}</span>
      </div>
      <div className="text-lg font-bold text-slate-700 mb-2">{title}</div>
      <div className="text-sm text-slate-500 mb-4 max-w-md mx-auto">{subtitle}</div>
      <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
        Back to dashboard
      </Link>
    </div>
  )
}

function DeletedTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={`text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5 ${i === headers.length - 1 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function ConfirmRow({ bg, colSpan, message, confirmLabel, confirmColor, onConfirm, onCancel }: {
  bg: 'emerald' | 'red'
  colSpan: number
  message: React.ReactNode
  confirmLabel: string
  confirmColor: 'emerald' | 'red'
  onConfirm: () => void
  onCancel: () => void
}) {
  const bgClass = bg === 'emerald' ? 'bg-emerald-50' : 'bg-red-50'
  const textClass = bg === 'emerald' ? 'text-emerald-900' : 'text-red-900'
  const btnClass = confirmColor === 'emerald'
    ? 'bg-emerald-600 hover:bg-emerald-700'
    : 'bg-red-600 hover:bg-red-700'
  return (
    <tr className={`border-b border-slate-100 last:border-0 ${bgClass}`}>
      <td colSpan={colSpan} className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={`${textClass} text-sm flex-1`}>{message}</span>
          <button onClick={onConfirm}
            className={`${btnClass} text-white text-xs font-bold px-4 py-1.5 rounded`}>{confirmLabel}</button>
          <button onClick={onCancel}
            className="bg-white border border-slate-300 text-slate-600 text-xs font-bold px-4 py-1.5 rounded">Cancel</button>
        </div>
      </td>
    </tr>
  )
}
