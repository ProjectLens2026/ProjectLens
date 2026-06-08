'use client'

// =============================================================================
// src/components/reports/TrendReport.tsx
// =============================================================================
// Trend & Variance Report — multi-version comparison.
//
// Shows how key metrics evolved across all schedule versions in chronological
// order. Includes a versions table, sparkline charts for each metric, and
// a variance summary (earliest vs latest).
//
// Pure data-display component. The page wrapper pulls all versions from
// projectStore and computes trend points.
// =============================================================================

import ReportHeader from '@/components/ReportHeader'
import PrintButton from '@/components/PrintButton'
import WordButton from '@/components/WordButton'
import { fmtShortDate } from '@/lib/reports'

const COLORS = {
  ink: '#13202e',
  blue: '#2563eb',
  red: '#dc2626',
  amber: '#f59e0b',
  green: '#16a34a',
  slate: '#1f2937',
}

export interface TrendPoint {
  versionLabel: string
  dataDate?: string
  projectedEnd?: string
  healthScore: number
  workCompletePct: number
  daysBehind: number
  negativeFloat: number
  oosCount: number
  criticalDriversCount: number
  longLeadAtRisk: number
  totalActivities: number
}

export interface TrendReportProps {
  orgName: string
  reportNo: string
  versionLabel: string
  project: {
    name: string
    projectId?: string | null
    project_code?: string | null
    owner?: string | null
    location?: string | null
  }
  // All versions in chronological order (earliest → latest)
  points: TrendPoint[]
  // Span info
  spanDays: number       // days between earliest and latest data date
}

export default function TrendReport(p: TrendReportProps) {
  const { points } = p
  const n = points.length

  // Single-version edge case
  if (n < 2) {
    return (
      <SingleVersionFallback {...p} />
    )
  }

  const first = points[0]
  const last = points[n - 1]

  // Variance calculations
  const healthDelta = last.healthScore - first.healthScore
  const workDelta = last.workCompletePct - first.workCompletePct
  const daysBehindDelta = last.daysBehind - first.daysBehind
  const oosDelta = last.oosCount - first.oosCount
  const nfDelta = last.negativeFloat - first.negativeFloat

  // Slip rate: days of projected-end drift per calendar month between updates
  let slipDaysPerMonth: number | null = null
  if (first.projectedEnd && last.projectedEnd && p.spanDays > 0) {
    const firstEnd = new Date(first.projectedEnd).getTime()
    const lastEnd = new Date(last.projectedEnd).getTime()
    if (!isNaN(firstEnd) && !isNaN(lastEnd)) {
      const endShiftDays = Math.round((lastEnd - firstEnd) / 86_400_000)
      const months = p.spanDays / 30
      slipDaysPerMonth = months > 0 ? Math.round(endShiftDays / months) : null
    }
  }

  return (
    <div>
      {/* Action bar */}
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Multi-version trend analysis. Use to identify recurring patterns and
          slip rate over time.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Trend & Variance Report"
          reportNo={p.reportNo}
          versionLabel={p.versionLabel}
          orgName={p.orgName}
          project={p.project}
        />

        {/* ──── Summary banner ────────────────────────────────────────── */}
        <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-4 print:break-inside-avoid"
          style={{ background: '#e0f2fe', border: `1px solid ${COLORS.blue}33` }}>
          <div className="rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0"
            style={{ background: COLORS.blue, color: '#fff' }}>
            <span className="font-extrabold text-[16px]">{n}</span>
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-extrabold" style={{ color: COLORS.ink }}>
              {n} schedule versions analyzed across {p.spanDays} days
            </div>
            <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
              First update: <span className="font-mono font-bold">{fmtShortDate(first.dataDate)}</span> ·
              Latest: <span className="font-mono font-bold">{fmtShortDate(last.dataDate)}</span>
              {slipDaysPerMonth !== null && (
                <> · Projected end is drifting <span className="font-mono font-bold" style={{ color: slipDaysPerMonth > 0 ? COLORS.red : COLORS.green }}>
                  {slipDaysPerMonth > 0 ? `+${slipDaysPerMonth}` : slipDaysPerMonth} days/month
                </span></>
              )}
            </div>
          </div>
        </div>

        {/* ──── Headline variance ─────────────────────────────────────── */}
        <SectionBar tag="VAR" title="Headline Variance · First vs Latest" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 print:break-inside-avoid">
          <VarianceCard
            label="Health Score"
            from={first.healthScore}
            to={last.healthScore}
            delta={healthDelta}
            unit="/100"
            higherIsBetter
          />
          <VarianceCard
            label="Work Complete"
            from={Math.round(first.workCompletePct)}
            to={Math.round(last.workCompletePct)}
            delta={Math.round(workDelta)}
            unit="%"
            higherIsBetter
          />
          <VarianceCard
            label="Days Behind"
            from={first.daysBehind}
            to={last.daysBehind}
            delta={daysBehindDelta}
            unit="d"
            higherIsBetter={false}
          />
          <VarianceCard
            label="OOS Activities"
            from={first.oosCount}
            to={last.oosCount}
            delta={oosDelta}
            higherIsBetter={false}
          />
          <VarianceCard
            label="Negative Float"
            from={first.negativeFloat}
            to={last.negativeFloat}
            delta={nfDelta}
            higherIsBetter={false}
          />
        </div>

        {/* ──── Sparkline trends ──────────────────────────────────────── */}
        <SectionBar tag="TRND" title="Metric Trends" rightMeta={`${n} data points`} />
        <Note>
          Each sparkline shows how the metric moved across schedule versions.
          The first dot is the earliest update; the last dot is the most recent.
        </Note>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 print:break-inside-avoid">
          <Sparkline
            label="Health Score"
            values={points.map(p => p.healthScore)}
            color={COLORS.green}
            higherIsBetter
            suffix="/100"
          />
          <Sparkline
            label="Work Complete"
            values={points.map(p => p.workCompletePct)}
            color={COLORS.blue}
            higherIsBetter
            suffix="%"
            decimals={0}
          />
          <Sparkline
            label="Days Behind Contract"
            values={points.map(p => p.daysBehind)}
            color={COLORS.red}
            higherIsBetter={false}
            suffix="d"
          />
          <Sparkline
            label="OOS Activities"
            values={points.map(p => p.oosCount)}
            color={COLORS.amber}
            higherIsBetter={false}
          />
          <Sparkline
            label="Negative Float"
            values={points.map(p => p.negativeFloat)}
            color={COLORS.red}
            higherIsBetter={false}
          />
          <Sparkline
            label="Long Lead at Risk"
            values={points.map(p => p.longLeadAtRisk)}
            color={COLORS.amber}
            higherIsBetter={false}
          />
        </div>

        {/* ──── Versions table ────────────────────────────────────────── */}
        <SectionBar tag="VERS" title="Versions · Detail Table" rightMeta={`${n} versions`} />
        <table className="w-full text-[10.5px] mb-4">
          <thead>
            <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
              <th className="py-1.5 px-2">#</th>
              <th className="py-1.5 px-2">Version</th>
              <th className="py-1.5 px-2">Data Date</th>
              <th className="py-1.5 px-2">Projected End</th>
              <th className="py-1.5 px-2 text-right">Health</th>
              <th className="py-1.5 px-2 text-right">Work %</th>
              <th className="py-1.5 px-2 text-right">Days Behind</th>
              <th className="py-1.5 px-2 text-right">OOS</th>
              <th className="py-1.5 px-2 text-right">Neg Float</th>
            </tr>
          </thead>
          <tbody>
            {points.map((pt, i) => {
              const isLatest = i === n - 1
              return (
                <tr key={i} className={`border-b border-slate-100 print:break-inside-avoid ${isLatest ? 'bg-blue-50/50' : ''}`}>
                  <td className="py-1.5 px-2 font-mono text-slate-400">{i + 1}{isLatest && <span className="ml-1 text-[8px] text-blue-600 font-bold uppercase">latest</span>}</td>
                  <td className="py-1.5 px-2 font-mono font-bold" style={{ color: COLORS.ink }}>{trunc(pt.versionLabel, 28)}</td>
                  <td className="py-1.5 px-2 font-mono text-slate-600">{fmtShortDate(pt.dataDate)}</td>
                  <td className="py-1.5 px-2 font-mono text-slate-600">{fmtShortDate(pt.projectedEnd)}</td>
                  <td className="py-1.5 px-2 text-right font-mono font-bold" style={{ color: pt.healthScore >= 80 ? COLORS.green : pt.healthScore >= 60 ? COLORS.amber : COLORS.red }}>{pt.healthScore}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-600">{Math.round(pt.workCompletePct)}%</td>
                  <td className="py-1.5 px-2 text-right font-mono font-bold" style={{ color: pt.daysBehind > 0 ? COLORS.red : COLORS.green }}>{pt.daysBehind > 0 ? `+${pt.daysBehind}` : pt.daysBehind}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-600">{pt.oosCount}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-600">{pt.negativeFloat}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ──── Observations ──────────────────────────────────────────── */}
        <SectionBar tag="OBS" title="Pattern Observations" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 print:break-inside-avoid">
          <Observation
            title="Schedule trajectory"
            body={
              daysBehindDelta > 0
                ? `Project has lost ${daysBehindDelta} days against the contract since the first analyzed version. This is a worsening trend — recovery actions are not catching up.`
                : daysBehindDelta < 0
                  ? `Project has recovered ${Math.abs(daysBehindDelta)} days against the contract since the first analyzed version. Recovery is working.`
                  : 'Schedule variance vs contract has held steady across versions. No recovery, but no further slip either.'
            }
            tone={daysBehindDelta > 0 ? 'red' : daysBehindDelta < 0 ? 'green' : 'slate'}
          />
          <Observation
            title="Schedule quality"
            body={
              oosDelta > 5 || nfDelta > 5
                ? `Schedule quality has degraded — out-of-sequence and negative-float counts are climbing. This often signals reactive scheduling rather than disciplined updates.`
                : oosDelta < -5 || nfDelta < -5
                  ? `Schedule quality has improved — out-of-sequence and negative-float counts have decreased. Scheduler discipline is paying off.`
                  : 'Schedule quality metrics are stable across versions.'
            }
            tone={oosDelta > 5 || nfDelta > 5 ? 'amber' : oosDelta < -5 || nfDelta < -5 ? 'green' : 'slate'}
          />
          <Observation
            title="Work progress"
            body={
              workDelta > 5
                ? `Work completion has advanced ${Math.round(workDelta)}% across versions. Project is moving forward as expected.`
                : workDelta < 0
                  ? `Work completion has DECREASED across versions — likely a sign of scope deletion, baseline replacement, or data-quality issue. Investigate.`
                  : 'Work completion is moving slowly across versions. Verify field activity is being captured in updates.'
            }
            tone={workDelta > 5 ? 'green' : workDelta < 0 ? 'red' : 'amber'}
          />
          <Observation
            title="Slip rate"
            body={
              slipDaysPerMonth === null
                ? 'Insufficient data to compute slip rate. Need at least two versions with projected end dates.'
                : slipDaysPerMonth > 5
                  ? `Project end date is drifting +${slipDaysPerMonth} days per month. At this rate, an additional ${slipDaysPerMonth * 6} days of slip will accumulate over the next 6 months without intervention.`
                  : slipDaysPerMonth < 0
                    ? `Project end date is RECOVERING at ${Math.abs(slipDaysPerMonth)} days per month — meaningful recovery is happening.`
                    : 'Project end date is stable across versions.'
            }
            tone={slipDaysPerMonth !== null && slipDaysPerMonth > 5 ? 'red' : slipDaysPerMonth !== null && slipDaysPerMonth < 0 ? 'green' : 'slate'}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 mt-6 border-t-2 text-[10px] text-slate-400" style={{ borderColor: COLORS.ink }}>
          <span>
            Generated by <b style={{ color: COLORS.ink }}>ControlLens</b> —
            analysis is advisory; the P6 schedule of record governs.
          </span>
          <span className="font-mono">{p.reportNo}</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-version fallback
// ─────────────────────────────────────────────────────────────────────────────

function SingleVersionFallback(p: TrendReportProps) {
  return (
    <div>
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Multi-version trend analysis requires at least 2 schedule versions.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Trend & Variance Report"
          reportNo={p.reportNo}
          versionLabel={p.versionLabel}
          orgName={p.orgName}
          project={p.project}
        />
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center mt-6">
          <div className="text-3xl mb-2">📈</div>
          <div className="text-[14px] font-bold" style={{ color: COLORS.ink }}>
            Need at least 2 schedule versions
          </div>
          <div className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            Trend analysis compares metrics across multiple schedule updates.
            Upload a second XER version (next monthly update) to unlock this
            report's full output.
          </div>
        </div>
        <div className="flex items-center justify-between pt-3 mt-6 border-t-2 text-[10px] text-slate-400" style={{ borderColor: COLORS.ink }}>
          <span>
            Generated by <b style={{ color: COLORS.ink }}>ControlLens</b> —
            analysis is advisory; the P6 schedule of record governs.
          </span>
          <span className="font-mono">{p.reportNo}</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionBar({ tag, title, rightMeta }: { tag: string; title: string; rightMeta?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 mb-3 mt-5 rounded text-white" style={{ background: COLORS.ink }}>
      <span className="font-mono text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.18)' }}>
        {tag}
      </span>
      <span className="text-[13px] font-extrabold uppercase tracking-wide flex-1">{title}</span>
      {rightMeta && <span className="font-mono text-[10px] opacity-80">{rightMeta}</span>}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-slate-500 italic leading-relaxed mb-3 max-w-[90%]">{children}</p>
}

function VarianceCard({ label, from, to, delta, unit = '', higherIsBetter }: {
  label: string; from: number; to: number; delta: number; unit?: string; higherIsBetter: boolean
}) {
  const isGood = higherIsBetter ? delta >= 0 : delta <= 0
  const color = delta === 0 ? COLORS.slate : isGood ? COLORS.green : COLORS.red
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '–'
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[16px] font-extrabold" style={{ color: COLORS.ink }}>{to}{unit}</span>
        <span className="font-mono text-[10px] text-slate-400">/ from {from}{unit}</span>
      </div>
      <div className="font-mono text-[10px] font-bold mt-1" style={{ color }}>
        {arrow} {delta > 0 ? '+' : ''}{delta}{unit}
      </div>
    </div>
  )
}

/**
 * Compact line sparkline showing a metric across versions.
 * Last point is highlighted; min/max labeled.
 */
function Sparkline({ label, values, color, higherIsBetter, suffix = '', decimals = 0 }: {
  label: string; values: number[]; color: string; higherIsBetter: boolean
  suffix?: string; decimals?: number
}) {
  if (values.length === 0) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const last = values[values.length - 1]
  const W = 240, H = 56, P = 4
  const iw = W - P * 2, ih = H - P * 2

  const xAt = (i: number) => P + (values.length > 1 ? (i / (values.length - 1)) * iw : iw / 2)
  const yAt = (v: number) => P + ih - ((v - min) / range) * ih

  const pathD = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${xAt(values.length - 1).toFixed(1)},${(P + ih).toFixed(1)} L${xAt(0).toFixed(1)},${(P + ih).toFixed(1)} Z`

  // Trend label: compare last to first
  const first = values[0]
  const delta = last - first
  const trendIsGood = higherIsBetter ? delta >= 0 : delta <= 0
  const trendColor = delta === 0 ? COLORS.slate : trendIsGood ? COLORS.green : COLORS.red
  const trendArrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '–'

  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="font-mono text-[10px] font-bold" style={{ color: trendColor }}>
          {trendArrow} {delta > 0 ? '+' : ''}{delta.toFixed(decimals)}{suffix}
        </span>
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="font-mono text-[16px] font-extrabold" style={{ color: COLORS.ink }}>{last.toFixed(decimals)}{suffix}</span>
        <span className="font-mono text-[9px] text-slate-400">min {min.toFixed(decimals)} · max {max.toFixed(decimals)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: 'block' }}>
        <path d={areaD} fill={color} opacity={0.12} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => (
          <circle
            key={i}
            cx={xAt(i)} cy={yAt(v)}
            r={i === values.length - 1 ? 3 : 1.5}
            fill={i === values.length - 1 ? color : '#fff'}
            stroke={color}
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  )
}

function Observation({ title, body, tone }: { title: string; body: string; tone: 'red' | 'amber' | 'green' | 'slate' }) {
  const color =
    tone === 'red' ? COLORS.red :
    tone === 'amber' ? COLORS.amber :
    tone === 'green' ? COLORS.green :
    COLORS.slate
  return (
    <div className="rounded-lg p-3 border-l-4" style={{ background: '#f8fafc', borderColor: color }}>
      <div className="text-[10px] font-extrabold uppercase tracking-wide mb-1" style={{ color }}>
        {title}
      </div>
      <div className="text-[11.5px] leading-relaxed" style={{ color: COLORS.ink }}>
        {body}
      </div>
    </div>
  )
}

function trunc(s: string | undefined, max: number): string {
  if (!s) return '—'
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
