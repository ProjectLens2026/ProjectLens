'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { traceLogic, type TraceDirection, type TraceNode } from '@/lib/traceLogic'
import type { TraceTask, Relationship } from '@/lib/xerParser'

const COLORS = {
  ink: '#13202e',
  blue: '#2563eb',
  red: '#dc2626',
  amber: '#f59e0b',
  green: '#16a34a',
  slate: '#1f2937',
}

export default function TraceLogicPanel({ analysis }: { analysis: any }) {
  const [query, setQuery] = useState('')
  const [rootId, setRootId] = useState<string | null>(null)
  const [direction, setDirection] = useState<TraceDirection>('both')
  const [maxDepth, setMaxDepth] = useState<number>(0)

  const relationships: Relationship[] = analysis?.traceRelationships || []
  const tasks: Record<string, TraceTask> = analysis?.traceTasks || {}
  const hasTraceData = relationships.length > 0 && Object.keys(tasks).length > 0
  const allTasks = useMemo(() => Object.values(tasks), [tasks])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      const milestones = allTasks.filter(task => task.task_type === 'TT_Mile' || task.task_type === 'TT_FinMile' || task.task_type === 'TT_StartMile')
      return milestones.slice(0, 40)
    }
    return allTasks
      .filter(task => (task.task_code || '').toLowerCase().includes(q) || (task.task_name || '').toLowerCase().includes(q))
      .slice(0, 40)
  }, [allTasks, query])

  const result = useMemo(() => {
    if (!rootId || !hasTraceData) return null
    return traceLogic(rootId, relationships, tasks, { direction, maxDepth })
  }, [rootId, relationships, tasks, direction, maxDepth, hasTraceData])

  if (!hasTraceData) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <div className="text-3xl mb-2">🧭</div>
        <div className="text-[14px] font-bold" style={{ color: COLORS.ink }}>Logic Trace needs a fresh schedule analysis</div>
        <div className="text-[12px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed mb-4">
          This saved version does not contain the activity relationship network required for tracing. Re-upload the source schedule to enable predecessor and successor tracing.
        </div>
        <Link href="/dashboard/upload" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold px-4 py-2 rounded-lg">Re-upload Schedule</Link>
      </div>
    )
  }

  return (
    <div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4">
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 mb-1">Logic Trace</div>
        <div className="text-[11px] text-slate-500 mb-3">Select an activity to inspect the predecessor chain feeding it and the successor chain it drives.</div>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by activity ID or name…" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-blue-500" />

        <div className="mt-2 max-h-52 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
          {matches.length === 0 && <div className="px-3 py-3 text-[12px] text-slate-400">No activities match “{query}”.</div>}
          {matches.map(task => {
            const selected = task.task_id === rootId
            const milestone = task.task_type === 'TT_Mile' || task.task_type === 'TT_FinMile' || task.task_type === 'TT_StartMile'
            return (
              <button key={task.task_id} onClick={() => setRootId(task.task_id)} className={`w-full text-left px-3 py-2 flex items-center gap-2 text-[12px] hover:bg-blue-50 transition-colors ${selected ? 'bg-blue-50' : ''}`}>
                {milestone && <span title="Milestone">◆</span>}
                <span className="font-mono font-bold" style={{ color: COLORS.ink }}>{task.task_code}</span>
                <span className="text-slate-600 truncate flex-1">{task.task_name}</span>
                <span className="font-mono text-[10px]" style={{ color: floatColor(task) }}>{fmtFloat(task.total_float_hr_cnt)}</span>
              </button>
            )
          })}
        </div>

        {rootId && <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Direction</span>
            <Segmented value={direction} onChange={value => setDirection(value as TraceDirection)} options={[{ v: 'both', l: 'Both' }, { v: 'pred', l: 'Predecessors' }, { v: 'succ', l: 'Successors' }]} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Levels</span>
            <Segmented value={String(maxDepth)} onChange={value => setMaxDepth(parseInt(value, 10))} options={[{ v: '1', l: '1' }, { v: '2', l: '2' }, { v: '3', l: '3' }, { v: '0', l: 'All' }]} />
          </div>
          <button onClick={() => window.print()} className="ml-auto text-[11px] font-bold px-3 py-1.5 rounded-lg text-white print:hidden" style={{ background: COLORS.ink }}>🖨 Print / Save PDF</button>
        </div>}
      </div>

      {!rootId && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <div className="text-2xl mb-2">☝️</div>
        <div className="text-[13px] font-bold" style={{ color: COLORS.ink }}>Select an activity above to trace its logic</div>
        <div className="text-[11px] text-slate-500 mt-1">Milestones are listed by default—try tracing the governing completion milestone backward.</div>
      </div>}

      {result && <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-[11px] text-slate-500 mb-4">
          This logical thread contains <b style={{ color: COLORS.ink }}>{result.predCount + result.succCount + 1}</b> activities ({result.predCount} feeding in, {result.succCount} driven).
          {result.truncated && <span className="text-amber-600 font-bold"> · Trace capped at 500 nodes per direction—narrow the levels to see less.</span>}
        </div>

        {(direction === 'both' || direction === 'pred') && <TraceSection title="Predecessors" tag="◀ FEEDS IN" color={COLORS.blue} count={result.predCount}>
          {result.predecessors.length === 0 ? <Empty msg="No predecessors—this activity has no logic feeding into it." /> : result.predecessors.map((node, index) => <NodeRow key={`${node.task.task_id}-${index}`} node={node} onClick={() => setRootId(node.task.task_id)} />)}
        </TraceSection>}

        <div className="my-3 rounded-lg border-2 p-3 flex items-center gap-3" style={{ borderColor: COLORS.ink, background: '#f8fafc' }}>
          <span className="font-mono text-[9px] font-bold text-white px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: COLORS.ink }}>Traced</span>
          <span className="font-mono text-[13px] font-extrabold" style={{ color: COLORS.ink }}>{result.root?.task_code}</span>
          <span className="text-[12px] text-slate-700 flex-1 truncate">{result.root?.task_name}</span>
          <span className="font-mono text-[11px] font-bold" style={{ color: result.root ? floatColor(result.root) : COLORS.slate }}>{result.root ? fmtFloat(result.root.total_float_hr_cnt) : ''}</span>
        </div>

        {(direction === 'both' || direction === 'succ') && <TraceSection title="Successors" tag="DRIVES ▶" color={COLORS.green} count={result.succCount}>
          {result.successors.length === 0 ? <Empty msg="No successors—nothing in the schedule depends on this activity." /> : result.successors.map((node, index) => <NodeRow key={`${node.task.task_id}-${index}`} node={node} onClick={() => setRootId(node.task.task_id)} />)}
        </TraceSection>}
      </div>}
    </div>
  )
}

function TraceSection({ title, tag, color, count, children }: { title: string; tag: string; color: string; count: number; children: React.ReactNode }) {
  return <div>
    <div className="flex items-center gap-2 mb-2"><span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider text-white" style={{ background: color }}>{tag}</span><span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: COLORS.ink }}>{title}</span><span className="font-mono text-[10px] text-slate-400">{count}</span></div>
    <div className="space-y-1">{children}</div>
  </div>
}

function NodeRow({ node, onClick }: { node: TraceNode; onClick: () => void }) {
  const task = node.task
  return <button onClick={onClick} className="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0" title="Click to trace from this activity">
    <span className="font-mono text-[9px] text-slate-300 w-8 flex-shrink-0 text-right">L{node.depth}</span>
    <span className="font-mono text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 flex-shrink-0" style={{ color: COLORS.ink }}>{node.relTypeLabel}{node.lagDays ? (node.lagDays > 0 ? `+${node.lagDays}` : node.lagDays) : ''}</span>
    <span className="font-mono text-[11px] font-bold flex-shrink-0" style={{ color: COLORS.ink }}>{task.task_code}</span>
    <span className="text-[11.5px] text-slate-600 truncate flex-1">{task.task_name}</span>
    <span className="font-mono text-[10px] text-slate-500 flex-shrink-0 hidden sm:inline">{fmtShort(task.early_start_date || task.target_start_date)} → {fmtShort(task.early_end_date || task.target_end_date)}</span>
    <span className="font-mono text-[10px] font-bold w-10 text-right flex-shrink-0" style={{ color: floatColor(task) }}>{fmtFloat(task.total_float_hr_cnt)}</span>
  </button>
}

function Segmented({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { v: string; l: string }[] }) {
  return <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">{options.map(option => <button key={option.v} onClick={() => onChange(option.v)} className={`text-[11px] font-semibold px-2.5 py-1 transition-colors ${value === option.v ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`} style={value === option.v ? { background: COLORS.blue } : undefined}>{option.l}</button>)}</div>
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-[11px] text-slate-400 italic px-2 py-2">{msg}</div>
}

function fmtFloat(hours: string): string {
  const value = parseFloat(hours || '0')
  return Number.isNaN(value) ? '—' : `${Math.round(value / 8)}d`
}

function floatColor(task: TraceTask): string {
  const days = Math.round(parseFloat(task.total_float_hr_cnt || '0') / 8)
  if (Number.isNaN(days)) return COLORS.slate
  return days < 0 ? COLORS.red : days === 0 ? COLORS.amber : COLORS.green
}

function fmtShort(date?: string): string {
  if (!date) return '—'
  const parts = date.slice(0, 10).split('-')
  if (parts.length !== 3) return '—'
  const monthIndex = parseInt(parts[1], 10) - 1
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return monthIndex >= 0 && monthIndex <= 11 ? `${months[monthIndex]} ${parts[2]}` : '—'
}
