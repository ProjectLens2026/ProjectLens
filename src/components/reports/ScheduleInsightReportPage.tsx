'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion } from '@/lib/projectStore'
import { analyzeMultipleFloatPaths } from '@/lib/multipleFloatPaths'
import { printReport } from '@/lib/printReport'
import { fmtShortDate, reportNumber, type ReportKind } from '@/lib/reports'
import ReviewerReportHeader from '@/components/reports/ReviewerReportHeader'
import NeutralReportFooter from '@/components/reports/NeutralReportFooter'

type Mode = 'critical' | 'longest' | 'near-critical' | 'quality'

type Config = {
  title: string
  kind: ReportKind
  intro: string
}

const CONFIG: Record<Mode, Config> = {
  critical: {
    title: 'Critical Path Report',
    kind: 'CP',
    intro: 'Activities identified in the active XER analysis as critical drivers of project completion.',
  },
  longest: {
    title: 'Longest Path Report',
    kind: 'LP',
    intro: 'Activities identified on the schedule’s longest path, presented in schedule order where available.',
  },
  'near-critical': {
    title: 'Near-Critical / Multiple Float Paths Report',
    kind: 'NCP',
    intro: 'Low-float driving chains derived from the current XER data. This view does not recalculate CPM; it organizes the schedule’s exported path/float information for review.',
  },
  quality: {
    title: 'Schedule Quality Report',
    kind: 'QUAL',
    intro: 'Focused schedule-quality review using the integrity evidence currently stored from the active XER.',
  },
}

export default function ScheduleInsightReportPage({ mode }: { mode: Mode }) {
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    setVersion(getActiveVersion(p))
    setReady(true)
  }, [])

  const a = version?.analysis
  const cfg = CONFIG[mode]
  const reportNo = reportNumber(project?.projectId || project?.name, cfg.kind)

  const nearCritical = useMemo(() => {
    if (mode !== 'near-critical' || !a?.allTasksForPaths) return null
    try {
      return analyzeMultipleFloatPaths(a.allTasksForPaths, 15, 5)
    } catch {
      return null
    }
  }, [mode, a?.allTasksForPaths])

  if (!ready) return <div className="p-6 text-sm text-slate-500">Loading report…</div>
  if (!project || !version || !a) return <MissingReportState />

  const rows = mode === 'critical'
    ? (a.criticalDrivers || [])
    : mode === 'longest'
      ? (a.longestPathActivities || [])
      : []

  return (
    <div className="p-4 md:p-6 max-w-[1180px] mx-auto">
      <ReportToolbar title={cfg.title} reportNo={reportNo} />

      <div id="schedule-insight-report" className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReviewerReportHeader
          title={cfg.title}
          reportNo={reportNo}
          versionLabel={version.versionLabel || version.fileName || 'Active version'}
          orgName={(project as any).company || undefined}
          project={project}
        />

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 mb-5">
          {cfg.intro}
        </div>

        {mode === 'critical' && (
          <ActivityReportSection
            tag="CP"
            title="Critical Activities"
            rows={rows}
            empty="No critical-driver activities are available for this schedule version."
          />
        )}

        {mode === 'longest' && (
          <ActivityReportSection
            tag="LP"
            title="Longest Path Activities"
            rows={rows}
            empty="No longest-path activities are available for this schedule version."
          />
        )}

        {mode === 'near-critical' && (
          <NearCriticalSection result={nearCritical} />
        )}

        {mode === 'quality' && (
          <QualitySection analysis={a} />
        )}

        <NeutralReportFooter reportNo={reportNo} />
      </div>
    </div>
  )
}

function ReportToolbar({ title, reportNo }: { title: string; reportNo: string }) {
  return (
    <div className="print:hidden flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 mb-4">
      <Link href="/dashboard/reports" className="text-[11px] font-semibold text-slate-500 hover:text-slate-900">‹ Reports</Link>
      <span className="text-[12px] font-extrabold text-slate-900">{title}</span>
      <button
        onClick={() => printReport('schedule-insight-report', { title, footerLabel: reportNo })}
        className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-[11px] font-bold text-white hover:bg-blue-700"
      >
        🖨 Save as PDF
      </button>
    </div>
  )
}

function ActivityReportSection({ tag, title, rows, empty }: { tag: string; title: string; rows: any[]; empty: string }) {
  return (
    <section>
      <SectionBar tag={tag} title={title} right={`${rows.length} activities`} />
      {rows.length === 0 ? <EmptyState text={empty} /> : <ActivityTable rows={rows} />}
    </section>
  )
}

function NearCriticalSection({ result }: { result: any }) {
  if (!result) {
    return <EmptyState text="Multiple float-path data is not available for this version. Re-upload the XER if this schedule predates path analysis." />
  }
  if (!result.paths?.length) {
    return <EmptyState text="No ranked paths were found at or below the 15-day float review threshold." />
  }

  return (
    <section>
      <SectionBar tag="NCP" title="Ranked Low-Float Paths" right={`Top ${result.paths.length}`} />
      <div className="space-y-4">
        {result.paths.map((path: any) => (
          <div key={path.pathNumber} className="rounded-xl border border-slate-200 overflow-hidden print:break-inside-avoid">
            <div className="flex flex-wrap items-center gap-3 bg-slate-50 border-b border-slate-200 px-4 py-2.5">
              <div className="font-bold text-[12px] text-slate-900">Path {path.pathNumber} · {path.pathName || 'Driving chain'}</div>
              <div className="ml-auto text-[10px] font-mono text-slate-600">Float {numberOrDash(path.floatDays)}d</div>
              <div className="text-[10px] text-slate-500">{path.activities?.length || 0} activities</div>
            </div>
            {path.plainExplanation ? (
              <div className="px-4 py-2 text-[10.5px] text-slate-600 border-b border-slate-100">{path.plainExplanation}</div>
            ) : null}
            <ActivityTable rows={path.activities || []} compact />
          </div>
        ))}
      </div>
    </section>
  )
}

function QualitySection({ analysis }: { analysis: any }) {
  const noTies = Array.isArray(analysis.noTies) ? analysis.noTies : []
  const oos = Array.isArray(analysis.outOfSequence) ? analysis.outOfSequence : []
  const lowFloat = Array.isArray(analysis.allTasksForPaths)
    ? analysis.allTasksForPaths.filter((t: any) => floatDays(t) < 0)
    : []

  return (
    <section>
      <SectionBar tag="QUAL" title="Schedule Integrity Summary" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5 print:break-inside-avoid">
        <Metric label="Activities Without Logic Ties" value={noTies.length} note="Review open-ended or isolated logic." />
        <Metric label="Out-of-Sequence Activities" value={oos.length} note="Actual progress conflicts requiring review." />
        <Metric label="Negative-Float Activities" value={analysis.negativeFloat || lowFloat.length} note="Completion pressure in the active schedule." />
      </div>

      <SubHeading>Activities without logic ties</SubHeading>
      {noTies.length ? <ActivityTable rows={noTies} /> : <EmptyState text="No untied activities are listed in the stored analysis." />}

      <SubHeading>Negative-float activity evidence</SubHeading>
      {lowFloat.length ? <ActivityTable rows={lowFloat} /> : <EmptyState text="No negative-float activity detail is available in the stored path dataset." />}

      <div className="mt-4 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-[10.5px] leading-relaxed text-blue-900">
        Out-of-sequence detail is available as a separate report so each relationship violation can be reviewed without duplicating the full evidence table here.
      </div>
    </section>
  )
}

function ActivityTable({ rows, compact = false }: { rows: any[]; compact?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${compact ? 'text-[9.5px]' : 'text-[10.5px]'}`}>
        <thead>
          <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
            <th className="py-1.5 px-2 w-[13%]">Activity ID</th>
            <th className="py-1.5 px-2">Activity</th>
            <th className="py-1.5 px-2 w-[11%]">Status</th>
            <th className="py-1.5 px-2 w-[12%]">Start</th>
            <th className="py-1.5 px-2 w-[12%]">Finish</th>
            <th className="py-1.5 px-2 w-[9%] text-right">Float</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t: any, i: number) => (
            <tr key={`${t.task_id || t.task_code || i}-${i}`} className="border-b border-slate-100 print:break-inside-avoid">
              <td className="py-1.5 px-2 font-mono font-bold text-slate-900">{t.task_code || '—'}</td>
              <td className="py-1.5 px-2 text-slate-700">{t.task_name || '—'}</td>
              <td className="py-1.5 px-2 text-slate-600">{statusLabel(t.status_code)}</td>
              <td className="py-1.5 px-2 font-mono text-slate-600">{fmtShortDate(effectiveStart(t))}</td>
              <td className="py-1.5 px-2 font-mono text-slate-600">{fmtShortDate(effectiveFinish(t))}</td>
              <td className={`py-1.5 px-2 text-right font-mono font-bold ${floatDays(t) <= 0 ? 'text-red-600' : floatDays(t) <= 15 ? 'text-amber-600' : 'text-slate-700'}`}>
                {numberOrDash(floatDays(t))}d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SectionBar({ tag, title, right }: { tag: string; title: string; right?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 mb-3 rounded text-white bg-slate-900">
      <span className="font-mono text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/15">{tag}</span>
      <span className="text-[12px] font-extrabold uppercase tracking-wide flex-1">{title}</span>
      {right ? <span className="font-mono text-[9px] opacity-80">{right}</span> : null}
    </div>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700 mt-5 mb-2">{children}</div>
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-[8.5px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-xl font-extrabold text-slate-900 mt-1">{value}</div>
      <div className="text-[9.5px] text-slate-500 mt-0.5">{note}</div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-[11px] text-slate-500">{text}</div>
}

function MissingReportState() {
  return (
    <div className="p-6">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center max-w-xl mx-auto">
        <div className="text-2xl mb-2">📄</div>
        <div className="text-sm font-bold text-slate-900">No active schedule analysis</div>
        <div className="text-xs text-slate-500 mt-1">Select a project/version with an analyzed XER, then open this report again.</div>
        <Link href="/dashboard/reports" className="inline-block mt-4 text-xs font-bold text-blue-600">Back to Reports</Link>
      </div>
    </div>
  )
}

function effectiveStart(t: any): string | undefined {
  return t.act_start_date || t.early_start_date || t.target_start_date
}

function effectiveFinish(t: any): string | undefined {
  return t.act_end_date || t.early_end_date || t.target_end_date
}

function floatDays(t: any): number {
  if (typeof t.floatDays === 'number') return Math.round(t.floatDays)
  const h = parseFloat(t.total_float_hr_cnt || '0')
  return isNaN(h) ? 0 : Math.round(h / 8)
}

function numberOrDash(n: any): string {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? String(Math.round(v)) : '—'
}

function statusLabel(code?: string): string {
  if (code === 'TK_Complete') return 'Complete'
  if (code === 'TK_Active') return 'In Progress'
  if (code === 'TK_NotStart') return 'Not Started'
  return code || '—'
}
