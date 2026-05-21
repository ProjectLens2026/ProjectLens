'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import {
  loadProjects, getLatestVersion,
  setActiveProjectId, setActiveVersionId,
  getProjectStatus,
  Project, ProjectStatus,
} from '@/lib/projectStore'

// =============================================================================
// Enterprise Dashboard — portfolio-level view across ALL projects in the workspace.
//
// Sections (top to bottom):
//   1. Header — workspace name + project count + filter pills
//   2. Portfolio KPI tiles (4): Active Projects, At-Risk, Total Days Behind, Avg % Complete
//   3. Health distribution bar — visual breakdown of portfolio health
//   4. Projects table — one row per project, sortable, with View link
//
// Route: /dashboard/enterprise
//
// Reads from each project's latest version's `analysis` object using the same
// field-name variants as the per-project Executive Dashboard, with safe fallbacks
// where data is missing.
// =============================================================================

type SortKey = 'health' | 'daysBehind' | 'workComplete' | 'name' | 'contractEnd'
type StatusFilter = 'all' | 'active' | 'onhold' | 'completed'

export default function EnterpriseDashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('health')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [])

  function refresh() {
    setProjects(loadProjects())
  }

  // Per-project derived data: health, dates, KPIs.
  // Only projects with Active / On Hold / Completed statuses appear here
  // (Archived and Deleted are excluded — they have their own pages).
  const rows = useMemo(() => buildRows(projects), [projects])

  // Filter by status (UI control)
  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows
    return rows.filter(r => {
      if (statusFilter === 'active') return r.status === 'Active'
      if (statusFilter === 'onhold') return r.status === 'On Hold'
      if (statusFilter === 'completed') return r.status === 'Completed'
      return true
    })
  }, [rows, statusFilter])

  // Sort
  const sortedRows = useMemo(() => sortRows(filteredRows, sortKey), [filteredRows, sortKey])

  // Portfolio-level KPIs
  const portfolioKPIs = useMemo(() => computePortfolioKPIs(rows), [rows])

  // Empty state
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
            <span className="text-3xl">📊</span>
          </div>
          <div className="text-lg font-bold text-slate-700 mb-2">No projects yet</div>
          <div className="text-sm text-slate-500 mb-4">
            Upload your first P6 XER to start your portfolio dashboard.
          </div>
          <Link href="/dashboard/upload" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
            Upload Schedule
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Enterprise Dashboard</span>
          <span className="text-slate-400 text-sm ml-2">· Portfolio Overview · {rows.length} project{rows.length !== 1 ? 's' : ''}</span>
        </div>
        <Link href="/dashboard/upload" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md">
          + New Project
        </Link>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-4">

        {/* Portfolio KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPITile
            label="Active Projects"
            value={String(portfolioKPIs.active)}
            sub={`${portfolioKPIs.onHold} on hold · ${portfolioKPIs.completed} completed`}
            valueColor="text-slate-900"
          />
          <KPITile
            label="At-Risk"
            value={String(portfolioKPIs.atRisk)}
            sub={portfolioKPIs.atRisk > 0 ? 'Need attention' : 'All healthy'}
            valueColor={portfolioKPIs.atRisk > 0 ? 'text-red-600' : 'text-emerald-600'}
          />
          <KPITile
            label="Total Days Behind"
            value={portfolioKPIs.totalDaysBehind > 0 ? `+${portfolioKPIs.totalDaysBehind}` : String(portfolioKPIs.totalDaysBehind)}
            sub="Cumulative across portfolio"
            valueColor={portfolioKPIs.totalDaysBehind > 0 ? 'text-red-600' : 'text-emerald-600'}
          />
          <KPITile
            label="Avg % Complete"
            value={`${portfolioKPIs.avgComplete.toFixed(0)}%`}
            sub={`${portfolioKPIs.totalActivities.toLocaleString()} activities tracked`}
            valueColor="text-slate-900"
          />
        </div>

        {/* Health Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-slate-800 mb-3">Portfolio Health Distribution</div>
          <HealthDistributionBar rows={rows} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
            <HealthLegend color="bg-emerald-500" label="Stable" count={portfolioKPIs.stable} />
            <HealthLegend color="bg-yellow-400" label="Monitor Closely" count={portfolioKPIs.monitor} />
            <HealthLegend color="bg-amber-500" label="Attention Needed" count={portfolioKPIs.attention} />
            <HealthLegend color="bg-red-500" label="Recovery Required" count={portfolioKPIs.recovery} />
          </div>
        </div>

        {/* Filter pills + sort */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1.5">
            <FilterPill label="All" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} count={rows.length}/>
            <FilterPill label="Active" active={statusFilter === 'active'} onClick={() => setStatusFilter('active')} count={portfolioKPIs.active}/>
            <FilterPill label="On Hold" active={statusFilter === 'onhold'} onClick={() => setStatusFilter('onhold')} count={portfolioKPIs.onHold}/>
            <FilterPill label="Completed" active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} count={portfolioKPIs.completed}/>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Sort by:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs"
            >
              <option value="health">Health (worst first)</option>
              <option value="daysBehind">Days Behind (most first)</option>
              <option value="workComplete">% Complete</option>
              <option value="name">Name (A–Z)</option>
              <option value="contractEnd">Contract End (soonest first)</option>
            </select>
          </div>
        </div>

        {/* Projects table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="text-left font-semibold py-3 pl-4 pr-2 w-6"></th>
                  <th className="text-left font-semibold py-3 pr-3">Project</th>
                  <th className="text-left font-semibold py-3 pr-3 hidden lg:table-cell">Contract #</th>
                  <th className="text-left font-semibold py-3 pr-3">Status</th>
                  <th className="text-left font-semibold py-3 pr-3 hidden md:table-cell">Start</th>
                  <th className="text-left font-semibold py-3 pr-3">Contract End</th>
                  <th className="text-left font-semibold py-3 pr-3 hidden md:table-cell">Projected End</th>
                  <th className="text-right font-semibold py-3 pr-3">Behind</th>
                  <th className="text-right font-semibold py-3 pr-3">% Comp.</th>
                  <th className="text-right font-semibold py-3 pr-3 hidden lg:table-cell">Risks</th>
                  <th className="text-right font-semibold py-3 pr-4 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <ProjectRow key={r.project.id} row={r}/>
                ))}
              </tbody>
            </table>
          </div>
          {sortedRows.length === 0 && (
            <div className="text-center py-12 text-sm text-slate-400 italic">No projects match the current filter.</div>
          )}
        </div>

      </div>
    </div>
  )
}

// =============================================================================
// Project row component
// =============================================================================
function ProjectRow({ row }: { row: ProjectRowData }) {
  const { project, status, condition, healthScore } = row

  function handleView() {
    setActiveProjectId(project.id)
    const latest = getLatestVersion(project)
    if (latest) setActiveVersionId(latest.id)
  }

  const conditionColor =
    condition === 'Recovery Required' ? 'bg-red-500' :
    condition === 'Attention Needed' ? 'bg-amber-500' :
    condition === 'Monitor Closely' ? 'bg-yellow-400' :
    condition === 'Stable' ? 'bg-emerald-500' :
    'bg-slate-400'

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      {/* Health dot */}
      <td className="py-3 pl-4 pr-2">
        <div className={clsx('w-2.5 h-2.5 rounded-full', conditionColor)} title={`${condition || 'Unknown'} · ${healthScore}/100`}/>
      </td>

      {/* Project name */}
      <td className="py-3 pr-3 min-w-[200px]">
        <Link href="/dashboard" onClick={handleView} className="text-slate-900 font-semibold hover:text-blue-600">
          {project.name}
        </Link>
        <div className="text-[10px] text-slate-500">{condition || '—'} · {healthScore}/100</div>
      </td>

      {/* Contract # */}
      <td className="py-3 pr-3 text-xs text-slate-500 font-mono hidden lg:table-cell">{project.projectId || '—'}</td>

      {/* Status */}
      <td className="py-3 pr-3"><StatusPill status={status}/></td>

      {/* Start */}
      <td className="py-3 pr-3 text-xs text-slate-600 hidden md:table-cell">{row.startDate}</td>

      {/* Contract End */}
      <td className="py-3 pr-3 text-xs">
        <span className={clsx(row.contractPast ? 'text-red-600 font-semibold' : 'text-slate-600')}>
          {row.contractEndDate}
        </span>
      </td>

      {/* Projected End */}
      <td className="py-3 pr-3 text-xs hidden md:table-cell">
        <span className={clsx(row.daysBehind > 0 ? 'text-amber-600 font-semibold' : 'text-slate-600')}>
          {row.projectedEndDate}
        </span>
      </td>

      {/* Days Behind */}
      <td className="py-3 pr-3 text-xs text-right">
        <span className={clsx(
          'font-semibold',
          row.daysBehind > 0 ? 'text-red-600' :
          row.daysBehind < 0 ? 'text-emerald-600' :
          'text-slate-600'
        )}>
          {row.daysBehind > 0 ? `+${row.daysBehind}` : row.daysBehind}
        </span>
      </td>

      {/* % Complete */}
      <td className="py-3 pr-3 text-xs text-right">
        <div className="flex items-center justify-end gap-2">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
            <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, row.workComplete)}%` }}/>
          </div>
          <span className="font-semibold text-slate-900">{row.workComplete}%</span>
        </div>
      </td>

      {/* Risks */}
      <td className="py-3 pr-3 text-xs text-right hidden lg:table-cell">
        <span className={clsx('font-semibold', row.criticalRisks > 0 ? 'text-red-600' : 'text-slate-600')}>
          {row.risksDetected}{row.criticalRisks > 0 ? ` (${row.criticalRisks}!)` : ''}
        </span>
      </td>

      {/* View button */}
      <td className="py-3 pr-4 text-right">
        <Link
          href="/dashboard"
          onClick={handleView}
          className="text-blue-600 hover:text-blue-700 text-xs font-semibold"
        >View →</Link>
      </td>
    </tr>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

function KPITile({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={clsx('text-2xl font-bold mt-0.5', valueColor)}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  )
}

function FilterPill({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count: number }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'text-xs font-semibold px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5',
        active ? 'bg-blue-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
      )}
    >
      {label}
      <span className={clsx(
        'text-[10px] px-1.5 py-0.5 rounded-full',
        active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
      )}>{count}</span>
    </button>
  )
}

function HealthDistributionBar({ rows }: { rows: ProjectRowData[] }) {
  const total = rows.length || 1
  const stable = rows.filter(r => r.condition === 'Stable').length
  const monitor = rows.filter(r => r.condition === 'Monitor Closely').length
  const attention = rows.filter(r => r.condition === 'Attention Needed').length
  const recovery = rows.filter(r => r.condition === 'Recovery Required').length
  const unknown = total - stable - monitor - attention - recovery
  const segments = [
    { count: stable, color: 'bg-emerald-500', label: 'Stable' },
    { count: monitor, color: 'bg-yellow-400', label: 'Monitor' },
    { count: attention, color: 'bg-amber-500', label: 'Attention' },
    { count: recovery, color: 'bg-red-500', label: 'Recovery' },
    { count: unknown, color: 'bg-slate-300', label: 'Unknown' },
  ].filter(s => s.count > 0)
  return (
    <div className="flex h-3 bg-slate-100 rounded-full overflow-hidden">
      {segments.map((s, i) => (
        <div
          key={i}
          className={clsx('h-full', s.color)}
          style={{ width: `${(s.count / total) * 100}%` }}
          title={`${s.label}: ${s.count}`}
        />
      ))}
    </div>
  )
}

function HealthLegend({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', color)}/>
      <span className="text-slate-600 flex-1">{label}</span>
      <span className="text-slate-900 font-semibold">{count}</span>
    </div>
  )
}

function StatusPill({ status }: { status: ProjectStatus }) {
  const cls =
    status === 'Active' ? 'bg-emerald-100 text-emerald-800' :
    status === 'On Hold' ? 'bg-amber-100 text-amber-800' :
    status === 'Completed' ? 'bg-slate-200 text-slate-700' :
    'bg-slate-100 text-slate-600'
  return <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide', cls)}>{status}</span>
}

// =============================================================================
// Data builders
// =============================================================================

interface ProjectRowData {
  project: Project
  status: ProjectStatus
  condition: string | undefined
  healthScore: number
  daysBehind: number
  workComplete: number
  risksDetected: number
  criticalRisks: number
  startDate: string
  contractEndDate: string
  projectedEndDate: string
  contractPast: boolean
  totalActivities: number
}

function buildRows(projects: Project[]): ProjectRowData[] {
  return projects
    .filter(p => {
      const s = getProjectStatus(p)
      return s !== 'Archived' && s !== 'Deleted'
    })
    .map(p => {
      const status = getProjectStatus(p)
      const latest = getLatestVersion(p)
      const a: any = latest?.analysis || {}

      const condition = a.condition || a.healthLabel
      const healthScore = num(a.healthScore, deriveScoreFromCondition(condition))
      const daysBehind = num(a.daysBehind, 0)
      const workComplete = num(a.workComplete ?? a.percentComplete, 0)
      const risksDetected = num(a.risksDetected ?? a.risksCount, 0)
      const criticalRisks = num(a.criticalRisks, 0)
      const totalActivities = num(a.totalActivities, 0)

      const projectStart = a.projectStart || a.project_start || a.ntp || a.ntpDate
      const contractEnd = a.contractEnd || a.contract_end || a.contractFinish || a.contract_finish
      const projectedEnd = a.projectedEnd || a.projected_end || a.forecastFinish || a.forecast_finish || a.projectedFinish

      const today = new Date()
      const contractPast = contractEnd ? new Date(contractEnd) < today : false

      return {
        project: p,
        status,
        condition,
        healthScore,
        daysBehind,
        workComplete,
        risksDetected,
        criticalRisks,
        startDate: fmtDate(projectStart),
        contractEndDate: fmtDate(contractEnd),
        projectedEndDate: fmtDate(projectedEnd),
        contractPast,
        totalActivities,
      }
    })
}

function sortRows(rows: ProjectRowData[], key: SortKey): ProjectRowData[] {
  const conditionRank = (c?: string) => {
    if (c === 'Recovery Required') return 0
    if (c === 'Attention Needed') return 1
    if (c === 'Monitor Closely') return 2
    if (c === 'Stable') return 3
    return 4
  }
  return [...rows].sort((a, b) => {
    if (key === 'health') return conditionRank(a.condition) - conditionRank(b.condition)
    if (key === 'daysBehind') return b.daysBehind - a.daysBehind
    if (key === 'workComplete') return b.workComplete - a.workComplete
    if (key === 'name') return a.project.name.localeCompare(b.project.name)
    if (key === 'contractEnd') {
      const aD = a.contractEndDate === '—' ? Infinity : new Date(a.contractEndDate).getTime()
      const bD = b.contractEndDate === '—' ? Infinity : new Date(b.contractEndDate).getTime()
      return aD - bD
    }
    return 0
  })
}

function computePortfolioKPIs(rows: ProjectRowData[]) {
  const active = rows.filter(r => r.status === 'Active').length
  const onHold = rows.filter(r => r.status === 'On Hold').length
  const completed = rows.filter(r => r.status === 'Completed').length
  const atRisk = rows.filter(r =>
    r.condition === 'Recovery Required' || r.condition === 'Attention Needed'
  ).length
  const totalDaysBehind = rows.reduce((sum, r) => sum + Math.max(0, r.daysBehind), 0)
  const avgComplete = rows.length > 0
    ? rows.reduce((sum, r) => sum + r.workComplete, 0) / rows.length
    : 0
  const totalActivities = rows.reduce((sum, r) => sum + r.totalActivities, 0)
  const stable = rows.filter(r => r.condition === 'Stable').length
  const monitor = rows.filter(r => r.condition === 'Monitor Closely').length
  const attention = rows.filter(r => r.condition === 'Attention Needed').length
  const recovery = rows.filter(r => r.condition === 'Recovery Required').length
  return {
    active, onHold, completed, atRisk, totalDaysBehind, avgComplete, totalActivities,
    stable, monitor, attention, recovery,
  }
}

// =============================================================================
// Helpers
// =============================================================================

function num(v: any, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return isFinite(n) ? n : fallback
}

function fmtDate(d?: string): string {
  if (!d) return '—'
  try {
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return String(d)
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    const yyyy = dt.getFullYear()
    return `${mm}/${dd}/${yyyy}`
  } catch { return String(d) }
}

function deriveScoreFromCondition(c?: string): number {
  if (c === 'Stable') return 85
  if (c === 'Monitor Closely') return 65
  if (c === 'Attention Needed') return 45
  if (c === 'Recovery Required') return 25
  return 50
}
