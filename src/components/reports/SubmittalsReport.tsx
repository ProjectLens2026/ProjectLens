'use client'

// =============================================================================
// src/components/reports/SubmittalsReport.tsx
// =============================================================================
// Submittals Report — schedule-relevant submit / review / approval activities.
// Focuses only on submittals detected in the schedule. RFI tracking is intentionally
// outside this report and outside the primary Control Lens navigation.
// =============================================================================

import ReportHeader from '@/components/reports/ReviewerReportHeader'
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
  // Kept optional for backward compatibility with existing page wrappers.
  // It is intentionally not rendered in this report.
  rfis?: any[]
}

export default function SubmittalsReport(p: SubmittalsReportProps) {
  const { submittals } = p

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


  // Summary banner color
  const exposed = subAtRisk.length
  const banner =
    subCritical.length > 0 ? { bg: '#fee2e2', color: COLORS.red } :
    subAtRisk.length > 0 ? { bg: '#fef3c7', color: COLORS.amber } :
    { bg: '#e6f5ee', color: COLORS.green }

  return (
    <div>
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Schedule-relevant submittals, approval timing, and float exposure.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Submittals Report"
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
                ? 'No submittal timing concerns detected'
                : `${exposed} submittal ${exposed === 1 ? 'item has' : 'items have'} limited float`}
            </div>
            <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
              {submittals.length} submittal {submittals.length === 1 ? 'pair' : 'pairs'}
              {p.dataDate && <> · data date <span className="font-mono font-bold">{fmtShortDate(p.dataDate)}</span></>}
            </div>
          </div>
        </div>

        {/* ──── Methodology ───────────────────────────────────────────── */}
        <SectionBar tag="METH" title="What’s Included" />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4 print:break-inside-avoid">
          <ul className="text-[11.5px] text-slate-700 leading-relaxed list-disc pl-5 space-y-1.5">
            <li><b>Submittal activities</b> — submit, review, and approval activities identified in the schedule.</li>
            <li><b>Schedule exposure</b> — active submittals are grouped by remaining total float so the reviewer can see which approvals may constrain downstream work.</li>
            <li><b>Schedule reference</b> — activity IDs, dates, status, and float remain visible so each comment can be checked against the XER.</li>
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
              Activity names are reviewed for Submit/Review/Approval patterns.
              If the schedule uses different naming conventions, some submittals may require reviewer verification.
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

        {/* ──── Reviewer actions ───────────────────────────────────── */}
        {exposed > 0 && (
          <>
            <SectionBar tag="ACT" title="Reviewer Actions" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 print:break-inside-avoid">
              <ActionCard
                tone="red"
                title="Critical / overdue submittals"
                body="Confirm the responsible party, planned response date, and the downstream activity that depends on approval. Escalate where the available float has been exhausted."
              />
              <ActionCard
                tone="amber"
                title="Tight-float submittals"
                body="Verify that the remaining review cycle is realistic and that approval is logically tied to procurement, fabrication, delivery, or installation activities as applicable."
              />
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 mt-6 border-t-2 text-[10px] text-slate-400" style={{ borderColor: COLORS.ink }}>
          <span>
            Schedule review output — the schedule of record and governing contract documents control.
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

function trunc(s: string | undefined, max: number): string {
  if (!s) return '—'
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
function shortDate(d?: any): string {
  if (!d) return '—'
  try {
    const raw = typeof d === 'string' ? d : String(d)
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`
    const dt = new Date(raw.replace(' ', 'T'))
    if (isNaN(dt.getTime())) return '—'
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    return `${mm}/${dd}/${dt.getFullYear()}`
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
