'use client'

// =============================================================================
// src/app/dashboard/reports/trend/page.tsx
// =============================================================================
// Trend & Variance Report page wrapper. Unlike other reports, this one needs
// ALL versions of the project, not just the active one. Loads + sorts by
// data date, then maps each to a TrendPoint.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getActiveProject, getActiveVersion, addCalendarDays,
  Project, ScheduleVersion,
} from '@/lib/projectStore'
import { createClient } from '@/lib/supabase/client'
import { reportNumber } from '@/lib/reports'
import TrendReport, { TrendPoint } from '@/components/reports/TrendReport'

export default function TrendReportPage() {
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
          <div className="text-sm text-slate-500 mb-4">Pick a project from the sidebar to generate the Trend Report.</div>
          <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  // Pull all non-deleted versions, sort by data date (or upload date) ascending
  const allVersions = (project.versions || [])
    .filter(v => !v.deletedAt)
    .map(v => ({
      ...v,
      _sortKey: new Date(
        v.versionDates?.manualDataDate || (v.analysis as any)?.dataDate || v.dataDate || v.uploadedAt
      ).getTime(),
    }))
    .sort((a, b) => (a._sortKey || 0) - (b._sortKey || 0))

  // Map each version to a TrendPoint
  const manualOriginal = project.contractDates?.originalContractCompletion || undefined

  const points: TrendPoint[] = allVersions.map(v => {
    const a: any = v.analysis || {}
    const timeExt = v.versionDates?.timeExtensionDays ?? 0
    const manualRevised = v.versionDates?.revisedContractCompletion || undefined
    const revisedComp = manualRevised || (manualOriginal ? addCalendarDays(manualOriginal, timeExt) : undefined)

    const dataDate = v.versionDates?.manualDataDate || a.dataDate || v.dataDate || v.uploadedAt
    const projectedEnd = a.projectedEnd || a.forecastFinish || revisedComp || manualOriginal

    let daysBehind = 0
    if (revisedComp && projectedEnd) {
      const cd = new Date(revisedComp), pd = new Date(projectedEnd)
      if (!isNaN(cd.getTime()) && !isNaN(pd.getTime())) {
        const cu = Date.UTC(cd.getFullYear(), cd.getMonth(), cd.getDate())
        const pu = Date.UTC(pd.getFullYear(), pd.getMonth(), pd.getDate())
        daysBehind = Math.round((pu - cu) / 86_400_000)
      }
    }

    return {
      versionLabel: v.versionLabel || v.fileName || '—',
      dataDate,
      projectedEnd,
      healthScore: num(a.healthScore, 0),
      workCompletePct: num(a.workCompletePct ?? a.workComplete ?? a.percentComplete, 0),
      daysBehind,
      negativeFloat: num(a.negativeFloat, 0),
      oosCount: Array.isArray(a.outOfSequence) ? a.outOfSequence.length : 0,
      criticalDriversCount: Array.isArray(a.criticalDrivers) ? a.criticalDrivers.length : 0,
      longLeadAtRisk: num(a.longLeadAtRisk, 0),
      totalActivities: num(a.totalActivities, 0),
    }
  })

  // Span in calendar days between earliest and latest data date
  let spanDays = 0
  if (points.length >= 2 && points[0].dataDate && points[points.length - 1].dataDate) {
    const start = new Date(points[0].dataDate as string).getTime()
    const end = new Date(points[points.length - 1].dataDate as string).getTime()
    if (!isNaN(start) && !isNaN(end)) spanDays = Math.round((end - start) / 86_400_000)
  }

  const projectCode = project.projectId || project.name
  const reportNo = reportNumber(projectCode, 'TREND')
  const versionLabel = version.versionLabel || version.fileName || 'v1 · working draft'

  return (
    <div className="p-6 max-w-[920px] mx-auto h-full overflow-y-auto">
      <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">‹ Reports</Link>
      <div className="mt-3">
        <TrendReport
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
          points={points}
          spanDays={spanDays}
        />
      </div>
    </div>
  )
}

function num(v: any, def: number): number {
  if (v === null || v === undefined || v === '') return def
  const n = Number(v)
  return isNaN(n) ? def : n
}
