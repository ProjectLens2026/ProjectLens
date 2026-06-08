'use client'

// =============================================================================
// src/components/reports/FullAnalysisReport.tsx
// =============================================================================
// Full Analysis Report — the scheduler's deep diagnostic. Every metric the
// engine produces, organized by diagnostic category. Sits between Executive
// Summary (owner snapshot) and Complete Project Report (kitchen sink) —
// focused on WHAT WAS FOUND, not raw activity dumps.
//
// Sections:
//   1. Cover sheet
//   2. Diagnostic summary (key metrics tile grid)
//   3. Critical Path Analysis (count + top drivers)
//   4. Float Distribution (histogram)
//   5. Schedule Logic Integrity (OOS + no-ties)
//   6. Activity Status (counts + work % breakdown)
//   7. Procurement Health (long lead)
//   8. Milestones at Risk
//   9. Footer
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

export interface FloatBucket {
  label: string         // e.g. "≤ 0d (critical)"
  count: number
  color: string
}

export interface FullAnalysisReportProps {
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

  // Diagnostic summary
  healthScore: number
  healthLabel: string
  daysBehind: number
  workCompletePct: number
  totalActivities: number
  completedCount: number
  inProgressCount: number
  notStartedCount: number
  negativeFloatCount: number
  dataDate?: string

  // Critical path
  criticalDriversCount: number
  criticalDriversTop: any[]      // sampled top 10
  longestPathCount: number
  longestPathTop: any[]

  // Float distribution
  floatBuckets: FloatBucket[]

  // Schedule logic integrity
  oosCount: number
  oosTop: any[]
  noTiesCount: number
  noTiesTop: any[]

  // Procurement
  longLeadTotal: number
  longLeadAtRisk: number
  longLeadTop: any[]

  // Milestones at risk
  milestonesAtRisk: any[]
}

export default function FullAnalysisReport(p: FullAnalysisReportProps) {
  return (
    <div>
      {/* Action bar */}
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Deep diagnostic of every metric the analyzer produces — schedule health,
          critical path, float, logic integrity, and procurement.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Full Analysis Report"
          reportNo={p.reportNo}
          versionLabel={p.versionLabel}
          orgName={p.orgName}
          project={p.project}
        />

        {/* ──── 1. DIAGNOSTIC SUMMARY ──────────────────────────────── */}
        <SectionBar tag="DIAG" title="Diagnostic Summary" rightMeta={p.dataDate ? `Data date · ${fmtShortDate(p.dataDate)}` : undefined} />
        <HealthBanner score={p.healthScore} label={p.healthLabel} />

        <SubLabel>Schedule indicators</SubLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 print:break-inside-avoid">
          <KPI label="Days Behind" value={p.daysBehind > 0 ? `+${p.daysBehind}` : `${p.daysBehind}`} tone={p.daysBehind > 0 ? 'red' : 'green'} caption={p.daysBehind > 0 ? 'past revised end' : 'on plan'} />
          <KPI label="Work Complete" value={`${Math.round(p.workCompletePct)}%`} tone="blue" caption="effective % across activities" />
          <KPI label="Total Activities" value={String(p.totalActivities)} tone="slate" caption={`${p.completedCount} done · ${p.inProgressCount} active`} />
          <KPI label="Negative Float" value={String(p.negativeFloatCount)} tone={p.negativeFloatCount > 0 ? 'red' : 'green'} caption={p.negativeFloatCount === 0 ? 'no late activities' : 'activities behind'} />
        </div>

        {/* ──── 2. CRITICAL PATH ANALYSIS ──────────────────────────── */}
        {(p.criticalDriversCount > 0 || p.longestPathCount > 0) && (
          <Section>
            <SectionBar tag="CPA" title="Critical Path Analysis" rightMeta={`${p.criticalDriversCount} drivers · ${p.longestPathCount} longest path acts`} />
            <Note>
              Critical path drivers are activities with total float ≤ 0 — they directly
              control the project finish date. Longest path activities are tagged
              <span className="font-mono"> driving_path_flag = 'Y'</span> by P6.
            </Note>

            {p.criticalDriversTop.length > 0 && (
              <>
                <SubLabel>Top critical drivers · sample of {p.criticalDriversTop.length}{p.criticalDriversCount > p.criticalDriversTop.length ? ` of ${p.criticalDriversCount}` : ''}</SubLabel>
                <ActivityTable rows={p.criticalDriversTop} columns={['code', 'name', 'float', 'earlyStart', 'earlyEnd']} />
              </>
            )}

            {p.longestPathTop.length > 0 && (
              <>
                <SubLabel>Longest path · sample of {p.longestPathTop.length}{p.longestPathCount > p.longestPathTop.length ? ` of ${p.longestPathCount}` : ''}</SubLabel>
                <ActivityTable rows={p.longestPathTop} columns={['code', 'name', 'float', 'earlyStart', 'earlyEnd']} />
              </>
            )}
          </Section>
        )}

        {/* ──── 3. FLOAT DISTRIBUTION ──────────────────────────────── */}
        {p.floatBuckets.length > 0 && (
          <Section>
            <SectionBar tag="FLT" title="Float Distribution" rightMeta={`${p.totalActivities} total activities`} />
            <Note>
              How float is distributed across the project. A healthy schedule has most
              activities in the &gt;14 day buckets; concentration at ≤ 0 indicates
              near-critical fragility.
            </Note>
            <FloatHistogram buckets={p.floatBuckets} max={p.totalActivities} />
          </Section>
        )}

        {/* ──── 4. SCHEDULE LOGIC INTEGRITY ────────────────────────── */}
        {(p.oosCount > 0 || p.noTiesCount > 0) && (
          <Section>
            <SectionBar tag="LOG" title="Schedule Logic Integrity" rightMeta={`${p.oosCount} OOS · ${p.noTiesCount} no-ties`} />
            <Note>
              Construction sequence problems (OOS) — activities that started or finished
              against their predecessor logic. Missing-ties — activities with no
              predecessor or successor, which break CPM analysis.
            </Note>

            {p.oosTop.length > 0 && (
              <>
                <SubLabel>Out-of-sequence activities · top {p.oosTop.length}{p.oosCount > p.oosTop.length ? ` of ${p.oosCount}` : ''}</SubLabel>
                <table className="w-full text-[10.5px] mb-4">
                  <thead>
                    <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
                      <th className="py-1.5 px-2 w-[14%]">Activity</th>
                      <th className="py-1.5 px-2">Name</th>
                      <th className="py-1.5 px-2 w-[14%]">Predecessor</th>
                      <th className="py-1.5 px-2 w-[8%]">Rel</th>
                      <th className="py-1.5 px-2 text-right w-[12%]">Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.oosTop.map((o: any, i: number) => {
                      const primary = (o.violations && o.violations[0]) || null
                      const predCode = primary?.pred?.task_code || o.pred?.task_code || '—'
                      const relLabel = primary?.relTypeLabel || (o.relType?.replace(/^PR_/, '')) || '—'
                      const variance = primary?.varianceDays
                      return (
                        <tr key={i} className="border-b border-slate-100 print:break-inside-avoid">
                          <td className="py-1.5 px-2 font-mono font-bold" style={{ color: COLORS.ink }}>{o.task?.task_code || '—'}</td>
                          <td className="py-1.5 px-2 text-slate-700">{trunc(o.task?.task_name, 45)}</td>
                          <td className="py-1.5 px-2 font-mono text-slate-600">{predCode}</td>
                          <td className="py-1.5 px-2"><span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100" style={{ color: COLORS.ink }}>{relLabel}</span></td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold" style={{ color: COLORS.red }}>{variance !== undefined ? `${variance}d` : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}

            {p.noTiesTop.length > 0 && (
              <>
                <SubLabel>Activities with no logic ties · top {p.noTiesTop.length}{p.noTiesCount > p.noTiesTop.length ? ` of ${p.noTiesCount}` : ''}</SubLabel>
                <ActivityTable rows={p.noTiesTop} columns={['code', 'name', 'earlyStart', 'earlyEnd', 'status']} />
              </>
            )}
          </Section>
        )}

        {/* ──── 5. ACTIVITY STATUS ─────────────────────────────────── */}
        <Section>
          <SectionBar tag="STAT" title="Activity Status Breakdown" rightMeta={`${p.totalActivities} total`} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 print:break-inside-avoid">
            <KPI label="Complete" value={String(p.completedCount)} tone="green" caption={`${pctOf(p.completedCount, p.totalActivities)}% of total`} />
            <KPI label="In Progress" value={String(p.inProgressCount)} tone="blue" caption={`${pctOf(p.inProgressCount, p.totalActivities)}% of total`} />
            <KPI label="Not Started" value={String(p.notStartedCount)} tone="slate" caption={`${pctOf(p.notStartedCount, p.totalActivities)}% of total`} />
            <KPI label="Negative Float" value={String(p.negativeFloatCount)} tone={p.negativeFloatCount > 0 ? 'red' : 'green'} caption={`${pctOf(p.negativeFloatCount, p.totalActivities)}% behind`} />
          </div>
          <StatusBar
            complete={p.completedCount}
            inProgress={p.inProgressCount}
            notStarted={p.notStartedCount}
          />
        </Section>

        {/* ──── 6. PROCUREMENT HEALTH ──────────────────────────────── */}
        {p.longLeadTotal > 0 && (
          <Section>
            <SectionBar tag="PRO" title="Procurement Health" rightMeta={`${p.longLeadAtRisk} at risk · ${p.longLeadTotal} total`} />
            <Note>
              Long-lead items are procurement activities with ≥35 calendar days duration.
              "At risk" = float ≤ 14 days; further slip translates directly into project
              completion delay.
            </Note>
            <div className="grid grid-cols-3 gap-2 mb-3 print:break-inside-avoid">
              <KPI label="Total long-lead" value={String(p.longLeadTotal)} tone="slate" caption="≥35 days duration" />
              <KPI label="At risk" value={String(p.longLeadAtRisk)} tone={p.longLeadAtRisk > 0 ? 'red' : 'green'} caption="≤14 days float" />
              <KPI label="Healthy" value={String(p.longLeadTotal - p.longLeadAtRisk)} tone="green" caption=">14 days float" />
            </div>
            {p.longLeadTop.length > 0 && (
              <>
                <SubLabel>Most exposed · sorted by float ascending</SubLabel>
                <table className="w-full text-[10.5px] mb-3">
                  <thead>
                    <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
                      <th className="py-1.5 px-2 w-[14%]">Activity</th>
                      <th className="py-1.5 px-2">Name</th>
                      <th className="py-1.5 px-2 w-[10%]">Duration</th>
                      <th className="py-1.5 px-2 w-[10%]">Remaining</th>
                      <th className="py-1.5 px-2 w-[10%]">Float</th>
                      <th className="py-1.5 px-2 w-[10%]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.longLeadTop.map((it: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100 print:break-inside-avoid">
                        <td className="py-1.5 px-2 font-mono font-bold" style={{ color: COLORS.ink }}>{it.task_code || '—'}</td>
                        <td className="py-1.5 px-2 text-slate-700">{trunc(it.task_name, 45)}</td>
                        <td className="py-1.5 px-2 font-mono text-slate-600">{it.durationDays}d</td>
                        <td className="py-1.5 px-2 font-mono text-slate-600">{it.remainingDays}d</td>
                        <td className="py-1.5 px-2 font-mono font-bold" style={{ color: it.floatDays <= 14 ? COLORS.red : COLORS.green }}>{it.floatDays}d</td>
                        <td className="py-1.5 px-2 text-slate-600">{statusLabel(it.status_code)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Section>
        )}

        {/* ──── 7. MILESTONES AT RISK ──────────────────────────────── */}
        {p.milestonesAtRisk.length > 0 && (
          <Section>
            <SectionBar tag="MS" title="Milestones at Risk" rightMeta={`${p.milestonesAtRisk.length}`} />
            <Note>
              Contract milestones with negative float — projected to be missed based
              on current schedule. Owner notification typically required within 7 days.
            </Note>
            <ActivityTable rows={p.milestonesAtRisk} columns={['code', 'name', 'float', 'earlyEnd', 'status']} />
          </Section>
        )}

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

function Section({ children }: { children: React.ReactNode }) {
  return <div className="mt-6">{children}</div>
}

function SectionBar({ tag, title, rightMeta }: { tag: string; title: string; rightMeta?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 mb-3 rounded text-white" style={{ background: COLORS.ink }}>
      <span className="font-mono text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.18)' }}>
        {tag}
      </span>
      <span className="text-[13px] font-extrabold uppercase tracking-wide flex-1">{title}</span>
      {rightMeta && <span className="font-mono text-[10px] opacity-80">{rightMeta}</span>}
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700 mb-2 mt-3">{children}</div>
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-slate-500 italic leading-relaxed mb-3 max-w-[90%]">{children}</p>
}

function HealthBanner({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? COLORS.green : score >= 60 ? COLORS.amber : COLORS.red
  const bg = score >= 80 ? '#e6f5ee' : score >= 60 ? '#fef3c7' : '#fee2e2'
  return (
    <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-3 print:break-inside-avoid" style={{ background: bg, border: `1px solid ${color}33` }}>
      <div className="rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ background: color, color: '#fff' }}>
        <span className="font-extrabold text-[13px]">{score}</span>
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-extrabold" style={{ color: COLORS.ink }}>{label} · Health {score}/100</div>
      </div>
    </div>
  )
}

function KPI({ label, value, caption, tone }: { label: string; value: string; caption: string; tone: 'blue' | 'red' | 'amber' | 'green' | 'slate' }) {
  const accent = tone === 'red' ? COLORS.red : tone === 'amber' ? COLORS.amber : tone === 'green' ? COLORS.green : tone === 'slate' ? COLORS.slate : COLORS.blue
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accent }} />
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="font-mono text-[17px] font-extrabold leading-none" style={{ color: accent }}>{value}</div>
      <div className="text-[9.5px] text-slate-500 mt-1 leading-snug">{caption}</div>
    </div>
  )
}

/**
 * Horizontal bar chart of float distribution. Each bucket is a row with
 * label · count · bar · % of total.
 */
function FloatHistogram({ buckets, max }: { buckets: FloatBucket[]; max: number }) {
  const maxCount = Math.max(1, ...buckets.map(b => b.count))
  return (
    <div className="space-y-1.5 mb-3">
      {buckets.map(b => {
        const pct = max > 0 ? (b.count / max) * 100 : 0
        const barPct = (b.count / maxCount) * 100
        return (
          <div key={b.label} className="grid grid-cols-[140px_1fr_60px] gap-3 items-center">
            <div className="text-[10.5px] font-mono text-slate-600">{b.label}</div>
            <div className="relative h-5 bg-slate-50 rounded overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded"
                style={{ width: `${Math.max(2, barPct)}%`, background: b.color }}
              />
              <div className="absolute inset-0 flex items-center justify-end pr-2 font-mono font-bold text-[10px]" style={{ color: barPct > 70 ? '#fff' : COLORS.ink }}>
                {b.count}
              </div>
            </div>
            <div className="text-[10px] font-mono text-slate-500 text-right">{pct.toFixed(1)}%</div>
          </div>
        )
      })}
    </div>
  )
}

function StatusBar({ complete, inProgress, notStarted }: { complete: number; inProgress: number; notStarted: number }) {
  const total = complete + inProgress + notStarted
  if (total === 0) return null
  const cPct = (complete / total) * 100
  const iPct = (inProgress / total) * 100
  const nPct = (notStarted / total) * 100
  return (
    <div className="rounded-lg overflow-hidden border border-slate-200 mb-3">
      <div className="flex h-6">
        {cPct > 0 && <div style={{ width: `${cPct}%`, background: COLORS.green }} title={`Complete: ${complete}`} />}
        {iPct > 0 && <div style={{ width: `${iPct}%`, background: COLORS.blue }} title={`In Progress: ${inProgress}`} />}
        {nPct > 0 && <div style={{ width: `${nPct}%`, background: '#cbd5e1' }} title={`Not Started: ${notStarted}`} />}
      </div>
      <div className="flex items-center gap-4 px-3 py-1.5 text-[10px] font-mono text-slate-600 bg-slate-50">
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: COLORS.green }} />Complete {cPct.toFixed(0)}%</span>
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: COLORS.blue }} />In Progress {iPct.toFixed(0)}%</span>
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: '#cbd5e1' }} />Not Started {nPct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

function ActivityTable({ rows, columns }: { rows: any[]; columns: string[] }) {
  const colDef: Record<string, { label: string; width?: string; render: (r: any) => string; mono?: boolean; bold?: boolean; align?: 'left' | 'right' }> = {
    code: { label: 'Activity ID', width: '14%', render: r => r.task_code || r.code || '—', mono: true, bold: true },
    name: { label: 'Activity Name', render: r => trunc(r.task_name || r.name || '—', 50) },
    float: { label: 'Float (hr)', width: '10%', render: r => r.total_float_hr_cnt || '0', mono: true, align: 'right' },
    earlyStart: { label: 'Early Start', width: '12%', render: r => shortDate(r.early_start_date || r.target_start_date), mono: true },
    earlyEnd: { label: 'Early Finish', width: '12%', render: r => shortDate(r.early_end_date || r.target_end_date), mono: true },
    status: { label: 'Status', width: '10%', render: r => statusLabel(r.status_code) },
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
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
function statusLabel(code?: string): string {
  switch (code) {
    case 'TK_NotStart': return 'Not Started'
    case 'TK_Active': return 'In Progress'
    case 'TK_Complete': return 'Complete'
    default: return code || '—'
  }
}
function pctOf(part: number, total: number): string {
  if (total <= 0) return '0'
  return ((part / total) * 100).toFixed(0)
}
