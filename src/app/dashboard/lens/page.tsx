'use client'
// =============================================================================
// Schedule Analysis page (Day 10 — Multiple Float Paths added)
//
// New: 'multi-paths' pill in Schedule Filter shows the top 5 driving chains
// (Path 1 = critical, Paths 2-5 = near-critical) with inline Gantt charts
// and plain-language explanations. Federal/commercial PMs need to see
// near-critical paths because today's near-critical = tomorrow's critical.
//
// Existing functionality preserved (Critical Path, Longest Path, 2 Week
// Lookahead, Not Started, Finished, all other tabs untouched).
// =============================================================================
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion, updateVersionNarrative } from '@/lib/projectStore'
import { analyzeMultipleFloatPaths, activityToGanttRange, type FloatPath } from '@/lib/multipleFloatPaths'
import type { Task } from '@/lib/xerParser'

export default function ControlLensAnalysisPage() {
  const [analysis, setAnalysis] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('schedule-filter')
  const [scheduleFilter, setScheduleFilter] = useState<
    'critical' | 'longest' | 'multi-paths' | 'lookahead' | 'not-started' | 'finished'
  >('critical')
  const [floatThreshold, setFloatThreshold] = useState<number>(5)
  const [expandedPaths, setExpandedPaths] = useState<Set<number>>(new Set([1, 2]))
  const [narrativeText, setNarrativeText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [narrativeError, setNarrativeError] = useState<string | null>(null)

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setNarrativeText(version?.aiNarrative || '')
    setIsEditing(false)
    setNarrativeError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version?.id])

  function refresh() {
    const p = getActiveProject()
    setProject(p)
    const v = getActiveVersion(p)
    setVersion(v)
    setAnalysis(v?.analysis || null)
  }

  // Compute Multiple Float Paths from the precomputed task list in analysis.
  // Memoized so it only re-runs when threshold or version changes.
  const multiPathsResult = useMemo(() => {
    if (!analysis?.allTasksForPaths) return null
    try {
      return analyzeMultipleFloatPaths(analysis.allTasksForPaths, floatThreshold, 5)
    } catch (e) {
      console.error('[Lens] Multiple Float Paths failed:', e)
      return null
    }
  }, [analysis?.allTasksForPaths, floatThreshold])

  // Fallback: if parsedXER isn't on the analysis, build a partial result
  // from criticalDrivers + longestPathActivities. Less rich than the full
  // algorithm but enough to show SOMETHING for legacy versions.
  const multiPathsFallback = useMemo(() => {
    if (multiPathsResult || !analysis) return null
    const drivers = analysis.criticalDrivers || []
    const longest = analysis.longestPathActivities || []
    if (drivers.length === 0 && longest.length === 0) return null
    return { drivers, longest }
  }, [multiPathsResult, analysis])

  function togglePathExpand(pathNumber: number) {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(pathNumber)) next.delete(pathNumber)
      else next.add(pathNumber)
      return next
    })
  }

  async function handleGenerate() {
    if (!project || !version || !analysis) return
    setIsGenerating(true)
    setNarrativeError(null)
    try {
      const res = await fetch('/api/generate-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis, context: version.context || {} }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        let errMsg = 'Could not generate the Operational Analysis. Try again.'
        try {
          const parsed = JSON.parse(errText)
          if (parsed.error) errMsg = parsed.error
        } catch {}
        throw new Error(errMsg)
      }
      const data = await res.json()
      const newNarrative = (data.narrative || '').trim()
      if (!newNarrative) throw new Error('Generation returned an empty result. Try again.')
      setNarrativeText(newNarrative)
      updateVersionNarrative(project.id, version.id, newNarrative)
    } catch (err: any) {
      console.error('[ControlLens] Operational Analysis generation failed:', err)
      setNarrativeError(err.message || 'Could not generate the Operational Analysis. Try again.')
    } finally {
      setIsGenerating(false)
    }
  }
  function handleEdit() { setIsEditing(true); setNarrativeError(null) }
  function handleEditSave() {
    if (!project || !version) return
    updateVersionNarrative(project.id, version.id, narrativeText)
    setIsEditing(false)
  }
  function handleEditCancel() { setNarrativeText(version?.aiNarrative || ''); setIsEditing(false) }
  function handleClear() {
    if (!project || !version) return
    if (!confirm('Clear the Operational Analysis for this version? You can generate a new one anytime.')) return
    setNarrativeText('')
    updateVersionNarrative(project.id, version.id, '')
    setIsEditing(false)
    setNarrativeError(null)
  }

  function fmtFloat(hours: string | number) {
    const h = typeof hours === 'string' ? parseFloat(hours || '0') : hours
    if (isNaN(h)) return '—'
    return Math.round(h / 8) + 'd'
  }
  function conditionColor(cond: string) {
    if (cond === 'Recovery Required') return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900' }
    if (cond === 'Attention Needed') return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900' }
    if (cond === 'Monitor Closely') return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900' }
    return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900' }
  }

  if (!analysis || !project) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <div>
            <span className="font-bold text-slate-900 text-base">Full Analysis</span>
            <span className="text-slate-400 text-sm ml-2">· No active project</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">🔍</span>
            </div>
            <div className="text-lg font-bold text-slate-700 mb-2">No analysis available</div>
            <div className="text-sm text-slate-500 mb-6">Upload a schedule to see the full analysis here.</div>
            <Link href="/dashboard/upload"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700">
              Upload Schedule →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const a = analysis
  const condColor = conditionColor(a.condition)
  const hasNarrative = !!(narrativeText && narrativeText.trim())

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0 no-print">
        <div>
          <span className="font-bold text-slate-900 text-base">Full Analysis</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name}</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.print()} className="text-xs border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-400 font-semibold flex items-center gap-1.5">
            🖨 Print / Save PDF
          </button>
          <Link href="/dashboard/upload" className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400 hover:text-blue-600 font-semibold">
            ⬆ Upload New Version
          </Link>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-bold text-slate-900">{project.name}</div>
              {project.projectId && <div className="text-[10px] font-mono text-blue-600 mt-0.5">{project.projectId}</div>}
              <div className="text-xs text-slate-500 mt-0.5">{a.fileType || 'Primavera P6 XER'} · Data date: {a.dataDate?.slice(0,10) || 'N/A'}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Contract completion</div>
              <div className="text-sm font-bold text-red-600">{a.contractEnd?.slice(0,10) || 'N/A'} <span className="text-xs font-normal text-slate-500">· Projected {a.projectedEnd?.slice(0,10) || 'N/A'}</span></div>
            </div>
          </div>
        </div>

        {/* Condition banner */}
        <div className={`${condColor.bg} ${condColor.border} border rounded-xl p-4 flex items-center gap-4`}>
          <div className="text-3xl">{a.condition === 'Recovery Required' ? '🔴' : a.condition === 'Attention Needed' ? '⚠️' : '🟢'}</div>
          <div className="flex-1">
            <div className={`font-bold text-sm ${condColor.text}`}>
              {a.condition?.toUpperCase()} {a.delayDays > 0 && `— PROJECT IS ${a.delayDays} DAYS BEHIND CONTRACT`}
            </div>
            <div className="text-xs mt-1 opacity-80">
              {a.negativeFloat} of {a.totalActivities} activities carry negative float · {a.notStarted} activities not yet started · {a.outOfSequence?.length || 0} out-of-sequence
            </div>
          </div>
          <div className="text-center flex-shrink-0">
            <div className={`text-3xl font-extrabold ${condColor.text}`}>{a.healthScore}</div>
            <div className="text-[10px] opacity-70">Health Score / 100</div>
          </div>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-5 gap-2">
          <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Total activities</div><div className="text-xl font-bold">{a.totalActivities}</div></div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Complete</div><div className="text-xl font-bold text-green-600">{a.complete}</div></div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">In progress</div><div className="text-xl font-bold text-amber-600">{a.inProgress}</div></div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Negative float</div><div className="text-xl font-bold text-red-600">{a.negativeFloat}</div></div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Out-of-sequence</div><div className="text-xl font-bold text-red-600">{a.outOfSequence?.length || 0}</div></div>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="tab-bar flex gap-0 border-b border-slate-100 overflow-x-auto no-print">
            {[
              { id: 'schedule-filter', label: 'Schedule Filters (Primavera)', icon: '🔎' },
              { id: 'logic', label: 'Sequence Problems', icon: '🔧' },
              { id: 'noties', label: 'No Logic Ties', icon: '⛓️' },
              { id: 'longlead', label: 'Long Lead Items', icon: '📦' },
              { id: 'field', label: 'Field Reality', icon: '👷' },
              { id: 'plain', label: 'Plain Language', icon: '💬' },
              { id: 'ai', label: 'Operational Analysis', icon: '📝' },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === t.id ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-slate-500 hover:text-slate-900'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {activeTab === 'schedule-filter' && (
              <div className="tab-pane">
                <h3 className="text-sm font-bold mb-1">Schedule Filters <span className="text-slate-400 font-normal">(Primavera)</span></h3>
                <p className="text-[11px] text-slate-500 mb-3 italic">P6 filters read directly from your XER file.</p>

                <div className="flex flex-wrap gap-2 mb-5">
                  {[
                    { id: 'critical',    label: 'Critical Path',          icon: '🎯' },
                    { id: 'longest',     label: 'Longest Path',           icon: '📏' },
                    { id: 'multi-paths', label: 'Multiple Float Paths (ControlLens)',   icon: '🛤️', isNew: true },
                    { id: 'lookahead',   label: '2 Week Lookahead',       icon: '📅' },
                    { id: 'not-started', label: 'Activities Not Started', icon: '⏸️' },
                    { id: 'finished',    label: 'Activities Finished',    icon: '✅' },
                  ].map(f => (
                    <button key={f.id} onClick={() => setScheduleFilter(f.id as any)}
                      className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors flex items-center gap-1.5 ${
                        scheduleFilter === f.id ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}>
                      {f.icon} {f.label}
                      {(f as any).isNew && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${scheduleFilter === f.id ? 'bg-white text-blue-600' : 'bg-emerald-100 text-emerald-700'}`}>NEW</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* CRITICAL PATH (existing) */}
                {scheduleFilter === 'critical' && (
                  <div>
                    <p className="text-xs text-slate-500 mb-4">The critical path is the chain of activities controlling project completion. If any of these slips, the whole project slips by that same amount.</p>
                    <div className="space-y-2">
                      {(a.criticalDrivers || []).slice(0, 12).map((t: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 text-xs">
                          <div className="font-mono font-semibold text-slate-900 w-32 flex-shrink-0">{t.task_code}</div>
                          <div className="flex-1 text-slate-700">{t.task_name}</div>
                          <div className="text-red-600 font-bold w-14 text-right">{fmtFloat(t.total_float_hr_cnt)}</div>
                          <div className="w-16 text-slate-500">{fmtFloat(t.remain_drtn_hr_cnt)}</div>
                          <div className="w-20"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status_code === 'TK_Complete' ? 'bg-green-100 text-green-700' : t.status_code === 'TK_Active' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{t.status_code === 'TK_Complete' ? 'Done' : t.status_code === 'TK_Active' ? `${t.phys_complete_pct}%` : 'Not started'}</span></div>
                        </div>
                      ))}
                      {(!a.criticalDrivers || a.criticalDrivers.length === 0) && (
                        <div className="text-center py-8 text-slate-400 text-xs">No critical path activities detected.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* MULTIPLE FLOAT PATHS (new) */}
                {scheduleFilter === 'multi-paths' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      <div className="font-bold mb-1">ControlLens Multiple Float Paths analysis</div>
                      ControlLens ranks the top driving chains of activities by total float — beyond just the single critical path that P6 shows. <strong>Path 1 is the critical path</strong> (zero or negative float). <strong>Paths 2-5 are near-critical</strong> — today's near-critical becomes tomorrow's critical after one slip. All paths run to the final completion milestone. This is the proper Multiple Float Paths method that federal claim analysts and PM teams use for delay analysis.
                    </div>

                    {/* Threshold + summary control */}
                    <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-xs font-semibold text-slate-700">Float threshold</span>
                      <select value={floatThreshold}
                        onChange={e => setFloatThreshold(parseInt(e.target.value, 10))}
                        className="text-xs px-2 py-1 border border-slate-300 rounded bg-white">
                        <option value={5}>5 days</option>
                        <option value={10}>10 days</option>
                        <option value={15}>15 days</option>
                      </select>
                      <span className="text-[11px] text-slate-500 flex-1">
                        Paths with total float ≤ {floatThreshold} days are considered near-critical.
                      </span>
                      <span className="text-[11px] text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                        Showing top {Math.min(multiPathsResult?.paths.length || 0, 5)}
                      </span>
                    </div>

                    {!multiPathsResult && !multiPathsFallback && (
                      <div className="text-center py-8 text-slate-400 text-xs">
                        Multiple float path analysis isn't available for this version. Re-upload the XER to refresh.
                      </div>
                    )}

                    {!multiPathsResult && multiPathsFallback && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-3">
                        This version was uploaded before Multiple Float Paths was added. Re-upload the XER to enable the full ranked-path view. Showing the existing critical path drivers below.
                      </div>
                    )}

                    {multiPathsResult && multiPathsResult.paths.length === 0 && (
                      <div className="text-center py-8 text-slate-400 text-xs">
                        No paths found at or below {floatThreshold} days float. Try increasing the threshold.
                      </div>
                    )}

                    {multiPathsResult && multiPathsResult.paths.map(path => (
                      <PathCard key={path.pathNumber} path={path}
                        expanded={expandedPaths.has(path.pathNumber)}
                        onToggle={() => togglePathExpand(path.pathNumber)}
                        projectStart={multiPathsResult.projectStart}
                        projectEnd={multiPathsResult.projectEnd}
                      />
                    ))}
                  </div>
                )}

                {/* LONGEST PATH (existing) */}
                {scheduleFilter === 'longest' && (
                  <div>
                    {(a.longestPathActivities && a.longestPathActivities.length > 0) ? (
                      <>
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                          The longest path is the chain of activities that determines when the project finishes — the path with the greatest total duration from start to end. P6 flags these activities with the <span className="font-mono">driving_path_flag</span>.
                        </div>
                        <div className="space-y-2">
                          <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 pb-2">
                            <div className="col-span-1">Code</div>
                            <div className="col-span-5">Activity</div>
                            <div className="col-span-2 text-right">Start</div>
                            <div className="col-span-2 text-right">Finish</div>
                            <div className="col-span-1 text-right">Float</div>
                            <div className="col-span-1 text-right">Status</div>
                          </div>
                          {a.longestPathActivities.slice(0, 50).map((t: any, i: number) => {
                            const fl = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
                            const pct = parseFloat(t.phys_complete_pct || '0')
                            return (
                              <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 last:border-0 text-xs items-center">
                                <div className="col-span-1 font-mono font-semibold text-slate-800 truncate">{t.task_code}</div>
                                <div className="col-span-5 text-slate-700 truncate">{t.task_name}</div>
                                <div className="col-span-2 text-right text-slate-600">{(t.early_start_date || t.target_start_date || t.act_start_date || '').slice(0,10)}</div>
                                <div className="col-span-2 text-right text-slate-600 font-semibold">{(t.early_end_date || t.target_end_date || t.act_end_date || '').slice(0,10)}</div>
                                <div className={`col-span-1 text-right font-bold ${fl < 0 ? 'text-red-600' : fl === 0 ? 'text-amber-600' : 'text-green-600'}`}>{fl}d</div>
                                <div className="col-span-1 text-right">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.status_code === 'TK_Complete' ? 'bg-green-100 text-green-700' : t.status_code === 'TK_Active' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{t.status_code === 'TK_Complete' ? 'Done' : t.status_code === 'TK_Active' ? `${pct}%` : 'Not started'}</span>
                                </div>
                              </div>
                            )
                          })}
                          {a.longestPathActivities.length > 50 && (
                            <div className="text-center text-[10px] text-slate-400 pt-3">Showing first 50 of {a.longestPathActivities.length} activities</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-amber-900 mb-4 leading-relaxed">
                          <strong>P6 has not calculated a longest path for this schedule.</strong> No activities have the driving_path_flag set. Try the new Multiple Float Paths view for a richer analysis.
                        </div>
                        <div className="space-y-2">
                          {(a.criticalDrivers || []).slice(0, 12).map((t: any, i: number) => (
                            <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 text-xs">
                              <div className="font-mono font-semibold text-slate-900 w-32 flex-shrink-0">{t.task_code}</div>
                              <div className="flex-1 text-slate-700">{t.task_name}</div>
                              <div className="text-red-600 font-bold w-14 text-right">{fmtFloat(t.total_float_hr_cnt)}</div>
                              <div className="w-16 text-slate-500">{fmtFloat(t.remain_drtn_hr_cnt)}</div>
                              <div className="w-20"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status_code === 'TK_Complete' ? 'bg-green-100 text-green-700' : t.status_code === 'TK_Active' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{t.status_code === 'TK_Complete' ? 'Done' : t.status_code === 'TK_Active' ? `${t.phys_complete_pct}%` : 'Not started'}</span></div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 2 WEEK LOOKAHEAD (existing) */}
                {scheduleFilter === 'lookahead' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      Activities scheduled to start or finish within 14 calendar days after the data date ({a.dataDate?.slice(0,10) || 'N/A'}).
                    </div>
                    {(!a.twoWeekLookahead || a.twoWeekLookahead.length === 0) ? (
                      <div className="text-center py-8 text-slate-400 text-xs">No activities scheduled in next 14 days.</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 pb-2">
                          <div className="col-span-1">Code</div><div className="col-span-5">Activity</div><div className="col-span-2 text-right">Start</div><div className="col-span-2 text-right">Finish</div><div className="col-span-1 text-right">% Done</div><div className="col-span-1 text-right">Float</div>
                        </div>
                        {a.twoWeekLookahead.slice(0, 30).map((t: any, i: number) => {
                          const fl = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
                          const pct = parseFloat(t.phys_complete_pct || '0')
                          return (
                            <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 last:border-0 text-xs items-center">
                              <div className="col-span-1 font-mono font-semibold text-slate-800 truncate">{t.task_code}</div>
                              <div className="col-span-5 text-slate-700 truncate">{t.task_name}</div>
                              <div className="col-span-2 text-right text-slate-600">{(t.early_start_date || t.target_start_date || '').slice(0,10)}</div>
                              <div className="col-span-2 text-right text-slate-600 font-semibold">{(t.early_end_date || t.target_end_date || '').slice(0,10)}</div>
                              <div className="col-span-1 text-right text-slate-600">{pct}%</div>
                              <div className={`col-span-1 text-right font-bold ${fl < 0 ? 'text-red-600' : fl <= 14 ? 'text-amber-600' : 'text-green-600'}`}>{fl}d</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* NOT STARTED (existing) */}
                {scheduleFilter === 'not-started' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      Activities with no actual start date and no physical progress recorded. Sorted by planned start (soonest first).
                    </div>
                    {(!a.notStartedActivities || a.notStartedActivities.length === 0) ? (
                      <div className="text-center py-8 text-slate-400 text-xs">No not-started activities detected.</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 pb-2">
                          <div className="col-span-1">Code</div><div className="col-span-5">Activity</div><div className="col-span-2 text-right">Planned Start</div><div className="col-span-2 text-right">Planned Finish</div><div className="col-span-1 text-right">Duration</div><div className="col-span-1 text-right">Float</div>
                        </div>
                        {a.notStartedActivities.slice(0, 100).map((t: any, i: number) => {
                          const fl = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
                          const dur = Math.round(parseFloat(t.target_drtn_hr_cnt || t.remain_drtn_hr_cnt || '0') / 8)
                          return (
                            <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 last:border-0 text-xs items-center">
                              <div className="col-span-1 font-mono font-semibold text-slate-800 truncate">{t.task_code}</div>
                              <div className="col-span-5 text-slate-700 truncate">{t.task_name}</div>
                              <div className="col-span-2 text-right text-slate-600">{(t.early_start_date || t.target_start_date || '').slice(0,10) || '—'}</div>
                              <div className="col-span-2 text-right text-slate-600">{(t.early_end_date || t.target_end_date || '').slice(0,10) || '—'}</div>
                              <div className="col-span-1 text-right text-slate-600">{dur}d</div>
                              <div className={`col-span-1 text-right font-bold ${fl < 0 ? 'text-red-600' : fl <= 14 ? 'text-amber-600' : 'text-green-600'}`}>{fl}d</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* FINISHED (existing) */}
                {scheduleFilter === 'finished' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      Activities with an actual finish date. Variance shows actual finish vs. planned finish.
                    </div>
                    {(!a.finishedActivities || a.finishedActivities.length === 0) ? (
                      <div className="text-center py-8 text-slate-400 text-xs">No finished activities detected.</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 pb-2">
                          <div className="col-span-1">Code</div><div className="col-span-5">Activity</div><div className="col-span-2 text-right">Actual Start</div><div className="col-span-2 text-right">Actual Finish</div><div className="col-span-1 text-right">Duration</div><div className="col-span-1 text-right">Variance</div>
                        </div>
                        {a.finishedActivities.slice(0, 100).map((t: any, i: number) => {
                          let variance: number | null = null
                          const actEnd = t.act_end_date
                          const plannedEnd = t.target_end_date || t.early_end_date
                          if (actEnd && plannedEnd) {
                            const a1 = new Date(actEnd.replace(' ', 'T')).getTime()
                            const p1 = new Date(plannedEnd.replace(' ', 'T')).getTime()
                            if (!isNaN(a1) && !isNaN(p1)) {
                              variance = Math.round((a1 - p1) / (1000 * 60 * 60 * 24))
                            }
                          }
                          let actualDuration = 0
                          if (t.act_start_date && t.act_end_date) {
                            const s = new Date(t.act_start_date.replace(' ', 'T')).getTime()
                            const e = new Date(t.act_end_date.replace(' ', 'T')).getTime()
                            if (!isNaN(s) && !isNaN(e)) {
                              actualDuration = Math.max(0, Math.round((e - s) / (1000 * 60 * 60 * 24)))
                            }
                          }
                          return (
                            <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 last:border-0 text-xs items-center">
                              <div className="col-span-1 font-mono font-semibold text-slate-800 truncate">{t.task_code}</div>
                              <div className="col-span-5 text-slate-700 truncate">{t.task_name}</div>
                              <div className="col-span-2 text-right text-slate-600">{(t.act_start_date || '').slice(0,10) || '—'}</div>
                              <div className="col-span-2 text-right text-slate-600 font-semibold">{(t.act_end_date || '').slice(0,10) || '—'}</div>
                              <div className="col-span-1 text-right text-slate-600">{actualDuration}d</div>
                              <div className={`col-span-1 text-right font-bold ${variance === null ? 'text-slate-400' : variance > 0 ? 'text-red-600' : variance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                                {variance === null ? '—' : variance > 0 ? `+${variance}d` : `${variance}d`}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* OTHER TABS — unchanged from before */}
            {activeTab === 'logic' && (
              <div>
                <h3 className="text-sm font-bold mb-3">Construction Sequence Problems · {a.outOfSequence?.length || 0} affected</h3>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                  Activities whose actual progress conflicts with relationship logic.
                </div>
                {(!a.outOfSequence || a.outOfSequence.length === 0) ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                    <div className="text-3xl mb-2">✓</div>
                    <div className="text-sm font-bold text-green-900">No sequence problems detected</div>
                  </div>
                ) : (
                  <>
                    {['Procurement', 'Pre-Construction', 'Other'].map(category => {
                      const items = (a.outOfSequence || []).filter((o: any) => o.category === category)
                      if (items.length === 0) return null
                      const catColor = category === 'Procurement' ? 'text-amber-700' : category === 'Pre-Construction' ? 'text-blue-700' : 'text-slate-700'
                      return (
                        <div key={category} className="mb-5">
                          <div className={`text-xs font-bold mb-2 uppercase tracking-wider ${catColor}`}>{category} · {items.length}</div>
                          <div className="space-y-2">
                            {items.slice(0, 30).map((o: any, i: number) => {
                              const violations = o.violations || []
                              return (
                                <div key={i} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 flex items-center gap-3">
                                    <div className="font-mono font-bold text-xs text-slate-900">{o.task.task_code}</div>
                                    <div className="flex-1 text-xs text-slate-700 truncate">{o.task.task_name}</div>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{violations.length} violation{violations.length === 1 ? '' : 's'}</span>
                                  </div>
                                  <div className="divide-y divide-slate-100">
                                    {violations.length === 0 ? (
                                      <div className="px-3 py-2 text-[11px] text-slate-500 italic">Predecessor {o.pred?.task_code} — relationship logic violated</div>
                                    ) : violations.map((v: any, vi: number) => (
                                      <div key={vi} className="px-3 py-2 text-[11px] leading-relaxed">
                                        <div className="flex items-start gap-2">
                                          <span className="font-mono font-bold text-slate-700 w-24 flex-shrink-0">{v.pred.task_code}</span>
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0">{v.relTypeLabel}</span>
                                          <span className="flex-1 text-slate-600">{v.pred.task_name}</span>
                                          <span className="text-[10px] font-bold text-red-700 flex-shrink-0">{v.varianceDays}d early</span>
                                        </div>
                                        <div className="mt-1 ml-26 text-[10px] text-slate-500 leading-snug">{v.description}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}

            {activeTab === 'noties' && (
              <div>
                <h3 className="text-sm font-bold mb-3">Activities with no logic ties ({a.noTies?.length || 0})</h3>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                  Every activity should be connected. Activities with no ties are "floating" — they don't show up correctly in critical path analysis.
                </div>
                <div className="space-y-2">
                  {(a.noTies || []).slice(0, 20).map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 text-xs">
                      <div className="font-mono font-semibold w-32 flex-shrink-0">{t.task_code}</div>
                      <div className="flex-1 text-slate-700">{t.task_name}</div>
                      <div className="text-red-600 font-bold w-14 text-right">{fmtFloat(t.total_float_hr_cnt)}</div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Logic gap</span>
                    </div>
                  ))}
                  {(!a.noTies || a.noTies.length === 0) && (
                    <div className="text-sm text-green-700 text-center py-6">✓ All activities have proper logic ties</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'longlead' && (
              <div>
                <h3 className="text-sm font-bold mb-3">Long lead items ({a.longLeadItems?.length || 0}, 35+ days)</h3>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                  Long lead items most commonly cause delays. Sorted by float — most critical first.
                </div>
                <div className="space-y-2">
                  {(a.longLeadItems || []).slice(0, 20).map((ll: any, i: number) => (
                    <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 text-xs">
                      <div className="col-span-2 font-mono font-semibold">{ll.task_code}</div>
                      <div className="col-span-5 text-slate-700">{ll.task_name}</div>
                      <div className="col-span-1 text-right">{ll.durationDays}d</div>
                      <div className="col-span-1 text-right">{ll.remainingDays}d</div>
                      <div className={`col-span-1 text-right font-bold ${ll.floatDays < 0 ? 'text-red-600' : ll.floatDays < 10 ? 'text-amber-600' : 'text-green-600'}`}>{ll.floatDays}d</div>
                      <div className="col-span-2 text-right"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ll.status_code === 'TK_Complete' ? 'bg-green-100 text-green-700' : ll.status_code === 'TK_Active' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{ll.status_code === 'TK_Complete' ? 'Delivered' : ll.status_code === 'TK_Active' ? `${ll.phys_complete_pct}%` : 'Not ordered'}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'field' && (
              <div>
                <h3 className="text-sm font-bold mb-3">Field reality — in progress ({a.inProgress})</h3>
                <div className="bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-amber-900 mb-4 leading-relaxed">
                  Activities the schedule says are being worked right now. Verify with your superintendent.
                </div>
                <div className="space-y-2">
                  {(a.inProgressActivities || []).slice(0, 25).map((t: any, i: number) => {
                    const pct = parseFloat(t.phys_complete_pct || '0')
                    const fl = parseFloat(t.total_float_hr_cnt || '0')
                    return (
                      <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 text-xs items-center">
                        <div className="col-span-3 font-mono font-semibold">{t.task_code}</div>
                        <div className="col-span-5 text-slate-700">{t.task_name}</div>
                        <div className="col-span-2">
                          <div className="flex items-center gap-2"><span className="font-bold w-8">{pct}%</span>
                          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct > 90 ? 'bg-green-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} /></div></div>
                        </div>
                        <div className="col-span-1 text-right text-slate-500">{fmtFloat(t.remain_drtn_hr_cnt)}</div>
                        <div className={`col-span-1 text-right font-bold ${fl < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmtFloat(t.total_float_hr_cnt)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {activeTab === 'plain' && (
              <div>
                <h3 className="text-sm font-bold mb-3">Plain language summary</h3>
                <div className="space-y-4 text-xs">
                  {a.delayDays > 30 && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">🚨</div>
                      <div>
                        <div className="font-bold text-slate-900">The project is {a.delayDays} days behind contract</div>
                        <div className="text-slate-600 mt-1 leading-relaxed">Contract completion was {a.contractEnd?.slice(0,10)}. Projected completion is now {a.projectedEnd?.slice(0,10)}.</div>
                      </div>
                    </div>
                  )}
                  {a.outOfSequence?.length > 0 && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">📦</div>
                      <div>
                        <div className="font-bold text-slate-900">{a.outOfSequence.length} activities started in the wrong order</div>
                        <div className="text-slate-600 mt-1 leading-relaxed">Work began before its predecessor was finished — usually a sign of trying to make up time.</div>
                      </div>
                    </div>
                  )}
                  {(a.longLeadItems || []).filter((l: any) => l.status_code === 'TK_NotStart' && l.floatDays < 0).length > 0 && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">⚡</div>
                      <div>
                        <div className="font-bold text-slate-900">Critical long lead items not yet ordered</div>
                        <div className="text-slate-600 mt-1 leading-relaxed">{(a.longLeadItems || []).filter((l: any) => l.status_code === 'TK_NotStart' && l.floatDays < 0).length} items with negative float remain unordered.</div>
                      </div>
                    </div>
                  )}
                  {a.noTies?.length > 0 && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">⛓️</div>
                      <div>
                        <div className="font-bold text-slate-900">{a.noTies.length} activities have no logic ties</div>
                        <div className="text-slate-600 mt-1 leading-relaxed">Their float calculations are unreliable.</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div>
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <div>
                    <h3 className="text-sm font-bold">Operational Analysis</h3>
                    <p className="text-xs text-slate-500 mt-0.5">A direct read of what the schedule is telling you.</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!hasNarrative && !isGenerating && (
                      <button onClick={handleGenerate} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5">
                        📝 Generate Operational Analysis
                      </button>
                    )}
                    {hasNarrative && !isEditing && !isGenerating && (
                      <>
                        <button onClick={handleEdit} className="border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1">✏️ Edit</button>
                        <button onClick={handleGenerate} className="border border-blue-200 hover:bg-blue-50 text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1">🔄 Regenerate</button>
                        <button onClick={handleClear} className="border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-600 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1">🗑️ Clear</button>
                      </>
                    )}
                  </div>
                </div>
                {narrativeError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-xs text-red-700">
                    <div className="font-bold mb-1">Couldn't generate the Operational Analysis</div>
                    <div>{narrativeError}</div>
                  </div>
                )}
                {isGenerating && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                    <div className="text-3xl mb-3 animate-pulse">📝</div>
                    <div className="text-sm font-bold text-blue-900">Generating Operational Analysis...</div>
                  </div>
                )}
                {!isGenerating && !hasNarrative && !narrativeError && (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
                    <div className="text-4xl mb-3">📝</div>
                    <div className="text-sm font-bold text-slate-700 mb-1">No Operational Analysis yet</div>
                    <div className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">When you're ready, click Generate to produce a written report.</div>
                    <button onClick={handleGenerate} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg">📝 Generate Operational Analysis</button>
                  </div>
                )}
                {hasNarrative && isEditing && !isGenerating && (
                  <div>
                    <textarea value={narrativeText} onChange={e => setNarrativeText(e.target.value)} rows={20}
                      className="w-full p-4 border border-blue-300 rounded-lg text-xs text-slate-800 font-sans leading-relaxed focus:outline-none focus:border-blue-500 resize-y bg-white" />
                    <div className="flex gap-2 mt-2 justify-end">
                      <button onClick={handleEditCancel} className="px-4 py-2 text-slate-600 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
                      <button onClick={handleEditSave} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">Save Changes</button>
                    </div>
                  </div>
                )}
                {hasNarrative && !isEditing && !isGenerating && (
                  <div className="bg-slate-50 border-l-4 border-blue-500 rounded-r-lg p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{narrativeText}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// PathCard — renders a single Float Path with Gantt chart, name, explanation,
// and expandable activity list.
// =============================================================================
function PathCard({ path, expanded, onToggle, projectStart, projectEnd }: {
  path: FloatPath
  expanded: boolean
  onToggle: () => void
  projectStart: string
  projectEnd: string
}) {
  const tagColor = path.isCritical
    ? 'bg-red-700 text-white'
    : path.isNearCritical
      ? 'bg-amber-600 text-white'
      : 'bg-slate-600 text-white'

  const tagLabel = path.isCritical
    ? `PATH ${path.pathNumber} · CRITICAL`
    : path.isNearCritical
      ? `PATH ${path.pathNumber} · NEAR-CRITICAL`
      : `PATH ${path.pathNumber}`

  const barColor = path.isCritical
    ? 'bg-red-700'
    : path.isNearCritical
      ? 'bg-amber-600'
      : 'bg-slate-500'

  const floatLabel = path.floatDays < 0
    ? `${path.floatDays} days float (behind)`
    : path.floatDays === 0
      ? '0 days float'
      : `${path.floatDays} day${path.floatDays === 1 ? '' : 's'} float`

  return (
    <div className="border border-slate-200 rounded-lg p-4 mb-3 bg-white">
      <button onClick={onToggle} className="w-full text-left flex items-center gap-2 mb-1">
        <span className={`${tagColor} text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded`}>
          {tagLabel}
        </span>
        <span className="text-base font-semibold text-slate-900 flex-1 truncate">{path.pathName}</span>
        <span className="text-xs text-slate-600">
          {path.activities.length} activities · {floatLabel} · drives to <span className="font-semibold">FINAL COMPLETION</span>
        </span>
        <span className="text-slate-400 ml-1 text-sm">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <>
          <p className="text-xs text-slate-600 leading-relaxed mb-3 mt-2 pl-1">{path.plainExplanation}</p>

          {/* Gantt strip with time axis */}
          <div className="bg-slate-50 border border-slate-200 rounded p-3 mb-3">
            {/* Time axis — month tick marks */}
            {(() => {
              const ticks = buildMonthTicks(projectStart, projectEnd)
              return (
                <div className="flex items-end mb-2 pb-1 border-b border-slate-300">
                  <div className="w-48 text-[11px] font-bold uppercase tracking-wider text-slate-500">Activity</div>
                  <div className="flex-1 relative h-5">
                    {ticks.map((tick, i) => (
                      <div key={i} className="absolute top-0 flex flex-col items-center"
                        style={{ left: `${tick.leftPct}%`, transform: 'translateX(-50%)' }}>
                        <div className="text-[10px] font-semibold text-slate-600">{tick.label}</div>
                        <div className="w-px h-2 bg-slate-400 mt-0.5"></div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Gantt bars */}
            <div className="space-y-1.5">
              {path.activities.slice(0, 12).map((t, i) => {
                const range = activityToGanttRange(t, projectStart, projectEnd)
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-48 font-mono text-[11px] text-slate-700 truncate" title={`${t.task_code} · ${t.task_name}`}>
                      <span className="font-bold">{t.task_code}</span> · {(t.task_name || '').slice(0, 26)}
                    </div>
                    <div className="flex-1 h-4 bg-white border border-slate-200 rounded relative">
                      {/* Subtle month grid lines */}
                      {(() => {
                        const ticks = buildMonthTicks(projectStart, projectEnd)
                        return ticks.map((tick, ti) => (
                          <div key={ti} className="absolute top-0 bottom-0 w-px bg-slate-200"
                            style={{ left: `${tick.leftPct}%` }} />
                        ))
                      })()}
                      {range && (
                        <div
                          className={`absolute top-0.5 bottom-0.5 rounded ${barColor}`}
                          style={{ left: `${range.leftPct}%`, width: `${range.widthPct}%`, minWidth: '4px' }}
                          title={`${t.early_start_date?.slice(0, 10) || ''} → ${t.early_end_date?.slice(0, 10) || ''}`}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
              {path.activities.length > 12 && (
                <div className="text-center text-[11px] text-slate-500 pt-2">Showing first 12 of {path.activities.length} activities · scroll the table below for full list</div>
              )}
            </div>

            {/* Project start / end date labels */}
            <div className="flex items-center mt-2 pt-2 border-t border-slate-200">
              <div className="w-48 text-[10px] text-slate-400 italic">Timeline →</div>
              <div className="flex-1 flex justify-between text-[10px] text-slate-500">
                <span>{projectStart?.slice(0, 10) || ''}</span>
                <span>{projectEnd?.slice(0, 10) || ''}</span>
              </div>
            </div>
          </div>

          {/* Activity table — slightly bigger fonts */}
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 pb-2">
              <div className="col-span-2">Code</div>
              <div className="col-span-5">Activity</div>
              <div className="col-span-2 text-right">Start</div>
              <div className="col-span-2 text-right">Finish</div>
              <div className="col-span-1 text-right">Float</div>
            </div>
            {path.activities.slice(0, 30).map((t, i) => {
              const fl = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
              return (
                <div key={i} className="grid grid-cols-12 gap-2 py-1.5 border-b border-slate-100 text-xs items-center last:border-0">
                  <div className="col-span-2 font-mono font-semibold text-slate-800 truncate">{t.task_code}</div>
                  <div className="col-span-5 text-slate-700 truncate">{t.task_name}</div>
                  <div className="col-span-2 text-right text-slate-600">{(t.early_start_date || t.target_start_date || '').slice(0, 10)}</div>
                  <div className="col-span-2 text-right text-slate-600">{(t.early_end_date || t.target_end_date || '').slice(0, 10)}</div>
                  <div className={`col-span-1 text-right font-bold ${fl < 0 ? 'text-red-600' : fl === 0 ? 'text-amber-700' : 'text-emerald-600'}`}>{fl}d</div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// =============================================================================
// buildMonthTicks — produce time-axis tick marks for the Gantt strip.
//
// Returns array of { leftPct, label } where leftPct is the horizontal position
// (0-100) along the project timeline and label is the month/year string. Spaces
// ticks at sensible monthly/quarterly intervals depending on the total range.
// =============================================================================
function buildMonthTicks(
  projectStart: string,
  projectEnd: string,
): { leftPct: number; label: string }[] {
  if (!projectStart || !projectEnd) return []
  try {
    const start = new Date(projectStart.replace(' ', 'T')).getTime()
    const end = new Date(projectEnd.replace(' ', 'T')).getTime()
    const total = end - start
    if (total <= 0) return []

    const months = total / (1000 * 60 * 60 * 24 * 30.44)
    // Pick interval: monthly if ≤12 months, every 2 months if ≤24, every 3 if ≤36, else 6
    const intervalMonths = months <= 12 ? 1 : months <= 24 ? 2 : months <= 36 ? 3 : 6

    const ticks: { leftPct: number; label: string }[] = []
    const startDate = new Date(start)
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    // Bump to first interval-aligned month at or after the start
    while (cursor.getTime() < start) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    let safety = 0
    while (cursor.getTime() <= end && safety < 60) {
      safety++
      const leftPct = ((cursor.getTime() - start) / total) * 100
      const m = cursor.getMonth()
      const y = cursor.getFullYear()
      // Show year on Jan and on the very first tick; otherwise just month
      const label = (m === 0 || ticks.length === 0) ? `${monthLabels[m]} '${String(y).slice(-2)}` : monthLabels[m]
      ticks.push({ leftPct, label })
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + intervalMonths, 1)
    }
    return ticks
  } catch {
    return []
  }
}
