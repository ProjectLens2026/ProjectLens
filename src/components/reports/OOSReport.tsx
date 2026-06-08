'use client'

// =============================================================================
// src/components/reports/OOSReport.tsx
// =============================================================================
// Out-of-Sequence Report — the federal-audit-grade OOS deliverable.
//
// Pulls every detected OOS activity with full per-violation evidence and
// presents it in the convention federal claim analysts expect:
//   - Methodology callout (matches P6 Schedule Log)
//   - Findings summary (counts)
//   - Distribution by relationship type
//   - Detail table — one row per activity-predecessor violation
//
// This is the report that documents the "44 vs 7" story. Generic parsers
// flag every historical date mismatch (44+); ControlLens reports only the
// real OOS that P6 Schedule Log would flag (7 in our test schedule).
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

export interface OOSReportProps {
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
  dataDate?: string
  oos: any[]                    // raw outOfSequence array
  totalActivities: number       // for context (% of total)
}

export default function OOSReport(p: OOSReportProps) {
  const { orgName, reportNo, versionLabel, project, dataDate, oos, totalActivities } = p

  // Compute summary stats
  const activityCount = oos.length
  const totalViolations = oos.reduce((sum: number, o: any) =>
    sum + (Array.isArray(o.violations) ? o.violations.length : 1), 0)

  // Distribution by relationship type
  const byRelType: Record<string, number> = { FS: 0, SS: 0, FF: 0, SF: 0, Other: 0 }
  for (const o of oos) {
    const violations = Array.isArray(o.violations) && o.violations.length > 0 ? o.violations : [{ relTypeLabel: o.relType?.replace(/^PR_/, '') || 'Other' }]
    for (const v of violations) {
      const rel = (v.relTypeLabel || v.relType?.replace(/^PR_/, '') || 'Other').toUpperCase()
      if (rel in byRelType) byRelType[rel] += 1
      else byRelType.Other += 1
    }
  }

  // Distribution by severity (based on variance magnitude)
  const bySeverity = { critical: 0, high: 0, medium: 0 }
  for (const o of oos) {
    const violations = Array.isArray(o.violations) && o.violations.length > 0 ? o.violations : [{ varianceDays: 0 }]
    for (const v of violations) {
      const variance = Math.abs(v.varianceDays || 0)
      if (variance >= 14) bySeverity.critical += 1
      else if (variance >= 7) bySeverity.high += 1
      else bySeverity.medium += 1
    }
  }

  // Flatten to one row per (activity, violation) pair for the detail table
  const detailRows: Array<{ task: any; violation: any; idx: number }> = []
  for (const o of oos) {
    const violations = Array.isArray(o.violations) && o.violations.length > 0
      ? o.violations
      : [{ pred: o.pred, relTypeLabel: o.relType?.replace(/^PR_/, ''), varianceDays: 0 }]
    violations.forEach((v: any, idx: number) => {
      detailRows.push({ task: o.task, violation: v, idx })
    })
  }

  return (
    <div>
      {/* Action bar */}
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Federal-audit-grade documentation of every detected out-of-sequence activity
          with full per-violation evidence.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Out-of-Sequence Report"
          reportNo={reportNo}
          versionLabel={versionLabel}
          orgName={orgName}
          project={project}
        />

        {/* ──── Findings summary ─────────────────────────────────────── */}
        <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-4 print:break-inside-avoid"
          style={{ background: activityCount > 0 ? '#fef3c7' : '#e6f5ee', border: `1px solid ${activityCount > 0 ? COLORS.amber : COLORS.green}33` }}>
          <div className="rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0"
            style={{ background: activityCount > 0 ? COLORS.amber : COLORS.green, color: '#fff' }}>
            <span className="font-extrabold text-[16px]">{activityCount}</span>
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-extrabold" style={{ color: COLORS.ink }}>
              {activityCount === 0 ? 'No out-of-sequence activities detected' : `${activityCount} activit${activityCount === 1 ? 'y' : 'ies'} with sequence violations`}
            </div>
            <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
              {totalViolations !== activityCount && (
                <>{totalViolations} total predecessor relationships violated · </>
              )}
              {totalActivities > 0 && (
                <>{((activityCount / totalActivities) * 100).toFixed(1)}% of schedule · </>
              )}
              {dataDate && <>data date <span className="font-mono font-bold">{fmtShortDate(dataDate)}</span></>}
            </div>
          </div>
        </div>

        {/* ──── Methodology callout ──────────────────────────────────── */}
        <SectionBar tag="METH" title="Detection Methodology" />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4 print:break-inside-avoid">
          <p className="text-[12px] text-slate-700 leading-relaxed mb-2">
            ControlLens detects out-of-sequence activities using the <b>P6 Schedule Log convention</b>:
            an activity is flagged only when it actualized in a way that violates the relationship
            logic with at least one predecessor.
          </p>
          <ul className="text-[11.5px] text-slate-600 leading-relaxed list-disc pl-5 space-y-1">
            <li><b>FS violation</b> — successor started/finished before predecessor finished (after accounting for any lag)</li>
            <li><b>SS violation</b> — successor started before predecessor started</li>
            <li><b>FF violation</b> — successor finished before predecessor finished</li>
            <li><b>SF violation</b> — successor finished before predecessor started (rare)</li>
          </ul>
          <p className="text-[11px] text-slate-500 italic leading-relaxed mt-2">
            Generic parsers flag every historical date mismatch, often producing dozens of false
            positives. This report contains only relationships that P6 Schedule Log itself would
            flag — what a federal auditor would care about.
          </p>
        </div>

        {/* ──── Distribution by relationship type ────────────────────── */}
        {totalViolations > 0 && (
          <>
            <SectionBar tag="DIST" title="Violations by Relationship Type" rightMeta={`${totalViolations} total`} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 print:break-inside-avoid">
              <RelBar label="FS" count={byRelType.FS} total={totalViolations} color={COLORS.red} />
              <RelBar label="SS" count={byRelType.SS} total={totalViolations} color={COLORS.amber} />
              <RelBar label="FF" count={byRelType.FF} total={totalViolations} color={COLORS.blue} />
              <RelBar label="SF" count={byRelType.SF + byRelType.Other} total={totalViolations} color={COLORS.slate} />
            </div>

            <SectionBar tag="SEV" title="Violations by Severity" rightMeta="based on variance days" />
            <div className="grid grid-cols-3 gap-2 mb-4 print:break-inside-avoid">
              <RelBar label="Critical · ≥14d" count={bySeverity.critical} total={totalViolations} color={COLORS.red} />
              <RelBar label="High · 7–13d" count={bySeverity.high} total={totalViolations} color={COLORS.amber} />
              <RelBar label="Medium · <7d" count={bySeverity.medium} total={totalViolations} color={COLORS.blue} />
            </div>
          </>
        )}

        {/* ──── Full detail table ────────────────────────────────────── */}
        {detailRows.length > 0 && (
          <>
            <SectionBar tag="DTL" title="Full Detail · Activity-by-Activity Evidence" rightMeta={`${detailRows.length} rows`} />
            <Note>
              One row per violated relationship. Activities with multiple violations span
              multiple rows. Variance shown in calendar days. Use this as the basis for
              classifying each violation as legitimate acceleration (TIA evidence) or
              logic gap (P6 fix needed).
            </Note>
            <table className="w-full text-[10.5px] mb-4">
              <thead>
                <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
                  <th className="py-1.5 px-2 w-[5%]">#</th>
                  <th className="py-1.5 px-2 w-[13%]">Activity</th>
                  <th className="py-1.5 px-2">Activity Name</th>
                  <th className="py-1.5 px-2 w-[13%]">Predecessor</th>
                  <th className="py-1.5 px-2">Pred. Name</th>
                  <th className="py-1.5 px-2 w-[6%] text-center">Rel</th>
                  <th className="py-1.5 px-2 w-[10%] text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row, i) => {
                  const v = row.violation
                  const predCode = v.pred?.task_code || '—'
                  const predName = v.pred?.task_name || ''
                  const relLabel = v.relTypeLabel || (v.relType?.replace(/^PR_/, '')) || '—'
                  const variance = v.varianceDays
                  const varianceColor =
                    variance === undefined ? COLORS.slate :
                    Math.abs(variance) >= 14 ? COLORS.red :
                    Math.abs(variance) >= 7 ? COLORS.amber :
                    COLORS.blue
                  // Visual divider when starting a new activity
                  const isFirstForTask = row.idx === 0
                  return (
                    <tr key={i} className={`border-b border-slate-100 print:break-inside-avoid ${isFirstForTask && i > 0 ? 'border-t-2 border-t-slate-200' : ''}`}>
                      <td className="py-1.5 px-2 font-mono text-slate-400">{i + 1}</td>
                      <td className="py-1.5 px-2 font-mono font-bold" style={{ color: COLORS.ink }}>
                        {isFirstForTask ? (row.task?.task_code || '—') : ''}
                      </td>
                      <td className="py-1.5 px-2 text-slate-700">
                        {isFirstForTask ? trunc(row.task?.task_name, 40) : ''}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-slate-600">{predCode}</td>
                      <td className="py-1.5 px-2 text-slate-600">{trunc(predName, 40)}</td>
                      <td className="py-1.5 px-2 text-center">
                        <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100" style={{ color: COLORS.ink }}>{relLabel}</span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold" style={{ color: varianceColor }}>
                        {variance !== undefined ? `${variance > 0 ? '-' : ''}${Math.abs(variance)}d` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}

        {/* ──── Recommended actions ──────────────────────────────────── */}
        {detailRows.length > 0 && (
          <>
            <SectionBar tag="ACT" title="Recommended Actions" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 print:break-inside-avoid">
              <ActionCard
                tone="green"
                title="Document acceleration"
                body="For each violation that represents intentional fast-tracking (e.g., owner pressure to advance work), capture date, justification, and authorization. This is your TIA evidence package."
              />
              <ActionCard
                tone="red"
                title="Fix logic gaps"
                body="For each violation that represents a true scheduling error (predecessor relationship is wrong or missing in P6), correct the schedule and re-baseline if needed."
              />
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 mt-6 border-t-2 text-[10px] text-slate-400" style={{ borderColor: COLORS.ink }}>
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

function RelBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</div>
        <div className="font-mono text-[18px] font-extrabold" style={{ color }}>{count}</div>
      </div>
      <svg width="100%" height="6" className="block">
        <rect x="0" y="0" width="100%" height="6" rx="2" fill="#eef2f7" />
        <rect x="0" y="0" width={`${Math.max(count > 0 ? 4 : 0, pct)}%`} height="6" rx="2" fill={color} />
      </svg>
      <div className="text-[9px] font-mono text-slate-500 mt-1">{pct.toFixed(1)}%</div>
    </div>
  )
}

function ActionCard({ tone, title, body }: { tone: 'green' | 'red'; title: string; body: string }) {
  const color = tone === 'green' ? COLORS.green : COLORS.red
  const bg = tone === 'green' ? '#e6f5ee' : '#fee2e2'
  return (
    <div className="rounded-lg p-3 border-l-4" style={{ background: bg, borderColor: color }}>
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
