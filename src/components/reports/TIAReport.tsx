'use client'

// =============================================================================
// src/components/reports/TIAReport.tsx
// =============================================================================
// Time Impact Analysis — documentation package for change order claims and
// owner notification. Single-snapshot view that compares contract baseline
// dates to current projected completion, with delay drivers and supporting
// evidence (sequence problems, missing logic, long-lead exposure).
//
// Federal customers use this as the basis exhibit when filing a delay claim.
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

export interface TIAReportProps {
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

  // Baseline contract dates
  ntp?: string
  originalCompletion?: string
  revisedCompletion?: string
  timeExtensionDays: number

  // Current schedule snapshot
  dataDate?: string
  projectedEnd?: string

  // Computed delay
  daysBehindRevised: number       // projected vs revised
  daysBehindOriginal: number      // projected vs original (includes any TE)

  // Delay drivers
  criticalDrivers: any[]          // sampled top 10
  criticalDriversTotal: number

  // Supporting evidence counts
  oosCount: number
  noTiesCount: number
  longLeadAtRisk: number
  negativeFloatCount: number
}

export default function TIAReport(p: TIAReportProps) {
  const isDelayed = p.daysBehindRevised > 0
  const isClaimable = p.daysBehindRevised >= 30   // 30+ day threshold typically warrants formal TIA

  return (
    <div>
      {/* Action bar */}
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Time Impact Analysis documentation. Use as the basis exhibit when
          notifying the owner of delay or filing a change order claim.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Time Impact Analysis"
          reportNo={p.reportNo}
          versionLabel={p.versionLabel}
          orgName={p.orgName}
          project={p.project}
        />

        {/* ──── Headline finding ─────────────────────────────────────── */}
        <div className="rounded-xl px-4 py-4 mb-5 flex items-center gap-4 print:break-inside-avoid"
          style={{
            background: isClaimable ? '#fee2e2' : isDelayed ? '#fef3c7' : '#e6f5ee',
            border: `1px solid ${isClaimable ? COLORS.red : isDelayed ? COLORS.amber : COLORS.green}33`,
          }}>
          <div className="rounded-full w-14 h-14 flex items-center justify-center flex-shrink-0"
            style={{ background: isClaimable ? COLORS.red : isDelayed ? COLORS.amber : COLORS.green, color: '#fff' }}>
            <span className="font-extrabold text-[18px]">{p.daysBehindRevised > 0 ? `+${p.daysBehindRevised}` : p.daysBehindRevised}</span>
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-extrabold" style={{ color: COLORS.ink }}>
              {isClaimable
                ? `Project ${p.daysBehindRevised} days behind — TIA territory`
                : isDelayed
                  ? `Project ${p.daysBehindRevised} day${p.daysBehindRevised === 1 ? '' : 's'} behind revised completion`
                  : 'Project on or ahead of revised contract completion'}
            </div>
            {isClaimable && (
              <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                Recovery may not be possible within original contract terms. Begin formal
                TIA documentation and prepare for contract amendment discussion.
              </div>
            )}
          </div>
        </div>

        {/* ──── Schedule comparison ──────────────────────────────────── */}
        <SectionBar tag="CMPR" title="Schedule Comparison" />
        <div className="grid grid-cols-2 gap-3 mb-4 print:break-inside-avoid">
          <CompareCard
            title="Baseline (Contract)"
            tone="slate"
            rows={[
              { label: 'NTP / Contract Start', value: fmtShortDate(p.ntp) },
              { label: 'Original Completion', value: fmtShortDate(p.originalCompletion) },
              { label: 'Time Extensions Granted', value: p.timeExtensionDays > 0 ? `+${p.timeExtensionDays} days` : 'None' },
              { label: 'Revised Completion', value: fmtShortDate(p.revisedCompletion) },
            ]}
          />
          <CompareCard
            title="Current Forecast"
            tone={isClaimable ? 'red' : isDelayed ? 'amber' : 'green'}
            rows={[
              { label: 'Data Date', value: fmtShortDate(p.dataDate) },
              { label: 'Projected End', value: fmtShortDate(p.projectedEnd) },
              { label: 'Variance vs Revised', value: p.daysBehindRevised > 0 ? `+${p.daysBehindRevised} days late` : p.daysBehindRevised === 0 ? 'On plan' : `${Math.abs(p.daysBehindRevised)} days ahead`, accent: true },
              { label: 'Variance vs Original', value: p.daysBehindOriginal > 0 ? `+${p.daysBehindOriginal} days late` : p.daysBehindOriginal === 0 ? 'On plan' : `${Math.abs(p.daysBehindOriginal)} days ahead`, accent: true },
            ]}
          />
        </div>

        {/* ──── Visual timeline ──────────────────────────────────────── */}
        <Timeline
          ntp={p.ntp}
          originalCompletion={p.originalCompletion}
          revisedCompletion={p.revisedCompletion}
          dataDate={p.dataDate}
          projectedEnd={p.projectedEnd}
          daysBehindRevised={p.daysBehindRevised}
        />

        {/* ──── Delay drivers ────────────────────────────────────────── */}
        {p.criticalDriversTotal > 0 && (
          <>
            <SectionBar tag="DRV" title="Delay Drivers · Critical Path" rightMeta={`${p.criticalDriversTotal} activities on critical path`} />
            <Note>
              Activities currently on the critical path (total float ≤ 0). These are the
              activities directly controlling the projected completion date. Each day
              of slip on any one of these is a day added to project end.
            </Note>
            <ActivityTable rows={p.criticalDrivers} columns={['code', 'name', 'float', 'earlyStart', 'earlyEnd']} />
            {p.criticalDriversTotal > p.criticalDrivers.length && (
              <div className="text-[9px] text-slate-400 italic mb-3">
                Showing top {p.criticalDrivers.length} of {p.criticalDriversTotal} critical path activities. Full list available in the Full Analysis Report.
              </div>
            )}
          </>
        )}

        {/* ──── Supporting evidence ──────────────────────────────────── */}
        <SectionBar tag="EVID" title="Supporting Evidence" />
        <Note>
          Schedule-quality factors that contribute to or amplify the delay. Include
          these counts as exhibits in the TIA submission so the owner sees the
          underlying schedule health.
        </Note>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 print:break-inside-avoid">
          <EvidenceCard
            label="Negative Float"
            count={p.negativeFloatCount}
            tone={p.negativeFloatCount > 0 ? 'red' : 'green'}
            caption="activities running late"
          />
          <EvidenceCard
            label="Sequence Problems"
            count={p.oosCount}
            tone={p.oosCount > 0 ? 'amber' : 'green'}
            caption="OOS violations"
          />
          <EvidenceCard
            label="Long Lead at Risk"
            count={p.longLeadAtRisk}
            tone={p.longLeadAtRisk > 0 ? 'red' : 'green'}
            caption="≤14 days float"
          />
          <EvidenceCard
            label="Missing Logic"
            count={p.noTiesCount}
            tone={p.noTiesCount > 0 ? 'amber' : 'green'}
            caption="no-tie activities"
          />
        </div>

        {/* ──── Use of this analysis ─────────────────────────────────── */}
        <SectionBar tag="USE" title="How to Use This Report" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 print:break-inside-avoid">
          <UseCard
            tone="blue"
            title="As owner notification"
            body="Most federal contracts require notification within 7-10 days of becoming aware of a delay. Attach this report to the formal notice letter to provide complete schedule basis."
          />
          <UseCard
            tone="amber"
            title="As change order exhibit"
            body="When filing a request for time extension or compensable delay, include this report as the supporting schedule analysis. Pair with the delay event log and root cause documentation."
          />
          <UseCard
            tone="green"
            title="As coordination tool"
            body="Walk this report with the field super, scheduler, and key trades. Each critical path activity needs an owner; each delay driver needs a recovery plan or formal acceptance."
          />
          <UseCard
            tone="red"
            title="As recovery basis"
            body="If recovery is possible, this report defines the gap. Use it to scope crew additions, overtime, or sequence acceleration. Track recovery actions against the activities listed here."
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

function CompareCard({ title, tone, rows }: {
  title: string
  tone: 'red' | 'amber' | 'green' | 'slate'
  rows: Array<{ label: string; value: string; accent?: boolean }>
}) {
  const color = tone === 'red' ? COLORS.red : tone === 'amber' ? COLORS.amber : tone === 'green' ? COLORS.green : COLORS.slate
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-3 py-2" style={{ background: COLORS.ink }}>
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-white">{title}</div>
      </div>
      <div className="px-3 py-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
            <span className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">{r.label}</span>
            <span className={`font-mono text-[11.5px] ${r.accent ? 'font-extrabold' : 'font-bold'}`} style={{ color: r.accent ? color : COLORS.ink }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Horizontal timeline showing NTP → Original Completion → Revised → Projected.
 * Pure SVG, no chart library. Markers placed proportionally on the time axis.
 */
function Timeline({
  ntp, originalCompletion, revisedCompletion, dataDate, projectedEnd, daysBehindRevised,
}: {
  ntp?: string; originalCompletion?: string; revisedCompletion?: string
  dataDate?: string; projectedEnd?: string; daysBehindRevised: number
}) {
  if (!ntp || !projectedEnd) return null
  const start = new Date(ntp).getTime()
  const end = new Date(projectedEnd).getTime()
  if (isNaN(start) || isNaN(end) || end <= start) return null

  // Add padding so end markers aren't pinned to the edge
  const totalMs = end - start
  const span = totalMs * 1.06   // 6% padding to the right
  const pct = (d?: string) => {
    if (!d) return null
    const t = new Date(d).getTime()
    if (isNaN(t)) return null
    return Math.max(0, Math.min(100, ((t - start) / span) * 100))
  }

  const W = 700, H = 110, M = 30
  const ntpX = pct(ntp); const origX = pct(originalCompletion)
  const revX = pct(revisedCompletion); const ddX = pct(dataDate); const projX = pct(projectedEnd)

  const xFor = (p: number | null) => p === null ? null : M + (p / 100) * (W - M * 2)

  return (
    <div className="mb-5 print:break-inside-avoid">
      <SectionBar tag="TML" title="Timeline" />
      <div className="rounded-lg border border-slate-200 px-3 py-3 bg-white">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ maxWidth: '100%' }}>
          {/* Track */}
          <line x1={M} y1={55} x2={W - M} y2={55} stroke="#cbd5e1" strokeWidth="2" />

          {/* Original → Revised slip indicator */}
          {origX !== null && revX !== null && revX !== origX && (
            <rect
              x={Math.min(xFor(origX)!, xFor(revX)!)}
              y={50}
              width={Math.abs(xFor(revX)! - xFor(origX)!)}
              height={10}
              fill={COLORS.amber}
              opacity={0.25}
            />
          )}

          {/* Revised → Projected delay indicator */}
          {revX !== null && projX !== null && daysBehindRevised > 0 && (
            <rect
              x={Math.min(xFor(revX)!, xFor(projX)!)}
              y={50}
              width={Math.abs(xFor(projX)! - xFor(revX)!)}
              height={10}
              fill={COLORS.red}
              opacity={0.35}
            />
          )}

          {/* Markers */}
          <Marker x={xFor(ntpX)} y={55} label="NTP" date={ntp} color={COLORS.slate} above />
          <Marker x={xFor(origX)} y={55} label="Original" date={originalCompletion} color={COLORS.slate} />
          {revX !== null && origX !== null && Math.abs(revX - origX) > 2 && (
            <Marker x={xFor(revX)} y={55} label="Revised" date={revisedCompletion} color={COLORS.amber} above />
          )}
          <Marker x={xFor(ddX)} y={55} label="Data Date" date={dataDate} color={COLORS.blue} dashed />
          <Marker x={xFor(projX)} y={55} label="Projected" date={projectedEnd} color={daysBehindRevised > 0 ? COLORS.red : COLORS.green} above bold />
        </svg>
      </div>
    </div>
  )
}

function Marker({ x, y, label, date, color, above, bold, dashed }: {
  x: number | null; y: number; label: string; date?: string; color: string
  above?: boolean; bold?: boolean; dashed?: boolean
}) {
  if (x === null) return null
  const labelY = above ? y - 22 : y + 32
  const dateY = above ? y - 8 : y + 18
  return (
    <>
      {dashed ? (
        <line x1={x} y1={y - 12} x2={x} y2={y + 12} stroke={color} strokeWidth="2" strokeDasharray="3 2" />
      ) : (
        <circle cx={x} cy={y} r={bold ? 5 : 4} fill={color} stroke="#fff" strokeWidth="1.5" />
      )}
      <text x={x} y={labelY} fontSize="10" fontWeight={bold ? 700 : 500} textAnchor="middle" fill={color}>{label}</text>
      {date && (
        <text x={x} y={dateY} fontSize="9" fontFamily="monospace" textAnchor="middle" fill="#64748b">
          {fmtShortDate(date)}
        </text>
      )}
    </>
  )
}

function EvidenceCard({ label, count, tone, caption }: {
  label: string; count: number; tone: 'red' | 'amber' | 'green' | 'slate'; caption: string
}) {
  const color = tone === 'red' ? COLORS.red : tone === 'amber' ? COLORS.amber : tone === 'green' ? COLORS.green : COLORS.slate
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="font-mono text-[18px] font-extrabold leading-none" style={{ color }}>{count}</div>
      <div className="text-[9.5px] text-slate-500 mt-1 leading-snug">{caption}</div>
    </div>
  )
}

function UseCard({ tone, title, body }: { tone: 'red' | 'amber' | 'green' | 'blue'; title: string; body: string }) {
  const color = tone === 'red' ? COLORS.red : tone === 'amber' ? COLORS.amber : tone === 'green' ? COLORS.green : COLORS.blue
  return (
    <div className="rounded-lg p-3 border-l-4" style={{ background: '#f8fafc', borderColor: color }}>
      <div className="text-[10px] font-extrabold uppercase tracking-wide mb-1" style={{ color }}>{title}</div>
      <div className="text-[11.5px] leading-relaxed" style={{ color: COLORS.ink }}>{body}</div>
    </div>
  )
}

function ActivityTable({ rows, columns }: { rows: any[]; columns: string[] }) {
  const colDef: Record<string, { label: string; width?: string; render: (r: any) => string; mono?: boolean; bold?: boolean; align?: 'left' | 'right' }> = {
    code: { label: 'Activity ID', width: '14%', render: r => r.task_code || '—', mono: true, bold: true },
    name: { label: 'Activity Name', render: r => trunc(r.task_name || '—', 50) },
    float: { label: 'Float (hr)', width: '10%', render: r => r.total_float_hr_cnt || '0', mono: true, align: 'right' },
    earlyStart: { label: 'Early Start', width: '12%', render: r => shortDate(r.early_start_date || r.target_start_date), mono: true },
    earlyEnd: { label: 'Early Finish', width: '12%', render: r => shortDate(r.early_end_date || r.target_end_date), mono: true },
  }
  return (
    <table className="w-full text-[10.5px] mb-3">
      <thead>
        <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
          {columns.map(c => (
            <th key={c} className="py-1.5 px-2 font-extrabold" style={colDef[c]?.width ? { width: colDef[c].width } : undefined}>
              {colDef[c]?.label || c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-100 print:break-inside-avoid">
            {columns.map(c => {
              const def = colDef[c]
              const align = def?.align === 'right' ? 'text-right' : 'text-left'
              const weight = def?.bold ? 'font-bold' : ''
              const family = def?.mono ? 'font-mono' : ''
              const colColor = def?.bold ? { color: COLORS.ink } : undefined
              return (
                <td key={c} className={`py-1.5 px-2 ${align} ${weight} ${family} text-slate-700`} style={colColor}>
                  {def?.render(r) || '—'}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function trunc(s: string | undefined, max: number): string {
  if (!s) return '—'
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
function shortDate(d?: string): string {
  if (!d) return '—'
  try {
    const dt = new Date(d.replace(' ', 'T'))
    if (isNaN(dt.getTime())) return '—'
    return dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
  } catch { return '—' }
}
