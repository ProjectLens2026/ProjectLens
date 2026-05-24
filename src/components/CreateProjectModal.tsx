'use client'
// =============================================================================
// CreateProjectModal — Day 9 / Phase 3B.
//
// Used by Admin/Owner to spin up a new EMPTY project shell (no schedule yet),
// matching the DGS workflow: contracting officer sets up the project record
// first (Name + Project ID), then hands it to a PM who uploads the baseline.
//
// On Save:
//   1. Validates Project ID against versionLabeler rules (uppercase, hyphens,
//      3-20 chars, no duplicates within the org).
//   2. Calls createEmptyProject() — local + Supabase write.
//   3. Optionally redirects to the upload page so the next click is the
//      baseline upload (preselected with this project's Name + ID).
//   4. Closes the modal.
//
// PM assignment (project_access table) is deferred to Phase 3C, when the
// invite flow exists and other PMs are in the org.
// =============================================================================

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  createEmptyProject, loadProjects,
  ContractDates,
} from '@/lib/projectStore'
import {
  sanitizeProjectId, sanitizeProjectIdLive, validateProjectId,
} from '@/lib/versionLabeler'

interface CreateProjectModalProps {
  open: boolean
  onClose: () => void
  // Optional: where to send the user after creating. Default: stay on current page.
  redirectTo?: 'upload' | 'dashboard' | 'none'
}

export default function CreateProjectModal({
  open,
  onClose,
  redirectTo = 'upload',
}: CreateProjectModalProps) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [owner, setOwner] = useState('')
  const [ntp, setNtp] = useState('')
  const [originalCompletion, setOriginalCompletion] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset state when modal opens fresh
  useEffect(() => {
    if (open) {
      setName('')
      setProjectId('')
      setOwner('')
      setNtp('')
      setOriginalCompletion('')
      setError('')
      setSubmitting(false)
    }
  }, [open])

  // ESC to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function updateProjectIdLive(raw: string) {
    setProjectId(sanitizeProjectIdLive(raw))
    setError('')
  }

  function handleCreate() {
    setError('')

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Project Name is required.')
      return
    }
    const strictId = sanitizeProjectId(projectId)
    const idErr = validateProjectId(strictId)
    if (idErr) {
      setError(idErr)
      return
    }
    // Block duplicate Project IDs within the org (local check; the cloud
    // write would also fail on the unique constraint).
    const existing = loadProjects()
    const collision = existing.find(p => p.projectId?.toUpperCase() === strictId.toUpperCase())
    if (collision) {
      setError(`Project ID "${strictId}" is already used by "${collision.name}".`)
      return
    }
    if (ntp && originalCompletion && ntp >= originalCompletion) {
      setError('Original Contract Completion must be after NTP.')
      return
    }

    setSubmitting(true)
    try {
      const contractDates: ContractDates | undefined = (ntp || originalCompletion)
        ? {
            ntp: ntp || '',
            originalContractCompletion: originalCompletion || '',
          }
        : undefined

      createEmptyProject({
        name: trimmedName,
        projectId: strictId,
        owner: owner.trim() || undefined,
        contractDates,
      })

      onClose()

      if (redirectTo === 'upload') router.push('/dashboard/upload')
      else if (redirectTo === 'dashboard') router.push('/dashboard')
      // 'none' = stay where we are
    } catch (e: any) {
      setError(e?.message || 'Failed to create project.')
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="font-bold text-slate-900 text-base">Create New Project</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Set up an empty project shell — the PM uploads the baseline next
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-1"
            title="Close (ESC)">×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Project Name */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Project Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              placeholder="e.g. Building A Renovation"
              autoFocus
              maxLength={120}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            <div className="text-[10px] text-slate-400 mt-1">
              The PM can edit this once they open the project.
            </div>
          </div>

          {/* Project ID */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Project ID <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={projectId}
              onChange={e => updateProjectIdLive(e.target.value)}
              placeholder="e.g. CONTRACT-001 or PROJ-2026"
              maxLength={20}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 font-mono uppercase" />
            <div className="text-[10px] text-slate-400 mt-1">
              Letters, numbers, hyphens · 3-20 chars · Locked once set.
            </div>
          </div>

          {/* Owner / Client */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Owner / Client <span className="text-slate-400 normal-case font-normal">· optional</span>
            </label>
            <input
              type="text"
              value={owner}
              onChange={e => setOwner(e.target.value)}
              placeholder="Client / owner organization"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
          </div>

          {/* Optional Contract Dates */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-2">
              📅 Contract Dates <span className="text-blue-700 normal-case font-normal">· optional, the PM can enter these later</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                  NTP / Contract Start
                </label>
                <input
                  type="date"
                  value={ntp}
                  onChange={e => { setNtp(e.target.value); setError('') }}
                  className="w-full px-2.5 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                  Original Completion
                </label>
                <input
                  type="date"
                  value={originalCompletion}
                  onChange={e => { setOriginalCompletion(e.target.value); setError('') }}
                  className="w-full px-2.5 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white" />
              </div>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold">
              ⚠ {error}
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
            <strong>Next step:</strong> after you create the shell, you'll be sent to the Upload page so the PM can upload the baseline XER for this project.
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors">
            {submitting ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
