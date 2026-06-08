'use client'

// =============================================================================
// src/app/dashboard/reports/executive/page.tsx
// =============================================================================
// Executive Summary report page wrapper.
//
// Responsibilities:
//   1. Load the active project + version from projectStore
//   2. Load org name from Supabase (for "Prepared by")
//   3. Compute all the report inputs (KPIs, dates, risks, S-curve, top risks)
//      using the SAME logic the Executive Dashboard uses — mirrors page.tsx
//      so numbers stay consistent between Dashboard and Report.
//   4. Render <ExecutiveReport> with everything as props
//
// The actual visual report lives in src/components/reports/ExecutiveReport.tsx
// — this file is pure data plumbing.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getActiveProject, getActiveVersion, addCalendarDays,
  Project, ScheduleVersion,
} from '@/lib/projectStore'
import { countRiskCategories } from '@/lib/riskDetector'
import { createClient } from '@/lib/supabase/client'
import { reportNumber } from '@/lib/reports'
import ExecutiveReport from '@/components/reports/ExecutiveReport'

export default function ExecutiveReportPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [version, setVersion] = useState<ScheduleVersion | null>(null)
  const [orgName, setOrgName] = useState<string>('—')
  const [ready, setReady] = useState(false)

  // Load project + version on mount
  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    setVersion(p ? getActiveVersion(p) : null)
    setReady(true)
  }, [])

  // Load org name (for "Prepared by")
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
      } catch (err) {
        console.warn('[reports.executive] failed to load org name:', err)
      }
    }
    loadOrg()
    return () => { cancelled = true }
  }, [])

  // ── Loading + empty states ──────────────────────────────────────────────
  if (!ready) {
    return <div className="p-6 text-sm text-slate-500">Loading report…</div>
  }
  if (!project || !version) {
    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">
          ‹ Reports
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center mt-4">
          <div className="text-3xl mb-3">📄</div>
          <div className="text-lg font-bold text-slate-700 mb-2">No project loaded</div>
          <div className="text-sm text-slate-500 mb-4">
            Upload a P6 XER file or pick a project from the sidebar to generate
            the Executive Summary.
          </div>
          <Link href="/dashboard/upload" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
            Upload Schedule
          </Link>
        </div>
      </div>
    )
  }

  // ── Compute report data — mirrors Executive Dashboard logic ─────────────
  const a: any = version.analysis || {}

  // Manual contract dates flow through project + version, same as Dashboard
  const manualNtp = project.contractDates?.ntp || undefined
  const manualOriginal = project.contractDates?.originalContractCompletion || undefined
  const timeExt = version.versionDates?.timeExtensionDays ?? 0
  const manualRevised = version.versionDates?.revisedContractCompletion || undefined
  const manualDataDate = version.versionDates?.manualDataDate || undefined

  const revisedComputed = manualOriginal
    ? addCalendarDays(manualOriginal, timeExt)
    : undefined
  const revisedCompletion = manualRevised || revisedComputed

  const dataDate = manualDataDate || a.dataDate || a.data_date || version.dataDate || version.uploadedAt
  const ntp = manualNtp || a.projectStart || a.project_start || a.ntp || a.ntpDate || dataDate
  const originalCompletion = manualOriginal || a.contractEnd || a.contract_end || a.contractFinish || a.contractCompletion
  const projectedEnd = a.projectedEnd || a.projected_end || a.forecastFinish || a.forecast_finish || a.projectedFinish || revisedCompletion || originalCompletion

  // Days behind = projected - revised (positive = behind, negative = ahead)
  let daysBehind = 0
  if (projectedEnd && revisedCompletion) {
    const ms = new Date(projectedEnd).getTime() - new Date(revisedCompletion).getTime()
    if (!isNaN(ms)) daysBehind = Math.round(ms / (1000 * 60 * 60 * 24))
  }

  // Work complete % — analyzer ships this directly in v2+
  let workCompletePct = num(a.workCompletePct, undefined)
  if (workCompletePct === undefined) {
    workCompletePct = num(
      a.workComplete ?? a.percentComplete ?? a.physicalPercentComplete ?? a.durationPercentComplete ?? a.progress,
      0
    )
  }

  const totalActivities = num(a.totalActivities ?? a.total_activities ?? a.activityCount, 0)
  const constructionActivities = num(a.constructionActivityCount, 0)

  // Critical float — try the analyzer field, fall back to min float on driving path
  let criticalFloatDays = num(a.criticalFloatDays ?? a.minDrivingFloat ?? a.minTotalFloat, undefined)
  if (criticalFloatDays === undefined && Array.isArray(a.longestPath)) {
    const floats = a.longestPath
      .map((t: any) => Number(t.totalFloatDays ?? t.total_float_days ?? t.totalFloat))
      .filter((n: number) => !isNaN(n))
    if (floats.length) criticalFloatDays = Math.min(...floats)
  }
  criticalFloatDays = criticalFloatDays ?? 0

  // Long lead at risk
  let longLeadAtRisk = num(a.longLeadAtRisk, undefined)
  if (longLeadAtRisk === undefined && Array.isArray(a.longLeadItems)) {
    longLeadAtRisk = a.longLeadItems.filter((it: any) => {
      const f = typeof it.floatDays === 'number' ? it.floatDays : parseFloat(it.floatDays || '999')
      if (isNaN(f)) return false
      if (it.status_code === 'TK_Complete') return false
      return f <= 14
    }).length
  }
  longLeadAtRisk = longLeadAtRisk ?? 0

  // Risk counts (Critical / High / Medium category count)
  let risks = { critical: 0, high: 0, medium: 0 }
  try {
    const r = countRiskCategories(a)
    if (r) risks = { critical: r.critical || 0, high: r.high || 0, medium: r.medium || 0 }
  } catch {}

  // Health score
  const healthScore = num(a.healthScore, 65)
  const healthLabel = a.healthLabel || a.condition || deriveHealthLabel(healthScore)
  const healthNarrative = a.healthNarrative || a.aiSummary
    || 'Project metrics are being assessed. Detailed health insights will appear here as the schedule is analyzed.'

  // S-curve points — pull from analyzer if available
  const sCurve = buildSCurve(a, ntp, projectedEnd, dataDate)

  // Top risks — pull the 5 most severe risks
  const topRisks = buildTopRisks(a)

  // Report metadata
  const projectCode = project.projectId || (project as any).project_code || project.name
  const reportNo = reportNumber(projectCode, 'EXEC')
  const versionLabel = version.versionLabel || version.fileName || 'v1 · working draft'

  return (
    <div className="p-6 max-w-[920px] mx-auto">
      <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">
        ‹ Reports
      </Link>
      <div className="mt-3">
        <ExecutiveReport
          orgName={orgName}
          reportNo={reportNo}
          versionLabel={versionLabel}
          project={{
            name: project.name,
            projectId: project.projectId,
            project_code: (project as any).project_code,
            owner: (project as any).owner || project.contractDates?.owner,
            location: (project as any).location,
          }}
          healthScore={healthScore}
          healthLabel={healthLabel}
          healthNarrative={healthNarrative}
          daysBehind={daysBehind}
          workCompletePct={workCompletePct}
          criticalFloatDays={criticalFloatDays}
          longLeadAtRisk={longLeadAtRisk}
          ntp={ntp}
          originalCompletion={originalCompletion}
          revisedCompletion={revisedCompletion}
          dataDate={dataDate}
          projectedEnd={projectedEnd}
          risks={risks}
          sCurve={sCurve}
          topRisks={topRisks}
          totalActivities={totalActivities || undefined}
          constructionActivities={constructionActivities || undefined}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — defensive numeric parsing, health labels, S-curve, top risks
// ─────────────────────────────────────────────────────────────────────────────

function num(v: any, def: any = 0): any {
  if (v === null || v === undefined || v === '') return def
  const n = Number(v)
  return isNaN(n) ? def : n
}

function deriveHealthLabel(score: number): string {
  if (score >= 85) return 'Stable'
  if (score >= 70) return 'Watch'
  if (score >= 55) return 'At Risk'
  return 'Critical'
}

/**
 * Build the S-curve points. Try analyzer-provided arrays first; if none,
 * synthesize a sparse curve from data date + projected end + work %.
 */
function buildSCurve(a: any, ntp?: string, projectedEnd?: string, dataDate?: string) {
  // Preferred: analyzer ships a sCurve array directly
  if (Array.isArray(a.sCurve) && a.sCurve.length > 0) {
    return a.sCurve.map((p: any) => ({
      label: p.label || p.month || p.period || '',
      planned: numOrUndef(p.planned ?? p.plannedPct),
      actual: numOrUndef(p.actual ?? p.actualPct),
      forecast: numOrUndef(p.forecast ?? p.forecastPct),
    })).filter((p: any) => p.label)
  }

  // Fallback synthesis: monthly points NTP → projected end
  if (!ntp || !projectedEnd) return []
  const start = new Date(ntp)
  const end = new Date(projectedEnd)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return []
  const data = dataDate ? new Date(dataDate) : null
  const months: { label: string; t: Date }[] = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const stop = new Date(end.getFullYear(), end.getMonth() + 1, 1)
  while (cur < stop && months.length < 60) {
    months.push({
      label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      t: new Date(cur),
    })
    cur.setMonth(cur.getMonth() + 1)
  }
  const totalMs = end.getTime() - start.getTime()
  if (totalMs <= 0) return []
  return months.map(m => {
    const elapsed = m.t.getTime() - start.getTime()
    const planned = Math.max(0, Math.min(100, (elapsed / totalMs) * 100))
    const actual = data && m.t <= data ? Math.min(planned, 100) : undefined
    const forecast = data && m.t > data ? planned : undefined
    return { label: m.label, planned, actual, forecast }
  })
}

/**
 * Pull the top 5 risk activities from the analyzer's risk arrays.
 * Tries multiple shapes — modern analyzer ships a categorized risks
 * object, older ones ship flat outOfSequence + noTies arrays.
 */
function buildTopRisks(a: any): Array<{
  severity: 'critical' | 'high' | 'medium'
  category: string
  activity: string
  description: string
}> {
  const out: any[] = []

  // OOS — typically the most actionable
  if (Array.isArray(a.outOfSequence)) {
    for (const o of a.outOfSequence.slice(0, 3)) {
      const t = o.task || o.successor || {}
      out.push({
        severity: 'critical' as const,
        category: 'Out-of-Sequence',
        activity: `${t.task_code || '—'} · ${t.task_name || ''}`.slice(0, 80),
        description: (o.violations?.[0]?.description || o.description || 'Successor actualized before predecessor.').slice(0, 200),
      })
    }
  }

  // Long lead at risk
  if (Array.isArray(a.longLeadItems) && out.length < 5) {
    for (const it of a.longLeadItems.slice(0, 2)) {
      const f = typeof it.floatDays === 'number' ? it.floatDays : parseFloat(it.floatDays || '999')
      if (isNaN(f) || f > 14 || it.status_code === 'TK_Complete') continue
      out.push({
        severity: f <= 7 ? ('critical' as const) : ('high' as const),
        category: 'Long Lead',
        activity: `${it.task_code || '—'} · ${it.task_name || ''}`.slice(0, 80),
        description: `Procurement item with only ${f} days of float remaining.`,
      })
      if (out.length >= 5) break
    }
  }

  // No-ties (logic gaps) — medium severity
  if (Array.isArray(a.noTies) && out.length < 5) {
    for (const n of a.noTies.slice(0, 5 - out.length)) {
      out.push({
        severity: 'medium' as const,
        category: 'Missing Logic',
        activity: `${n.task_code || n.code || '—'} · ${n.task_name || n.name || ''}`.slice(0, 80),
        description: n.reason || n.description || 'Activity lacks required predecessor or successor logic.',
      })
    }
  }

  return out.slice(0, 5)
}

function numOrUndef(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return isNaN(n) ? undefined : n
}
