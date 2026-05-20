'use client'
import { useState, useEffect } from 'react'
import { loadProjects, getLatestVersion, Project } from '@/lib/projectStore'

// =============================================================================
// Settings page — placeholder UI.
// Pages: Profile, Team & Access, Projects (status management).
// All forms are read-only / non-functional for the demo. Real save/invite/status
// logic ships when D3 (Supabase) is wired up.
// =============================================================================

type Tab = 'profile' | 'team' | 'projects'

// Hardcoded team members for the Team & Access placeholder.
const DEMO_MEMBERS = [
  { name: 'Mike Anderson', email: 'mike@nobelpcs.com', role: 'Admin', initials: 'MA', color: '#2563eb', joined: 'Joined Jan 2026', isYou: true },
  { name: 'Bob Carter', email: 'bob@nobelpcs.com', role: 'PM', initials: 'BC', color: '#16a34a', joined: 'Joined Feb 2026', isYou: false },
  { name: 'Alice Reyes', email: 'alice@nobelpcs.com', role: 'PM', initials: 'AR', color: '#dc2626', joined: 'Joined Mar 2026', isYou: false },
  { name: 'Sarah Chen', email: 'sarah@nobelpcs.com', role: 'Viewer', initials: 'SC', color: '#7c3aed', joined: 'Joined Apr 2026', isYou: false },
]
const DEMO_PENDING = [
  { email: 'john.smith@example.com', role: 'PM', daysAgo: 2, expiresInDays: 5 },
]

// 6-phase project lifecycle status. Order: Pre-Con → Design → Procurement → Construction → Closeout → Final Complete.
const STATUS_OPTIONS = [
  { key: 'pre-construction', label: 'Pre-Construction', icon: '📋', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  { key: 'design', label: 'Design', icon: '📐', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { key: 'procurement', label: 'Procurement', icon: '🚚', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  { key: 'construction', label: 'Construction', icon: '🏗', cls: 'bg-green-100 text-green-700 border-green-200' },
  { key: 'closeout', label: 'Closeout', icon: '✓', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'final', label: 'Final Complete', icon: '✓', cls: 'bg-slate-800 text-white border-slate-700' },
]

// Deterministic status per project based on name hash, so the demo looks varied.
function placeholderStatus(projectName: string) {
  let hash = 0
  for (let i = 0; i < projectName.length; i++) hash = ((hash << 5) - hash + projectName.charCodeAt(i)) | 0
  const idx = Math.abs(hash) % STATUS_OPTIONS.length
  // Skip Final Complete for active projects (those would be in Archive)
  return STATUS_OPTIONS[idx === 5 ? 3 : idx]
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile')
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    setProjects(loadProjects())
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-3 flex-shrink-0">
        <span className="text-xl">⚙</span>
        <span className="font-bold text-slate-900 text-base">Settings</span>
        <span className="text-slate-400 text-sm">· Nobel Project Control Services, LLC</span>
      </div>

      {/* Tabs */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 flex flex-shrink-0">
        <TabBtn label="Profile" active={tab === 'profile'} onClick={() => setTab('profile')} />
        <TabBtn label="Team & Access" active={tab === 'team'} onClick={() => setTab('team')} />
        <TabBtn label="Projects" active={tab === 'projects'} onClick={() => setTab('projects')} />
        <TabBtn label="Billing" disabled />
        <TabBtn label="API Keys" disabled />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'team' && <TeamTab />}
          {tab === 'projects' && <ProjectsTab projects={projects} />}
        </div>
      </div>
    </div>
  )
}

// ---------------- Tab button ----------------
function TabBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        'px-4 py-3 text-sm font-medium border-b-2 transition-colors ' +
        (disabled
          ? 'text-slate-300 cursor-not-allowed border-transparent'
          : active
            ? 'text-blue-600 border-blue-600 bg-white font-semibold'
            : 'text-slate-600 border-transparent hover:text-slate-900')
      }
    >
      {label}
      {disabled && <span className="ml-1 text-[10px] text-slate-300">(soon)</span>}
    </button>
  )
}

// ---------------- Profile tab ----------------
function ProfileTab() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-base font-bold text-slate-900 mb-1">Your Profile</h3>
      <p className="text-xs text-slate-500 mb-5">Personal information visible to your team.</p>

      {/* Avatar block */}
      <div className="flex items-center gap-5 pb-5 mb-5 border-b border-slate-100">
        <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          MA
        </div>
        <div className="flex-1">
          <div className="text-lg font-bold text-slate-900">Mike Anderson</div>
          <div className="text-xs text-slate-500 mt-0.5">mike@nobelpcs.com</div>
        </div>
        <button className="text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-md text-xs font-semibold">
          Change Photo
        </button>
      </div>

      {/* Form fields */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <Field label="First Name" value="Mike" />
        <Field label="Last Name" value="Anderson" />
        <Field label="Email" value="mike@nobelpcs.com" hint="Used for sign in" />
        <Field label="Phone" value="(555) 123-4567" hint="Optional" />
        <Field label="Company" value="Nobel Project Control Services, LLC" readOnly hint="Set by admin" />
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Role</label>
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">Admin</span>
            <span className="text-xs text-slate-500">Read-only — set by company admin</span>
          </div>
        </div>
        <Field label="Department / Division" value="Schedule Controls" hint="e.g. Estimating, PM, Field Ops" />
        <Field label="Job Title" value="Senior Schedule Analyst" hint="Optional" />
      </div>

      {/* Password section */}
      <div className="border-t border-slate-100 pt-5 mb-5">
        <h4 className="text-sm font-bold text-slate-900 mb-3">Change Password</h4>
        <div className="grid grid-cols-2 gap-4 max-w-2xl">
          <Field label="Current Password" type="password" value="" placeholder="••••••••" />
          <div></div>
          <Field label="New Password" type="password" value="" placeholder="••••••••" />
          <Field label="Confirm Password" type="password" value="" placeholder="••••••••" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
        <button className="px-4 py-2 text-slate-600 text-sm font-semibold border border-slate-200 rounded-md hover:bg-slate-50">
          Cancel
        </button>
        <button className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md">
          Save Changes
        </button>
      </div>

      <div className="text-[10px] text-slate-400 mt-3 text-center">
        Form is visual-only in this preview. Save will be wired up when team auth ships.
      </div>
    </div>
  )
}

function Field({ label, value, hint, type = 'text', readOnly, placeholder }: { label: string; value: string; hint?: string; type?: string; readOnly?: boolean; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 mb-1.5 block">{label}</label>
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

// ---------------- Team & Access tab ----------------
function TeamTab() {
  return (
    <div className="space-y-5">
      {/* Members table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-base font-bold text-slate-900">Team Members</h3>
          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{DEMO_MEMBERS.length}</span>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          {DEMO_MEMBERS.map((m, i) => (
            <div key={m.email} className={'flex items-center gap-3 px-4 py-3 ' + (i < DEMO_MEMBERS.length - 1 ? 'border-b border-slate-100' : '')}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: m.color }}>
                {m.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  {m.name}
                  {m.isYou && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold">You</span>}
                </div>
                <div className="text-[11px] text-slate-500">{m.email} · {m.joined}</div>
              </div>
              <RolePill role={m.role} />
              <button className="text-slate-400 hover:text-slate-700 text-base px-1">⋮</button>
            </div>
          ))}
        </div>
      </div>

      {/* Invite form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-base font-bold text-slate-900 mb-3">Invite a New Member</h3>
        <div className="flex gap-2 items-center">
          <input
            placeholder="email@example.com"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
          />
          <select className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white">
            <option>PM</option>
            <option>Admin</option>
            <option>Viewer</option>
          </select>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-semibold">
            Send Invite
          </button>
        </div>
        <div className="text-[10px] text-slate-400 mt-2">
          Invite emails will be sent when team auth ships.
        </div>
      </div>

      {/* Pending invitations */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-base font-bold text-slate-900">Pending Invitations</h3>
          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{DEMO_PENDING.length}</span>
        </div>
        {DEMO_PENDING.map(p => (
          <div key={p.email} className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-base">✉</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-900">{p.email}</div>
              <div className="text-[11px] text-amber-700">Sent {p.daysAgo} days ago · Expires in {p.expiresInDays} days · Role: {p.role}</div>
            </div>
            <button className="border border-blue-300 text-blue-600 hover:bg-blue-50 text-xs font-semibold px-3 py-1.5 rounded-md">Resend</button>
            <button className="text-slate-400 hover:text-slate-700 text-base">×</button>
          </div>
        ))}
      </div>

      {/* Access Policy */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="text-base font-bold text-slate-900 mb-3">Access Policy</h3>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <PolicyRow icon="👑" role="Admin"
            desc="Full control. Can manage members, billing, all projects, and settings. Can grant/revoke access. Can delete projects." />
          <PolicyRow icon="📊" role="PM (Project Manager)"
            desc="Can create new projects. Has full access to projects they create or have been added to. Cannot see other PMs' projects unless shared. Cannot modify team settings." />
          <PolicyRow icon="👁" role="Viewer"
            desc="Read-only access to projects they've been explicitly shared on. Can view dashboards, analyses, and reports. Cannot upload new schedules or edit anything." />
        </div>
      </div>
    </div>
  )
}

function RolePill({ role }: { role: string }) {
  const cls = role === 'Admin' ? 'bg-blue-100 text-blue-700' :
              role === 'PM' ? 'bg-green-100 text-green-700' :
              'bg-slate-100 text-slate-600'
  return <span className={'px-2.5 py-0.5 rounded-full text-[11px] font-bold ' + cls}>{role}</span>
}

function PolicyRow({ icon, role, desc }: { icon: string; role: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 py-1 border-b border-slate-200 last:border-0 last:pb-0">
      <div className="text-base flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-bold text-slate-900 mb-0.5">{role}</div>
        <div className="text-xs text-slate-600 leading-relaxed">{desc}</div>
      </div>
    </div>
  )
}

// ---------------- Projects tab ----------------
function ProjectsTab({ projects }: { projects: Project[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-base font-bold text-slate-900 mb-1">All Active Projects</h3>
      <p className="text-xs text-slate-500 mb-4">
        Change status to track project lifecycle. Setting to <strong>Final Complete</strong> automatically moves the project to Archive.
      </p>

      {projects.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          No projects yet. Upload a schedule to create your first project.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <div className="col-span-4">Project</div>
            <div className="col-span-3">Contract #</div>
            <div className="col-span-3">Status</div>
            <div className="col-span-1 text-center">Versions</div>
            <div className="col-span-1 text-center">Actions</div>
          </div>

          {/* Rows */}
          {projects.map((p, i) => {
            const status = placeholderStatus(p.name)
            const isLast = i === projects.length - 1
            return (
              <div key={p.id} className={'grid grid-cols-12 gap-3 px-4 py-3 items-center ' + (!isLast ? 'border-b border-slate-100' : '') + ' hover:bg-slate-50'}>
                <div className="col-span-4 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-400">
                    Updated {new Date(p.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div className="col-span-3 text-xs text-slate-600 font-mono truncate">
                  {p.projectId || <span className="text-slate-300 italic">no contract #</span>}
                </div>
                <div className="col-span-3">
                  <span className={'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer ' + status.cls}
                    title="Status changes coming soon">
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
  )
}
