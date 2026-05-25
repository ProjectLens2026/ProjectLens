'use client'
// =============================================================================
// Portfolio page — Day 10. Platform-owner only.
//
// Lets Jawid (and backup support@control-lens.com) see all customer
// organizations registered on ControlLens. Per-org stats: member counts by
// role, project counts, primary admin contact. Click a row to drill into
// the org's members + projects.
//
// This is NOT for customers. Customer Owners/Admins never see this page.
// Hidden from Sidebar unless email is in the platform whitelist.
//
// Access enforcement (3 layers):
//   1. Sidebar link hidden by perms.isPlatformOwner
//   2. Page redirects to /dashboard if not platform owner
//   3. SQL functions are SECURITY DEFINER and check email server-side
// =============================================================================
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePermissions } from '@/lib/usePermissions'
import {
  loadPortfolio, loadOrgMembersForPlatformOwner, loadOrgProjectsForPlatformOwner,
  PortfolioOrg, PortfolioMember, PortfolioProject,
} from '@/lib/supabase/db'

export default function PortfolioPage() {
  const router = useRouter()
  const perms = usePermissions()
  const [orgs, setOrgs] = useState<PortfolioOrg[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [drillMembers, setDrillMembers] = useState<PortfolioMember[]>([])
  const [drillProjects, setDrillProjects] = useState<PortfolioProject[]>([])
  const [drillLoading, setDrillLoading] = useState(false)

  useEffect(() => {
    if (perms.loading) return
    if (!perms.isPlatformOwner) {
      router.replace('/dashboard')
      return
    }
    setLoading(true)
    loadPortfolio().then(list => {
      setOrgs(list)
      setLoading(false)
    })
  }, [perms.loading, perms.isPlatformOwner, router])

  useEffect(() => {
    if (!selectedOrgId) {
      setDrillMembers([])
      setDrillProjects([])
      return
    }
    setDrillLoading(true)
    Promise.all([
      loadOrgMembersForPlatformOwner(selectedOrgId),
      loadOrgProjectsForPlatformOwner(selectedOrgId),
    ]).then(([m, p]) => {
      setDrillMembers(m)
      setDrillProjects(p)
      setDrillLoading(false)
    })
  }, [selectedOrgId])

  // Block render while we check perms (avoids flash of content for non-owners)
  if (perms.loading) {
    return <div className="flex items-center justify-center h-full text-sm text-slate-500">Loading...</div>
  }
  if (!perms.isPlatformOwner) {
    return null  // useEffect already redirected
  }

  const filtered = search.trim()
    ? orgs.filter(o =>
        o.org_name.toLowerCase().includes(search.toLowerCase()) ||
        (o.primary_admin_email || '').toLowerCase().includes(search.toLowerCase()))
    : orgs

  // Aggregate stats across all orgs
  const totalOrgs = orgs.length
  const totalUsers = orgs.reduce((sum, o) => sum + o.total_members, 0)
  const totalProjects = orgs.reduce((sum, o) => sum + o.project_count, 0)
  const totalActiveProjects = orgs.reduce((sum, o) => sum + o.active_project_count, 0)
  const personalOrgs = orgs.filter(o => o.account_type === 'personal').length

  const selectedOrg = orgs.find(o => o.org_id === selectedOrgId) || null

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">🌐 Platform Portfolio</span>
          <span className="text-slate-400 text-sm ml-2">· Cross-org view (ControlLens staff only)</span>
        </div>
        <div className="ml-auto">
          <input
            type="text"
            placeholder="Search company name or admin email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs w-72 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* Aggregate stats */}
          <div className="grid grid-cols-5 gap-3 mb-6">
            <StatCard label="Companies" value={totalOrgs} subtitle={`${totalOrgs - personalOrgs} active · ${personalOrgs} personal`} color="blue" />
            <StatCard label="Users" value={totalUsers} subtitle="across all orgs" color="emerald" />
            <StatCard label="Projects" value={totalProjects} subtitle={`${totalActiveProjects} active`} color="amber" />
            <StatCard label="Total Versions" value={orgs.reduce((s, o) => s + o.version_count, 0)} subtitle="all schedules" color="slate" />
            <StatCard label="Personal Orgs" value={personalOrgs} subtitle="auto-created workspaces" color="slate" subdued />
          </div>

          {loading ? (
            <div className="bg-white rounded-xl p-8 text-center text-sm text-slate-500">Loading portfolio...</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center">
              <div className="text-4xl mb-3">🏢</div>
              <div className="text-lg font-bold text-slate-700 mb-2">
                {orgs.length === 0 ? 'No companies registered yet' : 'No matches'}
              </div>
              <div className="text-sm text-slate-500">
                {orgs.length === 0
                  ? 'Customer organizations will appear here as they sign up.'
                  : 'Try a different search term.'}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Company</th>
                    <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-2.5">Primary Admin</th>
                    <th className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 py-2.5">Owners</th>
                    <th className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 py-2.5">Admins</th>
                    <th className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 py-2.5">PMs</th>
                    <th className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 py-2.5">Viewers</th>
                    <th className="text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 py-2.5">Projects</th>
                    <th className="text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 py-2.5">Created</th>
                    <th className="text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.org_id} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/30 cursor-pointer"
                      onClick={() => setSelectedOrgId(o.org_id === selectedOrgId ? null : o.org_id)}>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 text-sm">{o.org_name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            o.account_type === 'personal'
                              ? 'bg-slate-100 text-slate-500'
                              : o.account_type === 'enterprise'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-blue-100 text-blue-700'
                          }`}>{o.account_type || 'team'}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{o.org_id.slice(0, 8)}…</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {o.primary_admin_email ? (
                          <>
                            <div className="text-xs font-semibold text-slate-700">{o.primary_admin_name || '—'}</div>
                            <div className="text-[10px] text-slate-500">{o.primary_admin_email}</div>
                          </>
                        ) : (
                          <span className="text-slate-300 text-xs italic">No admin yet</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm font-bold text-blue-700">{o.owner_count}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm font-bold text-emerald-700">{o.admin_count}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm font-bold text-amber-700">{o.pm_count}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm font-bold text-slate-500">{o.viewer_count}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="text-sm font-bold text-slate-700">{o.project_count}</div>
                        {o.active_project_count !== o.project_count && (
                          <div className="text-[9px] text-slate-400">{o.active_project_count} active</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[10px] text-slate-500 italic whitespace-nowrap">
                        {new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-[10px] text-blue-600 font-bold">{selectedOrgId === o.org_id ? '▾' : '▸'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Drill-down panel */}
          {selectedOrg && (
            <div className="mt-4 bg-white border border-blue-300 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="font-bold text-slate-900 text-base">{selectedOrg.org_name}</div>
                  <div className="text-xs text-slate-500">{selectedOrg.total_members} members · {selectedOrg.project_count} projects · {selectedOrg.version_count} versions uploaded</div>
                </div>
                <button onClick={() => setSelectedOrgId(null)}
                  className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
              </div>

              {drillLoading ? (
                <div className="text-sm text-slate-500 py-4 text-center">Loading details...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Members */}
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Members ({drillMembers.length})</div>
                    <div className="bg-slate-50 rounded-lg overflow-hidden">
                      {drillMembers.length === 0 ? (
                        <div className="text-xs text-slate-400 italic p-3">No members in this org.</div>
                      ) : (
                        drillMembers.map(m => (
                          <div key={m.user_id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 last:border-0 text-xs">
                            <span className={
                              'text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ' +
                              (m.role === 'owner' ? 'bg-blue-100 text-blue-700' :
                               m.role === 'admin' ? 'bg-emerald-100 text-emerald-700' :
                               m.role === 'pm' ? 'bg-amber-100 text-amber-700' :
                               'bg-slate-200 text-slate-600')
                            }>{m.role}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-slate-800 truncate">{m.name || m.email.split('@')[0]}</div>
                              <div className="text-[10px] text-slate-500 truncate">{m.email}</div>
                            </div>
                            <div className="text-[10px] text-slate-400 italic whitespace-nowrap">
                              {new Date(m.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Projects */}
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Projects ({drillProjects.length})</div>
                    <div className="bg-slate-50 rounded-lg overflow-hidden">
                      {drillProjects.length === 0 ? (
                        <div className="text-xs text-slate-400 italic p-3">No projects in this org yet.</div>
                      ) : (
                        drillProjects.map(p => (
                          <div key={p.project_id} className="px-3 py-2 border-b border-slate-200 last:border-0 text-xs">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-slate-800 flex-1 min-w-0 truncate">{p.name}</div>
                              <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">{p.status}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                              <span className="font-mono">{p.project_code}</span>
                              <span>·</span>
                              <span>{p.version_count} version{p.version_count === 1 ? '' : 's'}</span>
                              <span>·</span>
                              <span className="italic">{p.created_by_email}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer note */}
          <div className="mt-6 text-[10px] text-slate-400 text-center italic">
            Platform owner view — visible only to ControlLens staff. Customers cannot see this page.
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, subtitle, color, subdued }: {
  label: string
  value: number
  subtitle?: string
  color: 'blue' | 'emerald' | 'amber' | 'slate'
  subdued?: boolean
}) {
  const colorMap = {
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    slate: 'text-slate-700',
  }
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-3 ${subdued ? 'opacity-80' : ''}`}>
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums mt-0.5 ${colorMap[color]}`}>{value}</div>
      {subtitle && <div className="text-[10px] text-slate-400 mt-0.5">{subtitle}</div>}
    </div>
  )
}
