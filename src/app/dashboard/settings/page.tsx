'use client'
// =============================================================================
// Settings page — Phase 3C / Day 9.
//
// Fully rebuilt — old version had hardcoded "Mike Anderson" demo data. New
// version reads from Supabase and supports the role-based invitation flow.
//
// Tabs:
//   1. Workspace   — your org name + your role
//   2. Members     — REAL list of org members from organization_members + profiles
//   3. Invitations — create new invitations, see pending ones, copy share-link
//
// Tabs deferred to later phases:
//   - Notifications (Phase 4)
//   - Billing (Phase 5, when Stripe integration ships)
//   - Profile is its own page at /dashboard/profile — link from here
//
// Invitation flow (no email sending — admin shares link manually for now):
//   1. Admin enters email + picks role (admin/pm/viewer)
//   2. App generates a unique token, inserts into invitations table
//   3. Returns acceptance URL: /auth/accept-invite?token=xxx
//   4. Admin copies link, pastes into Slack/email/WhatsApp to recipient
//   5. Recipient clicks → /auth/accept-invite page → signs up + joins org
// =============================================================================

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePermissions, roleLabel, roleBadgeColor } from '@/lib/usePermissions'
import {
  loadOrgMembers, loadPendingInvitations,
  createInvitation, revokeInvitation,
  updateOrgMemberRole, removeOrgMember,
  OrgMember, Invitation,
} from '@/lib/supabase/db'

type TabId = 'workspace' | 'members' | 'invitations' | 'notifications' | 'billing'
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'workspace', label: 'Workspace', icon: '🏢' },
  { id: 'members', label: 'Members', icon: '👥' },
  { id: 'invitations', label: 'Invitations', icon: '✉️' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'billing', label: 'Billing', icon: '💳' },
]

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const perms = usePermissions()

  const tabParam = (searchParams.get('tab') as TabId) || 'workspace'
  const activeTab: TabId = TABS.find(t => t.id === tabParam)?.id || 'workspace'

  function setActiveTab(id: TabId) {
    router.push(`/dashboard/settings?tab=${id}`)
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Settings</span>
          <span className="text-slate-400 text-sm ml-2">· {TABS.find(t => t.id === activeTab)?.label}</span>
        </div>
      </div>

      {/* Tab nav */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-1 flex-shrink-0 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              'flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ' +
              (activeTab === tab.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800')
            }
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {activeTab === 'workspace' && <WorkspaceTab perms={perms} />}
          {activeTab === 'members' && <MembersTab perms={perms} />}
          {activeTab === 'invitations' && <InvitationsTab perms={perms} />}
          {activeTab === 'notifications' && <ComingSoonTab title="Notifications" />}
          {activeTab === 'billing' && <ComingSoonTab title="Billing" />}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Workspace Tab
// =============================================================================
function WorkspaceTab({ perms }: { perms: ReturnType<typeof usePermissions> }) {
  if (perms.loading) return <div className="text-sm text-slate-500">Loading...</div>
  if (!perms.user) return <div className="text-sm text-slate-500">Not signed in.</div>

  return (
    <>
      <SectionHeader title="Your Workspace" subtitle="Organization name and your role within it" />
      <Card>
        <div className="space-y-4">
          <Field label="Workspace Name" value={perms.user.orgName || '—'} />
          <Field label="Your Email" value={perms.user.email} />
          <Field label="Your Role">
            <span className={
              'inline-block text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ' +
              roleBadgeColor(perms.user.orgRole).replace(/30/g, '100').replace(/200/g, '700')
            }>
              {roleLabel(perms.user.orgRole)}
            </span>
          </Field>
        </div>
      </Card>

      <SectionHeader title="Your Profile" subtitle="Personal info — edit in the Profile page" />
      <Card>
        <Link href="/dashboard/profile" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700">
          👤 Open My Profile →
        </Link>
      </Card>

      <SectionHeader title="Help & Support" subtitle="Reach the ControlLens team — we usually respond within 24 hours" />
      <Card>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-xl">📧</span>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Support Email</div>
              <a href="mailto:support@control-lens.com" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                support@control-lens.com
              </a>
              <div className="text-xs text-slate-500 mt-0.5">
                Technical issues, bug reports, account problems, or anything that's not working
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl">💼</span>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sales & General Inquiries</div>
              <a href="mailto:info@control-lens.com" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                info@control-lens.com
              </a>
              <div className="text-xs text-slate-500 mt-0.5">
                Pricing, demos, partnership opportunities, custom features
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl">🏢</span>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Company</div>
              <div className="text-sm font-semibold text-slate-900">Nobel Project Management Services, LLC</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Construction schedule intelligence built by construction PMs
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-xl">🌐</span>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Website</div>
              <a href="https://app.control-lens.com" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                app.control-lens.com
              </a>
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}

// =============================================================================
// Members Tab
// =============================================================================
function MembersTab({ perms }: { perms: ReturnType<typeof usePermissions> }) {
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingRole, setPendingRole] = useState<string>('')
  const [saving, setSaving] = useState(false)

  function refresh() {
    setLoading(true)
    loadOrgMembers().then(list => {
      setMembers(list)
      setLoading(false)
    })
  }

  useEffect(() => {
    if (perms.loading) return
    refresh()
  }, [perms.loading])

  async function handleSaveRole(userId: string) {
    setSaving(true)
    const result = await updateOrgMemberRole({ userId, newRole: pendingRole as any })
    setSaving(false)
    if (!result.ok) {
      alert('Failed to update role: ' + (result.error || 'unknown'))
      return
    }
    setEditingId(null)
    refresh()
  }

  async function handleRemove(member: OrgMember) {
    const ok = confirm(
      `Remove ${member.name || member.email} from the workspace?\n\n` +
      `They will lose access to all org projects. This does NOT delete their account — they can be re-invited later.`
    )
    if (!ok) return
    const result = await removeOrgMember(member.user_id)
    if (!result.ok) {
      alert('Failed to remove: ' + (result.error || 'unknown'))
      return
    }
    refresh()
  }

  const canEdit = perms.can.manageWorkspace  // Owner + Admin

  return (
    <>
      <SectionHeader
        title="Team Members"
        subtitle={loading ? 'Loading...' : `${members.length} ${members.length === 1 ? 'person' : 'people'} in ${perms.user?.orgName || 'this workspace'}`}
        action={perms.can.inviteUsers && (
          <Link href="/dashboard/settings?tab=invitations"
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1">
            <span>✉</span> Invite People
          </Link>
        )}
      />
      <Card noPadding>
        {loading ? (
          <div className="p-6 text-sm text-slate-500 text-center">Loading members...</div>
        ) : members.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 text-center">No members yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Member</th>
                <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Role</th>
                <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Joined</th>
                {canEdit && (
                  <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const isEditingThis = editingId === m.user_id
                return (
                  <tr key={m.user_id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                          {makeInitials(m.name || m.email)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 text-sm">
                            {m.name || m.email.split('@')[0]}
                            {m.is_self && <span className="ml-2 text-[10px] text-slate-400 font-normal">(you)</span>}
                          </div>
                          <div className="text-xs text-slate-500">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isEditingThis ? (
                        <select
                          value={pendingRole}
                          onChange={e => setPendingRole(e.target.value)}
                          className="px-2 py-1 border border-slate-300 rounded text-xs">
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="pm">Project Manager</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <span className={
                          'text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ' +
                          roleBadgeColor(m.role as any).replace(/30/g, '100').replace(/200/g, '700')
                        }>
                          {roleLabel(m.role as any)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(m.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        {isEditingThis ? (
                          <>
                            <button
                              onClick={() => handleSaveRole(m.user_id)}
                              disabled={saving}
                              className="text-blue-600 hover:text-blue-700 text-xs font-semibold mr-2">
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              disabled={saving}
                              className="text-slate-500 hover:text-slate-700 text-xs">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingId(m.user_id)
                                setPendingRole(m.role)
                              }}
                              className="text-blue-600 hover:text-blue-700 text-xs font-semibold">
                              Edit Role
                            </button>
                            {!m.is_self && (
                              <>
                                <span className="text-slate-300 mx-1.5">·</span>
                                <button
                                  onClick={() => handleRemove(m)}
                                  className="text-red-600 hover:text-red-700 text-xs font-semibold">
                                  Remove
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
      {canEdit && (
        <div className="text-[11px] text-slate-500 leading-relaxed">
          <strong>Note:</strong> Removing someone from the workspace revokes all their access immediately. Their auth account is preserved — you can re-invite them later. The last Owner cannot be removed or demoted.
        </div>
      )}
    </>
  )
}

// =============================================================================
// Invitations Tab
// =============================================================================
function InvitationsTab({ perms }: { perms: ReturnType<typeof usePermissions> }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('pm')
  const [submitting, setSubmitting] = useState(false)
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Invitation[]>([])
  const [loadingPending, setLoadingPending] = useState(true)

  function refresh() {
    setLoadingPending(true)
    loadPendingInvitations().then(list => {
      setPending(list)
      setLoadingPending(false)
    })
  }

  useEffect(() => {
    if (perms.loading) return
    refresh()
  }, [perms.loading])

  async function handleSendInvite() {
    setError('')
    setGeneratedLink(null)
    setCopied(false)

    if (!email.trim()) {
      setError('Email is required.')
      return
    }

    setSubmitting(true)
    const result = await createInvitation({ email: email.trim(), role })
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error || 'Failed to create invitation.')
      return
    }

    setGeneratedLink(result.acceptUrl || null)
    setEmail('')
    refresh()
  }

  async function handleRevoke(id: string, email: string) {
    if (!confirm(`Revoke invitation for ${email}?`)) return
    const ok = await revokeInvitation(id)
    if (ok) refresh()
    else alert('Failed to revoke invitation.')
  }

  function copyLink() {
    if (!generatedLink) return
    navigator.clipboard.writeText(generatedLink)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      })
      .catch(() => alert('Copy failed — please select the link and copy manually.'))
  }

  if (perms.loading) return <div className="text-sm text-slate-500">Loading...</div>

  // Gate the page — only Admin+ can invite
  if (!perms.can.inviteUsers) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
        <div className="font-bold mb-1">Permission required</div>
        <p>Only Owners and Admins can invite people to this workspace. Ask your workspace admin for access.</p>
      </div>
    )
  }

  return (
    <>
      <SectionHeader
        title="Invite people to your workspace"
        subtitle="Generate an invitation link, then share it via email, WhatsApp, or Slack"
      />

      <Card>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Email Address <span className="text-red-600">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="colleague@company.com"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
              {perms.isOwner && <option value="admin">Admin — full operational access (creates projects, invites PMs)</option>}
              <option value="pm">Project Manager — uploads schedules, manages assigned projects</option>
              <option value="viewer">Viewer — read-only access to projects shared with them</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs px-3 py-2 rounded-lg font-semibold">
              ⚠ {error}
            </div>
          )}

          <button
            onClick={handleSendInvite}
            disabled={submitting || !email.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-bold py-2.5 rounded-lg transition-colors">
            {submitting ? 'Generating link...' : '🔗 Generate Invitation Link'}
          </button>

          {generatedLink && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <div className="text-xs font-bold text-emerald-900 mb-2">✓ Invitation created — share this link:</div>
              <div className="bg-white border border-emerald-200 rounded p-2 mb-2 break-all text-[11px] font-mono text-slate-700">
                {generatedLink}
              </div>
              <button
                onClick={copyLink}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded">
                {copied ? '✓ Copied!' : '📋 Copy link'}
              </button>
              <div className="text-[10px] text-emerald-800 mt-2 leading-relaxed">
                Send this link to the recipient via email, WhatsApp, Slack, or any channel. The link expires in 7 days. When they click it, they'll create their password and join your workspace automatically.
              </div>
            </div>
          )}
        </div>
      </Card>

      {pending.length > 0 && (
        <>
          <SectionHeader title="Pending Invitations" subtitle={`${pending.length} waiting for acceptance`} />
          <Card noPadding>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Email</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Role</th>
                  <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Expires</th>
                  <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(inv => {
                  const acceptUrl = typeof window !== 'undefined'
                    ? `${window.location.origin}/auth/accept-invite?token=${inv.token}`
                    : `/auth/accept-invite?token=${inv.token}`
                  return (
                    <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-700 text-sm font-semibold">{inv.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-700 uppercase tracking-wide">
                          {roleLabel(inv.role as any)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatExpiresIn(inv.expires_at)}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(acceptUrl)
                            alert('Invitation link copied to clipboard')
                          }}
                          className="text-blue-600 hover:text-blue-700 text-xs font-semibold">
                          📋 Copy Link
                        </button>
                        <button
                          onClick={() => handleRevoke(inv.id, inv.email)}
                          className="text-red-600 hover:text-red-700 text-xs font-semibold">
                          Revoke
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {!loadingPending && pending.length === 0 && (
        <div className="text-center text-xs text-slate-400 italic py-4">No pending invitations.</div>
      )}
    </>
  )
}

// =============================================================================
// Coming Soon Tab (Notifications, Billing)
// =============================================================================
function ComingSoonTab({ title }: { title: string }) {
  return (
    <Card>
      <div className="text-center py-8">
        <div className="text-3xl mb-3">🚧</div>
        <div className="text-base font-bold text-slate-900 mb-1">{title}</div>
        <div className="text-sm text-slate-500">Coming in a future update.</div>
      </div>
    </Card>
  )
}

// =============================================================================
// Helpers + Sub-components
// =============================================================================
function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div>
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}

function Card({ children, noPadding }: { children: React.ReactNode; noPadding?: boolean }) {
  return (
    <div className={
      'bg-white border border-slate-200 rounded-xl shadow-sm ' +
      (noPadding ? 'overflow-hidden' : 'p-5')
    }>
      {children}
    </div>
  )
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      {value !== undefined ? (
        <div className="text-sm font-semibold text-slate-900">{value}</div>
      ) : (
        children
      )}
    </div>
  )
}

function makeInitials(s: string): string {
  if (!s) return '??'
  const parts = s.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatExpiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days > 0) return `In ${days} day${days !== 1 ? 's' : ''}`
  const hours = Math.floor(ms / (1000 * 60 * 60))
  return `In ${hours} hour${hours !== 1 ? 's' : ''}`
}
