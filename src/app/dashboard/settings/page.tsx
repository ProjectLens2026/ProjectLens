'use client'
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { loadProjects, Project } from '@/lib/projectStore'

// =============================================================================
// Settings page — v2 redesign.
// Hero workspace card + sectioned tabs (Profile, Team & Access, Projects).
// Visual polish targeting demo quality. All save/invite/status actions are
// placeholders for now; real logic ships when D3 (Supabase) is wired up.
// =============================================================================

type Tab = 'profile' | 'team' | 'projects'

// Hardcoded team members for the Team & Access placeholder.
const DEMO_MEMBERS = [
  { name: 'Mike Anderson', email: 'mike@nobelpcs.com', role: 'Admin', initials: 'MA', color: '#2563eb', joined: 'Jan 2026', lastActive: 'Active now', isYou: true, dept: 'Schedule Controls' },
  { name: 'Bob Carter', email: 'bob@nobelpcs.com', role: 'PM', initials: 'BC', color: '#16a34a', joined: 'Feb 2026', lastActive: '2h ago', isYou: false, dept: 'Project Management' },
  { name: 'Alice Reyes', email: 'alice@nobelpcs.com', role: 'PM', initials: 'AR', color: '#dc2626', joined: 'Mar 2026', lastActive: 'Yesterday', isYou: false, dept: 'Estimating' },
  { name: 'Sarah Chen', email: 'sarah@nobelpcs.com', role: 'Viewer', initials: 'SC', color: '#7c3aed', joined: 'Apr 2026', lastActive: '3 days ago', isYou: false, dept: 'Field Operations' },
]
const DEMO_PENDING = [
  { email: 'john.smith@example.com', role: 'PM', daysAgo: 2, expiresInDays: 5 },
  { email: 'lisa.park@navfac.gov', role: 'Viewer', daysAgo: 4, expiresInDays: 3 },
]

// 6-phase project lifecycle status. Order: Pre-Con → Design → Procurement → Construction → Closeout → Final Complete.
const STATUS_OPTIONS = [
  { key: 'pre-construction', label: 'Pre-Construction', icon: '📋', pillCls: 'bg-slate-100 text-slate-700 border-slate-200', dotCls: 'bg-slate-400' },
  { key: 'design',           label: 'Design',           icon: '📐', pillCls: 'bg-blue-100 text-blue-700 border-blue-200', dotCls: 'bg-blue-500' },
  { key: 'procurement',      label: 'Procurement',      icon: '🚚', pillCls: 'bg-purple-100 text-purple-700 border-purple-200', dotCls: 'bg-purple-500' },
  { key: 'construction',     label: 'Construction',     icon: '🏗', pillCls: 'bg-green-100 text-green-700 border-green-200', dotCls: 'bg-green-500' },
  { key: 'closeout',         label: 'Closeout',         icon: '✓', pillCls: 'bg-amber-100 text-amber-700 border-amber-200', dotCls: 'bg-amber-500' },
  { key: 'final',            label: 'Final Complete',   icon: '🏁', pillCls: 'bg-slate-800 text-white border-slate-700', dotCls: 'bg-slate-800' },
]

// Deterministic status per project based on name hash, so the demo looks varied.
function placeholderStatus(projectName: string) {
  let hash = 0
  for (let i = 0; i < projectName.length; i++) hash = ((hash << 5) - hash + projectName.charCodeAt(i)) | 0
  // Skip Final Complete (idx 5) for active projects — those would be in Archive
  const idx = Math.abs(hash) % 5
  return STATUS_OPTIONS[idx]
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile')
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    setProjects(loadProjects())
  }, [])

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* ============ TOP BAR ============ */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-3 flex-shrink-0">
        <span className="font-bold text-slate-900 text-base">Settings</span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500 text-sm">Manage your workspace, team, and projects</span>
      </div>

      {/* ============ WORKSPACE HERO CARD ============ */}
      <div className="bg-white border-b border-slate-200 px-6 py-6 flex-shrink-0">
        <div className="max-w-5xl mx-auto flex items-center gap-5">
          {/* Workspace logo */}
          <div className="w-20 h-20 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center flex-shrink-0">
            <svg width="44" height="32" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
              <rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/>
              <rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/>
              <rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/>
              <rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/>
            </svg>
          </div>

          {/* Workspace info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">Pro Plan</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Workspace</span>
            </div>
            <div className="text-xl font-bold text-slate-900 truncate">Nobel Project Control Services, LLC</div>
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span><strong className="text-slate-700">{DEMO_MEMBERS.length}</strong> members</span>
              </div>
              <span className="text-slate-200">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                <span><strong className="text-slate-700">{projects.length}</strong> active projects</span>
              </div>
              <span className="text-slate-200">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                <span><strong className="text-slate-700">3</strong> archived</span>
              </div>
              <span className="text-slate-200">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span><strong className="text-slate-700">{DEMO_PENDING.length}</strong> pending invites</span>
              </div>
            </div>
          </div>

          {/* CTA */}
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 flex-shrink-0">
            <span>+</span>
            <span>Invite Team</span>
          </button>
        </div>
      </div>

      {/* ============ TABS ============ */}
      <div className="bg-white border-b border-slate-200 px-6 flex flex-shrink-0 overflow-x-auto">
        <TabBtn label="Profile" icon="👤" active={tab === 'profile'} onClick={() => setTab('profile')} />
        <TabBtn label="Team & Access" icon="👥" active={tab === 'team'} onClick={() => setTab('team')} />
        <TabBtn label="Projects" icon="📁" active={tab === 'projects'} onClick={() => setTab('projects')} />
        <TabBtn label="Billing" icon="💳" disabled />
        <TabBtn label="API Keys" icon="🔑" disabled />
      </div>

      {/* ============ TAB CONTENT ============ */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-5xl mx-auto">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'team' && <TeamTab />}
          {tab === 'projects' && <ProjectsTab projects={projects} />}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Tab button
// ============================================================================
function TabBtn({ label, icon, active, disabled, onClick }: { label: string; icon: string; active?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        'px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ' +
        (disabled
          ? 'text-slate-300 cursor-not-allowed border-transparent'
          : active
            ? 'text-blue-600 border-blue-600 font-semibold'
            : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-200')
      }
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
      {disabled && <span className="text-[9px] text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded ml-1">soon</span>}
    </button>
  )
}

// ============================================================================
// PROFILE TAB
// ============================================================================
function ProfileTab() {
  return (
    <div className="space-y-5">
      {/* Profile picture section */}
      <SectionCard
        title="Profile Picture"
        subtitle="This photo will be visible to your team across ControlLens"
      >
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 shadow-md">
            MA
          </div>
          <div className="flex-1">
            <div className="text-base font-bold text-slate-900">Mike Anderson</div>
            <div className="text-xs text-slate-500 mt-0.5">mike@nobelpcs.com · Admin</div>
            <div className="flex gap-2 mt-3">
              <button className="text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-md text-xs font-semibold">
                Upload New
              </button>
              <button className="text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-md text-xs font-semibold">
                Remove
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Personal info */}
      <SectionCard
        title="Personal Information"
        subtitle="Your name, role, and where you fit in the company"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name" value="Mike" required />
          <Field label="Last Name" value="Anderson" required />
          <Field label="Job Title" value="Senior Schedule Analyst" hint="Visible to teammates" />
          <Field label="Department / Division" value="Schedule Controls" hint="e.g. Estimating, PM, Field Ops" />

          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Company</label>
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-slate-600 truncate">
              Nobel Project Control Services, LLC
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Read-only · workspace name</div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Role</label>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">Admin</span>
              <span className="text-xs text-slate-500">Full access</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Set by company admin · request a change in Team & Access</div>
          </div>
        </div>
      </SectionCard>

      {/* Contact */}
      <SectionCard
        title="Contact Information"
        subtitle="How teammates and the system reach you"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Email Address" value="mike@nobelpcs.com" hint="Used for sign in and notifications" required />
          <Field label="Phone" value="(555) 123-4567" hint="Optional · for urgent project alerts" />
          <Field label="Time Zone" value="(GMT-05:00) Eastern Time (US & Canada)" type="select" hint="Used for activity timestamps and reports" />
          <Field label="Preferred Date Format" value="MM/DD/YYYY (US Standard)" type="select" />
        </div>
      </SectionCard>

      {/* Security */}
      <SectionCard
        title="Security"
        subtitle="Keep your account secure"
        accent="amber"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Current Password" type="password" value="" placeholder="Enter current password" />
          <div></div>
          <Field label="New Password" type="password" value="" placeholder="At least 12 characters" />
          <Field label="Confirm New Password" type="password" value="" placeholder="Re-enter new password" />
        </div>
        <div className="mt-3 flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-md">
          <div>
            <div className="text-sm font-semibold text-slate-900">Two-Factor Authentication</div>
            <div className="text-xs text-slate-500 mt-0.5">Add an extra layer of security to your account</div>
          </div>
          <button className="border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-md text-xs font-semibold">
            Enable 2FA
          </button>
        </div>
      </SectionCard>

      {/* Notifications */}
      <SectionCard
        title="Notification Preferences"
        subtitle="What ControlLens should notify you about"
      >
        <NotifRow label="Schedule analysis complete" desc="When a new XER finishes processing" defaultOn />
        <NotifRow label="Risks detected" desc="High-priority risks found in a schedule you own" defaultOn />
        <NotifRow label="New RFI added" desc="When someone adds an RFI to your project" defaultOn />
        <NotifRow label="Team activity" desc="Daily digest of what your team did" defaultOn={false} />
        <NotifRow label="Product updates" desc="New features and improvements from ControlLens" defaultOn />
      </SectionCard>

      {/* Save / Cancel */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          All changes are visual-only in this preview. Save will be wired up when team auth ships.
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 text-slate-600 text-sm font-semibold border border-slate-200 rounded-md hover:bg-slate-50">
            Cancel
          </button>
          <button className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionCard({ title, subtitle, children, accent }: { title: string; subtitle?: string; children: ReactNode; accent?: 'amber' | 'red' | 'blue' }) {
  const accentBorder = accent === 'amber' ? 'border-l-amber-500' : accent === 'red' ? 'border-l-red-500' : accent === 'blue' ? 'border-l-blue-500' : 'border-l-slate-200'
  const accentClass = accent ? `border-l-4 ${accentBorder}` : ''
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-5 ${accentClass}`}>
      <div className="mb-4">
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value, hint, type = 'text', readOnly, placeholder, required }: { label: string; value: string; hint?: string; type?: string; readOnly?: boolean; placeholder?: string; required?: boolean }) {
  if (type === 'select') {
    return (
      <div>
        <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <select
          defaultValue={value}
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option>{value}</option>
        </select>
        {hint && <div className="text-[10px] text-slate-400 mt-1">{hint}</div>}
      </div>
    )
  }
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        readOnly={readOnly}
        className={
          'w-full px-3 py-2 border rounded-md text-sm ' +
          (readOnly ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-300 text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100')
        }
      />
      {hint && <div className="text-[10px] text-slate-400 mt-1">{hint}</div>}
    </div>
  )
}

function NotifRow({ label, desc, defaultOn }: { label: string; desc: string; defaultOn: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
      <button
        className={`relative w-10 h-5 rounded-full transition-colors ${defaultOn ? 'bg-blue-600' : 'bg-slate-200'}`}
        title="Toggle (placeholder)"
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${defaultOn ? 'left-5' : 'left-0.5'}`}></span>
      </button>
    </div>
  )
}

// ============================================================================
// TEAM & ACCESS TAB
// ============================================================================
function TeamTab() {
  return (
    <div className="space-y-5">
      {/* Members grid */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              Team Members
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{DEMO_MEMBERS.length}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">People who have access to this workspace</p>
          </div>
          <button className="text-blue-600 border border-blue-200 hover:bg-blue-50 text-xs font-semibold px-3 py-1.5 rounded-md">
            + Add Member
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {DEMO_MEMBERS.map(m => (
            <div key={m.email} className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 hover:shadow-sm transition-all flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ background: m.color }}
              >
                {m.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-900 truncate">{m.name}</span>
                  {m.isYou && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[9px] font-bold">YOU</span>}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{m.email}</div>
                <div className="flex items-center gap-2 mt-1">
                  <RolePill role={m.role} />
                  <span className="text-[10px] text-slate-400">·</span>
                  <span className="text-[10px] text-slate-400 truncate">{m.dept}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{m.lastActive} · Joined {m.joined}</div>
              </div>
              <button className="text-slate-400 hover:text-slate-700 text-base px-1 self-start">⋮</button>
            </div>
          ))}
        </div>
      </div>

      {/* Invite form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 border-l-4 border-l-blue-500">
        <h3 className="text-base font-bold text-slate-900 mb-1">Invite a New Member</h3>
        <p className="text-xs text-slate-500 mb-4">They'll get an email with instructions to join your workspace.</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Email Address</label>
            <input
              placeholder="colleague@nobelpcs.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Role</label>
            <select className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:border-blue-500">
              <option>PM</option>
              <option>Admin</option>
              <option>Viewer</option>
            </select>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-semibold whitespace-nowrap">
            Send Invite
          </button>
        </div>
      </div>

      {/* Pending invitations */}
      {DEMO_PENDING.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-base font-bold text-slate-900">Pending Invitations</h3>
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{DEMO_PENDING.length}</span>
          </div>
          <div className="space-y-2">
            {DEMO_PENDING.map(p => (
              <div key={p.email} className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-lg">✉</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{p.email}</div>
                  <div className="text-[11px] text-amber-700 mt-0.5">Sent {p.daysAgo} days ago · Expires in {p.expiresInDays} days · Role: {p.role}</div>
                </div>
                <button className="border border-blue-300 text-blue-600 hover:bg-blue-50 text-xs font-semibold px-3 py-1.5 rounded-md whitespace-nowrap">Resend</button>
                <button className="text-slate-400 hover:text-red-500 text-base">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Access Policy as 3 role cards */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-base font-bold text-slate-900 mb-1">Access Policy</h3>
        <p className="text-xs text-slate-500 mb-4">How permissions work in your workspace</p>
        <div className="grid grid-cols-3 gap-3">
          <RoleCard
            icon="👑"
            role="Admin"
            color="blue"
            perms={[
              'Manage all members',
              'Full access to all projects',
              'Billing & settings',
              'Delete or archive any project',
            ]}
          />
          <RoleCard
            icon="📊"
            role="PM (Project Manager)"
            color="green"
            perms={[
              'Create new projects',
              'Full access to own projects',
              'Can share projects with team',
              'Cannot modify workspace settings',
            ]}
          />
          <RoleCard
            icon="👁"
            role="Viewer"
            color="slate"
            perms={[
              'Read-only project access',
              'View dashboards & analyses',
              'Cannot upload schedules',
              'Cannot edit anything',
            ]}
          />
        </div>
      </div>
    </div>
  )
}

function RolePill({ role }: { role: string }) {
  const cls = role === 'Admin' ? 'bg-blue-100 text-blue-700' :
              role === 'PM' ? 'bg-green-100 text-green-700' :
              'bg-slate-100 text-slate-600'
  return <span className={'px-2 py-0.5 rounded-full text-[10px] font-bold ' + cls}>{role}</span>
}

function RoleCard({ icon, role, color, perms }: { icon: string; role: string; color: string; perms: string[] }) {
  const cardCls = color === 'blue' ? 'border-blue-200 bg-blue-50/50' :
                  color === 'green' ? 'border-green-200 bg-green-50/50' :
                  'border-slate-200 bg-slate-50/50'
  return (
    <div className={`border ${cardCls} rounded-lg p-4`}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm font-bold text-slate-900 mb-2">{role}</div>
      <ul className="space-y-1">
        {perms.map((p, i) => (
          <li key={i} className="text-[11px] text-slate-600 flex items-start gap-1.5">
            <span className="text-green-600 flex-shrink-0">✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ============================================================================
// PROJECTS TAB
// ============================================================================
function ProjectsTab({ projects }: { projects: Project[] }) {
  return (
    <div className="space-y-5">

      {/* Lifecycle visualization */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-base font-bold text-slate-900 mb-1">Project Lifecycle</h3>
        <p className="text-xs text-slate-500 mb-4">Projects move through these 6 phases. Setting status to <strong>Final Complete</strong> automatically archives the project.</p>
        <div className="flex items-center gap-2 overflow-x-auto">
          {STATUS_OPTIONS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 flex-shrink-0">
              <div className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border ${s.pillCls}`}>
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </div>
              {i < STATUS_OPTIONS.length - 1 && (
                <span className="text-slate-300 text-xl">→</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-2">
          <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold">FINAL COMPLETE</span>
          <span>→ project moves to 📦 Archive automatically</span>
        </div>
      </div>

      {/* Active projects table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              Active Projects
              <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{projects.length}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Change a project's status to move it through the lifecycle</p>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="text-4xl mb-2">📁</div>
            <div className="text-sm font-semibold text-slate-600">No active projects yet</div>
            <div className="text-xs mt-1">Upload a schedule to create your first project</div>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <div className="col-span-4">Project</div>
              <div className="col-span-3">Contract #</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-1 text-center">Versions</div>
              <div className="col-span-1 text-center"></div>
            </div>

            {projects.map((p, i) => {
              const status = placeholderStatus(p.name)
              const isLast = i === projects.length - 1
              return (
                <div key={p.id} className={'grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-slate-50 ' + (!isLast ? 'border-b border-slate-100' : '')}>
                  <div className="col-span-4 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400">
                      Updated {new Date(p.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {p.versions.length} version{p.versions.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="col-span-3 text-xs text-slate-600 font-mono truncate">
                    {p.projectId || <span className="text-slate-300 italic">no contract #</span>}
                  </div>
                  <div className="col-span-3">
                    <span className={'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer ' + status.pillCls}
                      title="Status changes coming next release">
                      <span>{status.icon}</span>
                      {status.label}
                      <span className="text-[8px] opacity-60">▾</span>
                    </span>
                  </div>
                  <div className="col-span-1 text-xs text-slate-600 text-center font-mono">{p.versions.length}</div>
                  <div className="col-span-1 text-center">
                    <button className="text-slate-400 hover:text-slate-700 text-base">⋮</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="text-[10px] text-slate-400 mt-3 text-center">
          Status workflow with auto-archive on "Final Complete" coming next release.
        </div>
      </div>
    </div>
  )
}
