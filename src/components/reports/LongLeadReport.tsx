'use client'

// =============================================================================
// src/components/reports/LongLeadReport.tsx
// =============================================================================
// Long-Lead & Procurement Report — every procurement activity ≥35 calendar
// days duration, with float exposure analysis. Use to surface delivery risks
// weeks before they impact the field.
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

export interface LongLeadReportProps {
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
  longLeadItems: any[]      // sorted by float ascending
  totalActivities: number
}

export default function LongLeadReport(p: LongLeadReportProps) {
  const { longLeadItems, totalActivities } = p
  const total = longLeadItems.length

  // Categorize by float exposure
  const critical = longLeadItems.filter(it => it.status_code !== 'TK_Complete' && it.floatDays <= 0)
  const atRisk = longLeadItems.filter(it => it.status_code !== 'TK_Complete' && it.floatDays > 0 && it.floatDays <= 14)
  const safe = longLeadItems.filter(it => it.status_code !== 'TK_Complete' && it.floatDays > 14)
  const completed = longLeadItems.filter(it => it.status_code === 'TK_Complete')

  // Categorize by status (excluding completed)
  const active = longLeadItems.filter(it => it.status_code !== 'TK_Complete')
  const notStarted = active.filter(it => it.status_code === 'TK_NotStart').length
  const inProgress = active.filter(it => it.status_code === 'TK_Active').length

  // Summary banner color
  const totalExposed = critical.length + atRisk.length
  const banner =
    critical.length > 0 ? { bg: '#fee2e2', color: COLORS.red } :
    atRisk.length > 0 ? { bg: '#fef3c7', color: COLORS.amber } :
    { bg: '#e6f5ee', color: COLORS.green }

  return (
    <div>
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Procurement activities ≥35 calendar days duration, with float exposure.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Long-Lead & Procurement Report"
          reportNo={p.reportNo}
          versionLabel={p.versionLabel}
          orgName={p.orgName}
          project={p.project}
        />

        {/* ──── Summary banner ────────────────────────────────────────── */}
        <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-4 print:break-inside-avoid"
          style={{ background: banner.bg, border: `1px solid ${banner.color}33` }}>
          <div className="rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0"
            style={{ background: banner.color, color: '#fff' }}>
            <span className="font-extrabold text-[16px]">{totalExposed}</span>
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-extrabold" style={{ color: COLORS.ink }}>
              {total === 0
                ? 'No long-lead items detected'
                : totalExposed === 0
                  ? `${total} long-lead items · all have healthy float`
                  : `${totalExposed} of ${total} long-lead items exposed`}
            </div>
            <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
              {critical.length > 0 && <><span className="font-bold" style={{ color: COLORS.red }}>{critical.length} critical</span> · </>}
              {atRisk.length > 0 && <><span className="font-bold" style={{ color: COLORS.amber }}>{atRisk.length} at risk</span> · </>}
              <span className="font-bold" style={{ color: COLORS.green }}>{safe.length} safe</span>
              {completed.length > 0 && <> · {completed.length} delivered</>}
              {p.dataDate && <> · data date <span className="font-mono font-bold">{fmtShortDate(p.dataDate)}</span></>}
            </div>
          </div>
        </div>

        {/* ──── Methodology ───────────────────────────────────────────── */}
        <SectionBar tag="METH" title="Detection Methodology" />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4 print:break-inside-avoid">
          <p className="text-[12px] text-slate-700 leading-relaxed mb-2">
            ControlLens flags every activity with <b>duration ≥ 35 calendar days</b> as a long-lead
            procurement item. Exposure is classified by remaining float:
          </p>
          <ul className="text-[11.5px] text-slate-600 leading-relaxed list-disc pl-5 space-y-1">
            <li><span className="font-bold" style={{ color: COLORS.red }}>Critical</span> — ≤0 days float. Already late; every day of further delay extends project end.</li>
            <li><span className="font-bold" style={{ color: COLORS.amber }}>At risk</span> — 1 to 14 days float. One missed delivery commitment and it becomes critical.</li>
            <li><span className="font-bold" style={{ color: COLORS.green }}>Safe</span> — &gt;14 days float. Comfortable buffer; routine vendor follow-up.</li>
          </ul>
        </div>

        {/* ──── Exposure distribution ─────────────────────────────────── */}
        {total > 0 && (
          <>
            <SectionBar tag="DIST" title="Exposure Distribution" rightMeta={`${total} items`} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 print:break-inside-avoid">
              <ExposureCard label="Critical · ≤0d" count={critical.length} total={total} color={COLORS.red} caption="overdue / late" />
              <ExposureCard label="At risk · 1–14d" count={atRisk.length} total={total} color={COLORS.amber} caption="one slip away" />
              <ExposureCard label="Safe · >14d" count={safe.length} total={total} color={COLORS.green} caption="healthy buffer" />
              <ExposureCard label="Delivered" count={completed.length} total={total} color={COLORS.slate} caption="complete" />
            </div>

            <SubLabel>By status · active items</SubLabel>
            <div className="grid grid-cols-2 gap-2 mb-4 print:break-inside-avoid">
              <KPI label="Not Started" value={String(notStarted)} tone="slate" caption="awaiting kickoff" />
              <KPI label="In Progress" value={String(inProgress)} tone="blue" caption="procurement underway" />
            </div>
          </>
        )}

        {/* ──── Critical items ────────────────────────────────────────── */}
        {critical.length > 0 && (
          <>
            <SectionBar tag="CRIT" title="Critical · Late Items" rightMeta={`${critical.length}`} />
            <Note>
              These procurement items are already past their float budget. Each day of further
              delay extends the project completion date. Owner notification recommended.
            </Note>
            <LongLeadTable rows={critical} />
          </>
        )}

        {/* ──── At-risk items ─────────────────────────────────────────── */}
        {atRisk.length > 0 && (
          <>
            <SectionBar tag="RISK" title="At Risk · Watch List" rightMeta={`${atRisk.length}`} />
            <Note>
              ≤14 days of float remaining. Call vendors this week for delivery confirmation.
              Escalate to executive level if delivery dates have not been confirmed in writing.
            </Note>
            <LongLeadTable rows={atRisk} />
          </>
        )}

        {/* ──── Safe items (compact) ──────────────────────────────────── */}
        {safe.length > 0 && (
          <>
            <SectionBar tag="SAFE" title="Safe · Healthy Float" rightMeta={`${safe.length}`} />
            <Note>
              {`>`} 14 days of float remaining. Routine monthly vendor follow-up. Re-evaluate
              if float erodes below 14 days at the next update.
            </Note>
            <LongLeadTable rows={safe.slice(0, 15)} />
            {safe.length > 15 && (
              <div className="text-[9px] text-slate-400 italic mb-3">
                Showing first 15 of {safe.length} safe items.
              </div>
            )}
          </>
        )}

        {/* ──── Completed items ───────────────────────────────────────── */}
        {completed.length > 0 && (
          <>
            <SectionBar tag="DLVR" title="Delivered · Closed Items" rightMeta={`${completed.length}`} />
            <LongLeadTable rows={completed.slice(0, 10)} showStatus />
            {completed.length > 10 && (
              <div className="text-[9px] text-slate-400 italic mb-3">
                Showing first 10 of {completed.length} delivered items.
              </div>
            )}
          </>
        )}

        {/* ──── Empty state ───────────────────────────────────────────── */}
        {total === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center mt-4">
            <div className="text-3xl mb-2">📦</div>
            <div className="text-[14px] font-bold" style={{ color: COLORS.ink }}>
              No long-lead items detected
            </div>
            <div className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              ControlLens did not detect any activities with duration ≥35 days that match
              procurement patterns. Verify procurement scope is captured in the schedule.
            </div>
          </div>
        )}

        {/* ──── Recommended actions ───────────────────────────────────── */}
        {totalExposed > 0 && (
          <>
            <SectionBar tag="ACT" title="Recommended Actions" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 print:break-inside-avoid">
              <ActionCard
                tone="red"
                title="This week · critical items"
                body="Call every vendor for items flagged Critical. Get written confirmation of delivery date. Escalate to executive level if dates are not confirmed. Notify owner of delay risk."
              />
              <ActionCard
                tone="amber"
                title="Next 2 weeks · at-risk items"
                body="Vendor follow-up for At-Risk items. Confirm production status and shipping plan. Identify alternate suppliers as backup. Document all communications."
              />
              <ActionCard
                tone="blue"
                title="Update schedule realistically"
                body="If vendors confirm later delivery dates than schedule reflects, update the activities. Don't carry false dates; they only hide the slip from the owner."
              />
              <ActionCard
                tone="green"
                title="Monthly cadence"
                body="Re-run this report at every monthly schedule update. Watch for items shifting from Safe → At-Risk or At-Risk → Critical. Early warning is the only advantage."
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

function SubLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700 mb-2 mt-3">{children}</div>
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-slate-500 italic leading-relaxed mb-3 max-w-[90%]">{children}</p>
}

function ExposureCard({ label, count, total, color, caption }: {
  label: string; count: number; total: number; color: string; caption: string
}) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="text-[9px] font-bold uppercase tracking-wide" style={{ color }}>{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[18px] font-extrabold" style={{ color }}>{count}</span>
        <span className="font-mono text-[10px] text-slate-400">{pct.toFixed(0)}%</span>
      </div>
      <div className="text-[9.5px] text-slate-500 mt-0.5 leading-snug">{caption}</div>
      <svg width="100%" height="4" className="block mt-1">
        <rect x="0" y="0" width="100%" height="4" rx="2" fill="#eef2f7" />
        <rect x="0" y="0" width={`${Math.max(count > 0 ? 4 : 0, pct)}%`} height="4" rx="2" fill={color} />
      </svg>
    </div>
  )
}

function KPI({ label, value, caption, tone }: {
  label: string; value: string; caption: string;
  tone: 'blue' | 'red' | 'amber' | 'green' | 'slate'
}) {
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

function ActionCard({ tone, title, body }: { tone: 'red' | 'amber' | 'green' | 'blue'; title: string; body: string }) {
  const color = tone === 'red' ? COLORS.red : tone === 'amber' ? COLORS.amber : tone === 'green' ? COLORS.green : COLORS.blue
  return (
    <div className="rounded-lg p-3 border-l-4" style={{ background: '#f8fafc', borderColor: color }}>
      <div className="text-[10px] font-extrabold uppercase tracking-wide mb-1" style={{ color }}>{title}</div>
      <div className="text-[11.5px] leading-relaxed" style={{ color: COLORS.ink }}>{body}</div>
    </div>
  )
}

function LongLeadTable({ rows, showStatus = false }: { rows: any[]; showStatus?: boolean }) {
  return (
    <table className="w-full text-[10.5px] mb-3">
      <thead>
        <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
          <th className="py-1.5 px-2 w-[14%]">Activity</th>
          <th className="py-1.5 px-2">Name</th>
          <th className="py-1.5 px-2 w-[10%]">Duration</th>
          <th className="py-1.5 px-2 w-[10%]">Remaining</th>
          <th className="py-1.5 px-2 w-[10%] text-right">Float</th>
          <th className="py-1.5 px-2 w-[12%]">Early Finish</th>
          {showStatus && <th className="py-1.5 px-2 w-[10%]">Status</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((it: any, i: number) => {
          const floatColor =
            it.floatDays <= 0 ? COLORS.red :
            it.floatDays <= 14 ? COLORS.amber :
            COLORS.green
          return (
            <tr key={i} className="border-b border-slate-100 print:break-inside-avoid">
              <td className="py-1.5 px-2 font-mono font-bold" style={{ color: COLORS.ink }}>{it.task_code || '—'}</td>
              <td className="py-1.5 px-2 text-slate-700">{trunc(it.task_name, 50)}</td>
              <td className="py-1.5 px-2 font-mono text-slate-600">{it.durationDays}d</td>
              <td className="py-1.5 px-2 font-mono text-slate-600">{it.remainingDays}d</td>
              <td className="py-1.5 px-2 text-right font-mono font-bold" style={{ color: floatColor }}>{it.floatDays}d</td>
              <td className="py-1.5 px-2 font-mono text-slate-600">{shortDate(it.early_end_date || it.target_end_date)}</td>
              {showStatus && <td className="py-1.5 px-2 text-slate-600">{statusLabel(it.status_code)}</td>}
            </tr>
          )
        })}
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
function statusLabel(code?: string): string {
  switch (code) {
    case 'TK_NotStart': return 'Not Started'
    case 'TK_Active': return 'In Progress'
    case 'TK_Complete': return 'Complete'
    default: return code || '—'
  }
}
