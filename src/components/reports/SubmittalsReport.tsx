'use client'

// =============================================================================
// src/components/reports/SubmittalsReport.tsx
// =============================================================================
// Submittals & RFI Impact Report — shows the paperwork that holds up
// construction. Two data sources:
//   1. Submittal activity pairs from the schedule (a.submittals[])
//   2. RFI items tracked at the project level (project.rfis[])
//
// Cross-references submittals/RFIs against critical path activities to show
// which paperwork items pose schedule risk.
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

export interface SubmittalsReportProps {
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
  // Submittal activity pairs from the schedule
  submittals: any[]
  // RFI items from the project (project.rfis) — opaque structure
  rfis: any[]
}

export default function SubmittalsReport(p: SubmittalsReportProps) {
  const { submittals, rfis } = p

  // Submittal exposure
  const subActive = submittals.filter(s => s.status_code !== 'TK_Complete')
  const subAtRisk = subActive.filter(s => {
    const f = parseFloat(s.total_float_hr_cnt || '0') / 8
    return !isNaN(f) && f <= 14
  })
  const subCritical = subActive.filter(s => {
    const f = parseFloat(s.total_float_hr_cnt || '0') / 8
    return !isNaN(f) && f <= 0
  })
  const subCompleted = submittals.filter(s => s.status_code === 'TK_Complete')

  // RFI counts — defensively handle whatever shape they're in
  const rfiTotal = rfis.length
  // Try common field names for status / open state
  const rfiOpen = rfis.filter(r => {
    const status = String(r?.status || r?.state || '').toLowerCase()
    return status && !['closed', 'answered', 'resolved', 'complete', 'completed'].includes(status)
  }).length
  const rfiClosed = rfiTotal - rfiOpen

  // Summary banner color
  const exposed = subCritical.length + subAtRisk.length + rfiOpen
  const banner =
    subCritical.length > 0 ? { bg: '#fee2e2', color: COLORS.red } :
    subAtRisk.length > 0 || rfiOpen > 0 ? { bg: '#fef3c7', color: COLORS.amber } :
    { bg: '#e6f5ee', color: COLORS.green }

  return (
    <div>
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Paperwork bottlenecks — submittals from the schedule and open RFIs.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Submittals & RFI Impact Report"
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
            <span className="font-extrabold text-[14px]">{exposed}</span>
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-extrabold" style={{ color: COLORS.ink }}>
              {exposed === 0
                ? 'No paperwork bottlenecks detected'
                : `${exposed} paperwork ${exposed === 1 ? 'item' : 'items'} pose schedule risk`}
            </div>
            <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
              {submittals.length} submittal {submittals.length === 1 ? 'pair' : 'pairs'} ·
              {rfiTotal} {rfiTotal === 1 ? 'RFI' : 'RFIs'} on file
              {p.dataDate && <> · data date <span className="font-mono font-bold">{fmtShortDate(p.dataDate)}</span></>}
            </div>
          </div>
        </div>

        {/* ──── Methodology ───────────────────────────────────────────── */}
        <SectionBar tag="METH" title="What's Included" />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4 print:break-inside-avoid">
          <ul className="text-[11.5px] text-slate-700 leading-relaxed list-disc pl-5 space-y-1.5">
            <li><b>Submittal activities</b> — ControlLens detects Submit + Review/Approval
              activity pairs in the P6 schedule by activity name. Exposure is classified
              by remaining total float.</li>
            <li><b>RFI items</b> — Tracked at the project level (RFIs page in the sidebar).
              Open RFIs are included; closed RFIs are noted in totals for context.</li>
            <li><b>Schedule impact</b> — Any submittal or RFI with ≤14 days of float, or
              with a missed due date, is flagged as a paperwork bottleneck.</li>
          </ul>
        </div>

        {/* ──── Submittals section ────────────────────────────────────── */}
        <SectionBar tag="SUB" title="Submittals · From Schedule" rightMeta={`${submittals.length} pairs`} />

        {submittals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center mb-4">
            <div className="text-2xl mb-2">📋</div>
            <div className="text-[12px] font-bold" style={{ color: COLORS.ink }}>
              No submittal activities detected in the schedule
            </div>
            <div className="text-[10px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              ControlLens scans activity names for Submit/Review/Approval patterns.
              If your schedule uses different naming conventions, submittals may not
              be auto-detected.
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 print:break-inside-avoid">
              <ExposureCard label="Critical · ≤0d" count={subCritical.length} total={submittals.length} color={COLORS.red} caption="overdue submittals" />
              <ExposureCard label="At risk · 1–14d" count={subAtRisk.length - subCritical.length} total={submittals.length} color={COLORS.amber} caption="tight float" />
              <ExposureCard label="Safe · >14d" count={subActive.length - subAtRisk.length} total={submittals.length} color={COLORS.green} caption="healthy buffer" />
              <ExposureCard label="Completed" count={subCompleted.length} total={submittals.length} color={COLORS.slate} caption="approved" />
            </div>

            {/* Critical submittals */}
            {subCritical.length > 0 && (
              <>
                <SubLabel>Critical · overdue submittals</SubLabel>
                <SubmittalTable rows={subCritical} />
              </>
            )}

            {/* At-risk submittals (excluding critical) */}
            {subAtRisk.length - subCritical.length > 0 && (
              <>
                <SubLabel>At risk · watch list</SubLabel>
                <SubmittalTable rows={subAtRisk.filter(s => {
                  const f = parseFloat(s.total_float_hr_cnt || '0') / 8
                  return !isNaN(f) && f > 0 && f <= 14
                })} />
              </>
            )}

            {/* Safe submittals (compact) */}
            {subActive.length - subAtRisk.length > 0 && (
              <>
                <SubLabel>Safe · healthy float</SubLabel>
                <SubmittalTable rows={subActive.filter(s => {
                  const f = parseFloat(s.total_float_hr_cnt || '0') / 8
                  return !isNaN(f) && f > 14
                }).slice(0, 15)} />
                {subActive.length - subAtRisk.length > 15 && (
                  <div className="text-[9px] text-slate-400 italic mb-3">
                    Showing first 15 of {subActive.length - subAtRisk.length} safe submittals.
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ──── RFIs section ──────────────────────────────────────────── */}
        <SectionBar tag="RFI" title="Requests for Information" rightMeta={`${rfiTotal} on file · ${rfiOpen} open`} />

        {rfiTotal === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center mb-4">
            <div className="text-2xl mb-2">❓</div>
            <div className="text-[12px] font-bold" style={{ color: COLORS.ink }}>
              No RFIs tracked for this project
            </div>
            <div className="text-[10px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              Use the RFIs page in the sidebar to log requests for information.
              Once logged, they'll appear here with status and exposure details.
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4 print:break-inside-avoid">
              <ExposureCard label="Total" count={rfiTotal} total={rfiTotal} color={COLORS.blue} caption="on file" />
              <ExposureCard label="Open" count={rfiOpen} total={rfiTotal} color={rfiOpen > 0 ? COLORS.amber : COLORS.green} caption="awaiting response" />
              <ExposureCard label="Closed" count={rfiClosed} total={rfiTotal} color={COLORS.slate} caption="resolved" />
            </div>

            {/* RFI table — render whatever fields are available */}
            {rfis.length > 0 && (
              <>
                <SubLabel>RFI register</SubLabel>
                <RFITable rows={rfis.slice(0, 20)} />
                {rfis.length > 20 && (
                  <div className="text-[9px] text-slate-400 italic mb-3">
                    Showing first 20 of {rfis.length} RFIs.
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ──── Recommended actions ───────────────────────────────────── */}
        {exposed > 0 && (
          <>
            <SectionBar tag="ACT" title="Recommended Actions" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 print:break-inside-avoid">
              <ActionCard
                tone="red"
                title="Overdue submittals · today"
                body="Every overdue submittal is consuming critical path float. Call the responsible team immediately. Escalate to executive level if no commitment is forthcoming."
              />
              <ActionCard
                tone="amber"
                title="Tight-float submittals · this week"
                body="Set firm in-house deadlines well before each submittal's float is exhausted. Build in review cycles and engineer markup time."
              />
              <ActionCard
                tone="blue"
                title="Open RFIs · weekly cadence"
                body="Run an RFI standup with the design team weekly. Track response time; escalate any RFI over 14 days old. Document every late response for TIA evidence."
              />
              <ActionCard
                tone="green"
                title="Document for claims"
                body="Every late submittal response or RFI answer is potential time impact evidence. Log dates, durations, and downstream activity impacts in the RFIs page."
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

function SubmittalTable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-[10.5px] mb-3">
      <thead>
        <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
          <th className="py-1.5 px-2 w-[14%]">Activity</th>
          <th className="py-1.5 px-2">Submittal Name</th>
          <th className="py-1.5 px-2 w-[10%] text-right">Float</th>
          <th className="py-1.5 px-2 w-[12%]">Early Start</th>
          <th className="py-1.5 px-2 w-[12%]">Early Finish</th>
          <th className="py-1.5 px-2 w-[10%]">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s: any, i: number) => {
          const float = parseFloat(s.total_float_hr_cnt || '0') / 8
          const floatColor = float <= 0 ? COLORS.red : float <= 14 ? COLORS.amber : COLORS.green
          return (
            <tr key={i} className="border-b border-slate-100 print:break-inside-avoid">
              <td className="py-1.5 px-2 font-mono font-bold" style={{ color: COLORS.ink }}>{s.task_code || '—'}</td>
              <td className="py-1.5 px-2 text-slate-700">{trunc(s.task_name, 50)}</td>
              <td className="py-1.5 px-2 text-right font-mono font-bold" style={{ color: floatColor }}>{Math.round(float)}d</td>
              <td className="py-1.5 px-2 font-mono text-slate-600">{shortDate(s.early_start_date || s.target_start_date)}</td>
              <td className="py-1.5 px-2 font-mono text-slate-600">{shortDate(s.early_end_date || s.target_end_date)}</td>
              <td className="py-1.5 px-2 text-slate-600">{statusLabel(s.status_code)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function RFITable({ rows }: { rows: any[] }) {
  return (
    <table className="w-full text-[10.5px] mb-3">
      <thead>
        <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
          <th className="py-1.5 px-2 w-[10%]">RFI #</th>
          <th className="py-1.5 px-2">Subject / Title</th>
          <th className="py-1.5 px-2 w-[14%]">Submitted</th>
          <th className="py-1.5 px-2 w-[14%]">Due / Needed By</th>
          <th className="py-1.5 px-2 w-[12%]">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any, i: number) => {
          // Defensive field reads — RFIs may have many possible shapes
          const number = r?.number || r?.id || r?.rfiNumber || (i + 1)
          const title = r?.title || r?.subject || r?.question || r?.description || '—'
          const submitted = r?.submittedDate || r?.dateSubmitted || r?.createdAt || r?.date
          const due = r?.dueDate || r?.neededBy || r?.requestedResponseDate || r?.responseDate
          const status = r?.status || r?.state || (r?.closed ? 'Closed' : 'Open')
          const isOpen = !['closed', 'answered', 'resolved', 'complete', 'completed'].includes(String(status).toLowerCase())
          const statusColor = isOpen ? COLORS.amber : COLORS.green
          return (
            <tr key={i} className="border-b border-slate-100 print:break-inside-avoid">
              <td className="py-1.5 px-2 font-mono font-bold" style={{ color: COLORS.ink }}>{String(number).slice(0, 12)}</td>
              <td className="py-1.5 px-2 text-slate-700">{trunc(String(title), 60)}</td>
              <td className="py-1.5 px-2 font-mono text-slate-600">{shortDate(submitted)}</td>
              <td className="py-1.5 px-2 font-mono text-slate-600">{shortDate(due)}</td>
              <td className="py-1.5 px-2">
                <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ background: `${statusColor}22`, color: statusColor }}>
                  {String(status).slice(0, 12)}
                </span>
              </td>
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
function shortDate(d?: any): string {
  if (!d) return '—'
  try {
    const s = typeof d === 'string' ? d : String(d)
    const dt = new Date(s.replace(' ', 'T'))
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
