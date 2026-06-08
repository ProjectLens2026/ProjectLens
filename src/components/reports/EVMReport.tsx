'use client'

// =============================================================================
// src/components/reports/EVMReport.tsx
// =============================================================================
// Earned Value Management Report — formal EVM documentation per federal
// reporting conventions. Pulls from project.evm (BAC, months[]) and computes
// cumulative PV, EV, AC, SV, CV, SPI, CPI plus forecasts (EAC, VAC, TCPI).
//
// Handles three states:
//   1. No EVM data set up → friendly empty state pointing to EVM page
//   2. EVM data but no actual cost → schedule-only metrics (SPI, SV)
//   3. Full EVM with actual cost → schedule + cost metrics (all indices)
// =============================================================================

import ReportHeader from '@/components/ReportHeader'
import PrintButton from '@/components/PrintButton'
import WordButton from '@/components/WordButton'

const COLORS = {
  ink: '#13202e',
  blue: '#2563eb',
  red: '#dc2626',
  amber: '#f59e0b',
  green: '#16a34a',
  slate: '#1f2937',
}

export interface EVMMonth {
  label: string
  plannedPct: number
  earnedPct: number
  actualCost?: number
}

export interface EVMCumulative {
  pv: number
  ev: number
  ac: number
  sv: number
  cv: number | null
  spi: number | null
  cpi: number | null
  hasAnyActualCost: boolean
}

export interface EVMReportProps {
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
  // EVM data
  totalBudget: number          // BAC
  currency: string
  distributionMode?: string
  months: EVMMonth[]
  cumulative: EVMCumulative
  // String formatters from the user's @/lib/evm module
  fmtDollars: (amount: number, currency: string) => string
  fmtRatio: (ratio: number | null) => string
}

export default function EVMReport(p: EVMReportProps) {
  const {
    totalBudget, currency, months, cumulative,
    fmtDollars, fmtRatio,
  } = p

  // Empty state — no EVM data set up
  if (!totalBudget || totalBudget <= 0 || !Array.isArray(months) || months.length === 0) {
    return <EVMEmptyState {...p} />
  }

  // Forecasts
  const cpi = cumulative.cpi
  const eac = cumulative.hasAnyActualCost && cpi !== null && cpi > 0
    ? totalBudget / cpi
    : null
  const vac = eac !== null ? totalBudget - eac : null
  // TCPI = (BAC - EV) / (BAC - AC) — what CPI we need to come in on budget
  const tcpi = cumulative.hasAnyActualCost && (totalBudget - cumulative.ac) !== 0
    ? (totalBudget - cumulative.ev) / (totalBudget - cumulative.ac)
    : null

  // SV percentage (relative to PV, for context)
  const svPct = cumulative.pv > 0 ? (cumulative.sv / cumulative.pv) * 100 : 0
  // CV percentage (relative to EV, for context)
  const cvPct = cumulative.hasAnyActualCost && cumulative.ev > 0 && cumulative.cv !== null
    ? (cumulative.cv / cumulative.ev) * 100
    : null

  return (
    <div>
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Earned Value Management — cost and schedule performance per federal reporting conventions.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Earned Value Report"
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
            <span className="font-extrabold text-[11px]">EVM</span>
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-extrabold" style={{ color: COLORS.ink }}>
              {fmtDollars(totalBudget, currency)} project · {months.length} {months.length === 1 ? 'month' : 'months'} tracked
            </div>
            <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
              {((cumulative.ev / totalBudget) * 100).toFixed(1)}% earned ·
              {((cumulative.pv / totalBudget) * 100).toFixed(1)}% planned
              {cumulative.hasAnyActualCost && <> · {((cumulative.ac / totalBudget) * 100).toFixed(1)}% spent</>}
              {!cumulative.hasAnyActualCost && <> · cost not tracked</>}
            </div>
          </div>
        </div>

        {/* ──── Cumulative values ─────────────────────────────────────── */}
        <SectionBar tag="CUM" title="Cumulative Values" rightMeta={`through ${months[months.length - 1]?.label || 'latest'}`} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 print:break-inside-avoid">
          <ValueCard
            label="BAC"
            sublabel="Budget at Completion"
            value={fmtDollars(totalBudget, currency)}
            tone="slate"
          />
          <ValueCard
            label="PV"
            sublabel="Planned Value"
            value={fmtDollars(cumulative.pv, currency)}
            tone="blue"
          />
          <ValueCard
            label="EV"
            sublabel="Earned Value"
            value={fmtDollars(cumulative.ev, currency)}
            tone="green"
          />
          <ValueCard
            label="AC"
            sublabel="Actual Cost"
            value={cumulative.hasAnyActualCost ? fmtDollars(cumulative.ac, currency) : '— not tracked'}
            tone={cumulative.hasAnyActualCost ? 'amber' : 'slate'}
          />
        </div>

        {/* ──── Performance indices ───────────────────────────────────── */}
        <SectionBar tag="PERF" title="Performance Indices" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 print:break-inside-avoid">
          <IndexCard
            label="SPI"
            sublabel="Schedule Performance"
            value={fmtRatio(cumulative.spi)}
            tone={cumulative.spi === null ? 'slate' : cumulative.spi >= 0.95 ? 'green' : cumulative.spi >= 0.85 ? 'amber' : 'red'}
            interpretation={interpretIndex(cumulative.spi, 'schedule')}
          />
          <IndexCard
            label="CPI"
            sublabel="Cost Performance"
            value={cumulative.hasAnyActualCost ? fmtRatio(cumulative.cpi) : '— not tracked'}
            tone={!cumulative.hasAnyActualCost ? 'slate' : cumulative.cpi === null ? 'slate' : cumulative.cpi >= 0.95 ? 'green' : cumulative.cpi >= 0.85 ? 'amber' : 'red'}
            interpretation={cumulative.hasAnyActualCost ? interpretIndex(cumulative.cpi, 'cost') : 'enter actual cost in EVM page'}
          />
          <ValueCard
            label="SV"
            sublabel="Schedule Variance"
            value={fmtDollars(cumulative.sv, currency)}
            tone={cumulative.sv < 0 ? 'red' : 'green'}
            caption={`${svPct > 0 ? '+' : ''}${svPct.toFixed(1)}% vs plan`}
          />
          <ValueCard
            label="CV"
            sublabel="Cost Variance"
            value={cumulative.hasAnyActualCost && cumulative.cv !== null ? fmtDollars(cumulative.cv, currency) : '— not tracked'}
            tone={!cumulative.hasAnyActualCost ? 'slate' : cumulative.cv !== null && cumulative.cv < 0 ? 'red' : 'green'}
            caption={cvPct !== null ? `${cvPct > 0 ? '+' : ''}${cvPct.toFixed(1)}% vs earned` : undefined}
          />
        </div>

        {/* ──── Cumulative curves ─────────────────────────────────────── */}
        <SectionBar tag="CURV" title="Cumulative Curves" rightMeta="PV · EV · AC over time" />
        <Note>
          Cumulative dollar values across each tracked month. Gap between PV (blue) and EV
          (green) represents schedule variance; gap between EV (green) and AC (amber)
          represents cost variance.
        </Note>
        <CurveChart months={months} totalBudget={totalBudget} currency={currency} fmtDollars={fmtDollars} />

        {/* ──── Forecasts ─────────────────────────────────────────────── */}
        {cumulative.hasAnyActualCost && eac !== null && (
          <>
            <SectionBar tag="FCST" title="Forecasts at Completion" />
            <Note>
              Projected final cost based on current cost performance. EAC assumes the project
              continues at the current CPI rate. TCPI shows the cost efficiency needed for the
              remaining work to hit the original budget.
            </Note>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4 print:break-inside-avoid">
              <ValueCard
                label="EAC"
                sublabel="Estimate at Completion"
                value={fmtDollars(eac, currency)}
                tone={eac > totalBudget ? 'red' : 'green'}
                caption={eac > totalBudget ? `${fmtDollars(eac - totalBudget, currency)} over budget` : 'within budget'}
              />
              <ValueCard
                label="VAC"
                sublabel="Variance at Completion"
                value={vac !== null ? fmtDollars(vac, currency) : '—'}
                tone={vac !== null && vac < 0 ? 'red' : 'green'}
                caption={vac !== null && vac < 0 ? 'projected overrun' : vac !== null ? 'projected under-run' : ''}
              />
              <IndexCard
                label="TCPI"
                sublabel="To-Complete Index"
                value={tcpi !== null ? fmtRatio(tcpi) : '—'}
                tone={tcpi === null ? 'slate' : tcpi <= 1.05 ? 'green' : tcpi <= 1.20 ? 'amber' : 'red'}
                interpretation={
                  tcpi === null ? '—' :
                  tcpi <= 1.0 ? 'remaining work fits budget' :
                  tcpi <= 1.05 ? 'tight — but recoverable' :
                  tcpi <= 1.20 ? 'difficult — needs intervention' :
                  'unrealistic — re-baseline likely needed'
                }
              />
            </div>
          </>
        )}

        {/* ──── Monthly breakdown ─────────────────────────────────────── */}
        <SectionBar tag="MO" title="Monthly Breakdown" rightMeta={`${months.length} ${months.length === 1 ? 'month' : 'months'}`} />
        <table className="w-full text-[10.5px] mb-4">
          <thead>
            <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
              <th className="py-1.5 px-2">Month</th>
              <th className="py-1.5 px-2 text-right">Planned %</th>
              <th className="py-1.5 px-2 text-right">Earned %</th>
              <th className="py-1.5 px-2 text-right">PV</th>
              <th className="py-1.5 px-2 text-right">EV</th>
              <th className="py-1.5 px-2 text-right">AC</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => {
              const pv = (m.plannedPct / 100) * totalBudget
              const ev = (m.earnedPct / 100) * totalBudget
              return (
                <tr key={i} className="border-b border-slate-100 print:break-inside-avoid">
                  <td className="py-1.5 px-2 font-mono font-bold" style={{ color: COLORS.ink }}>{m.label}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-600">{(m.plannedPct || 0).toFixed(1)}%</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-600">{(m.earnedPct || 0).toFixed(1)}%</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-700">{fmtDollars(pv, currency)}</td>
                  <td className="py-1.5 px-2 text-right font-mono font-bold" style={{ color: COLORS.green }}>{fmtDollars(ev, currency)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-700">{m.actualCost ? fmtDollars(m.actualCost, currency) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

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
// Empty state — no EVM set up
// ─────────────────────────────────────────────────────────────────────────────

function EVMEmptyState(p: EVMReportProps) {
  return (
    <div>
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          EVM data has not been entered for this project.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Earned Value Report"
          reportNo={p.reportNo}
          versionLabel={p.versionLabel}
          orgName={p.orgName}
          project={p.project}
        />
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center mt-6">
          <div className="text-3xl mb-2">💰</div>
          <div className="text-[14px] font-bold" style={{ color: COLORS.ink }}>
            EVM data not yet entered
          </div>
          <div className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed mb-4">
            Earned Value tracking requires Total Budget at Completion (BAC) and monthly
            planned/earned percentages. Open the Earned Value page in the sidebar to
            set these up, then re-generate this report.
          </div>
          <a href="/dashboard/evm" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-4 py-2 rounded-lg print:hidden">
            Open Earned Value Page
          </a>
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

function ValueCard({ label, sublabel, value, tone, caption }: {
  label: string; sublabel: string; value: string;
  tone: 'red' | 'amber' | 'green' | 'blue' | 'slate';
  caption?: string
}) {
  const color = tone === 'red' ? COLORS.red : tone === 'amber' ? COLORS.amber : tone === 'green' ? COLORS.green : tone === 'blue' ? COLORS.blue : COLORS.slate
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[14px] font-extrabold" style={{ color }}>{label}</span>
        <span className="text-[9px] uppercase tracking-wide text-slate-500">{sublabel}</span>
      </div>
      <div className="font-mono text-[15px] font-extrabold mt-1" style={{ color: COLORS.ink }}>{value}</div>
      {caption && <div className="text-[9.5px] text-slate-500 mt-0.5 leading-snug">{caption}</div>}
    </div>
  )
}

function IndexCard({ label, sublabel, value, tone, interpretation }: {
  label: string; sublabel: string; value: string;
  tone: 'red' | 'amber' | 'green' | 'slate';
  interpretation: string
}) {
  const color = tone === 'red' ? COLORS.red : tone === 'amber' ? COLORS.amber : tone === 'green' ? COLORS.green : COLORS.slate
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[14px] font-extrabold" style={{ color }}>{label}</span>
        <span className="text-[9px] uppercase tracking-wide text-slate-500">{sublabel}</span>
      </div>
      <div className="font-mono text-[18px] font-extrabold mt-0.5" style={{ color }}>{value}</div>
      <div className="text-[9.5px] text-slate-500 mt-0.5 leading-snug italic">{interpretation}</div>
    </div>
  )
}

function interpretIndex(index: number | null, type: 'cost' | 'schedule'): string {
  if (index === null) return '—'
  if (index >= 1.0) return type === 'cost' ? 'under budget' : 'ahead of plan'
  if (index >= 0.95) return type === 'cost' ? 'on budget' : 'on plan'
  if (index >= 0.85) return type === 'cost' ? 'slight cost overrun' : 'slight schedule slip'
  return type === 'cost' ? 'significant cost overrun' : 'significant schedule slip'
}

/**
 * Cumulative PV / EV / AC line chart. SVG, no chart library.
 */
function CurveChart({ months, totalBudget, currency, fmtDollars }: {
  months: EVMMonth[]; totalBudget: number; currency: string
  fmtDollars: (amount: number, currency: string) => string
}) {
  if (months.length === 0) return null

  // Build cumulative arrays
  let pvCum = 0, evCum = 0, acCum = 0
  const points = months.map(m => {
    pvCum += (m.plannedPct / 100) * totalBudget
    evCum += (m.earnedPct / 100) * totalBudget
    if (m.actualCost) acCum += m.actualCost
    return { label: m.label, pv: pvCum, ev: evCum, ac: acCum, hasAC: !!m.actualCost }
  })
  // Trim trailing AC if no actual cost was ever entered
  const hasAnyAC = months.some(m => !!m.actualCost)

  const W = 700, H = 200, PL = 50, PR = 12, PT = 12, PB = 30
  const iw = W - PL - PR, ih = H - PT - PB
  const max = Math.max(...points.map(p => Math.max(p.pv, p.ev, hasAnyAC ? p.ac : 0)), totalBudget * 0.1)

  const xAt = (i: number) => PL + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2)
  const yAt = (v: number) => PT + ih - (v / max) * ih

  const buildPath = (key: 'pv' | 'ev' | 'ac') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p[key]).toFixed(1)}`).join(' ')

  // X-axis tick step
  const tickStep = Math.max(1, Math.ceil(points.length / 12))

  return (
    <div className="rounded-lg border border-slate-200 p-3 mb-4 print:break-inside-avoid">
      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-wide text-slate-500 mb-2">
        <LegendDot color={COLORS.blue} label="Planned (PV)" />
        <LegendDot color={COLORS.green} label="Earned (EV)" />
        {hasAnyAC && <LegendDot color={COLORS.amber} label="Actual (AC)" />}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ maxWidth: '100%' }}>
        {/* Y-axis gridlines (25%, 50%, 75%, 100% of max) */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(p => {
          const y = yAt(max * p)
          const label = fmtDollars(max * p, currency)
          return (
            <g key={p}>
              <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="#e6ebf1" strokeWidth="1" />
              <text x={PL - 6} y={y + 3} textAnchor="end" fontSize="8" fill="#94a3b8" fontFamily="monospace">{label}</text>
            </g>
          )
        })}

        {/* BAC reference line (if within visible range) */}
        {totalBudget <= max * 1.05 && (
          <g>
            <line x1={PL} x2={W - PR} y1={yAt(totalBudget)} y2={yAt(totalBudget)} stroke={COLORS.slate} strokeWidth="1" strokeDasharray="3 3" opacity={0.5} />
            <text x={W - PR - 4} y={yAt(totalBudget) - 3} textAnchor="end" fontSize="8" fill={COLORS.slate} fontFamily="monospace">BAC</text>
          </g>
        )}

        {/* PV */}
        <path d={buildPath('pv')} fill="none" stroke={COLORS.blue} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* EV */}
        <path d={buildPath('ev')} fill="none" stroke={COLORS.green} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* AC (dashed if partial) */}
        {hasAnyAC && (
          <path d={buildPath('ac')} fill="none" stroke={COLORS.amber} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* X-axis labels */}
        {points.map((p, i) => {
          if (i % tickStep !== 0 && i !== points.length - 1) return null
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="16" height="6">
        <line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth="2" />
      </svg>
      {label}
    </span>
  )
}
