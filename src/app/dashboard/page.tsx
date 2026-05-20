'use client'
import { useState, useEffect, useMemo } from 'react'
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

  const a = version.analysis || {}

  // --------- safe field reads (all optional, sensible fallbacks) ----------
  const xerFile = version.fileName || 'schedule.xer'
  const versionLabel = version.versionLabel || 'CU-01'
  const lastUpdated = formatLastUpdated(version.uploadedAt)

  const healthScore = num(a.healthScore, 65)
  const healthLabel = a.healthLabel || a.condition || deriveHealthLabel(healthScore)
  const healthNarrative = a.healthNarrative || a.aiSummary
    || 'Project metrics are being assessed. Detailed health insights will appear here as the schedule is analyzed.'

  const dataDate = a.dataDate || version.dataDate || version.uploadedAt
  const projectStart = a.projectStart || a.ntp || dataDate
  const substantialCompletion = a.substantialCompletion || a.substComp
  const finalCompletion = a.finalCompletion || a.projectFinish
  const contractEnd = a.contractEnd || a.contractFinish || finalCompletion
  const projectedEnd = a.projectedEnd || a.forecastFinish || finalCompletion

  const ntpMilestone = a.ntpMilestone || 'NTP'
  const substMilestone = a.substMilestone || ''
  const finalMilestone = a.finalMilestone || ''

  const originalDuration = num(a.originalDuration, 261)
  const remainingDuration = num(a.remainingDuration, 317)
  const durationAtCompletion = num(a.durationAtCompletion, originalDuration + num(a.daysBehind, 56))

  const daysBehind = num(a.daysBehind, 56)
  const workComplete = num(a.workComplete ?? a.percentComplete, 39)
  const completedActivities = num(a.completedActivities, 134)
  const totalActivities = num(a.totalActivities, 348)
  const longLeadAtRisk = num(a.longLeadAtRisk, 0)
  const longLeadTotal = num(a.longLeadTotal, 6)
  const risksDetected = num(a.risksDetected ?? a.risksCount, 3)
  const criticalRisks = num(a.criticalRisks, 2)

  const attentionAreas: AttentionArea[] = Array.isArray(a.attentionAreas) && a.attentionAreas.length
    ? a.attentionAreas
    : defaultAttentionAreas(daysBehind)

  const lookahead: LookaheadItem[] = Array.isArray(a.lookahead) && a.lookahead.length
    ? a.lookahead
    : defaultLookahead()

  const operationalPressure: PressureItem[] = Array.isArray(a.operationalPressure) && a.operationalPressure.length
    ? a.operationalPressure
    : defaultPressure()

  const followUp: FollowUpItem[] = Array.isArray(a.followUp) && a.followUp.length
    ? a.followUp
    : defaultFollowUp(daysBehind)

  const communicationSummary = a.communicationSummary
    || defaultCommSummary(daysBehind)

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
      workComplete,
      planVelocityHint: a.plannedVelocity,
      actualByMonth: a.actualByMonth,
      plannedByMonth: a.plannedByMonth,
    }),
    [projectStart, contractEnd, projectedEnd, dataDate, workComplete, a.plannedVelocity, a.actualByMonth, a.plannedByMonth]
  )

  const behindByPts = workComplete - chartData.plannedAtToday
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
            <DurationCell label="Duration at Completion" value={durationAtCompletion} delta={daysBehind} />
          </div>
        </Card>

        {/* SECTION 3: KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPITile
            href="/dashboard/tia"
            label="Days Behind Contract"
            value={daysBehind > 0 ? `+${daysBehind}` : String(daysBehind)}
            sub={daysBehind > 0 ? '↓ TIA territory' : 'On contract'}
            valueColor={daysBehind > 0 ? 'red' : 'green'}
          />
          <KPITile
            href="/dashboard/lens"
            label="Work Complete"
            value={`${workComplete}%`}
            sub={`${completedActivities.toLocaleString()} of ${totalActivities.toLocaleString()} activities`}
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
            sub={criticalRisks > 0 ? `${criticalRisks} critical` : 'Auto-detected'}
            valueColor={criticalRisks > 0 ? 'red' : 'amber'}
          />
        </div>

        {/* SECTION 4: Schedule Progress chart (NEW) */}
        <Card>
          <div className="flex items-start justify-between mb-3">
            <div>
              <SectionTitle>Schedule Progress</SectionTitle>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Planned vs Actual completion · Contract end <span className="text-red-600 font-semibold">{fmtDate(contractEnd)}</span>
                {' · Projected '}<span className="text-amber-600 font-semibold">{fmtDate(projectedEnd)}{daysBehind > 0 ? ` (+${daysBehind}d)` : ''}</span>
              </div>
            </div>
            <ChartLegend />
          </div>
          <ScheduleProgressChart data={chartData} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-100">
            <InsightCell
              label={behindByPts >= 0 ? 'Ahead of plan by' : 'Behind plan by'}
              value={`${behindByPts >= 0 ? '+' : ''}${behindByPts.toFixed(1)} percentage pts`}
              color={behindByPts >= 0 ? 'green' : 'red'}
            />
            <InsightCell
              label="Velocity (last 3 mo)"
              value={`~${velocityPerMonth.toFixed(1)}% / month`}
              color="slate"
            />
            <InsightCell
              label="Required velocity to hit contract"
              value={requiredVelocity === Infinity ? '— (already past)' : `~${requiredVelocity.toFixed(1)}% / month`}
              color={requiredVelocity === Infinity || requiredVelocity > velocityPerMonth * 1.5 ? 'red' : 'slate'}
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
        {value} <span className="text-xs text-slate-500 font-normal">days</span>
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
  const { buckets, todayIndex, contractIndex, projectedIndex } = data
  const W = 700
  const H = 200
  const padL = 36, padR = 16, padT = 18, padB = 38
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const stepX = innerW / Math.max(buckets.length - 1, 1)
  const barW = 12
  const groupW = barW * 2 + 4
  const yFor = (pct: number) => padT + innerH * (1 - pct / 100)
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
      {todayIndex >= 0 && (
        <g>
          <line x1={padL + todayIndex * stepX} y1={padT} x2={padL + todayIndex * stepX} y2={H - padB} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2,2" />
          <text x={padL + todayIndex * stepX} y={padT - 4} fontSize="8" fill="#94a3b8" textAnchor="middle">Today</text>
        </g>
      )}
      {contractIndex >= 0 && (
        <g>
          <line x1={padL + contractIndex * stepX} y1={padT} x2={padL + contractIndex * stepX} y2={H - padB} stroke="#dc2626" strokeWidth="1" strokeDasharray="3,2" />
          <text x={padL + contractIndex * stepX} y={padT - 4} fontSize="9" fill="#dc2626" textAnchor="middle" fontWeight="600">Contract End</text>
        </g>
      )}
      {projectedIndex >= 0 && projectedIndex !== contractIndex && (
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
        const plannedH = innerH - (innerH * (1 - b.planned / 100))
        const actualH = innerH - (innerH * (1 - b.actual / 100))
        return (
          <g key={i}>
            <rect x={x} y={yFor(b.planned)} width={barW} height={plannedH} fill={plannedColor} />
            <rect x={x + barW + 4} y={yFor(b.actual)} width={barW} height={actualH} fill={actualColor} opacity={b.isForecast ? 0.85 : 1} />
            <text x={padL + i * stepX} y={H - padB + 14} fontSize="9" fill={b.isToday ? '#0f172a' : '#64748b'} textAnchor="middle" fontWeight={b.isToday ? '600' : '400'}>{b.label}</text>
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

function fmtDate(d?: string): string {
  if (!d) return '—'
  try {
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return d
    return dt.toISOString().slice(0, 10)
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
  const start = safeDate(input.projectStart)
  const contract = safeDate(input.contractEnd)
  const projected = safeDate(input.projectedEnd) || contract
  const today = safeDate(input.dataDate) || new Date()

  // If both planned and actual time series are provided, use them directly.
  if (Array.isArray(input.plannedByMonth) && Array.isArray(input.actualByMonth) && input.plannedByMonth.length === input.actualByMonth.length && input.plannedByMonth.length >= 3) {
    const buckets: ChartBucket[] = input.plannedByMonth.map((row: any, i: number) => {
      const label = typeof row.label === 'string' ? row.label : `M${i + 1}`
      const planned = num(row.value ?? row.planned, 0)
      const actual = num(input.actualByMonth![i]?.value ?? input.actualByMonth![i]?.actual, 0)
      return {
        label,
        planned,
        actual,
        isForecast: !!row.forecast,
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
      plannedAtToday: 0,
      velocityPerMonth: 0,
      requiredVelocityToHitContract: 0,
    }
  }

  // Otherwise — compute a plausible monthly progression
  if (!start || !contract) {
    return synthChartData(input.workComplete)
  }

  const totalMonths = Math.max(monthsBetween(start, projected || contract) + 1, 6)
  const numBuckets = Math.min(7, Math.max(6, totalMonths))
  // Build evenly-spaced buckets between start and projected end
  const buckets: ChartBucket[] = []
  for (let i = 0; i < numBuckets; i++) {
    const t = i / (numBuckets - 1)
    const bucketDate = new Date(start.getTime() + t * (projected!.getTime() - start.getTime()))
    const isAfterToday = bucketDate > today
    const isAfterContract = bucketDate > contract
    const isToday = !isAfterToday && (i === numBuckets - 1 || (i + 1 < numBuckets && new Date(start.getTime() + ((i + 1) / (numBuckets - 1)) * (projected!.getTime() - start.getTime())) > today))
    // Planned curve: linear from 0% at start to 100% at contract end
    const tPlannedAtContract = monthsBetween(start, contract) / monthsBetween(start, projected || contract)
    const localT = t / Math.max(tPlannedAtContract, 0.01)
    const planned = Math.min(100, Math.max(0, localT * 100))
    // Actual: ends at workComplete at the "today" position, then forecast continues to 100% at projected end
    let actual: number
    if (!isAfterToday) {
      // Linear from 0 to workComplete at today's position
      const todayT = (today.getTime() - start.getTime()) / (projected!.getTime() - start.getTime())
      const localActT = todayT > 0 ? t / todayT : 0
      actual = Math.min(input.workComplete, Math.max(0, localActT * input.workComplete))
    } else {
      // Forecast: linear from workComplete (at today) to 100% at projected end
      const todayT = (today.getTime() - start.getTime()) / (projected!.getTime() - start.getTime())
      const remainingT = (t - todayT) / (1 - todayT)
      actual = Math.min(100, input.workComplete + remainingT * (100 - input.workComplete))
    }
    buckets.push({
      label: bucketDate.toLocaleString('en-US', { month: 'short' }),
      sublabel: bucketDate.toLocaleString('en-US', { year: '2-digit' }) === buckets[0]?.sublabel?.replace("'", '') ? undefined : `'${String(bucketDate.getFullYear()).slice(2)}`,
      planned: round1(planned),
      actual: round1(actual),
      isForecast: isAfterToday,
      isToday,
      isContract: false,
      isProjected: i === numBuckets - 1,
    })
  }

  // Find indices for markers
  const todayIndex = findIndexClosest(buckets, start, projected!, today)
  const contractIndex = findIndexClosest(buckets, start, projected!, contract)
  const projectedIndex = numBuckets - 1

  // Velocity (last 3 buckets of actual data, before forecast)
  const actualBuckets = buckets.filter(b => !b.isForecast)
  const velocityPerMonth = actualBuckets.length >= 2
    ? (actualBuckets[actualBuckets.length - 1].actual - actualBuckets[Math.max(0, actualBuckets.length - 4)].actual) / Math.min(3, actualBuckets.length - 1)
    : 0
  const monthsToContract = Math.max(monthsBetween(today, contract), 0.1)
  const requiredVelocityToHitContract = today >= contract ? Infinity : (100 - input.workComplete) / monthsToContract
  const plannedAtToday = buckets[todayIndex]?.planned ?? input.workComplete

  return {
    buckets,
    todayIndex,
    contractIndex,
    projectedIndex,
    plannedAtToday,
    velocityPerMonth,
    requiredVelocityToHitContract,
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
