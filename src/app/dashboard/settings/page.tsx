'use client'
import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

// =============================================================================
// Settings page — scaffolding with 6 tabs.
//
// State of play (2026-05-20):
//   • Tabs render and switch correctly via ?tab=... URL param
//   • Forms are visible and editable in the input fields
//   • Data does NOT persist yet — no Supabase write-back wired in
//   • Demo members list is hardcoded to match the placeholder team in Sidebar
//
// When D3 Track B ships (Supabase wire-up), each tab becomes the real
// surface for that data:
//   Profile      → reads/writes auth.users + profile metadata
//   Workspace    → reads/writes organizations table
//   Members      → reads organization_members, with role updates
//   Invitations  → writes to invitations table, triggers email
//   Notifications → user preferences
//   Billing      → Stripe integration (later)
// =============================================================================

type TabId = 'profile' | 'workspace' | 'members' | 'invitations' | 'notifications' | 'billing'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'workspace', label: 'Workspace', icon: '🏢' },
  { id: 'members', label: 'Members', icon: '👥' },
  { id: 'invitations', label: 'Invitations', icon: '✉️' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'billing', label: 'Billing', icon: '💳' },
]

// Demo data — should match the placeholder data in Sidebar.tsx DEMO_MODE.
// When D3 ships, this gets replaced with live Supabase queries.
const DEMO_MEMBERS = [
  { id: 1, name: 'Mike Anderson', email: 'mike@nobelpcs.com', role: 'Admin', initials: 'MA', avatarColor: 'bg-blue-600' },
  { id: 2, name: 'Bob Carter', email: 'bob@nobelpcs.com', role: 'Project Manager', initials: 'BC', avatarColor: 'bg-emerald-600' },
  { id: 3, name: 'Alice Reyes', email: 'alice@nobelpcs.com', role: 'Project Manager', initials: 'AR', avatarColor: 'bg-purple-600' },
  { id: 4, name: 'Sarah Chen', email: 'sarah@nobelpcs.com', role: 'Scheduler', initials: 'SC', avatarColor: 'bg-amber-600' },
]

const DEMO_PENDING_INVITES = [
  { id: 1, email: 'tom.davis@external.com', role: 'Project Manager', invitedAt: '2 days ago' },
  { id: 2, email: 'linda.park@nobelpcs.com', role: 'Scheduler', invitedAt: '5 hours ago' },
]

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const tabParam = (searchParams.get('tab') as TabId) || 'profile'
  const activeTab: TabId = TABS.find(t => t.id === tabParam)?.id || 'profile'

  function setActiveTab(id: TabId) {
    router.push(`/dashboard/settings?tab=${id}`)
  }

  // Local form state — not persisted, just for UX
  const [profileForm, setProfileForm] = useState({
    name: 'Mike Anderson',
    email: 'mike@nobelpcs.com',
    role: 'Admin',
    phone: '',
  })
  const [workspaceForm, setWorkspaceForm] = useState({
    companyName: 'Nobel Project Control Services, LLC',
    contractPrefix: 'NPCS-',
    timezone: 'America/New_York',
    defaultProjectStatus: 'Active',
  })
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'Project Manager',
  })
  const [notifications, setNotifications] = useState({
    scheduleAlerts: true,
    weeklyDigest: true,
    rfiUpdates: false,
    teamActivity: true,
  })

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
        <div className="max-w-3xl mx-auto">

          {/* ============ PROFILE ============ */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <SectionHeader title="Your profile" subtitle="Personal information visible to your team" />
              <Card>
                <FormRow label="Full name" required>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={e => setProfileForm({...profileForm, name: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </FormRow>
                <FormRow label="Email" required>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </FormRow>
                <FormRow label="Role" hint="Set by workspace admin">
                  <input
                    type="text"
                    value={profileForm.role}
                    readOnly
                    className="w-full border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 cursor-not-allowed"
                  />
                </FormRow>
                <FormRow label="Phone (optional)">
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={e => setProfileForm({...profileForm, phone: e.target.value})}
                    placeholder="+1 (555) 123-4567"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </FormRow>
                <ComingSoonBanner text="Save isn't connected yet — D3 (Supabase) wires this up." />
                <SaveButton disabled />
              </Card>

              <SectionHeader title="Password" subtitle="Change your sign-in password" />
              <Card>
                <FormRow label="Current password">
                  <input type="password" placeholder="••••••••"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </FormRow>
                <FormRow label="New password">
                  <input type="password" placeholder="••••••••"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </FormRow>
                <FormRow label="Confirm new password">
                  <input type="password" placeholder="••••••••"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </FormRow>
                <ComingSoonBanner text="Password changes use Supabase Auth — coming with D3." />
                <SaveButton disabled label="Change password" />
              </Card>
            </div>
          )}

          {/* ============ WORKSPACE ============ */}
          {activeTab === 'workspace' && (
            <div className="space-y-6">
              <SectionHeader title="Workspace settings" subtitle="Your company info and team-wide defaults" />
              <Card>
                <FormRow label="Company name" required>
                  <input
                    type="text"
                    value={workspaceForm.companyName}
                    onChange={e => setWorkspaceForm({...workspaceForm, companyName: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <div className="text-[10px] text-slate-400 mt-1">Shown in the sidebar and at the top of exported reports.</div>
                </FormRow>
                <FormRow label="Contract # prefix" hint="Auto-applied to new project IDs">
                  <input
                    type="text"
                    value={workspaceForm.contractPrefix}
                    onChange={e => setWorkspaceForm({...workspaceForm, contractPrefix: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue-500"
                  />
                </FormRow>
                <FormRow label="Timezone">
                  <select
                    value={workspaceForm.timezone}
                    onChange={e => setWorkspaceForm({...workspaceForm, timezone: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option>America/New_York</option>
                    <option>America/Chicago</option>
                    <option>America/Denver</option>
                    <option>America/Los_Angeles</option>
                    <option>America/Anchorage</option>
                    <option>Pacific/Honolulu</option>
                  </select>
                </FormRow>
                <FormRow label="Default new-project status">
                  <select
                    value={workspaceForm.defaultProjectStatus}
                    onChange={e => setWorkspaceForm({...workspaceForm, defaultProjectStatus: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option>Active</option>
                    <option>On Hold</option>
                  </select>
                </FormRow>
                <ComingSoonBanner text="Workspace edits persist when D3 (Supabase organizations table) ships." />
                <SaveButton disabled />
              </Card>

              <SectionHeader title="Workspace logo" subtitle="Used in reports and email headers" />
              <Card>
                <div className="flex items-center gap-4 py-4">
                  <div className="w-20 h-20 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-3xl">
                    🏢
                  </div>
                  <div>
                    <button disabled className="bg-blue-600 disabled:bg-slate-300 text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-not-allowed">Upload logo</button>
                    <div className="text-[10px] text-slate-400 mt-1">PNG or SVG, max 2MB · Coming with D3</div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ============ MEMBERS ============ */}
          {activeTab === 'members' && (
            <div className="space-y-6">
              <SectionHeader
                title="Team members"
                subtitle={`${DEMO_MEMBERS.length} people in Nobel Project Control Services, LLC`}
                action={
                  <Link href="/dashboard/settings?tab=invitations"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1">
                    <span>✉</span> Invite people
                  </Link>
                }
              />
              <Card noPadding>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Member</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Email</th>
                      <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Role</th>
                      <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_MEMBERS.map(m => (
                      <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full ${m.avatarColor} flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0`}>
                              {m.initials}
                            </div>
                            <div className="font-semibold text-slate-900 text-sm">{m.name}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{m.email}</td>
                        <td className="px-4 py-3">
                          <span className={
                            'text-[10px] font-bold px-2 py-1 rounded-full ' +
                            (m.role === 'Admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')
                          }>{m.role}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button disabled className="text-slate-400 cursor-not-allowed text-xs hover:text-slate-600">Edit</button>
                          <span className="text-slate-300 mx-1.5">·</span>
                          <button disabled className="text-slate-400 cursor-not-allowed text-xs hover:text-red-600">Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <ComingSoonBanner text="Role changes and removals persist when D3 (Supabase organization_members) ships." />
            </div>
          )}

          {/* ============ INVITATIONS ============ */}
          {activeTab === 'invitations' && (
            <div className="space-y-6">
              <SectionHeader title="Invite people to your workspace" subtitle="They'll get an email to set their password and join" />
              <Card>
                <FormRow label="Email address" required>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={e => setInviteForm({...inviteForm, email: e.target.value})}
                    placeholder="colleague@yourcompany.com"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </FormRow>
                <FormRow label="Role">
                  <select
                    value={inviteForm.role}
                    onChange={e => setInviteForm({...inviteForm, role: e.target.value})}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option>Admin</option>
                    <option>Project Manager</option>
                    <option>Scheduler</option>
                    <option>Viewer</option>
                  </select>
                  <div className="text-[10px] text-slate-400 mt-1">
                    <strong>Admin</strong> = full access · <strong>PM</strong> = manage assigned projects · <strong>Scheduler</strong> = upload + analyze · <strong>Viewer</strong> = read-only
                  </div>
                </FormRow>
                <ComingSoonBanner text="Invite emails actually send when D3 (Supabase invitations + email trigger) ships." />
                <button disabled className="w-full bg-blue-600 disabled:bg-slate-300 text-white text-sm font-semibold py-2.5 rounded-lg cursor-not-allowed">
                  Send invitation
                </button>
              </Card>

              {DEMO_PENDING_INVITES.length > 0 && (
                <>
                  <SectionHeader title="Pending invitations" subtitle={`${DEMO_PENDING_INVITES.length} waiting for acceptance`} />
                  <Card noPadding>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Email</th>
                          <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Role</th>
                          <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Invited</th>
                          <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DEMO_PENDING_INVITES.map(inv => (
                          <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-700 text-xs">{inv.email}</td>
                            <td className="px-4 py-3">
                              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600">{inv.role}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{inv.invitedAt}</td>
                            <td className="px-4 py-3 text-right">
                              <button disabled className="text-slate-400 cursor-not-allowed text-xs">Resend</button>
                              <span className="text-slate-300 mx-1.5">·</span>
                              <button disabled className="text-slate-400 cursor-not-allowed text-xs">Cancel</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* ============ NOTIFICATIONS ============ */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <SectionHeader title="Email notifications" subtitle="What you want to hear about, and how often" />
              <Card>
                <ToggleRow
                  label="Schedule alerts"
                  desc="Get an email when a project's condition changes (Stable → Attention → Recovery)"
                  checked={notifications.scheduleAlerts}
                  onChange={v => setNotifications({...notifications, scheduleAlerts: v})}
                />
                <ToggleRow
                  label="Weekly digest"
                  desc="A Monday morning summary of all active projects and KPIs"
                  checked={notifications.weeklyDigest}
                  onChange={v => setNotifications({...notifications, weeklyDigest: v})}
                />
                <ToggleRow
                  label="RFI updates"
                  desc="When a teammate adds, edits, or evaluates an RFI"
                  checked={notifications.rfiUpdates}
                  onChange={v => setNotifications({...notifications, rfiUpdates: v})}
                />
                <ToggleRow
                  label="Team activity"
                  desc="When new versions are uploaded by your teammates"
                  checked={notifications.teamActivity}
                  onChange={v => setNotifications({...notifications, teamActivity: v})}
                />
                <ComingSoonBanner text="Notification preferences persist when D3 ships." />
                <SaveButton disabled />
              </Card>
            </div>
          )}

          {/* ============ BILLING ============ */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <SectionHeader title="Plan" subtitle="Your current ControlLens subscription" />
              <Card>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-lg font-bold text-slate-900">Pro Trial</div>
                    <div className="text-xs text-slate-500 mt-1">Trial ends in 14 days · Then $49/user/month</div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">Trial</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 mb-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Users</div>
                      <div className="text-base font-bold text-slate-900 mt-0.5">4</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Active Projects</div>
                      <div className="text-base font-bold text-slate-900 mt-0.5">12</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Storage</div>
                      <div className="text-base font-bold text-slate-900 mt-0.5">2.4 GB</div>
                    </div>
                  </div>
                </div>
                <ComingSoonBanner text="Stripe checkout, invoices, and plan changes wire up later." />
                <div className="flex gap-2">
                  <button disabled className="flex-1 bg-blue-600 disabled:bg-slate-300 text-white text-sm font-semibold py-2.5 rounded-lg cursor-not-allowed">
                    Upgrade to Pro
                  </button>
                  <button disabled className="flex-1 border border-slate-300 text-slate-600 disabled:opacity-50 text-sm font-semibold py-2.5 rounded-lg cursor-not-allowed">
                    Manage subscription
                  </button>
                </div>
              </Card>

              <SectionHeader title="Invoices" subtitle="Download past invoices for accounting" />
              <Card>
                <div className="text-center text-xs text-slate-400 py-6 italic">
                  No invoices yet — you're on a trial.
                </div>
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Reusable bits — kept local since this is the only file that uses them.
// Extract to /components if other pages need the same look.
// ============================================================================

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
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

function FormRow({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="text-[10px] text-slate-400 font-normal ml-2">· {hint}</span>}
      </label>
      {children}
    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 pr-4">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ' +
          (checked ? 'bg-blue-600' : 'bg-slate-300')
        }
      >
        <span
          className={
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform ' +
            (checked ? 'translate-x-6' : 'translate-x-1')
          }
        />
      </button>
    </div>
  )
}

function SaveButton({ disabled, label }: { disabled?: boolean; label?: string }) {
  return (
    <button
      disabled={disabled}
      className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-semibold px-5 py-2 rounded-lg disabled:cursor-not-allowed transition-colors"
    >
      {label || 'Save changes'}
    </button>
  )
}

function ComingSoonBanner({ text }: { text: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 flex items-start gap-2">
      <span className="text-amber-600 text-sm flex-shrink-0">ℹ️</span>
      <div className="text-[11px] text-amber-900 leading-relaxed">{text}</div>
    </div>
  )
}
