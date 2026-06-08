'use client'

// =============================================================================
// src/components/reports/ExecutiveReport.tsx
// =============================================================================
// The Executive Summary report — the most-viewed report in ControlLens.
// Designed to be printed and handed to owners, executives, or contracting
// officers. Visual language matches EstimateLens for cross-product consistency.
//
// Sections in order:
//   1. Cover sheet (ReportHeader)
//   2. Health stack (5 KPI tiles: Health, Days Behind, Work %, Critical Float,
//      Long Lead at Risk) — the top-row summary
//   3. Key Dates strip (NTP, Original, Revised, Data Date, Projected End)
//   4. Risks summary (Critical / High / Medium with bars + counts)
//   5. Schedule Progress curve (Planned vs Actual vs Forecast — SVG)
//   6. Top risk activities (compact table — 5 rows)
//   7. Footer (disclaimer + report number)
//
// All numbers come from props — this component does no data fetching. The
// page wrapper at src/app/dashboard/reports/executive/page.tsx pulls from
// projectStore and passes everything in.
// =============================================================================

import ReportHeader from '@/components/ReportHeader'
import PrintButton from '@/components/PrintButton'
import WordButton from '@/components/WordButton'
import { fmtShortDate } from '@/lib/reports'

interface RiskCategoryCount {
  critical: number
  high: number
  medium: number
}

interface RiskRow {
  severity: 'critical' | 'high' | 'medium'
  category: string         // e.g. "Out-of-Sequence" / "Float Erosion"
  activity: string         // task code + name
  description: string      // plain-English explanation
}

interface SCurvePoint {
  label: string            // e.g. "Sep '26"
  planned?: number         // 0..100
  actual?: number          // 0..100
  forecast?: number        // 0..100
}

export interface ExecutiveReportProps {
  // Header / project info
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

  // 1. Health
  healthScore: number              // 0..100
  healthLabel: string              // "Stable" / "At Risk" / etc.
  healthNarrative?: string         // optional 1-2 sentence narrative

  // 2. Key metrics
  daysBehind: number               // can be negative (ahead) or positive (behind)
  workCompletePct: number          // 0..100
  criticalFloatDays: number        // days of float on driving path
  longLeadAtRisk: number           // count

  // 3. Key dates (all formatted as ISO strings or undefined)
  ntp?: string
  originalCompletion?: string
  revisedCompletion?: string
  dataDate?: string
  projectedEnd?: string

  // 4. Risk summary counts
  risks: RiskCategoryCount

  // 5. S-curve data (chronological order)
  sCurve: SCurvePoint[]

  // 6. Top risks (already filtered/sorted, max 5)
  topRisks: RiskRow[]

  // Activity totals (shown in subtitle)
  totalActivities?: number
  constructionActivities?: number
}

const COLORS = {
  ink: '#13202e',
  blue: '#2563eb',
  red: '#dc2626',
  amber: '#f59e0b',
  green: '#16a34a',
  slate: '#1f2937',
}

export default function ExecutiveReport(props: ExecutiveReportProps) {
  const {
    orgName, reportNo, versionLabel, project,
    healthScore, healthLabel, healthNarrative,
    daysBehind, workCompletePct, criticalFloatDays, longLeadAtRisk,
    ntp, originalCompletion, revisedCompletion, dataDate, projectedEnd,
    risks, sCurve, topRisks,
    totalActivities, constructionActivities,
  } = props

  const healthColor =
    healthScore >= 80 ? COLORS.green :
    healthScore >= 60 ? COLORS.amber :
    COLORS.red
  const healthBg =
    healthScore >= 80 ? '#e6f5ee' :
    healthScore >= 60 ? '#fef3c7' :
    '#fee2e2'

  const totalRisks = risks.critical + risks.high + risks.medium

  return (
    <div>
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/*  Action bar — only on screen, hidden when printing                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Schedule health and key risks for the active project. Print or save
          as PDF; Word export coming soon.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/*  The printable card — everything inside this prints                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Executive Summary"
          reportNo={reportNo}
          versionLabel={versionLabel}
          orgName={orgName}
          project={project}
        />

        {/* ── 1. Health banner ─────────────────────────────────────────── */}
        <div
          className="rounded-xl px-5 py-4 mb-6 flex items-center gap-4 print:break-inside-avoid"
          style={{ background: healthBg, border: `1px solid ${healthColor}33` }}
        >
          <div
            className="rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0"
            style={{ background: healthColor, color: '#fff' }}
          >
            <span className="font-extrabold text-[16px]">{healthScore}</span>
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-extrabold" style={{ color: COLORS.ink }}>
              {healthLabel} · Health {healthScore}/100
            </div>
            {healthNarrative && (
              <div className="text-[12px] text-slate-600 leading-relaxed mt-0.5">
                {healthNarrative}
              </div>
            )}
          </div>
        </div>

        {/* ── 2. KPI stack — 4 boxes ───────────────────────────────────── */}
        <SectionLabel>Key metrics</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6 print:break-inside-avoid">
          <KPI
            label="Days Behind Contract"
            value={daysBehind > 0 ? `+${daysBehind}` : `${daysBehind}`}
            tone={daysBehind > 0 ? 'red' : 'green'}
            caption={daysBehind > 0 ? 'past revised end' : 'on or ahead of plan'}
          />
          <KPI
            label="Work Complete"
            value={`${Math.round(workCompletePct)}%`}
            tone="blue"
            caption={
              constructionActivities && totalActivities
                ? `construction activities (${constructionActivities} of ${totalActivities})`
                : 'effective % across activities'
            }
          />
          <KPI
            label="Critical Float"
            value={`${criticalFloatDays}d`}
            tone={criticalFloatDays <= 14 ? 'red' : criticalFloatDays <= 30 ? 'amber' : 'green'}
            caption="on driving path"
          />
          <KPI
            label="Long Lead at Risk"
            value={String(longLeadAtRisk)}
            tone={longLeadAtRisk > 0 ? 'amber' : 'green'}
            caption={longLeadAtRisk > 0 ? '≤14d float remaining' : 'none flagged'}
          />
        </div>

        {/* ── 3. Key dates strip ───────────────────────────────────────── */}
        <SectionLabel>Key dates</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6 print:break-inside-avoid">
          <DateBox label="NTP" value={fmtShortDate(ntp)} />
          <DateBox label="Original Comp." value={fmtShortDate(originalCompletion)} />
          <DateBox label="Revised Comp." value={fmtShortDate(revisedCompletion)} tone={revisedCompletion && originalCompletion && revisedCompletion !== originalCompletion ? 'amber' : undefined} />
          <DateBox label="Data Date" value={fmtShortDate(dataDate)} />
          <DateBox label="Projected End" value={fmtShortDate(projectedEnd)} tone={daysBehind > 0 ? 'red' : undefined} />
        </div>

        {/* ── 4. Risks summary ─────────────────────────────────────────── */}
        <SectionLabel>Risks detected · {totalRisks} {totalRisks === 1 ? 'category' : 'categories'}</SectionLabel>
        <div className="grid grid-cols-3 gap-2 mb-6 print:break-inside-avoid">
          <RiskBar label="Critical" count={risks.critical} color={COLORS.red} total={totalRisks} />
          <RiskBar label="High" count={risks.high} color={COLORS.amber} total={totalRisks} />
          <RiskBar label="Medium" count={risks.medium} color={COLORS.blue} total={totalRisks} />
        </div>

        {/* ── 5. Schedule Progress S-curve ─────────────────────────────── */}
        <SectionLabel>Schedule progress</SectionLabel>
        <SCurve points={sCurve} />

        {/* ── 6. Top risk activities table ─────────────────────────────── */}
        {topRisks.length > 0 && (
          <>
            <SectionLabel>Top risk activities</SectionLabel>
            <table className="w-full border-collapse text-[11px] mb-3 print:break-inside-avoid">
              <thead>
                <tr className="text-left text-[9.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 pr-2 w-[14px]"></th>
                  <th className="py-1.5 pr-2 w-[120px]">Category</th>
                  <th className="py-1.5 pr-2">Activity</th>
                  <th className="py-1.5 pr-2">What happened</th>
                </tr>
              </thead>
              <tbody>
                {topRisks.slice(0, 5).map((r, i) => {
                  const sevColor =
                    r.severity === 'critical' ? COLORS.red :
                    r.severity === 'high' ? COLORS.amber : COLORS.blue
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 pr-2">
                        <span
                          className="block w-2 h-2 rounded-full"
                          style={{ background: sevColor, boxShadow: `0 0 0 3px ${sevColor}22` }}
                          aria-label={r.severity}
                        />
                      </td>
                      <td className="py-2 pr-2 font-mono text-[10px] uppercase tracking-wide text-slate-600 align-top">
                        {r.category}
                      </td>
                      <td className="py-2 pr-2 font-mono text-[10.5px] font-bold align-top" style={{ color: COLORS.ink }}>
                        {r.activity}
                      </td>
                      <td className="py-2 pr-2 text-slate-600 align-top leading-relaxed">
                        {r.description}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-3 mt-2 border-t-2 text-[10px] text-slate-400" style={{ borderColor: COLORS.ink }}>
          <span>
            Generated by <b style={{ color: COLORS.ink }}>ControlLens</b> —
            analysis is advisory; the P6 schedule of record governs.
          </span>
          <span className="font-mono">{reportNo}</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Small building blocks
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 mb-2">
      {children}
    </div>
  )
}

function KPI({ label, value, caption, tone }: {
  label: string
  value: string
  caption: string
  tone: 'blue' | 'red' | 'amber' | 'green' | 'slate'
}) {
  const accent =
    tone === 'red' ? COLORS.red :
    tone === 'amber' ? COLORS.amber :
    tone === 'green' ? COLORS.green :
    tone === 'slate' ? COLORS.slate :
    COLORS.blue
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accent }} />
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </div>
      <div className="font-mono text-[20px] font-extrabold leading-none" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[10px] text-slate-500 mt-1 leading-snug">{caption}</div>
    </div>
  )
}

function DateBox({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'red' }) {
  const color =
    tone === 'red' ? COLORS.red :
    tone === 'amber' ? COLORS.amber :
    COLORS.ink
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-[12.5px] font-bold mt-0.5" style={{ color }}>{value}</div>
    </div>
  )
}

function RiskBar({ label, count, color, total }: { label: string; count: number; color: string; total: number }) {
  const pct = total > 0 ? Math.max(count > 0 ? 4 : 0, (count / total) * 100) : 0
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</div>
        <div className="font-mono text-[18px] font-extrabold" style={{ color }}>{count}</div>
      </div>
      <svg width="100%" height="6" className="block" aria-hidden="true">
        <rect x="0" y="0" width="100%" height="6" rx="2" fill="#eef2f7" />
        <rect x="0" y="0" width={`${pct}%`} height="6" rx="2" fill={color} />
      </svg>
    </div>
  )
}

/**
 * Planned vs Actual vs Forecast S-curve. Pure SVG, no chart library.
 * Renders gridlines, three lines, axis labels. Designed for print (no
 * tooltips, no interactivity).
 */
function SCurve({ points }: { points: SCurvePoint[] }) {
  if (points.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-[12px] text-slate-400 mb-6">
        No schedule progress data available for this version.
      </div>
    )
  }

  const W = 720, H = 220, PL = 36, PR = 12, PT = 12, PB = 26
  const iw = W - PL - PR, ih = H - PT - PB
  const n = points.length
  const xAt = (i: number) => PL + (n > 1 ? (i / (n - 1)) * iw : iw / 2)
  const yAt = (v: number) => PT + ih - (Math.max(0, Math.min(100, v)) / 100) * ih

  // Build paths only for points that have the value
  const buildPath = (key: 'planned' | 'actual' | 'forecast') => {
    let d = ''
    let started = false
    points.forEach((p, i) => {
      const v = p[key]
      if (v === undefined || v === null) return
      const x = xAt(i).toFixed(1)
      const y = yAt(v).toFixed(1)
      d += `${started ? 'L' : 'M'}${x},${y} `
      started = true
    })
    return d.trim()
  }

  const plannedPath = buildPath('planned')
  const actualPath = buildPath('actual')
  const forecastPath = buildPath('forecast')

  // Tick every Nth label so it doesn't overlap
  const tickStep = Math.max(1, Math.ceil(n / 12))

  return (
    <div className="mb-6 print:break-inside-avoid">
      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-wide text-slate-500 mb-2">
        <LegendDot color={COLORS.blue} label="Planned" />
        <LegendDot color={COLORS.green} label="Actual" />
        <LegendDot color={COLORS.amber} label="Forecast" dashed />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ maxWidth: '100%' }}>
        {/* Horizontal gridlines */}
        {[0, 25, 50, 75, 100].map(p => (
          <g key={p}>
            <line x1={PL} x2={W - PR} y1={yAt(p)} y2={yAt(p)} stroke="#e6ebf1" strokeWidth="1" />
            <text x={PL - 4} y={yAt(p) + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontFamily="monospace">{p}%</text>
          </g>
        ))}

        {/* Planned */}
        {plannedPath && (
          <path d={plannedPath} fill="none" stroke={COLORS.blue} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {/* Actual */}
        {actualPath && (
          <path d={actualPath} fill="none" stroke={COLORS.green} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {/* Forecast (dashed) */}
        {forecastPath && (
          <path d={forecastPath} fill="none" stroke={COLORS.amber} strokeWidth="2" strokeDasharray="4 4" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* X-axis labels */}
        {points.map((p, i) => {
          if (i % tickStep !== 0 && i !== n - 1) return null
          return (
            <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#677889" fontFamily="monospace">
              {p.label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="16" height="6">
        <line
          x1="0" y1="3" x2="16" y2="3"
          stroke={color} strokeWidth="2"
          strokeDasharray={dashed ? '3 3' : undefined}
        />
      </svg>
      {label}
    </span>
  )
}
