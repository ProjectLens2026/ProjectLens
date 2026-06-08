'use client'

// =============================================================================
// src/app/dashboard/reports/full/page.tsx
// =============================================================================
// Full Analysis report page wrapper. Reads the active project + version,
// computes diagnostic metrics including float distribution (bucketed), then
// renders the report.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getActiveProject, getActiveVersion, addCalendarDays,
  Project, ScheduleVersion,
} from '@/lib/projectStore'
import { createClient } from '@/lib/supabase/client'
import { reportNumber } from '@/lib/reports'
import FullAnalysisReport, { FloatBucket } from '@/components/reports/FullAnalysisReport'

const COLORS = {
  red: '#dc2626',
  amber: '#f59e0b',
  blue: '#2563eb',
  green: '#16a34a',
  slate: '#1f2937',
}

export default function FullAnalysisPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [version, setVersion] = useState<ScheduleVersion | null>(null)
  const [orgName, setOrgName] = useState<string>('—')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    setVersion(p ? getActiveVersion(p) : null)
    setReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadOrg() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: members } = await supabase
          .from('organization_members')
          .select('org_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
        if (!members || members.length === 0) return
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', members[0].org_id)
          .single()
        if (!cancelled && org?.name) setOrgName(org.name)
      } catch {}
    }
    loadOrg()
    return () => { cancelled = true }
  }, [])

  if (!ready) {
    return <div className="p-6 text-sm text-slate-500">Loading report…</div>
  }
  if (!project || !version) {
    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">‹ Reports</Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center mt-4">
          <div className="text-3xl mb-3">📄</div>
          <div className="text-lg font-bold text-slate-700 mb-2">No project loaded</div>
          <div className="text-sm text-slate-500 mb-4">Pick a project from the sidebar to generate the Full Analysis Report.</div>
          <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  const a: any = version.analysis || {}

  // Dates
  const manualNtp = project.contractDates?.ntp || undefined
  const manualOriginal = project.contractDates?.originalContractCompletion || undefined
  const timeExt = version.versionDates?.timeExtensionDays ?? 0
  const manualRevised = version.versionDates?.revisedContractCompletion || undefined
  const manualDataDate = version.versionDates?.manualDataDate || undefined
  const revisedComp = manualRevised || (manualOriginal ? addCalendarDays(manualOriginal, timeExt) : undefined)
  const dataDate = manualDataDate || a.dataDate || version.dataDate || version.uploadedAt
  const projectedEnd = a.projectedEnd || manualOriginal || a.contractEnd

  // Days behind
  let daysBehind = 0
  if (revisedComp && projectedEnd) {
    const cd = new Date(revisedComp), pd = new Date(projectedEnd)
    if (!isNaN(cd.getTime()) && !isNaN(pd.getTime())) {
      const cu = Date.UTC(cd.getFullYear(), cd.getMonth(), cd.getDate())
      const pu = Date.UTC(pd.getFullYear(), pd.getMonth(), pd.getDate())
      daysBehind = Math.round((pu - cu) / 86_400_000)
    }
  }

  // Core KPIs
  const healthScore = num(a.healthScore, 65)
  const healthLabel = a.healthLabel || a.condition || deriveHealthLabel(healthScore)
  const workCompletePct = num(a.workCompletePct ?? a.workComplete ?? a.percentComplete, 0)
  const totalActivities = num(a.totalActivities, 0)
  const completedCount = num(a.complete ?? a.completedActivities, 0)
  const inProgressCount = num(a.inProgress, 0)
  const notStartedCount = num(a.notStarted, 0)
  const negativeFloatCount = num(a.negativeFloat, 0)

  // Critical path
  const criticalDrivers = arr(a.criticalDrivers)
  const longestPath = arr(a.longestPathActivities)

  // Float distribution — bucket all activities by float
  const floatBuckets = buildFloatDistribution(a)

  // Schedule logic integrity
  const oosAll = arr(a.outOfSequence)
  const noTiesAll = arr(a.noTies)

  // Procurement
  const longLeadItems = arr(a.longLeadItems)
  const longLeadTotal = num(a.longLeadTotal, longLeadItems.length)
  const longLeadAtRisk = num(a.longLeadAtRisk, longLeadItems.filter((it: any) => {
    const f = typeof it.floatDays === 'number' ? it.floatDays : parseFloat(it.floatDays || '999')
    return !isNaN(f) && it.status_code !== 'TK_Complete' && f <= 14
  }).length)
  const longLeadSorted = [...longLeadItems].sort((a, b) => (a.floatDays ?? 999) - (b.floatDays ?? 999)).slice(0, 10)

  // Milestones at risk
  const milestonesAtRisk = arr(a.milestones).filter((m: any) => {
    const f = parseFloat(m.total_float_hr_cnt || '0') / 8
    return f < 0
  })

  // Report metadata
  const projectCode = project.projectId || project.name
  const reportNo = reportNumber(projectCode, 'FULL')
  const versionLabel = version.versionLabel || version.fileName || 'v1 · working draft'

  return (
    <div className="p-6 max-w-[920px] mx-auto h-full overflow-y-auto">
      <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">‹ Reports</Link>
      <div className="mt-3">
        <FullAnalysisReport
          orgName={orgName}
          reportNo={reportNo}
          versionLabel={versionLabel}
          project={{
            name: project.name,
            projectId: project.projectId,
            project_code: (project as any).project_code,
            owner: (project as any).owner,
            location: (project as any).location,
          }}
          healthScore={healthScore}
          healthLabel={healthLabel}
          daysBehind={daysBehind}
          workCompletePct={workCompletePct}
          totalActivities={totalActivities}
          completedCount={completedCount}
          inProgressCount={inProgressCount}
          notStartedCount={notStartedCount}
          negativeFloatCount={negativeFloatCount}
          dataDate={dataDate}
          criticalDriversCount={criticalDrivers.length}
          criticalDriversTop={criticalDrivers.slice(0, 10)}
          longestPathCount={longestPath.length}
          longestPathTop={longestPath.slice(0, 10)}
          floatBuckets={floatBuckets}
          oosCount={oosAll.length}
          oosTop={oosAll.slice(0, 15)}
          noTiesCount={noTiesAll.length}
          noTiesTop={noTiesAll.slice(0, 15)}
          longLeadTotal={longLeadTotal}
          longLeadAtRisk={longLeadAtRisk}
          longLeadTop={longLeadSorted}
          milestonesAtRisk={milestonesAtRisk}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Float distribution — try analyzer's allTasksForPaths, fall back to other arrays
// ─────────────────────────────────────────────────────────────────────────────

function buildFloatDistribution(a: any): FloatBucket[] {
  // Get the most comprehensive list of activities available
  let activities: any[] = []
  if (Array.isArray(a.allTasksForPaths) && a.allTasksForPaths.length > 0) {
    activities = a.allTasksForPaths
  } else if (Array.isArray(a.inProgressActivities) || Array.isArray(a.notStartedActivities)) {
    activities = [
      ...(a.inProgressActivities || []),
      ...(a.notStartedActivities || []),
    ]
  } else {
    return []
  }

  // Bucket activities by their float (in days)
  const buckets = [
    { label: '≤ 0d (critical)', count: 0, color: COLORS.red, min: -Infinity, max: 0 },
    { label: '1 – 5d', count: 0, color: COLORS.amber, min: 1, max: 5 },
    { label: '6 – 14d', count: 0, color: COLORS.amber, min: 6, max: 14 },
    { label: '15 – 30d', count: 0, color: COLORS.blue, min: 15, max: 30 },
    { label: '> 30d', count: 0, color: COLORS.green, min: 31, max: Infinity },
  ]

  for (const t of activities) {
    // Skip complete activities
    if (t.status_code === 'TK_Complete') continue

    const floatHours = parseFloat(t.total_float_hr_cnt || '0')
    if (isNaN(floatHours)) continue
    const floatDays = Math.round(floatHours / 8)

    for (const b of buckets) {
      if (floatDays >= b.min && floatDays <= b.max) {
        b.count += 1
        break
      }
    }
  }

  // Filter empty buckets only if they're all empty; otherwise show all
  const total = buckets.reduce((s, b) => s + b.count, 0)
  if (total === 0) return []

  return buckets.map(b => ({ label: b.label, count: b.count, color: b.color }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function num(v: any, def: number): number {
  if (v === null || v === undefined || v === '') return def
  const n = Number(v)
  return isNaN(n) ? def : n
}
function arr<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : []
}
function deriveHealthLabel(score: number): string {
  if (score >= 85) return 'Stable'
  if (score >= 70) return 'Watch'
  if (score >= 55) return 'At Risk'
  return 'Critical'
}
