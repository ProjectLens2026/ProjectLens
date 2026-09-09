'use client'

// =============================================================================
// src/app/dashboard/trace/page.tsx  (Day 15 — Trace Logic)
// =============================================================================
// P6-style Trace Logic. Pick an activity (or milestone), and ControlLens walks
// the relationship network to show every predecessor feeding it and everything
// it drives — the whole logical thread, no manual filter. Click any node in
// the result to re-root the trace on it and keep walking the chain.
//
// Requires analysis.traceRelationships + analysis.traceTasks, which the
// analyzer persists for uploads from Day 15 on. Versions uploaded earlier show
// a friendly "re-upload to enable" message (same pattern as Multiple Float
// Paths).
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion } from '@/lib/projectStore'
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

export default function TraceLogicPage() {
  const [project, setProject] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [ready, setReady] = useState(false)

  const [query, setQuery] = useState('')
  const [rootId, setRootId] = useState<string | null>(null)
  const [direction, setDirection] = useState<TraceDirection>('both')
  const [maxDepth, setMaxDepth] = useState<number>(0)   // 0 = all levels

  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    const v = getActiveVersion(p)
    setAnalysis(v?.analysis || null)
    setReady(true)
  }, [])

  const relationships: Relationship[] = analysis?.traceRelationships || []
  const tasks: Record<string, TraceTask> = analysis?.traceTasks || {}
  const hasTraceData = relationships.length > 0 && Object.keys(tasks).length > 0

  // Searchable activity list
  const allTasks = useMemo(() => Object.values(tasks), [tasks])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      // default: milestones first, then everything — capped
      const mile = allTasks.filter(t => t.task_type === 'TT_Mile' || t.task_type === 'TT_FinMile' || t.task_type === 'TT_StartMile')
      return mile.slice(0, 40)
    }
    return allTasks
      .filter(t => (t.task_code || '').toLowerCase().includes(q) || (t.task_name || '').toLowerCase().includes(q))
      .slice(0, 40)
  }, [allTasks, query])

  // Run the trace
  const result = useMemo(() => {
    if (!rootId || !hasTraceData) return null
    return traceLogic(rootId, relationships, tasks, { direction, maxDepth })
  }, [rootId, relationships, tasks, direction, maxDepth, hasTraceData])

  // ── States ────────────────────────────────────────────────────────────
  if (!ready) return <div className="p-6 text-sm text-slate-500">Loading…</div>

  if (!project || !analysis) {
    return (
      <Shell>
        <EmptyCard
          icon="🧭"
          title="No active project"
          body="Pick a project from the sidebar to trace schedule logic."
          cta={{ href: '/dashboard/upload', label: 'Upload Schedule' }}
        />
      </Shell>
    )
  }

  if (!hasTraceData) {
    return (
      <Shell project={project}>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="text-3xl mb-2">🧭</div>
          <div className="text-[14px] font-bold" style={{ color: COLORS.ink }}>
            Trace Logic needs a fresh upload
          </div>
          <div className="text-[12px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed mb-4">
            This schedule version was analyzed before Trace Logic was added, so its
            relationship network wasn't saved. Re-upload the XER for this version to
            enable clicking an activity and walking its full predecessor/successor chain.
          </div>
          <Link href="/dashboard/upload" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold px-4 py-2 rounded-lg">
            Re-upload Schedule
          </Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell project={project}>
      {/* Picker + controls */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4">
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 mb-2">
          Pick an activity or milestone
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by activity ID or name…"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-blue-500"
        />

        {/* Match list */}
        <div className="mt-2 max-h-52 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
          {matches.length === 0 && (
            <div className="px-3 py-3 text-[12px] text-slate-400">No activities match “{query}”.</div>
          )}
          {matches.map(t => {
            const isSel = t.task_id === rootId
            const isMile = t.task_type === 'TT_Mile' || t.task_type === 'TT_FinMile' || t.task_type === 'TT_StartMile'
            return (
              <button
                key={t.task_id}
                onClick={() => setRootId(t.task_id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 text-[12px] hover:bg-blue-50 transition-colors ${isSel ? 'bg-blue-50' : ''}`}
              >
                {isMile && <span title="Milestone">◆</span>}
                <span className="font-mono font-bold" style={{ color: COLORS.ink }}>{t.task_code}</span>
                <span className="text-slate-600 truncate flex-1">{t.task_name}</span>
                <span className="font-mono text-[10px]" style={{ color: floatColor(t) }}>{fmtFloat(t.total_float_hr_cnt)}</span>
              </button>
            )
          })}
        </div>

        {/* Controls */}
        {rootId && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Direction</span>
              <Segmented
                value={direction}
                onChange={v => setDirection(v as TraceDirection)}
                options={[{ v: 'both', l: 'Both' }, { v: 'pred', l: 'Predecessors' }, { v: 'succ', l: 'Successors' }]}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Levels</span>
              <Segmented
                value={String(maxDepth)}
                onChange={v => setMaxDepth(parseInt(v, 10))}
                options={[{ v: '1', l: '1' }, { v: '2', l: '2' }, { v: '3', l: '3' }, { v: '0', l: 'All' }]}
              />
            </div>
            <button onClick={() => window.print()} className="ml-auto text-[11px] font-bold px-3 py-1.5 rounded-lg text-white print:hidden" style={{ background: COLORS.ink }}>
              🖨 Print / Save PDF
            </button>
          </div>
        )}
      </div>

      {/* Result */}
      {!rootId && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="text-2xl mb-2">☝️</div>
          <div className="text-[13px] font-bold" style={{ color: COLORS.ink }}>Select an activity above to trace its logic</div>
          <div className="text-[11px] text-slate-500 mt-1">Milestones are listed by default — try tracing your completion milestone backward.</div>
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {/* Summary line */}
          <div className="text-[11px] text-slate-500 mb-4">
            This logical thread contains{' '}
            <b style={{ color: COLORS.ink }}>{result.predCount + result.succCount + 1}</b> activities
            {' '}({result.predCount} feeding in, {result.succCount} driven).
            {result.truncated && <span className="text-amber-600 font-bold"> · trace capped at 500 nodes per direction — narrow the levels to see less.</span>}
          </div>

          {/* Predecessors (farthest → nearest) */}
          {(direction === 'both' || direction === 'pred') && (
            <Section title="Predecessors" tag="◀ FEEDS IN" color={COLORS.blue} count={result.predCount}>
              {result.predecessors.length === 0
                ? <Empty msg="No predecessors — this activity has no logic feeding into it." />
                : result.predecessors.map((n, i) => <NodeRow key={i} node={n} onClick={() => setRootId(n.task.task_id)} />)}
            </Section>
          )}

          {/* Root */}
          <div className="my-3 rounded-lg border-2 p-3 flex items-center gap-3" style={{ borderColor: COLORS.ink, background: '#f8fafc' }}>
            <span className="font-mono text-[9px] font-bold text-white px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: COLORS.ink }}>Traced</span>
            <span className="font-mono text-[13px] font-extrabold" style={{ color: COLORS.ink }}>{result.root?.task_code}</span>
            <span className="text-[12px] text-slate-700 flex-1 truncate">{result.root?.task_name}</span>
            <span className="font-mono text-[11px] font-bold" style={{ color: result.root ? floatColor(result.root) : COLORS.slate }}>{result.root ? fmtFloat(result.root.total_float_hr_cnt) : ''}</span>
          </div>

          {/* Successors (nearest → farthest) */}
          {(direction === 'both' || direction === 'succ') && (
            <Section title="Successors" tag="DRIVES ▶" color={COLORS.green} count={result.succCount}>
              {result.successors.length === 0
                ? <Empty msg="No successors — nothing in the schedule depends on this activity." />
                : result.successors.map((n, i) => <NodeRow key={i} node={n} onClick={() => setRootId(n.task.task_id)} />)}
            </Section>
          )}

          <div className="flex items-center justify-between pt-3 mt-4 border-t-2 text-[10px] text-slate-400" style={{ borderColor: COLORS.ink }}>
            <span>Generated by <b style={{ color: COLORS.ink }}>ControlLens</b> — click any activity above to re-root the trace and walk the chain.</span>
          </div>
        </div>
      )}
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout + sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Shell({ children, project }: { children: React.ReactNode; project?: any }) {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0 no-print">
        <div>
          <span className="font-bold text-slate-900 text-base">Trace Logic</span>
          <span className="text-slate-400 text-sm ml-2">{project ? `· ${project.name}` : '· No active project'}</span>
        </div>
        <Link href="/dashboard/lens" className="ml-auto text-[12px] text-slate-500 hover:text-slate-800">‹ Full Analysis</Link>
      </div>
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="max-w-[920px] mx-auto">{children}</div>
      </div>
    </div>
  )
}

function Section({ title, tag, color, count, children }: {
  title: string; tag: string; color: string; count: number; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider text-white" style={{ background: color }}>{tag}</span>
        <span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: COLORS.ink }}>{title}</span>
        <span className="font-mono text-[10px] text-slate-400">{count}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function NodeRow({ node, onClick }: { node: TraceNode; onClick: () => void }) {
  const t = node.task
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
      title="Click to re-root the trace on this activity"
    >
      {/* depth indent */}
      <span className="font-mono text-[9px] text-slate-300 w-8 flex-shrink-0 text-right">L{node.depth}</span>
      <span className="font-mono text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 flex-shrink-0" style={{ color: COLORS.ink }}>{node.relTypeLabel}{node.lagDays ? (node.lagDays > 0 ? `+${node.lagDays}` : node.lagDays) : ''}</span>
      <span className="font-mono text-[11px] font-bold flex-shrink-0" style={{ color: COLORS.ink }}>{t.task_code}</span>
      <span className="text-[11.5px] text-slate-600 truncate flex-1">{t.task_name}</span>
      <span className="font-mono text-[10px] text-slate-500 flex-shrink-0 hidden sm:inline">{fmtShort(t.early_start_date || t.target_start_date)} → {fmtShort(t.early_end_date || t.target_end_date)}</span>
      <span className="font-mono text-[10px] font-bold w-10 text-right flex-shrink-0" style={{ color: floatColor(t) }}>{fmtFloat(t.total_float_hr_cnt)}</span>
    </button>
  )
}

function Segmented({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { v: string; l: string }[]
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
      {options.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`text-[11px] font-semibold px-2.5 py-1 transition-colors ${value === o.v ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          style={value === o.v ? { background: COLORS.blue } : undefined}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-[11px] text-slate-400 italic px-2 py-2">{msg}</div>
}

function EmptyCard({ icon, title, body, cta }: {
  icon: string; title: string; body: string; cta?: { href: string; label: string }
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
      <div className="text-3xl mb-3">{icon}</div>
      <div className="text-lg font-bold text-slate-700 mb-2">{title}</div>
      <div className="text-sm text-slate-500 mb-4">{body}</div>
      {cta && <Link href={cta.href} className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">{cta.label}</Link>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────
function fmtFloat(hr: string): string {
  const h = parseFloat(hr || '0')
  if (isNaN(h)) return '—'
  return Math.round(h / 8) + 'd'
}
function floatColor(t: TraceTask): string {
  const d = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
  if (isNaN(d)) return COLORS.slate
  return d < 0 ? COLORS.red : d === 0 ? COLORS.amber : COLORS.green
}
function fmtShort(d?: string): string {
  if (!d) return '—'
  const iso = d.slice(0, 10)
  const parts = iso.split('-')
  if (parts.length !== 3) return '—'
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mi = parseInt(parts[1], 10) - 1
  if (mi < 0 || mi > 11) return '—'
  return `${months[mi]} ${parts[2]}`
}
