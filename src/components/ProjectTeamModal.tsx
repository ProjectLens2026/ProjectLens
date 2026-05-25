'use client'
// =============================================================================
// ProjectTeamModal — Phase 3D / Day 9.
//
// Opened from the project ⋮ menu in the sidebar (Team option). Shows everyone
// who has access to this project + lets the caller add/remove people based
// on their role.
//
// Access matrix:
//   Owner/Admin of org:  can add PMs or Viewers, remove anyone
//   PM (their project):  can add Viewers only, remove Viewers they granted
//   Viewer:              read-only
// =============================================================================

import { useEffect, useState } from 'react'
import { usePermissions, roleLabel } from '@/lib/usePermissions'
import {
  loadProjectTeam, loadOrgMembersNotOnProject,
  addProjectMember, removeProjectMember,
  createProjectInvitation,
  ProjectTeamMember, AssignableMember,
} from '@/lib/supabase/db'

interface ProjectTeamModalProps {
  open: boolean
  onClose: () => void
  projectId: string         // local proj_xxx id
  projectName: string
  projectCode: string       // e.g. "TT-001"
}

export default function ProjectTeamModal({
  open, onClose, projectId, projectName, projectCode,
}: ProjectTeamModalProps) {
  const perms = usePermissions()
  const [team, setTeam] = useState<ProjectTeamMember[]>([])
  const [available, setAvailable] = useState<AssignableMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedAccess, setSelectedAccess] = useState<'edit' | 'view'>('view')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Phase 3D+ — Email invite form (new in Day 10)
  const [showInviteByEmail, setShowInviteByEmail] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'viewer' | 'pm'>('viewer')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState<{ email: string; url: string } | null>(null)

  // Who's the caller? Determines what they can do
  const canManageAsAdmin = perms.isOwner || perms.isAdmin  // adds PM or Viewer
  const canManageAsPM = perms.isPM                          // adds Viewer only

  async function refresh() {
    setLoading(true)
    // Always try to load available members — even Viewers see who could be
    // added (it just stays empty for them). This avoids stale-closure bugs
    // where perms hadn't loaded yet when the modal first opened.
    const [teamList, availableList] = await Promise.all([
      loadProjectTeam({ projectId }),
      loadOrgMembersNotOnProject(projectId).catch(err => {
        console.error('[ProjectTeamModal] loadOrgMembersNotOnProject failed:', err)
        return []
      }),
    ])
    console.log('[ProjectTeamModal] refresh:',
      { teamCount: teamList.length, availableCount: availableList.length,
        canManageAsAdmin, canManageAsPM, loading: perms.loading })
    setTeam(teamList)
    setAvailable(availableList)
    setLoading(false)
  }

  useEffect(() => {
    if (!open) return
    setShowAddForm(false)
    setSelectedUserId('')
    setSelectedAccess(canManageAsAdmin ? 'edit' : 'view')
    setError('')
    setShowInviteByEmail(false)
    setInviteEmail('')
    setInviteRole(canManageAsAdmin ? 'pm' : 'viewer')
    setInviteError('')
    setInviteSuccess(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, perms.loading, perms.isOwner, perms.isAdmin, perms.isPM])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function handleAdd() {
    setError('')
    if (!selectedUserId) { setError('Pick someone to add.'); return }
    setSubmitting(true)
    const result = await addProjectMember({
      projectId,
      userId: selectedUserId,
      accessLevel: selectedAccess,
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error || 'Failed to add member.')
      return
    }
    setShowAddForm(false)
    setSelectedUserId('')
    refresh()
  }

  async function handleRemove(member: ProjectTeamMember) {
    if (!confirm(`Remove ${member.name} from this project?`)) return
    const result = await removeProjectMember({ projectId, userId: member.user_id })
    if (!result.ok) {
      alert('Failed to remove: ' + (result.error || 'unknown error'))
      return
    }
    refresh()
  }

  // Phase 3D+ — Email invitation handler.
  // PMs can only invite Viewers. Admins/Owners can invite either PM or Viewer.
  async function handleInviteByEmail() {
    setInviteError('')
    setInviteSuccess(null)
    if (!inviteEmail.trim()) { setInviteError('Enter an email address.'); return }
    setInviting(true)
    const result = await createProjectInvitation({
      email: inviteEmail.trim(),
      role: inviteRole,
      projectId,
    })
    setInviting(false)
    if (!result.ok) {
      setInviteError(result.error || 'Failed to create invitation.')
      return
    }
    setInviteSuccess({ email: inviteEmail.trim(), url: result.acceptUrl || '' })
    setInviteEmail('')
    refresh()
  }

  function copyInviteUrl(url: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        alert('Invitation link copied to clipboard!\n\nShare this with the invitee via email, WhatsApp, etc.')
      }).catch(() => {
        window.prompt('Copy this invitation link:', url)
      })
    } else {
      window.prompt('Copy this invitation link:', url)
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
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
          <div>
            <div className="font-bold text-slate-900 text-base">Project Team</div>
            <div className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono">{projectCode}</span> · {projectName}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-1"
            title="Close (ESC)">×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading ? (
            <div className="text-center py-6 text-sm text-slate-500">Loading team...</div>
          ) : (
            <>
              {/* Member list */}
              <div className="space-y-1.5 mb-4">
                {team.map(m => (
                  <div key={m.user_id}
                    className="flex items-center gap-3 px-3 py-2 border border-slate-100 rounded-lg hover:bg-slate-50">
                    <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                      {initials(m.name || m.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {m.name}
                        {m.is_self && <span className="text-xs text-slate-400 font-normal ml-1.5">(you)</span>}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{m.email}</div>
                    </div>
                    <SourceBadge source={m.source} />
                    {m.is_removable && !m.is_self && (
                      <button
                        onClick={() => handleRemove(m)}
                        className="text-red-600 hover:text-red-700 text-xs font-semibold px-2"
                        title="Remove from project">
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add member form */}
              {(canManageAsAdmin || canManageAsPM) && !showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  disabled={available.length === 0}
                  className="w-full px-4 py-2.5 border-2 border-dashed border-slate-300 hover:border-blue-500 disabled:border-slate-200 hover:bg-blue-50 disabled:hover:bg-transparent rounded-lg text-sm font-semibold text-slate-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors">
                  {available.length === 0 ? '✓ All org members already have access' : '+ Add Member'}
                </button>
              )}

              {showAddForm && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Pick a team member
                    </label>
                    <select
                      value={selectedUserId}
                      onChange={e => { setSelectedUserId(e.target.value); setError('') }}
                      className="w-full px-3 py-2 border border-slate-200 rounded text-sm bg-white">
                      <option value="">Select someone...</option>
                      {available.map(a => (
                        <option key={a.user_id} value={a.user_id}>
                          {a.name} · {a.email} ({roleLabel(a.org_role as any)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Project Role
                    </label>
                    <select
                      value={selectedAccess}
                      onChange={e => setSelectedAccess(e.target.value as 'edit' | 'view')}
                      className="w-full px-3 py-2 border border-slate-200 rounded text-sm bg-white">
                      {canManageAsAdmin && <option value="edit">Project Manager — can upload, edit, share</option>}
                      <option value="view">Viewer — read-only access</option>
                    </select>
                    {!canManageAsAdmin && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        As a PM, you can only add Viewers. Promotions to PM require an Admin.
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2 rounded font-semibold">
                      ⚠ {error}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleAdd}
                      disabled={submitting || !selectedUserId}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2 rounded-lg">
                      {submitting ? 'Adding...' : 'Add to Project'}
                    </button>
                    <button
                      onClick={() => { setShowAddForm(false); setError('') }}
                      disabled={submitting}
                      className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!canManageAsAdmin && !canManageAsPM && (
                <div className="mt-4 text-xs text-slate-400 italic text-center">
                  You don't have permission to add members to this project.
                </div>
              )}

              {/* Phase 3D+ — Invite by Email section.
                  Lets PMs/Admins/Owners invite people who are NOT yet in the
                  org. On acceptance, the new user joins the org AND gets
                  access to this specific project. */}
              {(canManageAsAdmin || canManageAsPM) && !showAddForm && (
                <div className="mt-3">
                  {!showInviteByEmail && (
                    <button
                      onClick={() => setShowInviteByEmail(true)}
                      className="w-full px-4 py-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors flex items-center justify-center gap-2">
                      <span>✉</span> Invite new person by email
                      <span className="text-[10px] text-slate-500 font-normal">
                        ({canManageAsPM && !canManageAsAdmin ? 'Viewer only' : 'PM or Viewer'})
                      </span>
                    </button>
                  )}

                  {showInviteByEmail && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">
                          ✉ Invite by email
                        </div>
                        <button
                          onClick={() => { setShowInviteByEmail(false); setInviteError(''); setInviteSuccess(null); setInviteEmail('') }}
                          className="text-slate-400 hover:text-slate-700 text-lg leading-none">×</button>
                      </div>

                      {inviteSuccess ? (
                        <div className="bg-white border border-emerald-300 rounded-lg p-3">
                          <div className="text-xs font-bold text-emerald-900 mb-1.5">✓ Invitation created for {inviteSuccess.email}</div>
                          <div className="text-[10px] text-slate-600 mb-2">
                            Copy the link below and send it to them via email or WhatsApp. When they accept, they'll automatically join your workspace AND get access to this project.
                          </div>
                          <div className="bg-slate-50 border border-slate-200 rounded p-2 text-[10px] font-mono text-slate-700 break-all mb-2">
                            {inviteSuccess.url}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => copyInviteUrl(inviteSuccess.url)}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 rounded">
                              📋 Copy Link
                            </button>
                            <button
                              onClick={() => { setInviteSuccess(null); setInviteEmail('') }}
                              className="px-3 text-xs font-semibold text-slate-600 hover:text-slate-900">
                              Invite another
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                              Email address
                            </label>
                            <input
                              type="email"
                              value={inviteEmail}
                              onChange={e => { setInviteEmail(e.target.value); setInviteError('') }}
                              placeholder="someone@example.com"
                              className="w-full px-3 py-2 border border-slate-200 rounded text-sm bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                              Role on this project
                            </label>
                            <select
                              value={inviteRole}
                              onChange={e => setInviteRole(e.target.value as 'viewer' | 'pm')}
                              className="w-full px-3 py-2 border border-slate-200 rounded text-sm bg-white">
                              {canManageAsAdmin && <option value="pm">Project Manager — uploads, edits, shares</option>}
                              <option value="viewer">Viewer — read-only access</option>
                            </select>
                            {!canManageAsAdmin && (
                              <div className="text-[10px] text-slate-500 mt-1">
                                As a PM, you can only invite Viewers. Promotions to PM require an Admin.
                              </div>
                            )}
                          </div>

                          {inviteError && (
                            <div className="bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2 rounded font-semibold">
                              ⚠ {inviteError}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={handleInviteByEmail}
                              disabled={inviting || !inviteEmail.trim()}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-sm font-bold py-2 rounded-lg">
                              {inviting ? 'Creating...' : 'Generate Invitation Link'}
                            </button>
                          </div>
                          <div className="text-[10px] text-slate-500 leading-relaxed">
                            <strong>How it works:</strong> ControlLens generates a unique link. You copy and send it to {inviteEmail || 'them'} via email/WhatsApp. When they click and sign up, they'll auto-join your workspace as a {inviteRole === 'pm' ? 'Project Manager' : 'Viewer'} AND get access to <strong>this project only</strong>. Link expires in 7 days.
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-5 py-2 rounded-lg">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================
function initials(s: string): string {
  if (!s) return '??'
  const parts = s.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function SourceBadge({ source }: { source: ProjectTeamMember['source'] }) {
  const map: Record<typeof source, { text: string; cls: string }> = {
    org_owner:      { text: 'Owner',    cls: 'bg-blue-100 text-blue-700' },
    org_admin:      { text: 'Admin',    cls: 'bg-emerald-100 text-emerald-700' },
    creator:        { text: 'Creator',  cls: 'bg-purple-100 text-purple-700' },
    project_pm:     { text: 'PM',       cls: 'bg-amber-100 text-amber-700' },
    project_viewer: { text: 'Viewer',   cls: 'bg-slate-100 text-slate-700' },
  }
  const info = map[source]
  return (
    <span className={'text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ' + info.cls}>
      {info.text}
    </span>
  )
}
