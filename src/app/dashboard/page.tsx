'use client'

import { useState, useEffect, useMemo, Component, ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import {
  getActiveProject, getActiveVersion, getLatestVersion,
  subscribeToProjects, loadProjects,
  addCalendarDays,
  Project, ScheduleVersion,
} from '@/lib/projectStore'
import { countRiskCategories } from '@/lib/riskDetector'

// =============================================================================
// Executive Dashboard — main /dashboard page.
//
// Renders sections in this order:
//   1. Header bar (project, XER, last updated, action buttons)
//   2. Health status banner (color-coded by score)
//   3. Key Dates & Durations
//        - Manual row: NTP, Original Comp, Revised Comp (from contract dates)
//        - XER row: Data Date, Substantial, Final (from XER analysis)
//        - Durations: Original, Revised, Remaining, At Completion
//   4. KPI tiles (4 metrics, clickable to detail pages)
//   5. Schedule Progress chart (planned vs actual + forecast)
//   6. Immediate Attention Areas (up to 3 risk cards)
//   7. 2 Weeks Lookahead (milestone table)
//   8. Bottom row: Operational Pressure | Follow-Up | Communication
//
// Contract dates flow (2026-05-21):
//   - project.contractDates       — NTP + Original Comp (sticky across versions)
//   - version.versionDates        — Time Ext, Revised override, manual Data Date
//   - Dashboard reads manual values first, falls back to XER analyzer fields
//     so legacy projects with no manual entries still render correctly.
// =============================================================================

export default function ExecutiveDashboard() {
  return (
    <ErrorBoundary>
      <ExecutiveDashboardInner />
    </ErrorBoundary>
  )
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: err?.message || String(err) }
  }
  componentDidCatch(error: any, info: any) {
    console.error('[ExecutiveDashboard] render error:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6">
          <div className="bg-white border border-red-200 rounded-xl p-8 text-center max-w-lg">
            <div className="w-12 h-12 mx-auto mb-3 bg-red-100 rounded-2xl flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="text-base font-bold text-slate-800 mb-2">Dashboard failed to render</div>
            <div className="text-xs text-slate-500 mb-3">A piece of the data is in an unexpected format. The error is logged in the browser console.</div>
            <div className="text-[11px] text-red-600 font-mono bg-red-50 border border-red-100 rounded p-2 mb-4 text-left overflow-x-auto">{this.state.message}</div>
            <Link href="/dashboard/upload" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              Re-upload Schedule
            </Link>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function ExecutiveDashboardInner() {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [version, setVersion] = useState<ScheduleVersion | null>(null)

  useEffect(() => {
    refresh()
    const unsub = subscribeToProjects(refresh)
    const interval = setInterval(refresh, 2000)
    return () => { unsub(); clearInterval(interval) }
  }, [])

  function refresh() {
    const p = getActiveProject()
    setProject(p)
    setVersion(p ? getActiveVersion(p) : null)
  }

  if (!project || !version) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
            <span className="text-3xl">📊</span>
          </div>
          <div className="text-lg font-bold text-slate-700 mb-2">No project loaded</div>
          <div className="text-sm text-slate-500 mb-4">
            Upload a P6 XER file to see the Executive Dashboard with your project's health, dates, and schedule progress.
          </div>
          <Link href="/dashboard/upload" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
            Upload Schedule
          </Link>
        </div>
      </div>
    )
  }

  return <DashboardContent project={project} version={version} />
}

function DashboardContent({ project, version }: { project: Project; version: ScheduleVersion }) {
  const a = version.analysis || {}

  // ============================================================================
  // MANUAL CONTRACT DATES (project + version level) — primary source of truth
  // ============================================================================
  const manualNtp = project.contractDates?.ntp || undefined
  const manualOriginalCompletion = project.contractDates?.originalContractCompletion || undefined
  const manualSubstantialCompletion = project.contractDates?.substantialCompletion || undefined
  const timeExtensionDays = version.versionDates?.timeExtensionDays ?? 0
  const manualRevisedCompletion = version.versionDates?.revisedContractCompletion || undefined
  const manualDataDate = version.versionDates?.manualDataDate || undefined

  // Revised = manual override OR (original + time extension)
  const revisedCompletionComputed = manualOriginalCompletion
    ? addCalendarDays(manualOriginalCompletion, timeExtensionDays)
    : undefined
  const revisedContractCompletion = manualRevisedCompletion || revisedCompletionComputed

  // --------- safe field reads (manual first, XER fallback) ----------
  const xerFile = version.fileName || 'schedule.xer'
  const lastUpdated = formatLastUpdated(version.uploadedAt)
  const healthScore = num(a.healthScore, 65)
  const healthLabel = a.healthLabel || a.condition || deriveHealthLabel(healthScore)
  const healthNarrative = a.healthNarrative || a.aiSummary
    || 'Project metrics are being assessed. Detailed health insights will appear here as the schedule is analyzed.'

  // Data Date: manual → XER → uploaded
  const dataDate = manualDataDate || a.dataDate || a.data_date || version.dataDate || version.uploadedAt
  // NTP: manual → XER → dataDate
  const projectStart = manualNtp || a.projectStart || a.project_start || a.ntp || a.ntpDate || dataDate

  // Milestone detection (XER-only, unchanged)
  const milestones = Array.isArray(a.milestones) ? a.milestones : []
  const findMilestone = (codes: string[], nameKeywords: string[]) => {
    for (const m of milestones) {
      const code = String(m?.code || m?.id || m?.activityId || '').toUpperCase()
      const name = String(m?.name || m?.label || m?.activityName || '').toLowerCase()
      if (codes.some(c => code.includes(c))) return m
      if (nameKeywords.some(k => name.includes(k))) return m
    }
    return null
  }
  const findMilestoneDate = (m: any) => m?.date || m?.finish || m?.actualFinish || m?.scheduledFinish || m?.early_finish || null

  const substMilestoneObj = findMilestone(
    ['MILE-195', 'MS-195', '195', 'BCD', 'SUB', 'M-SUB', 'ASB', 'BO', 'TCO', '100'],
    ['substantial', 'subst comp', 'sub completion', 'beneficial occupancy', 'beneficial occup', 'bo date', 'temp occupancy', 'temporary occupancy']
  )
  const finalMilestoneObj = findMilestone(
    ['MILE-200', 'MS-200', '200', 'FC', 'M-FC', 'PCD', '999'],
    ['final completion', 'final compl', 'project finish', 'project close', 'closeout', 'project completion', 'punch list complete']
  )

  // Contract End: MANUAL Original Contract Completion → XER fallback
  const contractEnd = manualOriginalCompletion
    || a.contractEnd || a.contract_end || a.contractFinish || a.contract_finish || a.contractCompletion

  const projectedEnd = a.projectedEnd || a.projected_end || a.forecastFinish || a.forecast_finish || a.projectedFinish || contractEnd
  const finalCompletion = a.finalCompletion || a.final_completion || a.projectFinish || a.project_finish || a.finalComp || findMilestoneDate(finalMilestoneObj) || projectedEnd
  const substantialCompletion = a.substantialCompletion || a.substantial_completion || a.substComp || a.subComp || a.substantialComp || a.substCompletion || findMilestoneDate(substMilestoneObj)

  const ntpMilestone = a.ntpMilestone || 'NTP'
  const substMilestone = a.substMilestone || (substMilestoneObj?.code || substMilestoneObj?.id || '')
  const finalMilestone = a.finalMilestone || (finalMilestoneObj?.code || finalMilestoneObj?.id || '')

  // ============================================================================
  // DURATIONS — per PM formulas
  //   Original   = NTP → Original Contract Completion  (inclusive)
  //   Revised    = NTP → Revised Contract Completion   (inclusive)
  //   Remaining  = Data Date → Revised Contract Completion
  //   At Compl.  = NTP → Projected End (XER forecast)  (= Option B)
  // All in calendar days. daysBetween() is +1 inclusive — matches the
  // industry convention where NTP day counts as day 1.
  // ============================================================================
  const daysBetween = (start?: string, end?: string): number | undefined => {
    if (!start || !end) return undefined
    const s = new Date(start)
    const e = new Date(end)
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return undefined
    const sUTC = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate())
    const eUTC = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate())
    return Math.max(0, Math.round((eUTC - sUTC) / (1000 * 60 * 60 * 24))) + 1
  }

  // Original Duration = NTP → Original Contract Completion
  const originalDurationComputed = daysBetween(projectStart, contractEnd)
  const originalDurationField = numOrUndefAtTop(
    a.originalDuration ?? a.original_duration ??
    a.targetDuration ?? a.target_duration ??
    a.plannedDuration ?? a.planned_duration ??
    a.baselineDuration ?? a.baseline_duration ??
    a.contractDuration ?? a.contract_duration
  )
  const originalDuration = originalDurationComputed ?? originalDurationField ?? 0
  const hasOriginalDuration = originalDurationComputed !== undefined || originalDurationField !== undefined

  // Revised Duration = NTP → Revised Contract Completion
  const revisedDurationComputed = daysBetween(projectStart, revisedContractCompletion)
  const revisedDuration = revisedDurationComputed ?? originalDuration

  // Remaining Duration = Data Date → Revised Contract Completion
  // (Was Data Date → Projected End in pre-2026-05-21 code. PM clarified:
  // Remaining should be against the contract's revised completion, not the
  // XER's forecast. Forecast slip is captured in At Completion + Days Behind.)
  const remainingDurationComputed = daysBetween(dataDate, revisedContractCompletion)
  const remainingDurationField = numOrUndefAtTop(
    a.remainingDuration ?? a.remaining_duration ??
    a.atCompletionRemainingDuration
  )
  const remainingDuration = remainingDurationComputed ?? remainingDurationField ?? 0

  // Days Behind = Projected End - Revised Contract Completion (if forecast is past contract)
  let daysBehind: number | undefined = numOrUndefAtTop(a.daysBehind ?? a.days_behind ?? a.behindContract)
  if (daysBehind === undefined && revisedContractCompletion && projectedEnd) {
    const cD = new Date(revisedContractCompletion)
    const pD = new Date(projectedEnd)
    if (!isNaN(cD.getTime()) && !isNaN(pD.getTime())) {
      const cUTC = Date.UTC(cD.getFullYear(), cD.getMonth(), cD.getDate())
      const pUTC = Date.UTC(pD.getFullYear(), pD.getMonth(), pD.getDate())
      daysBehind = Math.round((pUTC - cUTC) / (1000 * 60 * 60 * 24))
    }
  }
  const daysBehindNum = daysBehind ?? 0
  const hasDaysBehind = daysBehind !== undefined

  // At Completion Duration = NTP → Projected End (Forecast Finish from XER)
  const durationAtCompletionComputed = daysBetween(projectStart, projectedEnd)
  const durationAtCompletionField = numOrUndefAtTop(
    a.durationAtCompletion ?? a.duration_at_completion ??
    a.atCompletionDuration ?? a.at_completion_duration
  )
  const durationAtCompletion = durationAtCompletionComputed ?? durationAtCompletionField ?? (revisedDuration + Math.max(0, daysBehindNum))

  // ============================================================================
  // WORK % COMPLETE — PM-defined formula (Day 5, v2)
  //
  // Analyzer computes this now using:
  //   effective_pct per activity = 100 if (status=Complete OR phys%>=80)
  //                                else phys_complete_pct as-is
  //   workCompletePct = mean(effective_pct) across ALL activities
  //
  // Dashboard reads it directly from a.workCompletePct. Falls back to the
  // pre-v2 logic only for legacy versions analyzed before v2 ships (where
  // workCompletePct will be undefined).
  // ============================================================================
  let workComplete: number | undefined = numOrUndefAtTop(a.workCompletePct)

  // Breakdown numbers for the explainer text. All come from the analyzer.
  // If they're missing (legacy version), the explainer hides itself.
  const wcCompletedAtThreshold = numOrUndefAtTop(a.completedAtThreshold)
  const wcInProgressCount = numOrUndefAtTop(a.workInProgressCount)
  const wcInProgressAvgPct = numOrUndefAtTop(a.workInProgressAvgPct)
  const wcNotStartedCount = numOrUndefAtTop(a.workNotStartedCount)
  // v3 — construction-only filtering numbers
  const wcConstructionCount = numOrUndefAtTop(a.constructionActivityCount)
  const wcExcludedCount = numOrUndefAtTop(a.excludedFromWorkPctCount)
  const wcExcludedMilestone = numOrUndefAtTop(a.excludedMilestoneCount)
  const wcExcludedSubmittal = numOrUndefAtTop(a.excludedSubmittalCount)
  const wcExcludedProcurement = numOrUndefAtTop(a.excludedProcurementCount)
  const wcExcludedDesign = numOrUndefAtTop(a.excludedDesignCount)
  const wcExcludedCloseout = numOrUndefAtTop(a.excludedCloseoutCount)
  const hasWorkCompleteBreakdown =
    wcCompletedAtThreshold !== undefined &&
    wcInProgressCount !== undefined &&
    wcNotStartedCount !== undefined

  // --- Legacy fallback chain (pre-v2 versions or non-XER analyses) ---
  if (workComplete === undefined) {
    workComplete = numOrUndefAtTop(
      a.workComplete ?? a.percentComplete ?? a.percent_complete ??
      a.physicalPercentComplete ?? a.physical_percent_complete ??
      a.durationPercentComplete ?? a.duration_percent_complete ??
      a.percentDone ?? a.percent_done ?? a.progress ??
      a.pctComplete ?? a.pct_complete ?? a.completion
    )
  }
  const completedActivities = numOrUndefAtTop(a.completedActivities ?? a.completed_activities ?? a.completed ?? a.completedCount)
  const totalActivities = num(a.totalActivities ?? a.total_activities ?? a.activityCount ?? a.activity_count, 0)

  if (workComplete === undefined && completedActivities !== undefined && totalActivities > 0) {
    workComplete = (completedActivities / totalActivities) * 100
  }

  let workCompleteIsTimeBased = false
  if (workComplete === undefined && projectStart && projectedEnd && dataDate) {
    const pS = new Date(projectStart)
    const pE = new Date(projectedEnd)
    const dD = new Date(dataDate)
    if (!isNaN(pS.getTime()) && !isNaN(pE.getTime()) && !isNaN(dD.getTime())) {
      const pSUTC = Date.UTC(pS.getFullYear(), pS.getMonth(), pS.getDate())
      const pEUTC = Date.UTC(pE.getFullYear(), pE.getMonth(), pE.getDate())
      const dDUTC = Date.UTC(dD.getFullYear(), dD.getMonth(), dD.getDate())
      const total = pEUTC - pSUTC
      const elapsed = dDUTC - pSUTC
      if (total > 0) {
        workComplete = Math.max(0, Math.min(100, (elapsed / total) * 100))
        workCompleteIsTimeBased = true
      }
    }
  }

  const workCompleteNum = workComplete ?? 0
  const hasWorkComplete = workComplete !== undefined

  // ============================================================================
  // LONG LEAD AT RISK — Day 5, v2
  //
  // Analyzer now returns longLeadTotal (count of detected long-lead items)
  // and longLeadAtRisk (those with float<=14 days). Earlier versions of
  // the dashboard read fields that didn't exist on the analysis object,
  // so this number was always 0 even when 28 long-lead items were detected.
  //
  // Fallback path: if the analyzer fields are missing (legacy version),
  // compute on the fly from the longLeadItems array if present.
  // ============================================================================
  let longLeadTotal = numOrUndefAtTop(a.longLeadTotal)
  let longLeadAtRisk = numOrUndefAtTop(a.longLeadAtRisk)
  if (longLeadTotal === undefined && Array.isArray(a.longLeadItems)) {
    longLeadTotal = a.longLeadItems.length
  }
  if (longLeadAtRisk === undefined && Array.isArray(a.longLeadItems)) {
    longLeadAtRisk = a.longLeadItems.filter((it: any) => {
      const f = typeof it.floatDays === 'number' ? it.floatDays : parseFloat(it.floatDays || '999')
      if (isNaN(f)) return false
      if (it.status_code === 'TK_Complete') return false
      return f <= 14
    }).length
  }
  longLeadTotal = longLeadTotal ?? 0
  longLeadAtRisk = longLeadAtRisk ?? 0

  // Risks Detected — Day 5, v9 (CATEGORY count, not activity count)
  //
  // The dashboard tile previously showed activity-level severity counts
  // computed from float buckets in the analyzer. Per founder direction,
  // it now shows how many RISK CATEGORIES (from the Risks page) have
  // triggered, broken down by severity. Numbers match what the user sees
  // when they click into /dashboard/risks.
  //
  // Categories detected by detectRiskCategories():
  //   Time Impact / Critical Path / Procurement / Construction Sequence /
  //   Schedule Quality / Overall Health / Milestones (up to 7)
  const riskCats = countRiskCategories(a)
  const risksAll = riskCats.all
  const risksCritical = riskCats.critical
  const risksHigh = riskCats.high
  const risksMedium = riskCats.medium

  const attentionAreas: AttentionArea[] = Array.isArray(a.attentionAreas) && a.attentionAreas.length
    ? a.attentionAreas
    : defaultAttentionAreas(daysBehindNum)
  const lookahead: LookaheadItem[] = Array.isArray(a.lookahead) && a.lookahead.length
    ? a.lookahead
    : defaultLookahead()
  const operationalPressure: PressureItem[] = Array.isArray(a.operationalPressure) && a.operationalPressure.length
    ? a.operationalPressure
    : defaultPressure()
  const followUp: FollowUpItem[] = Array.isArray(a.followUp) && a.followUp.length
    ? a.followUp
    : defaultFollowUp(daysBehindNum)
  const communicationSummary = a.communicationSummary
    || defaultCommSummary(daysBehindNum)

  // --------- Schedule Progress chart data ----------
  const chartData = useMemo(
    () => buildScheduleProgressData({
      projectStart,
      contractEnd: revisedContractCompletion || contractEnd,  // use revised for chart's "contract end" marker
      projectedEnd,
      dataDate,
      workComplete: workCompleteNum,
      planVelocityHint: a.plannedVelocity,
      actualByMonth: a.actualByMonth,
      plannedByMonth: a.plannedByMonth,
    }),
    [projectStart, contractEnd, revisedContractCompletion, projectedEnd, dataDate, workCompleteNum, a.plannedVelocity, a.actualByMonth, a.plannedByMonth]
  )

  const behindByPts = workCompleteNum - chartData.plannedAtToday
  const velocityPerMonth = chartData.velocityPerMonth
  const requiredVelocity = chartData.requiredVelocityToHitContract

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Header bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center justify-between flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Executive Dashboard</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name}{project.projectId ? ` · ${project.projectId}` : ''} · {xerFile}</span>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <span className="text-xs text-slate-400">Last updated: {lastUpdated}</span>
          <Link href="/dashboard/lens" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5">
            🔍 Full Analysis
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            title="Print or save as PDF"
            className="bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5">
            🖨 Print / Save PDF
          </button>
          <Link href="/dashboard/upload" className="bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5">
            + Upload Schedule
          </Link>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-4">

        {/* SECTION 1: Health Status banner */}
        <HealthBanner score={healthScore} label={healthLabel} narrative={healthNarrative} />

        {/* SECTION 2: Key Dates & Durations */}
        <Card>
          <SectionTitle>Key Dates & Durations</SectionTitle>

          {/* Manual contract dates row — 4 cells */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <DateCell
              label="NTP / Contract Start"
              value={fmtDate(projectStart)}
              sub={manualNtp ? 'Entered manually' : 'From XER'} />
            <DateCell
              label="Original Contract Completion"
              value={fmtDate(contractEnd)}
              sub={manualOriginalCompletion ? 'Entered manually' : 'From XER'}
              highlightColor="red" />
            <DateCell
              label="Revised Contract Completion"
              value={fmtDate(revisedContractCompletion)}
              sub={
                manualRevisedCompletion ? 'Override (manual)' :
                timeExtensionDays > 0 ? `Original + ${timeExtensionDays}d` :
                'No time extension'
              }
              highlightColor="amber" />
            <DateCell
              label="Substantial — Manual"
              value={fmtDate(manualSubstantialCompletion)}
              sub={manualSubstantialCompletion ? 'Per contract' : 'Add via Upload → Contract Dates'} />
          </div>

          {/* XER-detected dates row — 4 cells */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            <DateCell
              label="Data Date"
              value={fmtDate(dataDate)}
              sub={manualDataDate ? 'Manual entry' : 'From XER'} />
            <DateCell
              label="Substantial — XER"
              value={fmtDate(substantialCompletion)}
              sub={substMilestone ? `${substMilestone} · From XER` : 'Detected from XER'} />
            <DateCell
              label="Final Completion"
              value={fmtDate(finalCompletion)}
              sub={finalMilestone ? `${finalMilestone} · From XER` : 'Detected from XER'} />
            <DateCell
              label="Projected End"
              value={fmtDate(projectedEnd)}
              sub={daysBehindNum > 0 ? `+${daysBehindNum}d vs revised` : 'XER forecast'}
              highlightColor={daysBehindNum > 0 ? 'amber' : undefined} />
          </div>

          {/* Durations row — 4 cells */}
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4">
            <DurationCell label="Original Duration" value={originalDuration} />
            <DurationCell label="Revised Duration" value={revisedDuration} />
            <DurationCell label="Remaining Duration" value={remainingDuration} />
            <DurationCell label="Duration at Completion" value={durationAtCompletion} delta={daysBehindNum > 0 ? daysBehindNum : undefined} />
          </div>
        </Card>

        {/* SECTION 3: KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPITile
            href="/dashboard/tia"
            label="Days Behind Contract"
            value={!hasDaysBehind ? '—' : (daysBehindNum > 0 ? `+${daysBehindNum}` : String(daysBehindNum))}
            sub={!hasDaysBehind ? 'Not yet computed' : (daysBehindNum > 0 ? '↓ TIA territory' : 'On contract')}
            valueColor={!hasDaysBehind ? 'slate' : (daysBehindNum > 0 ? 'red' : 'green')}
          />
          <KPITile
            href="/dashboard/lens"
            label="Work Complete"
            value={hasWorkComplete ? `${Math.round(workCompleteNum)}%` : '—'}
            sub={
              !hasWorkComplete ? 'No activity data' :
              workCompleteIsTimeBased ? 'Time-based estimate' :
              hasWorkCompleteBreakdown
                ? (wcConstructionCount !== undefined
                    ? `${wcCompletedAtThreshold!.toLocaleString()} of ${wcConstructionCount.toLocaleString()} construction (≥80%)`
                    : `${wcCompletedAtThreshold!.toLocaleString()} of ${totalActivities.toLocaleString()} complete (≥80%)`)
                : completedActivities !== undefined
                  ? `${completedActivities.toLocaleString()} of ${totalActivities.toLocaleString()} activities`
                  : totalActivities > 0 ? `${totalActivities.toLocaleString()} activities total` : 'Computed'
            }
            valueColor="slate"
          />
          <KPITile
            href="/dashboard/procurement"
            label="Long Lead at Risk"
            value={String(longLeadAtRisk)}
            sub={longLeadAtRisk === 0 ? `✓ none ≤14d float · ${longLeadTotal} total` : `≤14d float · ${longLeadTotal} total`}
            valueColor={longLeadAtRisk === 0 ? 'green' : 'red'}
          />
          <RisksTile
            all={risksAll}
            critical={risksCritical}
            high={risksHigh}
            medium={risksMedium}
          />
        </div>

        {/* WORK % CALCULATION EXPLAINER — Day 5, v3
            Shows the math behind the Work Complete tile so PMs see what
            drove the percentage. v3 makes the construction-only scope
            explicit, and shows which activity categories were excluded
            from the average. Hidden if breakdown data is unavailable
            (legacy versions). */}
        {hasWorkComplete && hasWorkCompleteBreakdown && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 -mt-2 mb-2">
            <div className="flex items-start gap-3">
              <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mt-0.5 whitespace-nowrap">
                Work % calculation
              </div>
              <div className="flex-1 text-[12px] text-slate-700 leading-relaxed">
                <span className="font-semibold text-slate-900">{wcCompletedAtThreshold!.toLocaleString()}</span> complete (≥80%, counted as 100%)
                {' + '}
                <span className="font-semibold text-slate-900">{wcInProgressCount!.toLocaleString()}</span> in-progress (avg <span className="font-semibold">{Math.round(wcInProgressAvgPct ?? 0)}%</span>)
                {' + '}
                <span className="font-semibold text-slate-900">{wcNotStartedCount!.toLocaleString()}</span> not started (0%)
                {' = '}
                <span className="font-semibold text-slate-900">{Math.round(workCompleteNum)}%</span> across{' '}
                {wcConstructionCount !== undefined
                  ? <><span className="font-semibold">{wcConstructionCount.toLocaleString()}</span> construction activities</>
                  : <>{totalActivities.toLocaleString()} activities</>}
                {wcExcludedCount !== undefined && wcExcludedCount > 0 && (
                  <span className="block text-slate-500 mt-1">
                    Excluded <span className="font-semibold text-slate-700">{wcExcludedCount.toLocaleString()}</span> non-construction activities:{' '}
                    {wcExcludedMilestone !== undefined && wcExcludedMilestone > 0 && <>{wcExcludedMilestone} milestones · </>}
                    {wcExcludedSubmittal !== undefined && wcExcludedSubmittal > 0 && <>{wcExcludedSubmittal} submittals · </>}
                    {wcExcludedProcurement !== undefined && wcExcludedProcurement > 0 && <>{wcExcludedProcurement} procurement · </>}
                    {wcExcludedDesign !== undefined && wcExcludedDesign > 0 && <>{wcExcludedDesign} design · </>}
                    {wcExcludedCloseout !== undefined && wcExcludedCloseout > 0 && <>{wcExcludedCloseout} closeout</>}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: Schedule Progress chart */}
        <Card>
          <div className="flex items-start justify-between mb-3">
            <div>
              <SectionTitle>Schedule Progress</SectionTitle>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Last 2 months + forecast · Revised end <span className="text-red-600 font-semibold">{fmtDate(revisedContractCompletion || contractEnd)}</span>
                {' · Projected '}<span className="text-amber-600 font-semibold">{fmtDate(projectedEnd)}{daysBehindNum > 0 ? ` (+${daysBehindNum}d)` : ''}</span>
              </div>
            </div>
            <ChartLegend />
          </div>
          <ScheduleProgressChart data={chartData} />
          {/* Bar/line description — v8. The KPI legend at the top names
              the categories; this block explains WHAT each color represents
              so the chart reads without having to interpret. Placed below
              the chart so it doesn't compete with the title or pills above. */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 bg-blue-600 rounded-sm flex-shrink-0"/>
              <span><span className="font-semibold text-blue-900">Planned</span> — baseline cumulative % at this date</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 bg-emerald-600 rounded-sm flex-shrink-0"/>
              <span><span className="font-semibold text-emerald-900">Actual</span> — verified progress to date</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 bg-amber-400 rounded-sm flex-shrink-0" style={{opacity: 0.85}}/>
              <span><span className="font-semibold text-amber-900">Forecast</span> — projected progress after data date</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="6" viewBox="0 0 20 6"><line x1="0" y1="3" x2="20" y2="3" stroke="#b45309" strokeWidth="2" strokeDasharray="4,3"/></svg>
              <span>Dashed line = forecast cumulative</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block px-1 text-[9px] font-bold text-red-700 bg-red-50 border border-red-300 rounded-sm" style={{lineHeight: '12px'}}>CONTRACT END</span>
              <span>Revised contract completion</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block px-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-300 rounded-sm" style={{lineHeight: '12px'}}>FORECAST END</span>
              <span>Projected completion from XER</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100">
            <InsightCell
              label={!hasWorkComplete ? 'Plan variance' : (behindByPts >= 0 ? 'Ahead of plan by' : 'Behind plan by')}
              value={!hasWorkComplete ? '—' : `${behindByPts >= 0 ? '+' : ''}${behindByPts.toFixed(1)} percentage pts`}
              color={!hasWorkComplete ? 'slate' : (behindByPts >= 0 ? 'green' : 'red')}
            />
            <InsightCell
              label="Velocity (last 3 mo)"
              value={!hasWorkComplete ? '—' : `~${velocityPerMonth.toFixed(1)}% / month`}
              color="slate"
            />
            <InsightCell
              label="Required velocity to hit contract"
              value={!hasWorkComplete
                ? '—'
                : (requiredVelocity === Infinity ? '— (already past)' : `~${requiredVelocity.toFixed(1)}% / month`)}
              color={!hasWorkComplete ? 'slate' : (requiredVelocity === Infinity || requiredVelocity > velocityPerMonth * 1.5 ? 'red' : 'slate')}
            />
          </div>
        </Card>

        {/* SECTION 5: Immediate Attention Areas */}
        <div>
          <div className="text-sm font-semibold text-slate-800 mb-2">Immediate Attention Areas</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {attentionAreas.slice(0, 3).map((area, i) => (
              <AttentionAreaCard key={i} area={area} />
            ))}
          </div>
        </div>

        {/* SECTION 6: 2 Weeks Lookahead */}
        <Card>
          <SectionTitle>2 Weeks Lookahead</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left font-semibold py-2 pr-3">Milestone</th>
                  <th className="text-left font-semibold py-2 pr-3 w-28">Date</th>
                  <th className="text-left font-semibold py-2 pr-3 w-24">Status</th>
                  <th className="text-left font-semibold py-2 w-16">Risk</th>
                </tr>
              </thead>
              <tbody>
                {lookahead.map((item, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="py-2 pr-3 text-slate-900 text-xs">{item.name}</td>
                    <td className="py-2 pr-3 text-slate-500 text-xs">{item.date}</td>
                    <td className="py-2 pr-3"><StatusPill status={item.status} /></td>
                    <td className="py-2 text-xs font-semibold"><RiskLabel risk={item.risk} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* SECTION 7: Bottom row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card compact>
            <SectionTitle>Operational Pressure</SectionTitle>
            <div className="text-xs">
              {operationalPressure.map((p, i) => (
                <div key={i} className={clsx(
                  'flex justify-between py-1.5',
                  i < operationalPressure.length - 1 ? 'border-b border-slate-100' : ''
                )}>
                  <span className="text-slate-600">{p.label}</span>
                  <PressureLabel level={p.level} />
                </div>
              ))}
            </div>
          </Card>

          <Card compact>
            <SectionTitle>Recommended Follow-Up</SectionTitle>
            <div className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
              {followUp.map((f, i) => (
                <div key={i} className={clsx(
                  'pl-2 py-1 border-l-2',
                  f.priority === 'high' ? 'border-red-500' : f.priority === 'medium' ? 'border-amber-500' : 'border-slate-300'
                )}>
                  {f.text}
                </div>
              ))}
            </div>
          </Card>

          <div className="bg-sky-50 border border-sky-200 rounded-xl p-3">
            <div className="text-xs font-semibold text-sky-900 mb-1.5">Communication Summary</div>
            <div className="text-xs text-sky-800 leading-relaxed">{communicationSummary}</div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { navigator.clipboard?.writeText(communicationSummary) }}
                className="text-[10px] bg-white text-sky-900 border border-sky-200 px-2 py-1 rounded hover:bg-sky-100 font-semibold"
              >📋 Copy</button>
              <Link href="/dashboard/tia"
                className="text-[10px] bg-white text-sky-900 border border-sky-200 px-2 py-1 rounded hover:bg-sky-100 font-semibold"
              >📑 TIA</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Sub-components — unchanged from prior version
// =============================================================================

function Card({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={clsx(
      'bg-white border border-slate-200 rounded-xl shadow-sm',
      compact ? 'p-3' : 'p-4'
    )}>{children}</div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold text-slate-800 mb-3">{children}</div>
}

function HealthBanner({ score, label, narrative }: { score: number; label: string; narrative: string }) {
  const tone = score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red'
  const bg = tone === 'green' ? 'bg-emerald-50 border-emerald-200' : tone === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
  const titleColor = tone === 'green' ? 'text-emerald-900' : tone === 'amber' ? 'text-amber-900' : 'text-red-900'
  const bodyColor = tone === 'green' ? 'text-emerald-800' : tone === 'amber' ? 'text-amber-800' : 'text-red-800'
  const icon = tone === 'green' ? '✓' : tone === 'amber' ? '👁' : '⚠'
  return (
    <div className={clsx('border rounded-xl p-3 flex items-center gap-3', bg)}>
      <div className="text-2xl flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <div className={clsx('text-sm font-semibold', titleColor)}>{label} · Health {score}/100</div>
        <div className={clsx('text-xs mt-0.5', bodyColor)}>{narrative}</div>
      </div>
      <Link href="/dashboard/lens" className={clsx('text-xs px-3 py-1.5 rounded-md font-semibold bg-white border whitespace-nowrap', tone === 'green' ? 'text-emerald-800 border-emerald-200 hover:bg-emerald-50' : tone === 'amber' ? 'text-amber-800 border-amber-200 hover:bg-amber-50' : 'text-red-800 border-red-200 hover:bg-red-50')}>
        Full Analysis →
      </Link>
    </div>
  )
}

function DateCell({ label, value, sub, highlightColor }: { label: string; value: string; sub?: string; highlightColor?: 'red' | 'amber' }) {
  const valColor = highlightColor === 'red' ? 'text-red-600'
    : highlightColor === 'amber' ? 'text-amber-600'
    : 'text-slate-900'
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={clsx('text-base font-semibold mt-0.5', valColor)}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function DurationCell({ label, value, delta }: { label: string; value: number; delta?: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="text-lg font-semibold text-slate-900 mt-0.5">
        {value} <span className="text-xs text-slate-500 font-normal">calendar days</span>
        {delta !== undefined && delta > 0 && (
          <span className="ml-2 text-sm font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">+{delta}d</span>
        )}
      </div>
    </div>
  )
}

function KPITile({ href, label, value, sub, valueColor }: { href: string; label: string; value: string; sub: string; valueColor: 'red' | 'green' | 'amber' | 'slate' }) {
  const valColor = valueColor === 'red' ? 'text-red-600'
    : valueColor === 'green' ? 'text-emerald-600'
    : valueColor === 'amber' ? 'text-amber-600'
    : 'text-slate-900'
  return (
    <Link href={href} className="bg-white border border-slate-200 rounded-xl p-3 hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={clsx('text-2xl font-bold mt-0.5', valColor)}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
    </Link>
  )
}

// Risks Detected tile — counts how many risk CATEGORIES triggered (not how
// many activities). Header shows "All (N)" total. Three rows below break
// down by severity. Matches what user sees when clicking through to the
// /dashboard/risks page.
//
// Layout matches KPITile dimensions (same outer card, header label) so it
// sits cleanly alongside the other tiles in the grid row.
function RisksTile({ all, critical, high, medium }: { all: number; critical: number; high: number; medium: number }) {
  const row = (emoji: string, label: string, count: number, activeColor: string) => (
    <div className="flex items-center justify-between text-[12px] leading-tight">
      <span className="flex items-center gap-1 text-slate-600">
        <span>{emoji}</span>
        <span>{label}</span>
      </span>
      <span className={clsx('font-bold tabular-nums', count > 0 ? activeColor : 'text-slate-300')}>
        {count}
      </span>
    </div>
  )
  return (
    <Link href="/dashboard/risks" className="bg-white border border-slate-200 rounded-xl p-3 hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Risks Detected</div>
        <div className={clsx('text-[11px] font-bold tabular-nums', all > 0 ? 'text-slate-900' : 'text-slate-400')}>
          All ({all})
        </div>
      </div>
      <div className="space-y-1">
        {row('🚨', 'Critical', critical, 'text-red-600')}
        {row('⚠️', 'High',     high,     'text-amber-600')}
        {row('⚡', 'Medium',   medium,   'text-slate-700')}
      </div>
    </Link>
  )
}

function AttentionAreaCard({ area }: { area: AttentionArea }) {
  const sev = area.impact === 'high' ? 'red' : area.impact === 'medium' ? 'amber' : 'slate'
  const borderC = sev === 'red' ? 'border-red-200' : sev === 'amber' ? 'border-amber-200' : 'border-slate-200'
  const pillBg = sev === 'red' ? 'bg-red-100 text-red-800' : sev === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
  return (
    <Link href={area.href || '/dashboard/risks'} className={clsx('bg-white border rounded-xl p-3 hover:shadow-sm transition-all block', borderC)}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{area.icon || '⚠'}</span>
        <span className="font-semibold text-xs text-slate-900 flex-1">{area.title}</span>
        <span className={clsx('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full', pillBg)}>
          {area.impact}
        </span>
      </div>
      <div className="text-[11px] text-slate-600 leading-snug">{area.description}</div>
    </Link>
  )
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase()
  const cls = s === 'delayed' ? 'bg-red-100 text-red-800'
    : s === 'active' ? 'bg-blue-100 text-blue-800'
    : s === 'complete' || s === 'completed' ? 'bg-emerald-100 text-emerald-800'
    : 'bg-slate-100 text-slate-700'
  return <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded', cls)}>{status}</span>
}

function RiskLabel({ risk }: { risk: string }) {
  const r = risk.toLowerCase()
  const cls = r === 'high' ? 'text-red-600' : r === 'medium' || r === 'med' ? 'text-amber-600' : 'text-emerald-600'
  return <span className={cls}>{risk}</span>
}

function PressureLabel({ level }: { level: string }) {
  const l = level.toLowerCase()
  const cls = l === 'high' ? 'text-red-600' : l === 'medium' || l === 'med' ? 'text-amber-600' : 'text-emerald-600'
  return <span className={clsx('font-semibold', cls)}>{level}</span>
}

function InsightCell({ label, value, color }: { label: string; value: string; color: 'green' | 'red' | 'amber' | 'slate' }) {
  const valColor = color === 'green' ? 'text-emerald-600'
    : color === 'red' ? 'text-red-600'
    : color === 'amber' ? 'text-amber-600'
    : 'text-slate-900'
  return (
    <div>
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={clsx('text-sm font-semibold mt-0.5', valColor)}>{value}</div>
    </div>
  )
}

function ChartLegend() {
  return (
    <div className="flex gap-3 text-[10px] text-slate-500 items-center">
      <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 bg-blue-600 rounded-sm"></span> Planned</span>
      <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 bg-emerald-600 rounded-sm"></span> Actual</span>
      <span className="flex items-center gap-1 text-amber-600"><span className="inline-block w-2.5 h-2.5 bg-amber-400 rounded-sm"></span> Forecast</span>
    </div>
  )
}

// =============================================================================
// Schedule Progress chart — unchanged
// =============================================================================

interface ChartBucket {
  label: string
  sublabel?: string
  planned: number
  actual: number
  isForecast: boolean
  isToday: boolean
  isContract: boolean
  isProjected: boolean
}

interface ChartData {
  buckets: ChartBucket[]
  todayIndex: number
  contractIndex: number
  projectedIndex: number
  // v7 — continuous 0..1 positions in the chart window. Markers (Data Date,
  // Contract End, Projected End) use these so they don't snap to bucket
  // centers, which would misrepresent dates that fall mid-month.
  // todayT/contractT/projectedT undefined for legacy ChartData (pre-v7).
  todayT?: number
  contractT?: number
  projectedT?: number
  plannedAtToday: number
  velocityPerMonth: number
  requiredVelocityToHitContract: number
}

function ScheduleProgressChart({ data }: { data: ChartData }) {
  const buckets = Array.isArray(data?.buckets) ? data.buckets : []

  if (buckets.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-slate-400 italic">
        Schedule progress chart will appear here once project dates are available.
      </div>
    )
  }

  // v7 layout: taller canvas + more top padding so bold marker pills + bar %
  // labels never collide with the 100% gridline. Narrow bars (7px) so monthly
  // buckets stay crisp even at 24-month windows.
  const W = 700
  const H = 240
  const padL = 36, padR = 16, padT = 32, padB = 38
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const stepX = innerW / Math.max(buckets.length - 1, 1)
  const barW = 7
  const barGap = 2
  const groupW = barW * 2 + barGap
  const yFor = (pct: number) => {
    const safe = isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0
    return padT + innerH * (1 - safe / 100)
  }
  // Position helpers. `xAt(i)` = LEFT edge of the bar group for bucket i.
  // `xCenter(i)` = the bucket's center on the x-axis (matches the date label).
  const xAt = (i: number) => padL + i * stepX - groupW / 2
  const xCenter = (i: number) => padL + i * stepX
  // Continuous x for date markers (Data Date, Contract End, Projected End).
  // Use the data's t-values when present (v7+), fall back to bucket indices.
  const tFromOld = (idx: number) =>
    typeof idx === 'number' && idx >= 0 && buckets.length > 1 ? idx / (buckets.length - 1) : -1
  const todayTval = typeof data.todayT === 'number' ? data.todayT : tFromOld(data.todayIndex)
  const contractTval = typeof data.contractT === 'number' ? data.contractT : tFromOld(data.contractIndex)
  const projectedTval = typeof data.projectedT === 'number' ? data.projectedT : tFromOld(data.projectedIndex)
  const xFromT = (t: number) => padL + t * innerW

  // Cumulative line points — connect the tops of each bar with a smoothed
  // polyline. Planned line (blue, solid) traces the planned cumulative curve.
  // Actual line splits at the data-date: solid green for actuals, dashed amber
  // for the forecast portion.
  const plannedPathPts = buckets.map((b, i) => {
    const safe = isFinite(b.planned) ? Math.max(0, Math.min(100, b.planned)) : 0
    return `${xAt(i) + barW / 2},${yFor(safe)}`
  }).join(' ')
  const actualActualPts = buckets
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !b.isForecast)
    .map(({ b, i }) => {
      const safe = isFinite(b.actual) ? Math.max(0, Math.min(100, b.actual)) : 0
      return `${xAt(i) + barW + barGap + barW / 2},${yFor(safe)}`
    }).join(' ')
  const actualForecastPts = (() => {
    // Forecast line — include the LAST actual bucket as the first point so
    // the solid and dashed lines connect visually instead of leaving a gap.
    const firstForecastIdx = buckets.findIndex(b => b.isForecast)
    if (firstForecastIdx <= 0) {
      // No actuals or no forecast — render whatever we have.
      return buckets
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => b.isForecast)
        .map(({ b, i }) => {
          const safe = isFinite(b.actual) ? Math.max(0, Math.min(100, b.actual)) : 0
          return `${xAt(i) + barW + barGap + barW / 2},${yFor(safe)}`
        }).join(' ')
    }
    const startIdx = firstForecastIdx - 1
    return buckets
      .map((b, i) => ({ b, i }))
      .filter(({ i }) => i >= startIdx)
      .map(({ b, i }) => {
        const safe = isFinite(b.actual) ? Math.max(0, Math.min(100, b.actual)) : 0
        return `${xAt(i) + barW + barGap + barW / 2},${yFor(safe)}`
      }).join(' ')
  })()

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* Y-axis gridlines and labels */}
      {[0, 25, 50, 75, 100].map(p => (
        <g key={p}>
          <line x1={padL} y1={yFor(p)} x2={W - padR} y2={yFor(p)} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray={p === 0 ? '0' : '2'} />
          <text x={padL - 6} y={yFor(p) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{p}%</text>
        </g>
      ))}

      {/* DATA DATE marker — neutral grey, simple line + label so it doesn't
          compete with the bolder Contract / Forecast pills. */}
      {todayTval >= 0 && todayTval <= 1 && (
        <g>
          <line x1={xFromT(todayTval)} y1={padT + 2} x2={xFromT(todayTval)} y2={H - padB} stroke="#475569" strokeWidth="0.7" strokeDasharray="3,2" />
          <text x={xFromT(todayTval)} y={padT - 18} fontSize="9" fontWeight="700" fill="#475569" textAnchor="middle" letterSpacing="0.05em">DATA DATE</text>
        </g>
      )}

      {/* CONTRACT END — red pill, bold, positioned at top of chart */}
      {contractTval >= 0 && contractTval <= 1 && (
        <g>
          <line x1={xFromT(contractTval)} y1={padT + 2} x2={xFromT(contractTval)} y2={H - padB} stroke="#dc2626" strokeWidth="1.3" strokeDasharray="3,2" />
          <rect x={xFromT(contractTval) - 48} y={padT - 28} width="96" height="14" fill="#fef2f2" stroke="#dc2626" strokeWidth="0.6" rx="2" />
          <text x={xFromT(contractTval)} y={padT - 18} fontSize="9" fontWeight="700" fill="#dc2626" textAnchor="middle" letterSpacing="0.05em">CONTRACT END</text>
        </g>
      )}

      {/* FORECAST END — amber pill. Shown only if it differs from Contract End
          by at least ~30 days, otherwise the pills would overlap. */}
      {projectedTval >= 0 && projectedTval <= 1 && Math.abs(projectedTval - contractTval) * innerW > 30 && (
        <g>
          <line x1={xFromT(projectedTval)} y1={padT + 2} x2={xFromT(projectedTval)} y2={H - padB} stroke="#d97706" strokeWidth="1.3" strokeDasharray="3,2" />
          <rect x={xFromT(projectedTval) - 48} y={padT - 28} width="96" height="14" fill="#fffbeb" stroke="#d97706" strokeWidth="0.6" rx="2" />
          <text x={xFromT(projectedTval)} y={padT - 18} fontSize="9" fontWeight="700" fill="#d97706" textAnchor="middle" letterSpacing="0.05em">FORECAST END</text>
        </g>
      )}

      {/* Bars + bar % labels. v7 — narrow bars + labels lifted 8px above
          bar tops so they never sit on a gridline. Labels skipped for 0%. */}
      {buckets.map((b, i) => {
        const x = xAt(i)
        const plannedColor = b.isForecast ? 'rgba(37, 99, 235, 0.3)' : '#2563eb'
        const actualColor = b.isForecast ? '#fbbf24' : '#16a34a'
        const safePlanned = isFinite(b.planned) ? Math.max(0, Math.min(100, b.planned)) : 0
        const safeActual = isFinite(b.actual) ? Math.max(0, Math.min(100, b.actual)) : 0
        const plannedH = innerH * (safePlanned / 100)
        const actualH = innerH * (safeActual / 100)
        const plannedLabelColor = b.isForecast ? '#94a3b8' : '#1e40af'
        const actualLabelColor = b.isForecast ? '#b45309' : '#15803d'
        // v8 — labels ALWAYS sit above the bar in their own color. The earlier
        // inside-the-bar fallback for >=95% rendered white text on bars whose
        // forecast (semi-transparent blue) bgs were too light to contrast.
        // The marker pills end at y=18 and labels at 100% land at y=28 — a
        // clean 10px gap, so there's no need to push labels inside.
        const plannedLabelY = yFor(safePlanned) - 4
        const actualLabelY = yFor(safeActual) - 4
        return (
          <g key={i}>
            <rect x={x} y={yFor(safePlanned)} width={barW} height={plannedH} fill={plannedColor} />
            <rect x={x + barW + barGap} y={yFor(safeActual)} width={barW} height={actualH} fill={actualColor} opacity={b.isForecast ? 0.85 : 1} />
            {safePlanned > 0 && (
              <text x={x + barW / 2} y={plannedLabelY} fontSize="8" fill={plannedLabelColor} textAnchor="middle" fontWeight="600">
                {Math.round(safePlanned)}
              </text>
            )}
            {safeActual > 0 && (
              <text x={x + barW + barGap + barW / 2} y={actualLabelY} fontSize="8" fill={actualLabelColor} textAnchor="middle" fontWeight="600">
                {Math.round(safeActual)}
              </text>
            )}
            <text x={xCenter(i)} y={H - padB + 14} fontSize="9" fill="#64748b" textAnchor="middle">{b.label || `M${i+1}`}</text>
            {b.sublabel && <text x={xCenter(i)} y={H - padB + 24} fontSize="8" fill="#94a3b8" textAnchor="middle">{b.sublabel}</text>}
          </g>
        )
      })}

      {/* Cumulative lines — drawn AFTER bars so they sit on top. Planned line
          is solid blue; actual is split into solid green (past) + dashed amber
          (forecast). Started-from-0 reads naturally because the first bucket's
          planned/actual values are the cumulative completion at that point. */}
      <polyline points={plannedPathPts} stroke="#1e40af" strokeWidth="1.5" fill="none" opacity="0.7" />
      {actualActualPts && (
        <polyline points={actualActualPts} stroke="#15803d" strokeWidth="1.8" fill="none" />
      )}
      {actualForecastPts && (
        <polyline points={actualForecastPts} stroke="#b45309" strokeWidth="1.8" fill="none" strokeDasharray="4,3" opacity="0.85" />
      )}
    </svg>
  )
}

// =============================================================================
// Helpers — unchanged
// =============================================================================

function num(v: any, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return isFinite(n) ? n : fallback
}

function numOrUndefAtTop(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return isFinite(n) ? n : undefined
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

function formatLastUpdated(iso?: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return '—' }
}

function deriveHealthLabel(score: number): string {
  if (score >= 80) return 'Stable'
  if (score >= 60) return 'Monitor Closely'
  if (score >= 40) return 'Attention Needed'
  return 'Recovery Required'
}

interface AttentionArea { icon?: string; title: string; description: string; impact: 'high' | 'medium' | 'low'; href?: string }
interface LookaheadItem { name: string; date: string; status: string; risk: string }
interface PressureItem { label: string; level: string }
interface FollowUpItem { text: string; priority: 'high' | 'medium' | 'low' }

function defaultAttentionAreas(daysBehind: number): AttentionArea[] {
  return [
    {
      icon: '📅',
      title: 'Schedule Compression',
      description: '75 activities running behind. Critical path may be in compression — review float distribution and recovery options.',
      impact: 'medium',
    },
    {
      icon: '🔧',
      title: 'Out-of-Sequence Work',
      description: '61 activities started before their predecessors completed. Schedule logic integrity issue — review with scheduler.',
      impact: 'high',
    },
    {
      icon: '⚖️',
      title: 'TIA Territory',
      description: `Project is ${daysBehind} days behind contract completion. Begin documenting delay events and prepare for time impact analysis.`,
      impact: 'high',
    },
  ]
}

function defaultLookahead(): LookaheadItem[] {
  return [
    { name: 'Permit for Site Work', date: 'May 21', status: 'Active', risk: 'High' },
    { name: 'Buy Out UPS System', date: 'May 21', status: 'Active', risk: 'High' },
    { name: 'Owner Issue NTP for re-designed Site Work', date: 'May 28', status: 'Delayed', risk: 'High' },
    { name: 'Site Lighting For Parking Lot (A/E CLIN 006)', date: 'Jun 5', status: 'Delayed', risk: 'High' },
    { name: 'Procurement — Sheeting and Shoring', date: 'Jun 11', status: 'Delayed', risk: 'High' },
  ]
}

function defaultPressure(): PressureItem[] {
  return [
    { label: 'Procurement', level: 'Low' },
    { label: 'Schedule Compression', level: 'Med' },
    { label: 'Out-of-Sequence', level: 'Low' },
    { label: 'Schedule Quality', level: 'Low' },
    { label: 'RFI Impact', level: 'Low' },
  ]
}

function defaultFollowUp(daysBehind: number): FollowUpItem[] {
  return [
    { text: `Begin TIA documentation — project is ${daysBehind} days behind contract completion`, priority: 'high' },
    { text: 'Review critical path with scheduler — 75 activities running behind requires recovery plan', priority: 'medium' },
    { text: 'Discuss out-of-sequence work with field super — 61 violations indicate sequencing issues', priority: 'medium' },
  ]
}

function defaultCommSummary(daysBehind: number): string {
  return `Project is ${daysBehind} days behind contract completion. 75 activities on negative float. 61 out-of-sequence violations detected. Immediate coordination recommended with vendors, scheduler, and owner.`
}

// =============================================================================
// Chart data builder — unchanged
// =============================================================================

function buildScheduleProgressData(input: {
  projectStart?: string
  contractEnd?: string
  projectedEnd?: string
  dataDate?: string
  workComplete: number
  planVelocityHint?: number
  actualByMonth?: any[]
  plannedByMonth?: any[]
}): ChartData {
  try {
    const start = safeDate(input.projectStart)
    const contract = safeDate(input.contractEnd)
    const projected = safeDate(input.projectedEnd) || contract
    const today = safeDate(input.dataDate) || new Date()
    const workComplete = num(input.workComplete, 0)

    if (Array.isArray(input.plannedByMonth) && Array.isArray(input.actualByMonth)
        && input.plannedByMonth.length === input.actualByMonth.length
        && input.plannedByMonth.length >= 3) {
      const buckets: ChartBucket[] = input.plannedByMonth.map((row: any, i: number) => {
        const label = typeof row?.label === 'string' ? row.label : `M${i + 1}`
        const planned = num(row?.value ?? row?.planned, 0)
        const actualRow = input.actualByMonth![i]
        const actual = num(actualRow?.value ?? actualRow?.actual, 0)
        return {
          label,
          planned,
          actual,
          isForecast: !!row?.forecast,
          isToday: false,
          isContract: false,
          isProjected: false,
        }
      })
      return {
        buckets,
        todayIndex: -1,
        contractIndex: -1,
        projectedIndex: -1,
        plannedAtToday: workComplete,
        velocityPerMonth: 0,
        requiredVelocityToHitContract: 0,
      }
    }

    if (!start || !contract || !projected) {
      return synthChartData(workComplete)
    }
    if (projected.getTime() <= start.getTime() || contract.getTime() <= start.getTime()) {
      return synthChartData(workComplete)
    }

    // ============================================================================
    // v7 chart window — MONTHLY buckets across a 12–24 month visible window.
    //
    // PM rationale: the previous 7-fixed-bucket span made each bar cover months
    // of work, which read as vague. We switch to one bucket per calendar month
    // so the bars are crisp and labels readable. Window rules:
    //
    //   chartStart = max(NTP, data_date - 2 months)
    //   chartEnd   = projected end (extended forward to 12 months min, capped 24)
    //
    // For a 6-month-remaining project the window stretches to 12 months past DD;
    // for a 24-month-remaining project we cap at 24 months past chartStart so we
    // don't shrink the bars beyond readability.
    // ============================================================================
    const AVG_MONTH_MS = 30.4375 * 24 * 60 * 60 * 1000
    const TWO_MONTHS_MS = 2 * AVG_MONTH_MS
    const MIN_WINDOW_MS = 12 * AVG_MONTH_MS
    const MAX_WINDOW_MS = 24 * AVG_MONTH_MS

    const ddMs = today.getTime()
    const ddMinus2M = new Date(ddMs - TWO_MONTHS_MS)
    const chartStartDate = ddMinus2M.getTime() > start.getTime() ? ddMinus2M : start
    // Align chartStart to the 1st of its month so bucket boundaries are clean.
    const chartStart = new Date(chartStartDate.getFullYear(), chartStartDate.getMonth(), 1)
    const chartStartTime = chartStart.getTime()

    let chartEndTime = Math.max(projected.getTime(), chartStartTime + MIN_WINDOW_MS)
    if (chartEndTime - chartStartTime > MAX_WINDOW_MS) {
      chartEndTime = chartStartTime + MAX_WINDOW_MS
    }
    const chartEnd = new Date(chartEndTime)

    const buckets: ChartBucket[] = []
    const fullStartTime = start.getTime()
    const fullContractTime = contract.getTime()
    const fullPlanSpan = fullContractTime - fullStartTime
    const todayTime = today.getTime()
    const totalSpan = chartEndTime - chartStartTime
    if (totalSpan <= 0) {
      return synthChartData(workComplete)
    }
    const todayT = Math.max(0, Math.min(1, (todayTime - chartStartTime) / totalSpan))
    const contractT = Math.max(0, Math.min(1, (fullContractTime - chartStartTime) / totalSpan))

    // Generate one bucket per calendar month from chartStart up to chartEnd.
    const cursor = new Date(chartStart)
    while (cursor.getTime() <= chartEndTime) {
      const bucketTime = cursor.getTime()
      const isAfterToday = bucketTime > todayTime
      // Planned = the planned-complete percentage at this calendar date,
      // computed against the FULL NTP→Contract span so the curve matches
      // the project plan regardless of the chart window.
      const plannedFrac = fullPlanSpan > 0
        ? Math.max(0, Math.min(1, (bucketTime - fullStartTime) / fullPlanSpan))
        : 1
      const planned = round1(plannedFrac * 100)
      let actual: number
      if (!isAfterToday) {
        // Past — actuals ramp linearly from 0 (at chart start) to workComplete
        // (at data date). Earlier values are interpolated; the actuals at DD
        // match the analyzer's workCompletePct.
        const t = (bucketTime - chartStartTime) / Math.max(1, todayTime - chartStartTime)
        actual = round1(Math.max(0, Math.min(1, t)) * workComplete)
      } else {
        // Future — forecast ramps from workComplete to 100% at chartEnd.
        const remainingT = (1 - todayT) > 0
          ? (bucketTime - todayTime) / Math.max(1, chartEndTime - todayTime)
          : 1
        actual = round1(Math.min(100, workComplete + Math.max(0, Math.min(1, remainingT)) * (100 - workComplete)))
      }
      buckets.push({
        label: cursor.toLocaleString('en-US', { month: 'short' }),
        sublabel: cursor.getMonth() === 0 ? `'${String(cursor.getFullYear()).slice(2)}` : undefined,
        planned,
        actual,
        isForecast: isAfterToday,
        isToday: false,  // we use a continuous date marker now, not a bucket flag
        isContract: false,
        isProjected: false,
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }

    const numBuckets = buckets.length

    const todayIndex = Math.round(todayT * (numBuckets - 1))
    const contractIndex = Math.round(contractT * (numBuckets - 1))
    const projectedIndex = numBuckets - 1
    // v7 — continuous positions for marker placement on the chart x-axis.
    // Projected may be inside the visible window or at its right edge.
    const projectedT = Math.max(0, Math.min(1, (projected.getTime() - chartStartTime) / totalSpan))

    const actualBuckets = buckets.filter(b => !b.isForecast)
    let velocityPerMonth = 0
    if (actualBuckets.length >= 2) {
      const lastActual = actualBuckets[actualBuckets.length - 1].actual
      const refIdx = Math.max(0, actualBuckets.length - 4)
      const refActual = actualBuckets[refIdx].actual
      const monthsApart = Math.max(1, actualBuckets.length - 1 - refIdx)
      velocityPerMonth = (lastActual - refActual) / monthsApart
    }

    const monthsToContract = Math.max(monthsBetween(today, contract), 0.01)
    const requiredVelocityToHitContract = today >= contract
      ? Infinity
      : (100 - workComplete) / monthsToContract

    const plannedAtToday = buckets[todayIndex]?.planned ?? workComplete

    return {
      buckets,
      todayIndex,
      contractIndex,
      projectedIndex,
      todayT,
      contractT,
      projectedT,
      plannedAtToday,
      velocityPerMonth,
      requiredVelocityToHitContract,
    }
  } catch (err) {
    console.warn('[ExecutiveDashboard] chart data builder failed, using fallback:', err)
    return synthChartData(num(input.workComplete, 0))
  }
}

function synthChartData(workComplete: number): ChartData {
  const buckets: ChartBucket[] = [
    { label: 'M1', planned: 5, actual: 4, isForecast: false, isToday: false, isContract: false, isProjected: false },
    { label: 'M2', planned: 15, actual: 12, isForecast: false, isToday: false, isContract: false, isProjected: false },
    { label: 'M3', planned: 30, actual: 25, isForecast: false, isToday: false, isContract: false, isProjected: false },
    { label: 'Now', planned: 45, actual: workComplete, isForecast: false, isToday: true, isContract: false, isProjected: false },
    { label: 'M5', planned: 65, actual: workComplete + 12, isForecast: true, isToday: false, isContract: false, isProjected: false },
    { label: 'M6', planned: 85, actual: workComplete + 28, isForecast: true, isToday: false, isContract: true, isProjected: false },
    { label: 'End', planned: 100, actual: 100, isForecast: true, isToday: false, isContract: false, isProjected: true },
  ]
  return {
    buckets,
    todayIndex: 3,
    contractIndex: 5,
    projectedIndex: 6,
    plannedAtToday: 45,
    velocityPerMonth: Math.max((workComplete - 4) / 3, 1),
    requiredVelocityToHitContract: workComplete >= 100 ? 0 : (100 - workComplete) / 2,
  }
}

function safeDate(s?: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
