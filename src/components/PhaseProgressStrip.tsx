'use client'

import { useMemo, useState } from 'react'
import { buildPhaseProgress, phaseDate, type PhaseActivity } from '@/lib/phaseProgress'

const showDate = (date: string | null) => date || 'Not reported'
const phaseModels = new WeakMap<object, ReturnType<typeof buildPhaseProgress>>()
function getPhaseModel(analysis: any) {
  if (!analysis || typeof analysis !== 'object') return buildPhaseProgress(analysis)
  const cached = phaseModels.get(analysis)
  if (cached) return cached
  const model = buildPhaseProgress(analysis)
  phaseModels.set(analysis, model)
  return model
}

export default function PhaseProgressStrip({ analysis, originalBaseline, dataDate }: {
  analysis: any; originalBaseline: boolean; dataDate?: string
}) {
  const model = useMemo(() => getPhaseModel(analysis), [analysis])
  const [selected, setSelected] = useState<string | null>(null)
  const [limit, setLimit] = useState(25)
  const phase = model.phases.find(p => p.id === selected)
  const dates = model.phases.flatMap(p => [p.start, p.finish]).filter((d): d is string => !!d)
  const date = phaseDate(dataDate)
  if (date) dates.push(date)
  dates.sort()
  const start = dates[0], end = dates[dates.length - 1]
  const lo = start ? Date.parse(start + 'T00:00:00Z') : 0
  const span = end ? Math.max(86400000, Date.parse(end + 'T00:00:00Z') - lo) : 86400000
  const position = (value: string) => Math.max(0, Math.min(100, (Date.parse(value + 'T00:00:00Z') - lo) / span * 100))
  const timeline = (row: { start: string | null; finish: string | null }) => (
    <div className="relative h-5 rounded bg-slate-100" aria-label={`Schedule dates ${showDate(row.start)} to ${showDate(row.finish)}`}>
      {row.start && row.finish && row.start <= row.finish && <div className="absolute top-1 h-3 rounded bg-blue-500" style={{ left: `${position(row.start)}%`, width: `${Math.max(0.5, position(row.finish) - position(row.start))}%`, maxWidth: `${100 - position(row.start)}%` }} />}
      {date && <div className="absolute top-0 h-5 border-l border-dashed border-slate-700" style={{ left: `${position(date)}%` }} title={`Data date: ${date}`} />}
    </div>
  )
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Phase progress">
    <div className="flex flex-wrap justify-between gap-2 mb-3">
      <div><h2 className="text-sm font-semibold text-slate-800">Phase progress</h2><p className="text-[11px] text-slate-500">Average reported physical progress · Equal activity weights</p></div>
      <span className="text-[10px] text-slate-500">Overall not calculated — phase weights not agreed</span>
    </div>
    {!model.hasEvidence ? <p className="text-xs text-slate-500">Activity evidence is not loaded for this version. Phase progress is unavailable.</p> : <>
      {originalBaseline && model.baselineProgress > 0 && <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="status">Baseline contains recorded progress — verify submission. {model.baselineProgress.toLocaleString()} activities have physical progress, actual dates or a started/completed status. Reported values are preserved.</p>}
      <div className="overflow-x-auto pb-1"><div className="grid grid-cols-5 min-w-[650px] divide-x divide-slate-200">
        {model.phases.map(p => <button key={p.id} type="button" aria-expanded={selected === p.id} aria-controls="phase-progress-details" onClick={() => { setSelected(selected === p.id ? null : p.id); setLimit(25) }} className={`px-3 text-left first:pl-0 focus-visible:outline-blue-600 ${selected === p.id ? 'text-blue-800' : 'text-slate-700'}`}>
          <div className="text-xs font-medium truncate" title={p.label}>{p.label}</div>
          <div className="mt-1 text-lg font-bold text-blue-600">{p.percent === null ? '—' : `${Math.round(p.percent * 10) / 10}%`} <span className="text-xs">{selected === p.id ? '▾' : '›'}</span></div>
          <div className="mt-1 h-1 rounded bg-slate-100"><div className="h-1 rounded bg-blue-500" style={{ width: `${p.percent ?? 0}%` }} /></div>
          <div className="mt-1 text-[10px] text-slate-500">{p.eligible ? `${p.reported.toLocaleString()}/${p.eligible.toLocaleString()} reported` : 'No eligible activities'}</div>
        </button>)}
      </div></div>
      <p className="mt-2 text-[10px] text-slate-500">Select a phase for its timeline and delivery evidence. Missing values are excluded, not treated as zero. {model.unclassified.toLocaleString()} unclassified · {model.excluded.toLocaleString()} milestones / summaries / level-of-effort excluded · {model.uncertain.toLocaleString()} low-confidence phase assignments.</p>
      {model.phases.some(p => p.eligible > p.reported) && <p className="mt-1 text-[10px] text-amber-700">Incomplete physical-progress coverage. Older saved analyses may lack these fields; a newly analyzed upload retains them. Percentages cover reported activities only.</p>}
    </>}
    {phase && <div id="phase-progress-details" className="mt-4 border-t border-slate-200 pt-3">
      <div className="flex justify-between gap-3"><h3 className="text-sm font-bold">{phase.label} — selected version</h3><button type="button" onClick={() => setSelected(null)} className="text-xs text-blue-600">Collapse</button></div>
      <p className="my-2 text-[11px] text-slate-500">{showDate(phase.start)} → {showDate(phase.finish)} · Schedule dates, not a physical-progress curve. Dashed line: data date. Phase assignments are inferred; verify the activity list.</p>
      {timeline(phase)}
      {start && <div className="flex justify-between text-[10px] text-slate-500 mt-1"><span>{start}</span><span>{end}</span></div>}
      <div className="mt-3 text-xs font-semibold">Site delivery candidates ({phase.deliveries.length})</div>
      <p className="text-[10px] text-slate-500 mt-1">Only explicit site-delivery activities with actual finish dates are labeled delivered. Combined fabrication / delivery needs confirmation. Required-on-site dates are not inferred from float.</p>
      {phase.deliveries.length === 0 ? <p className="my-2 text-xs text-slate-500">No delivery candidates identified in this phase.</p> : <ul className="mt-2 divide-y divide-slate-100">{phase.deliveries.slice(0, limit).map(t => <li key={t.id} className="py-2 text-xs flex justify-between gap-3"><span>{t.code} — {t.name}</span><span className={`shrink-0 ${t.deliveryStatus === 'Delivered' ? 'text-emerald-700' : t.deliveryStatus === 'Forecast' ? 'text-blue-700' : 'text-amber-700'}`}>{t.deliveryStatus} · {showDate(t.finish)}</span></li>)}</ul>}
      <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-blue-700">Activities and physical-progress calculation ({phase.eligible.toLocaleString()})</summary>
        <p className="mt-2 text-[11px] text-slate-500">Sum of valid reported physical percentages ÷ {phase.reported.toLocaleString()} reporting activities. No duration, cost, status or 80% completion substitution.</p>
        <div className="overflow-x-auto mt-2"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500"><th className="py-2">Activity ID — Name</th><th>Physical %</th><th>Start / Finish</th><th className="min-w-[160px]">Timeline</th></tr></thead><tbody>{phase.activities.slice(0, limit).map((t: PhaseActivity) => <tr key={t.id} className="border-t border-slate-100"><td className="py-2 pr-3">{t.code} — {t.name}</td><td className="pr-3">{t.percent === null ? 'Not reported' : `${t.percent}%`}</td><td className="pr-3 whitespace-nowrap">{showDate(t.start)}<br />{showDate(t.finish)}</td><td>{timeline(t)}</td></tr>)}</tbody></table></div>
      </details>
      {Math.max(phase.eligible, phase.deliveries.length) > limit && <button type="button" onClick={() => setLimit(limit + 25)} className="mt-3 text-xs font-semibold text-blue-600">Show 25 more activities / deliveries</button>}
    </div>}
  </section>
}
