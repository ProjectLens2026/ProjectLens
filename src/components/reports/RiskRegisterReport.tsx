'use client'

// =============================================================================
// src/components/reports/RiskRegisterReport.tsx
// =============================================================================
// Risk Register — the deep-dive risk document for federal customers.
// Mirrors the EstimateLens visual language: branded cover sheet, compact
// summary strip, then a detail card per detected risk with severity stripe,
// category, recommendation, action items, and affected activities.
//
// Data comes from the page wrapper as props. The wrapper computes risks
// using the SAME detectRisks() logic the /dashboard/risks page uses, so
// what customers see here matches what they see in the interactive view.
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

export interface RiskItem {
  id: string
  category: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium'
  detail: string
  recommendation: string
  affectedActivities?: any[]
  actionItems: string[]
  sequenceProblems?: any[]
}

export interface RiskRegisterReportProps {
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
  risks: RiskItem[]
}

export default function RiskRegisterReport(props: RiskRegisterReportProps) {
  const { orgName, reportNo, versionLabel, project, dataDate, risks } = props

  const counts = {
    critical: risks.filter(r => r.severity === 'critical').length,
    high: risks.filter(r => r.severity === 'high').length,
    medium: risks.filter(r => r.severity === 'medium').length,
  }
  const total = counts.critical + counts.high + counts.medium

  return (
    <div>
      {/* Action bar */}
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Every detected risk grouped by severity. Print or save as PDF for the
          owner's quarterly review.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      {/* Printable card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Risk Register"
          reportNo={reportNo}
          versionLabel={versionLabel}
          orgName={orgName}
          project={project}
        />

        {/* Summary banner */}
        <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-4 print:break-inside-avoid"
          style={{ background: total > 0 ? '#fef3c7' : '#e6f5ee', border: `1px solid ${total > 0 ? COLORS.amber : COLORS.green}33` }}>
          <div className="rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0"
            style={{ background: total > 0 ? COLORS.amber : COLORS.green, color: '#fff' }}>
            <span className="font-extrabold text-[16px]">{total}</span>
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-extrabold" style={{ color: COLORS.ink }}>
              {total === 0 ? 'No risks detected' : `${total} risk ${total === 1 ? 'category' : 'categories'} detected`}
            </div>
            {dataDate && (
              <div className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                Based on the schedule version with data date <span className="font-mono font-bold">{fmtShortDate(dataDate)}</span>.
              </div>
            )}
          </div>
        </div>

        {/* Severity strip */}
        <SubLabel>Severity breakdown</SubLabel>
        <div className="grid grid-cols-3 gap-2 mb-6 print:break-inside-avoid">
          <SevBar label="Critical" count={counts.critical} color={COLORS.red} total={total} />
          <SevBar label="High" count={counts.high} color={COLORS.amber} total={total} />
          <SevBar label="Medium" count={counts.medium} color={COLORS.blue} total={total} />
        </div>

        {/* Risk detail cards */}
        {risks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-[14px] font-bold" style={{ color: COLORS.ink }}>No risks detected</div>
            <div className="text-[11px] text-slate-500 mt-1">
              The schedule analyzer did not identify any patterns that meet
              the threshold for inclusion in this register.
            </div>
          </div>
        ) : (
          <>
            {counts.critical > 0 && (
              <>
                <SectionBar tag="CRIT" title="Critical Risks" rightMeta={`${counts.critical} ${counts.critical === 1 ? 'category' : 'categories'}`} color={COLORS.red} />
                {risks.filter(r => r.severity === 'critical').map(r => <RiskCard key={r.id} risk={r} />)}
              </>
            )}
            {counts.high > 0 && (
              <>
                <SectionBar tag="HIGH" title="High Risks" rightMeta={`${counts.high} ${counts.high === 1 ? 'category' : 'categories'}`} color={COLORS.amber} />
                {risks.filter(r => r.severity === 'high').map(r => <RiskCard key={r.id} risk={r} />)}
              </>
            )}
            {counts.medium > 0 && (
              <>
                <SectionBar tag="MED" title="Medium Risks" rightMeta={`${counts.medium} ${counts.medium === 1 ? 'category' : 'categories'}`} color={COLORS.blue} />
                {risks.filter(r => r.severity === 'medium').map(r => <RiskCard key={r.id} risk={r} />)}
              </>
            )}
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

function RiskCard({ risk }: { risk: RiskItem }) {
  const sevColor =
    risk.severity === 'critical' ? COLORS.red :
    risk.severity === 'high' ? COLORS.amber :
    COLORS.blue
  const sevBg =
    risk.severity === 'critical' ? '#fee2e2' :
    risk.severity === 'high' ? '#fef3c7' :
    '#e0f2fe'

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden mb-3 print:break-inside-avoid">
      {/* Header strip */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-200" style={{ background: sevBg }}>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sevColor, boxShadow: `0 0 0 3px ${sevColor}33` }} />
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest" style={{ color: sevColor }}>
          {risk.category}
        </span>
        <span className="text-[13px] font-extrabold flex-1" style={{ color: COLORS.ink }}>
          {risk.title}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-[12px] text-slate-600 leading-relaxed mb-3">
          {risk.description}
        </p>

        {risk.detail && (
          <div className="mb-3">
            <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500 mb-1">Detail</div>
            <div className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-line">
              {risk.detail}
            </div>
          </div>
        )}

        {/* Recommendation — highlighted block */}
        <div className="mb-3 p-3 rounded-lg border-l-4" style={{ background: '#f8fafc', borderColor: sevColor }}>
          <div className="text-[9px] font-extrabold uppercase tracking-wide mb-1" style={{ color: sevColor }}>
            ControlLens Recommendation
          </div>
          <div className="text-[12px] font-medium leading-relaxed" style={{ color: COLORS.ink }}>
            {risk.recommendation}
          </div>
        </div>

        {/* Action items */}
        {risk.actionItems && risk.actionItems.length > 0 && (
          <div className="mb-3">
            <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
              Action items
            </div>
            <ol className="space-y-1">
              {risk.actionItems.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-slate-700 leading-relaxed">
                  <span className="font-mono font-bold flex-shrink-0" style={{ color: COLORS.blue }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{a}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Affected activities — compact */}
        {risk.affectedActivities && risk.affectedActivities.length > 0 && (
          <div className="mb-3">
            <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
              Affected activities · {risk.affectedActivities.length}
            </div>
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
                  <th className="py-1.5 pr-2 w-[18%]">Activity ID</th>
                  <th className="py-1.5 pr-2">Activity Name</th>
                  <th className="py-1.5 pr-2 text-right w-[10%]">Float</th>
                </tr>
              </thead>
              <tbody>
                {risk.affectedActivities.slice(0, 10).map((t: any, i: number) => {
                  const float = parseFloat(t.total_float_hr_cnt || t.floatDays || '0') / (t.total_float_hr_cnt ? 8 : 1)
                  const floatColor = float < 0 ? COLORS.red : float <= 14 ? COLORS.amber : COLORS.green
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 font-mono font-bold" style={{ color: COLORS.ink }}>
                        {t.task_code || '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-700">{trunc(t.task_name, 50)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono font-bold" style={{ color: floatColor }}>
                        {Math.round(float)}d
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {risk.affectedActivities.length > 10 && (
              <div className="text-[9px] text-slate-400 italic mt-1">
                Showing first 10 of {risk.affectedActivities.length} affected activities.
              </div>
            )}
          </div>
        )}

        {/* Sequence problems — full list for OOS risks */}
        {risk.sequenceProblems && risk.sequenceProblems.length > 0 && (
          <div className="mb-1">
            <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500 mb-2">
              All sequence problems · {risk.sequenceProblems.length}
            </div>
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
                  <th className="py-1.5 pr-2 w-[16%]">Activity</th>
                  <th className="py-1.5 pr-2">Name</th>
                  <th className="py-1.5 pr-2 w-[14%]">Predecessor</th>
                  <th className="py-1.5 pr-2 w-[8%]">Rel</th>
                  <th className="py-1.5 pr-2 text-right w-[12%]">Variance</th>
                </tr>
              </thead>
              <tbody>
                {risk.sequenceProblems.slice(0, 30).map((o: any, i: number) => {
                  const primary = (o.violations && o.violations[0]) || null
                  const predCode = primary?.pred?.task_code || o.pred?.task_code || '—'
                  const relLabel = primary?.relTypeLabel || (o.relType?.replace(/^PR_/, '')) || '—'
                  const variance = primary?.varianceDays
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 font-mono font-bold" style={{ color: COLORS.ink }}>
                        {o.task?.task_code || '—'}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-700">{trunc(o.task?.task_name, 45)}</td>
                      <td className="py-1.5 pr-2 font-mono text-slate-600">{predCode}</td>
                      <td className="py-1.5 pr-2">
                        <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100" style={{ color: COLORS.ink }}>
                          {relLabel}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right font-mono font-bold" style={{ color: COLORS.red }}>
                        {variance !== undefined ? `${variance}d early` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {risk.sequenceProblems.length > 30 && (
              <div className="text-[9px] text-slate-400 italic mt-1">
                Showing first 30 of {risk.sequenceProblems.length} sequence problems.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700 mb-2 mt-2">
      {children}
    </div>
  )
}

function SectionBar({ tag, title, rightMeta, color }: { tag: string; title: string; rightMeta?: string; color: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 mb-3 mt-5 rounded text-white" style={{ background: color }}>
      <span className="font-mono text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.18)' }}>
        {tag}
      </span>
      <span className="text-[13px] font-extrabold uppercase tracking-wide flex-1">{title}</span>
      {rightMeta && <span className="font-mono text-[10px] opacity-80">{rightMeta}</span>}
    </div>
  )
}

function SevBar({ label, count, color, total }: { label: string; count: number; color: string; total: number }) {
  const pct = total > 0 ? Math.max(count > 0 ? 4 : 0, (count / total) * 100) : 0
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</div>
        <div className="font-mono text-[18px] font-extrabold" style={{ color }}>{count}</div>
      </div>
      <svg width="100%" height="6" className="block">
        <rect x="0" y="0" width="100%" height="6" rx="2" fill="#eef2f7" />
        <rect x="0" y="0" width={`${pct}%`} height="6" rx="2" fill={color} />
      </svg>
    </div>
  )
}

function trunc(s: string | undefined, max: number): string {
  if (!s) return '—'
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
