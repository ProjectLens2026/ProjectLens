'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion } from '@/lib/projectStore'
import { traceLogic, type TraceNode } from '@/lib/traceLogic'
import type { Relationship, TraceTask } from '@/lib/xerParser'
import { printReport } from '@/lib/printReport'
import { fmtShortDate, reportNumber } from '@/lib/reports'
import ReviewerReportHeader from '@/components/reports/ReviewerReportHeader'
import NeutralReportFooter from '@/components/reports/NeutralReportFooter'

export default function LogicTraceReportPage() {
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const [query, setQuery] = useState('')
  const [rootId, setRootId] = useState<string | null>(null)

  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    const v = getActiveVersion(p)
    setVersion(v)
    setReady(true)
  }, [])

  const a = version?.analysis
  const relationships: Relationship[] = a?.traceRelationships || []
  const tasks: Record<string, TraceTask> = a?.traceTasks || {}
  const allTasks = useMemo(() => Object.values(tasks), [tasks])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = q
      ? allTasks.filter(t => (t.task_code || '').toLowerCase().includes(q) || (t.task_name || '').toLowerCase().includes(q))
      : allTasks.filter(t => ['TT_Mile', 'TT_FinMile', 'TT_StartMile'].includes(t.task_type))
    return source.slice(0, 60)
  }, [query, allTasks])

  const result = useMemo(() => {
    if (!rootId || !relationships.length || !Object.keys(tasks).length) return null
    return traceLogic(rootId, relationships, tasks, { direction: 'both', maxDepth: 0 })
  }, [rootId, relationships, tasks])

  if (!ready) return <div className="p-6 text-sm text-slate-500">Loading report…</div>
  if (!project || !version || !a) return <Missing />

  const reportNo = reportNumber(project.projectId || project.name, 'TRACE')
  const hasTraceData = relationships.length > 0 && Object.keys(tasks).length > 0

  return (
    <div className="p-4 md:p-6 max-w-[1180px] mx-auto">
      <div className="print:hidden rounded-2xl border border-slate-200 bg-white p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Link href="/dashboard/reports" className="text-[11px] font-semibold text-slate-500 hover:text-slate-900">‹ Reports</Link>
          <div className="text-[12px] font-extrabold text-slate-900">Logic Trace Report</div>
          {result ? (
            <button onClick={() => printReport('logic-trace-report', { title: 'Logic Trace Report', footerLabel: reportNo })}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-[11px] font-bold text-white hover:bg-blue-700">
              🖨 Save as PDF
            </button>
          ) : null}
        </div>

        {!hasTraceData ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
            This version does not contain stored relationship-trace data. Re-upload the XER to enable this report.
          </div>
        ) : (
          <>
            <label className="block text-[9px] font-extrabold uppercase tracking-wide text-slate-500 mb-1">Select activity or milestone</label>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search activity ID or name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] outline-none focus:border-blue-500" />
            <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {matches.map(t => (
                <button key={t.task_id} onClick={() => { setRootId(t.task_id); setQuery(`${t.task_code} · ${t.task_name}`) }}
                  className={`w-full text-left px-3 py-2 text-[11px] hover:bg-slate-50 ${rootId === t.task_id ? 'bg-blue-50' : 'bg-white'}`}>
                  <span className="font-mono font-bold text-slate-900">{t.task_code}</span>
                  <span className="text-slate-600 ml-2">{t.task_name}</span>
                </button>
              ))}
              {matches.length === 0 ? <div className="px-3 py-4 text-center text-[10px] text-slate-400">No matching activities.</div> : null}
            </div>
          </>
        )}
      </div>

      {result?.root ? (
        <div id="logic-trace-report" className="rounded-2xl border border-slate-200 bg-white p-6">
          <ReviewerReportHeader
            title="Logic Trace Report"
            reportNo={reportNo}
            versionLabel={version.versionLabel || version.fileName || 'Active version'}
            project={project}
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mb-5 text-[11px] text-slate-600">
            Relationship trace for the selected schedule activity. Predecessors are shown farthest-back to nearest; successors are shown nearest to farthest.
          </div>

          <TraceSummary root={result.root} predCount={result.predCount} succCount={result.succCount} truncated={result.truncated} />
          <TraceSection title="Predecessor Chain" tag="PRED" rows={result.predecessors} />
          <RootActivity task={result.root} />
          <TraceSection title="Successor Chain" tag="SUCC" rows={result.successors} />
          <NeutralReportFooter reportNo={reportNo} />
        </div>
      ) : (
        hasTraceData ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-[11px] text-slate-500">Select an activity or milestone above to build the report.</div> : null
      )}
    </div>
  )
}

function TraceSummary({ root, predCount, succCount, truncated }: { root: TraceTask; predCount: number; succCount: number; truncated: boolean }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-5 print:break-inside-avoid">
      <Metric label="Selected Activity" value={root.task_code || '—'} />
      <Metric label="Predecessors" value={String(predCount)} />
      <Metric label="Successors" value={String(succCount)} />
      <Metric label="Trace Status" value={truncated ? 'Truncated' : 'Complete'} />
    </div>
  )
}

function TraceSection({ title, tag, rows }: { title: string; tag: string; rows: TraceNode[] }) {
  return (
    <section className="mb-5">
      <SectionBar tag={tag} title={title} right={`${rows.length} activities`} />
      {rows.length ? (
        <table className="w-full text-[10.5px]">
          <thead><tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
            <th className="py-1.5 px-2 w-[9%]">Depth</th><th className="py-1.5 px-2 w-[14%]">Activity ID</th><th className="py-1.5 px-2">Activity</th><th className="py-1.5 px-2 w-[9%]">Rel</th><th className="py-1.5 px-2 w-[9%] text-right">Lag</th><th className="py-1.5 px-2 w-[13%]">Start</th><th className="py-1.5 px-2 w-[13%]">Finish</th>
          </tr></thead>
          <tbody>{rows.map((n, i) => <TraceRow key={`${n.task.task_id}-${i}`} node={n} />)}</tbody>
        </table>
      ) : <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-[10px] text-slate-400">No {title.toLowerCase()} activities.</div>}
    </section>
  )
}

function TraceRow({ node }: { node: TraceNode }) {
  const t = node.task
  return (
    <tr className="border-b border-slate-100 print:break-inside-avoid">
      <td className="py-1.5 px-2 font-mono text-slate-500">{node.depth}</td>
      <td className="py-1.5 px-2 font-mono font-bold text-slate-900">{t.task_code}</td>
      <td className="py-1.5 px-2 text-slate-700">{t.task_name}</td>
      <td className="py-1.5 px-2 font-mono text-slate-600">{node.relTypeLabel}</td>
      <td className="py-1.5 px-2 font-mono text-right text-slate-600">{node.lagDays}d</td>
      <td className="py-1.5 px-2 font-mono text-slate-600">{fmtShortDate(t.act_start_date || t.early_start_date || t.target_start_date)}</td>
      <td className="py-1.5 px-2 font-mono text-slate-600">{fmtShortDate(t.act_end_date || t.early_end_date || t.target_end_date)}</td>
    </tr>
  )
}

function RootActivity({ task }: { task: TraceTask }) {
  return (
    <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4 mb-5 print:break-inside-avoid">
      <div className="text-[8px] uppercase tracking-widest font-extrabold text-blue-600">Selected Activity / Root</div>
      <div className="mt-1 text-[12px] font-extrabold text-slate-900"><span className="font-mono">{task.task_code}</span> · {task.task_name}</div>
      <div className="mt-1 text-[10px] text-slate-600">{fmtShortDate(task.act_start_date || task.early_start_date || task.target_start_date)} → {fmtShortDate(task.act_end_date || task.early_end_date || task.target_end_date)}</div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 p-3"><div className="text-[8px] uppercase tracking-wide font-bold text-slate-400">{label}</div><div className="mt-1 font-mono text-[13px] font-extrabold text-slate-900">{value}</div></div>
}

function SectionBar({ tag, title, right }: { tag: string; title: string; right: string }) {
  return <div className="flex items-center gap-3 px-3 py-2 mb-2 rounded text-white bg-slate-900"><span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/15">{tag}</span><span className="text-[12px] font-extrabold uppercase tracking-wide flex-1">{title}</span><span className="font-mono text-[9px] opacity-80">{right}</span></div>
}

function Missing() {
  return <div className="p-6"><div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div className="text-sm font-bold text-slate-900">No active schedule analysis</div><Link href="/dashboard/reports" className="inline-block mt-3 text-xs font-bold text-blue-600">Back to Reports</Link></div></div>
}
