'use client'
import { useState, useEffect, useMemo, Component, ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import {
  getActiveProject, getActiveVersion, getLatestVersion,
  subscribeToProjects, loadProjects,
  Project, ScheduleVersion,
} from '@/lib/projectStore'

// =============================================================================
// Executive Dashboard — main /dashboard page.
//
// Renders 7 sections in this order:
//   1. Header bar (project, XER, last updated, action buttons)
//   2. Health status banner (color-coded by score)
//   3. Key Dates & Durations (6 date cells + 3 duration cells)
//   4. KPI tiles (4 metrics, clickable to detail pages)
//   5. Schedule Progress chart (NEW — planned vs actual + forecast)
//   6. Immediate Attention Areas (up to 3 risk cards)
//   7. 2 Weeks Lookahead (milestone table)
//   8. Bottom row: Operational Pressure | Follow-Up | Communication
//
// All data reads from activeVersion.analysis with safe fallbacks so the
// dashboard still renders gracefully when fields are missing or null.
// =============================================================================

export default function ExecutiveDashboard() {
  return (
    <ErrorBoundary>
      <ExecutiveDashboardInner />
    </ErrorBoundary>
  )
}

// Inline error boundary — catches any render error in the dashboard
// and shows a friendly fallback instead of crashing the whole app.
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

  // Empty state when no project is loaded
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

  // Delegate to DashboardContent so its hooks (useMemo) only run when project/version exist.
  // This avoids React error #310 ("rendered more hooks than during the previous render")
  // which happens when hooks are conditionally called past an early return.
  return <DashboardContent project={project} version={version} />
}

// =============================================================================
// DashboardContent — only renders when project + version are loaded.
// All hooks here run on EVERY render of this component (no conditional hooks).
// =============================================================================
function DashboardContent({ project, version }: { project: Project; version: ScheduleVersion }) {
  const a = version.analysis || {}

  // --------- safe field reads (all optional, sensible fallbacks) ----------
  const xerFile = version.fileName || 'schedule.xer'
  const versionLabel = version.versionLabel || 'CU-01'
  const lastUpdated = formatLastUpdated(version.uploadedAt)

  const healthScore = num(a.healthScore, 65)
  const healthLabel = a.healthLabel || a.condition || deriveHealthLabel(healthScore)
  const healthNarrative = a.healthNarrative || a.aiSummary
    || 'Project metrics are being assessed. Detailed health insights will appear here as the schedule is analyzed.'

  const dataDate = a.dataDate || a.data_date || version.dataDate || version.uploadedAt
  const projectStart = a.projectStart || a.project_start || a.ntp || a.ntpDate || dataDate

  // Try direct fields first, then fall back to scanning the milestones array
  // by common milestone codes (MILE-195 = substantial, MILE-200 = final, etc.)
  // and by name keywords. This handles different XER analysis output shapes.
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

  // Federal contract schedules use various milestone code patterns for
  // Substantial / Final Completion. Try common variants:
  //   - MILE-195 / MS-195 / 195 (Primavera convention for substantial)
  //   - BCD (Beneficial Occupancy Date), SUB, M-SUB, ASB, BO (federal common)
  //   - TCO (Temporary Certificate of Occupancy) — close enough to substantial
  //   - 100 (sometimes used as the substantial completion code)
  const substMilestoneObj = findMilestone(
    ['MILE-195', 'MS-195', '195', 'BCD', 'SUB', 'M-SUB', 'ASB', 'BO', 'TCO', '100'],
    ['substantial', 'subst comp', 'sub completion', 'beneficial occupancy', 'beneficial occup', 'bo date', 'temp occupancy', 'temporary occupancy']
  )
  const finalMilestoneObj = findMilestone(
    ['MILE-200', 'MS-200', '200', 'FC', 'M-FC', 'PCD', '999'],
    ['final completion', 'final compl', 'project finish', 'project close', 'closeout', 'project completion', 'punch list complete']
  )

  // Resolve dates in order so finalCompletion can fall back to projectedEnd.
  // Per the user's mental model: Final Completion = the projected end of the
  // project. They're the same milestone in practice.
  const contractEnd = a.contractEnd || a.contract_end || a.contractFinish || a.contract_finish || a.contractCompletion
  const projectedEnd = a.projectedEnd || a.projected_end || a.forecastFinish || a.forecast_finish || a.projectedFinish || contractEnd
  const finalCompletion = a.finalCompletion || a.final_completion || a.projectFinish || a.project_finish || a.finalComp || findMilestoneDate(finalMilestoneObj) || projectedEnd
  const substantialCompletion = a.substantialCompletion || a.substantial_completion || a.substComp || a.subComp || a.substantialComp || a.substCompletion || findMilestoneDate(substMilestoneObj)

  const ntpMilestone = a.ntpMilestone || 'NTP'
  const substMilestone = a.substMilestone || (substMilestoneObj?.code || substMilestoneObj?.id || '')
  const finalMilestone = a.finalMilestone || (finalMilestoneObj?.code || finalMilestoneObj?.id || '')

  // Durations — compute from dates FIRST (truthful calendar-day count).
  // The analyzer's field value is unreliable (it can be in wrong units,
  // refer to a sub-window, or be plain wrong). Use it only as fallback
  // when dates aren't available.
  const daysBetween = (start?: string, end?: string): number | undefined => {
    if (!start || !end) return undefined
    const s = new Date(start)
    const e = new Date(end)
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return undefined
    const sUTC = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate())
    const eUTC = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate())
    // +1 makes this inclusive: both start and end days are counted.
    return Math.max(0, Math.round((eUTC - sUTC) / (1000 * 60 * 60 * 24))) + 1
  }
  // Original Duration = NTP → Contract End (inclusive, calendar days)
  const originalDurationComputed = daysBetween(projectStart, contractEnd)
  const originalDurationField = numOrUndefAtTop(
    a.originalDuration ?? a.original_duration ??
    a.targetDuration ?? a.target_duration ??
    a.plannedDuration ?? a.planned_duration ??
    a.baselineDuration ?? a.baseline_duration ??
    a.contractDuration ?? a.contract_duration
  )
  const originalDuration = originalDurationComputed ?? originalDurationField ?? 0
  // Remaining Duration = Data Date → Projected End (inclusive)
  const remainingDurationComputed = daysBetween(dataDate, projectedEnd)
  const remainingDurationField = numOrUndefAtTop(
    a.remainingDuration ?? a.remaining_duration ??
    a.atCompletionRemainingDuration
  )
  const remainingDuration = remainingDurationComputed ?? remainingDurationField ?? 0
  const hasOriginalDuration = originalDurationComputed !== undefined || originalDurationField !== undefined

  // Days behind — if analysis didn't store it, compute from contractEnd vs projectedEnd.
  // Normalize to date-only so time-of-day / timezone parsing differences don't
  // produce phantom +1 day diffs when the dates are actually the same calendar day.
  let daysBehind: number | undefined = numOrUndefAtTop(a.daysBehind ?? a.days_behind ?? a.behindContract)
  if (daysBehind === undefined && contractEnd && projectedEnd) {
    const cD = new Date(contractEnd)
    const pD = new Date(projectedEnd)
    if (!isNaN(cD.getTime()) && !isNaN(pD.getTime())) {
      const cUTC = Date.UTC(cD.getFullYear(), cD.getMonth(), cD.getDate())
      const pUTC = Date.UTC(pD.getFullYear(), pD.getMonth(), pD.getDate())
      daysBehind = Math.round((pUTC - cUTC) / (1000 * 60 * 60 * 24))
    }
  }
  const daysBehindNum = daysBehind ?? 0
  const hasDaysBehind = daysBehind !== undefined

  // Duration at Completion = NTP → Projected End (inclusive)
  const durationAtCompletionComputed = daysBetween(projectStart, projectedEnd)
  const durationAtCompletionField = numOrUndefAtTop(
    a.durationAtCompletion ?? a.duration_at_completion ??
    a.atCompletionDuration ?? a.at_completion_duration
  )
  const durationAtCompletion = durationAtCompletionComputed ?? durationAtCompletionField ?? (originalDuration + daysBehindNum)

  // Work complete — try many field variants, then compute from activities.
  // Final fallback: time-based progress (where the project is on its timeline)
  // so the Schedule Progress insights show something instead of "—".
  let workComplete: number | undefined = numOrUndefAtTop(
    a.workComplete ?? a.percentComplete ?? a.percent_complete ??
    a.physicalPercentComplete ?? a.physical_percent_complete ??
    a.durationPercentComplete ?? a.duration_percent_complete ??
    a.percentDone ?? a.percent_done ?? a.progress ??
    a.pctComplete ?? a.pct_complete ?? a.completion
  )
  const completedActivities = numOrUndefAtTop(a.completedActivities ?? a.completed_activities ?? a.completed ?? a.completedCount)
  const totalActivities = num(a.totalActivities ?? a.total_activities ?? a.activityCount ?? a.activity_count, 0)
  if (workComplete === undefined && completedActivities !== undefined && totalActivities > 0) {
    workComplete = (completedActivities / totalActivities) * 100
  }
  // Time-based fallback: how far along is the project in elapsed time?
  // Not "real" work-complete (which needs activity progress from the XER), but
  // gives the chart and insights useful values instead of "—" until the analysis
  // pipeline outputs real progress data.
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

  const longLeadAtRisk = num(a.longLeadAtRisk, 0)
  const longLeadTotal = num(a.longLeadTotal, 0)
  const hasLongLeadData = a.longLeadTotal !== undefined
  const risksDetected = num(a.risksDetected ?? a.risksCount, 0)
  const criticalRisks = num(a.criticalRisks, 0)
  const hasRiskData = a.risksDetected !== undefined || a.risksCount !== undefined

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
  // Computes a 7-bucket monthly chart from project start → forecast end.
  // Uses analysis values where present; otherwise interpolates a plausible
  // planned vs actual progression matching workComplete at the data date.
  const chartData = useMemo(
    () => buildScheduleProgressData({
      projectStart,
      contractEnd,
      projectedEnd,
      dataDate,
      workComplete: workCompleteNum,
      planVelocityHint: a.plannedVelocity,
      actualByMonth: a.actualByMonth,
      plannedByMonth: a.plannedByMonth,
    }),
    [projectStart, contractEnd, projectedEnd, dataDate, workCompleteNum, a.plannedVelocity, a.actualByMonth, a.plannedByMonth]
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Last updated: {lastUpdated}</span>
          <Link href="/dashboard/lens" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md flex items-center gap-1.5">
            🔍 Full Analysis
          </Link>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DateCell label="Data Date" value={fmtDate(dataDate)} sub="As of XER upload" />
            <DateCell label="Project Start / NTP" value={fmtDate(projectStart)} sub={ntpMilestone ? `NTP Milestone (${ntpMilestone})` : ''} />
            <DateCell label="Substantial Completion" value={fmtDate(substantialCompletion)} sub={substMilestone} />

            <DateCell label="Final Completion" value={fmtDate(finalCompletion)} sub={finalMilestone} />
            <DateCell label="Contract End" value={fmtDate(contractEnd)} sub="Per contract" highlightColor="red" />
            <DateCell label="Projected End" value={fmtDate(projectedEnd)} sub="Per current schedule" highlightColor="amber" />
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
            <DurationCell label="Original Duration" value={originalDuration} />
            <DurationCell label="Remaining Duration" value={remainingDuration} />
            <DurationCell label="Duration at Completion" value={durationAtCompletion} delta={daysBehindNum} />
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
              completedActivities !== undefined
                ? `${completedActivities.toLocaleString()} of ${totalActivities.toLocaleString()} activities`
                : totalActivities > 0 ? `${totalActivities.toLocaleString()} activities total` : 'Computed'
            }
            valueColor="slate"
          />
          <KPITile
            href="/dashboard/procurement"
            label="Long Lead at Risk"
            value={String(longLeadAtRisk)}
            sub={longLeadAtRisk === 0 ? `✓ ${longLeadTotal} long lead total` : `of ${longLeadTotal} long lead`}
            valueColor={longLeadAtRisk === 0 ? 'green' : 'red'}
          />
          <KPITile
            href="/dashboard/risks"
            label="Risks Detected"
            value={String(risksDetected)}
            sub={risksDetected === 0 ? 'Auto-detected · none flagged' : (criticalRisks > 0 ? `${criticalRisks} critical` : 'Auto-detected')}
            valueColor={risksDetected === 0 ? 'green' : (criticalRisks > 0 ? 'red' : 'amber')}
          />
        </div>

        {/* SECTION 4: Schedule Progress chart (NEW) */}
        <Card>
          <div className="flex items-start justify-between mb-3">
            <div>
              <SectionTitle>Schedule Progress</SectionTitle>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Planned vs Actual completion · Contract end <span className="text-red-600 font-semibold">{fmtDate(contractEnd)}</span>
                {' · Projected '}<span className="text-amber-600 font-semibold">{fmtDate(projectedEnd)}{daysBehindNum > 0 ? ` (+${daysBehindNum}d)` : ''}</span>
              </div>
            </div>
            <ChartLegend />
          </div>
          <ScheduleProgressChart data={chartData} />
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
          {/* Operational Pressure */}
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
          {/* Recommended Follow-Up */}
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
          {/* Communication Summary */}
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
// Sub-components
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
// Schedule Progress chart — SVG-based, monthly buckets, with markers
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
  plannedAtToday: number
  velocityPerMonth: number
  requiredVelocityToHitContract: number
}

function ScheduleProgressChart({ data }: { data: ChartData }) {
  const buckets = Array.isArray(data?.buckets) ? data.buckets : []
  const todayIndex = typeof data?.todayIndex === 'number' ? data.todayIndex : -1
  const contractIndex = typeof data?.contractIndex === 'number' ? data.contractIndex : -1
  const projectedIndex = typeof data?.projectedIndex === 'number' ? data.projectedIndex : -1

  if (buckets.length === 0) {
    return (
      <div className="text-center py-8 text-xs text-slate-400 italic">
        Schedule progress chart will appear here once project dates are available.
      </div>
    )
  }

  const W = 700
  const H = 200
  const padL = 36, padR = 16, padT = 18, padB = 38
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const stepX = innerW / Math.max(buckets.length - 1, 1)
  const barW = 12
  const groupW = barW * 2 + 4
  const yFor = (pct: number) => {
    const safe = isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0
    return padT + innerH * (1 - safe / 100)
  }
  const xAt = (i: number) => padL + i * stepX - groupW / 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* gridlines */}
      {[0, 25, 50, 75, 100].map(p => (
        <g key={p}>
          <line x1={padL} y1={yFor(p)} x2={W - padR} y2={yFor(p)} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray={p === 0 ? '0' : '2'} />
          <text x={padL - 6} y={yFor(p) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{p}%</text>
        </g>
      ))}
      {/* markers */}
      {todayIndex >= 0 && todayIndex < buckets.length && (
        <g>
          <line x1={padL + todayIndex * stepX} y1={padT} x2={padL + todayIndex * stepX} y2={H - padB} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2,2" />
          <text x={padL + todayIndex * stepX} y={padT - 4} fontSize="8" fill="#94a3b8" textAnchor="middle">Today</text>
        </g>
      )}
      {contractIndex >= 0 && contractIndex < buckets.length && (
        <g>
          <line x1={padL + contractIndex * stepX} y1={padT} x2={padL + contractIndex * stepX} y2={H - padB} stroke="#dc2626" strokeWidth="1" strokeDasharray="3,2" />
          <text x={padL + contractIndex * stepX} y={padT - 4} fontSize="9" fill="#dc2626" textAnchor="middle" fontWeight="600">Contract End</text>
        </g>
      )}
      {projectedIndex >= 0 && projectedIndex < buckets.length && projectedIndex !== contractIndex && (
        <g>
          <line x1={padL + projectedIndex * stepX} y1={padT} x2={padL + projectedIndex * stepX} y2={H - padB} stroke="#d97706" strokeWidth="1" strokeDasharray="3,2" />
          <text x={padL + projectedIndex * stepX} y={padT - 4} fontSize="9" fill="#d97706" textAnchor="middle" fontWeight="600">Forecast End</text>
        </g>
      )}
      {/* bars */}
      {buckets.map((b, i) => {
        const x = xAt(i)
        const plannedColor = b.isForecast ? 'rgba(37, 99, 235, 0.3)' : '#2563eb'
        const actualColor = b.isForecast ? '#fbbf24' : '#16a34a'
        const safePlanned = isFinite(b.planned) ? Math.max(0, Math.min(100, b.planned)) : 0
        const safeActual = isFinite(b.actual) ? Math.max(0, Math.min(100, b.actual)) : 0
        const plannedH = innerH * (safePlanned / 100)
        const actualH = innerH * (safeActual / 100)
        return (
          <g key={i}>
            <rect x={x} y={yFor(safePlanned)} width={barW} height={plannedH} fill={plannedColor} />
            <rect x={x + barW + 4} y={yFor(safeActual)} width={barW} height={actualH} fill={actualColor} opacity={b.isForecast ? 0.85 : 1} />
            <text x={padL + i * stepX} y={H - padB + 14} fontSize="9" fill={b.isToday ? '#0f172a' : '#64748b'} textAnchor="middle" fontWeight={b.isToday ? '600' : '400'}>{b.label || `M${i+1}`}</text>
            {b.sublabel && <text x={padL + i * stepX} y={H - padB + 24} fontSize="8" fill="#94a3b8" textAnchor="middle">{b.sublabel}</text>}
          </g>
        )
      })}
    </svg>
  )
}

// =============================================================================
// Helpers
// =============================================================================

function num(v: any, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return isFinite(n) ? n : fallback
}

// Returns the parsed number when v is a finite number-or-string, else undefined.
// Use when "no data" needs to be distinguishable from 0.
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
    // MM/DD/YYYY format
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
// Chart data builder
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

    // If both planned and actual time series are provided, use them directly.
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

    // Otherwise — compute a plausible monthly progression
    if (!start || !contract || !projected) {
      return synthChartData(workComplete)
    }

    // Sanity check: projected must be > start, contract should be > start
    if (projected.getTime() <= start.getTime() || contract.getTime() <= start.getTime()) {
      return synthChartData(workComplete)
    }

    const numBuckets = 7
    const buckets: ChartBucket[] = []
    const startTime = start.getTime()
    const projectedTime = projected.getTime()
    const totalSpan = projectedTime - startTime
    const todayT = totalSpan > 0 ? Math.max(0, Math.min(1, (today.getTime() - startTime) / totalSpan)) : 0.5
    const contractT = totalSpan > 0 ? Math.max(0, Math.min(1, (contract.getTime() - startTime) / totalSpan)) : 0.8

    for (let i = 0; i < numBuckets; i++) {
      const t = i / (numBuckets - 1)
      const bucketDate = new Date(startTime + t * totalSpan)
      const isAfterToday = t > todayT
      const isToday = i > 0 && (todayT >= (i - 1) / (numBuckets - 1)) && (todayT <= i / (numBuckets - 1))

      // Planned curve: linear from 0% at start to 100% at contractT
      const localPlannedT = contractT > 0 ? Math.min(1, t / contractT) : 1
      const planned = round1(localPlannedT * 100)

      // Actual: linear from 0 to workComplete at todayT; forecast linear from workComplete to 100% at projected end
      let actual: number
      if (!isAfterToday) {
        const localActT = todayT > 0 ? Math.min(1, t / todayT) : 0
        actual = round1(localActT * workComplete)
      } else {
        const remainingT = (1 - todayT) > 0 ? (t - todayT) / (1 - todayT) : 1
        actual = round1(Math.min(100, workComplete + remainingT * (100 - workComplete)))
      }

      buckets.push({
        label: bucketDate.toLocaleString('en-US', { month: 'short' }),
        sublabel: t === 0 ? `'${String(bucketDate.getFullYear()).slice(2)}` : undefined,
        planned,
        actual,
        isForecast: isAfterToday,
        isToday,
        isContract: false,
        isProjected: i === numBuckets - 1,
      })
    }

    const todayIndex = Math.round(todayT * (numBuckets - 1))
    const contractIndex = Math.round(contractT * (numBuckets - 1))
    const projectedIndex = numBuckets - 1

    // Velocity (compare last actual bucket to one ~3 buckets back)
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
      plannedAtToday,
      velocityPerMonth,
      requiredVelocityToHitContract,
    }
  } catch (err) {
    // Any unexpected math/date issue — fall back to synthetic data so the
    // dashboard still renders. The error gets logged for debugging.
    console.warn('[ExecutiveDashboard] chart data builder failed, using fallback:', err)
    return synthChartData(num(input.workComplete, 0))
  }
}

function synthChartData(workComplete: number): ChartData {
  // Fallback synthetic data when dates are not available
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
function findIndexClosest(buckets: ChartBucket[], start: Date, end: Date, target: Date): number {
  if (target <= start) return 0
  if (target >= end) return buckets.length - 1
  const t = (target.getTime() - start.getTime()) / (end.getTime() - start.getTime())
  return Math.round(t * (buckets.length - 1))
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}
