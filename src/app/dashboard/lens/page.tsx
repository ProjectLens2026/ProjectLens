'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion, updateVersionNarrative, updateProjectEvm } from '@/lib/projectStore'
import type { EvmData, EvmMonth, DistributionMode } from '@/lib/evm'
import { buildEvmMonths, evmCumulative, monthCPI, monthSPI, fmtDollars, fmtRatio } from '@/lib/evm'

export default function ControlLensAnalysisPage() {
  const [analysis, setAnalysis] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('schedule-filter')
  const [scheduleFilter, setScheduleFilter] = useState<
    'critical' | 'longest' | 'lookahead' | 'not-started' | 'finished'
  >('critical')
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

  async function handleGenerate() {
    if (!project || !version || !analysis) return
    setIsGenerating(true)
    setNarrativeError(null)
    try {
      const res = await fetch('/api/generate-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis,
          context: version.context || {},
        }),
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
      if (!newNarrative) {
        throw new Error('Generation returned an empty result. Try again.')
      }
      setNarrativeText(newNarrative)
      updateVersionNarrative(project.id, version.id, newNarrative)
    } catch (err: any) {
      console.error('[ControlLens] Operational Analysis generation failed:', err)
      setNarrativeError(err.message || 'Could not generate the Operational Analysis. Try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  function handleEdit() {
    setIsEditing(true)
    setNarrativeError(null)
  }
  function handleEditSave() {
    if (!project || !version) return
    updateVersionNarrative(project.id, version.id, narrativeText)
    setIsEditing(false)
  }
  function handleEditCancel() {
    setNarrativeText(version?.aiNarrative || '')
    setIsEditing(false)
  }
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
            <div className="text-sm text-slate-500 mb-6">Upload a schedule to see the full analysis here. Once analyzed, this page shows the complete breakdown of your active project.</div>
            <Link href="/dashboard/upload"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
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
          <button onClick={() => window.print()} className="text-xs border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-400 transition-colors font-semibold flex items-center gap-1.5">
            🖨 Print / Save PDF
          </button>
          <Link href="/dashboard/upload" className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors font-semibold">
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
        {/* Condition Banner */}
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
        {/* KPI Grid */}
        <div className="grid grid-cols-5 gap-2">
          <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Total activities</div><div className="text-xl font-bold">{a.totalActivities}</div></div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Complete</div><div className="text-xl font-bold text-green-600">{a.complete}</div></div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">In progress</div><div className="text-xl font-bold text-amber-600">{a.inProgress}</div></div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Negative float</div><div className="text-xl font-bold text-red-600">{a.negativeFloat}</div></div>
          <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Out-of-sequence</div><div className="text-xl font-bold text-red-600">{a.outOfSequence?.length || 0}</div></div>
        </div>
        {/* Tabs — v10: Gantt removed, Schedule Filter promoted to first,
            Project Production added as the second tab. Everything else
            unchanged. */}
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="tab-bar flex gap-0 border-b border-slate-100 overflow-x-auto no-print">
            {[
              { id: 'schedule-filter', label: 'Schedule Filter', icon: '🔎' },
              { id: 'production', label: 'Project Production', icon: '💰' },
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
            {/* SCHEDULE FILTER — promoted to first tab in v10 */}
            {activeTab === 'schedule-filter' && (
              <div className="tab-pane">
                <h3 className="text-sm font-bold mb-3">Schedule Filter</h3>
                <p className="text-xs text-slate-500 mb-4">Slice the schedule different ways. Pick a filter below.</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {[
                    { id: 'critical',    label: 'Critical Path',          enabled: true,  icon: '🎯' },
                    { id: 'longest',     label: 'Longest Path',           enabled: true,  icon: '📏' },
                    { id: 'lookahead',   label: '2 Week Lookahead',       enabled: true,  icon: '📅' },
                    { id: 'not-started', label: 'Activities Not Started', enabled: true,  icon: '⏸️' },
                    { id: 'finished',    label: 'Activities Finished',    enabled: true,  icon: '✅' },
                  ].map(f => (
                    <button key={f.id} onClick={() => f.enabled && setScheduleFilter(f.id as any)} disabled={!f.enabled}
                      className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                        scheduleFilter === f.id && f.enabled ? 'bg-blue-600 text-white'
                        : f.enabled ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                      }`}>
                      {f.icon} {f.label}
                    </button>
                  ))}
                </div>
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
                        <div className="text-center py-8 text-slate-400 text-xs">No critical path activities detected in this schedule.</div>
                      )}
                    </div>
                  </div>
                )}
                {scheduleFilter === 'longest' && (
                  <div>
                    {(a.longestPathActivities && a.longestPathActivities.length > 0) ? (
                      <>
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                          The longest path is the chain of activities that determines when the project finishes — the path with the greatest total duration from start to end. P6 flags these activities with the <span className="font-mono">driving_path_flag</span>. ControlLens shows them here in chronological order.
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
                            const float = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
                            const pct = parseFloat(t.phys_complete_pct || '0')
                            return (
                              <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 last:border-0 text-xs items-center">
                                <div className="col-span-1 font-mono font-semibold text-slate-800 truncate">{t.task_code}</div>
                                <div className="col-span-5 text-slate-700 truncate">{t.task_name}</div>
                                <div className="col-span-2 text-right text-slate-600">{(t.early_start_date || t.target_start_date || t.act_start_date || '').slice(0,10)}</div>
                                <div className="col-span-2 text-right text-slate-600 font-semibold">{(t.early_end_date || t.target_end_date || t.act_end_date || '').slice(0,10)}</div>
                                <div className={`col-span-1 text-right font-bold ${float < 0 ? 'text-red-600' : float === 0 ? 'text-amber-600' : 'text-green-600'}`}>{float}d</div>
                                <div className="col-span-1 text-right">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.status_code === 'TK_Complete' ? 'bg-green-100 text-green-700' : t.status_code === 'TK_Active' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{t.status_code === 'TK_Complete' ? 'Done' : t.status_code === 'TK_Active' ? `${pct}%` : 'Not started'}</span>
                                </div>
                              </div>
                            )
                          })}
                          {a.longestPathActivities.length > 50 && (
                            <div className="text-center text-[10px] text-slate-400 pt-3">Showing first 50 of {a.longestPathActivities.length} activities on the longest path</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-amber-900 mb-4 leading-relaxed">
                          <strong>P6 has not calculated a longest path for this schedule.</strong> No activities have the driving_path_flag set. This usually means the scheduler did not enable longest-path calculation in P6's Scheduling Options. Showing the Critical Path drivers (zero/negative float) instead as the best available substitute.
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
                          {(!a.criticalDrivers || a.criticalDrivers.length === 0) && (
                            <div className="text-center py-8 text-slate-400 text-xs">No path data available.</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {scheduleFilter === 'lookahead' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      Activities scheduled to start or finish within 14 calendar days after the data date ({a.dataDate?.slice(0,10) || 'N/A'}). Use this for weekly coordination meetings with field super and trades.
                    </div>
                    {(!a.twoWeekLookahead || a.twoWeekLookahead.length === 0) ? (
                      <div className="text-center py-8 text-slate-400 text-xs">No activities scheduled in next 14 days.</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 pb-2">
                          <div className="col-span-1">Code</div><div className="col-span-5">Activity</div><div className="col-span-2 text-right">Start</div><div className="col-span-2 text-right">Finish</div><div className="col-span-1 text-right">% Done</div><div className="col-span-1 text-right">Float</div>
                        </div>
                        {a.twoWeekLookahead.slice(0, 30).map((t: any, i: number) => {
                          const float = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
                          const pct = parseFloat(t.phys_complete_pct || '0')
                          return (
                            <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 last:border-0 text-xs items-center">
                              <div className="col-span-1 font-mono font-semibold text-slate-800 truncate">{t.task_code}</div>
                              <div className="col-span-5 text-slate-700 truncate">{t.task_name}</div>
                              <div className="col-span-2 text-right text-slate-600">{(t.early_start_date || t.target_start_date || '').slice(0,10)}</div>
                              <div className="col-span-2 text-right text-slate-600 font-semibold">{(t.early_end_date || t.target_end_date || '').slice(0,10)}</div>
                              <div className="col-span-1 text-right text-slate-600">{pct}%</div>
                              <div className={`col-span-1 text-right font-bold ${float < 0 ? 'text-red-600' : float <= 14 ? 'text-amber-600' : 'text-green-600'}`}>{float}d</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                {scheduleFilter === 'not-started' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      Activities with no actual start date and no physical progress recorded. Sorted by planned start (soonest first). Use this for "what should already have started" review with the field super.
                    </div>
                    {(!a.notStartedActivities || a.notStartedActivities.length === 0) ? (
                      <div className="text-center py-8 text-slate-400 text-xs">No not-started activities detected.</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 pb-2">
                          <div className="col-span-1">Code</div><div className="col-span-5">Activity</div><div className="col-span-2 text-right">Planned Start</div><div className="col-span-2 text-right">Planned Finish</div><div className="col-span-1 text-right">Duration</div><div className="col-span-1 text-right">Float</div>
                        </div>
                        {a.notStartedActivities.slice(0, 100).map((t: any, i: number) => {
                          const float = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
                          const duration = Math.round(parseFloat(t.target_drtn_hr_cnt || t.remain_drtn_hr_cnt || '0') / 8)
                          return (
                            <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 last:border-0 text-xs items-center">
                              <div className="col-span-1 font-mono font-semibold text-slate-800 truncate">{t.task_code}</div>
                              <div className="col-span-5 text-slate-700 truncate">{t.task_name}</div>
                              <div className="col-span-2 text-right text-slate-600">{(t.early_start_date || t.target_start_date || '').slice(0,10) || '—'}</div>
                              <div className="col-span-2 text-right text-slate-600">{(t.early_end_date || t.target_end_date || '').slice(0,10) || '—'}</div>
                              <div className="col-span-1 text-right text-slate-600">{duration}d</div>
                              <div className={`col-span-1 text-right font-bold ${float < 0 ? 'text-red-600' : float <= 14 ? 'text-amber-600' : 'text-green-600'}`}>{float}d</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                {scheduleFilter === 'finished' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      Activities with an actual finish date. Most recently completed appear first. The Variance column shows actual finish vs. planned finish — positive means late, negative means early.
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

            {/* PROJECT PRODUCTION — new EVM tab, v10 */}
            {activeTab === 'production' && (
              <ProjectProduction project={project} dataDate={a.dataDate} />
            )}

            {/* SEQUENCE PROBLEMS */}
            {activeTab === 'logic' && (
              <div>
                <h3 className="text-sm font-bold mb-3">
                  Construction Sequence Problems · {a.outOfSequence?.length || 0} affected {a.outOfSequence?.length === 1 ? 'activity' : 'activities'}
                </h3>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                  <div className="font-bold mb-1">What this shows</div>
                  Activities whose actual progress conflicts with the relationship logic in the schedule. For each one, ControlLens lists every violated relationship with full evidence — what the logic required, what actually happened, and how many days earlier the work occurred than the logic allowed.
                </div>
                {(!a.outOfSequence || a.outOfSequence.length === 0) ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                    <div className="text-3xl mb-2">✓</div>
                    <div className="text-sm font-bold text-green-900">No sequence problems detected</div>
                    <div className="text-xs text-green-700 mt-1">All actual progress is consistent with the relationship logic.</div>
                  </div>
                ) : (
                  <>
                    {['Procurement', 'Pre-Construction', 'Other'].map(category => {
                      const items = (a.outOfSequence || []).filter((o: any) => o.category === category)
                      if (items.length === 0) return null
                      const catColor = category === 'Procurement' ? 'text-amber-700' : category === 'Pre-Construction' ? 'text-blue-700' : 'text-slate-700'
                      return (
                        <div key={category} className="mb-5">
                          <div className={`text-xs font-bold mb-2 uppercase tracking-wider ${catColor}`}>{category} · {items.length} {items.length === 1 ? 'activity' : 'activities'}</div>
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
            {/* NO TIES */}
            {activeTab === 'noties' && (
              <div>
                <h3 className="text-sm font-bold mb-3">Activities with no logic ties ({a.noTies?.length || 0} found)</h3>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                  Every activity should be connected — at least one predecessor and one successor. Activities with no ties are "floating" in the schedule. Delays to them will not show up in the analysis. This is a schedule quality problem.
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
            {/* LONG LEAD */}
            {activeTab === 'longlead' && (
              <div>
                <h3 className="text-sm font-bold mb-3">Long lead items ({a.longLeadItems?.length || 0} items, 35+ days duration)</h3>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                  Long lead items are materials or equipment requiring significant time to fabricate and deliver. These are the items that most commonly cause delays. ControlLens sorts by float — most critical first.
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
            {/* FIELD REALITY */}
            {activeTab === 'field' && (
              <div>
                <h3 className="text-sm font-bold mb-3">Field reality — activities in progress right now ({a.inProgress})</h3>
                <div className="bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-amber-900 mb-4 leading-relaxed">
                  These are activities the schedule says are being worked right now. Verify with your superintendent that progress matches what is physically happening on site.
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
            {/* PLAIN LANGUAGE */}
            {activeTab === 'plain' && (
              <div>
                <h3 className="text-sm font-bold mb-3">Plain language summary</h3>
                <div className="space-y-4 text-xs">
                  {a.delayDays > 30 && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">🚨</div>
                      <div>
                        <div className="font-bold text-slate-900">The project is {a.delayDays} days behind contract</div>
                        <div className="text-slate-600 mt-1 leading-relaxed">Contract completion was {a.contractEnd?.slice(0,10)}. Projected completion is now {a.projectedEnd?.slice(0,10)}. {a.negativeFloat} activities carry negative float, and {a.notStarted} have not yet started.</div>
                      </div>
                    </div>
                  )}
                  {a.outOfSequence?.length > 0 && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">📦</div>
                      <div>
                        <div className="font-bold text-slate-900">{a.outOfSequence.length} activities started in the wrong order</div>
                        <div className="text-slate-600 mt-1 leading-relaxed">In these cases, work began before its predecessor was finished. This usually means the contractor was trying to make up time — which is TIA evidence of schedule disruption from earlier delay events.</div>
                      </div>
                    </div>
                  )}
                  {(a.longLeadItems || []).filter((l: any) => l.status_code === 'TK_NotStart' && l.floatDays < 0).length > 0 && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">⚡</div>
                      <div>
                        <div className="font-bold text-slate-900">Critical long lead items not yet ordered</div>
                        <div className="text-slate-600 mt-1 leading-relaxed">{(a.longLeadItems || []).filter((l: any) => l.status_code === 'TK_NotStart' && l.floatDays < 0).length} long lead items have negative float and have not been ordered yet. Each day they sit unordered adds another day to the delay.</div>
                      </div>
                    </div>
                  )}
                  {a.noTies?.length > 0 && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">⛓️</div>
                      <div>
                        <div className="font-bold text-slate-900">{a.noTies.length} activities have no logic ties</div>
                        <div className="text-slate-600 mt-1 leading-relaxed">These activities are not properly connected to predecessors or successors. The float calculations for them are unreliable and they may not show up correctly in critical path analysis.</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* OPERATIONAL ANALYSIS — generate / edit / regenerate / clear flow */}
            {activeTab === 'ai' && (
              <div>
                <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                  <div>
                    <h3 className="text-sm font-bold">Operational Analysis</h3>
                    <p className="text-xs text-slate-500 mt-0.5">A direct read of what the schedule is telling you, what matters most this week, and what conversations to have. Generated on demand — the engine works without it.</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!hasNarrative && !isGenerating && (
                      <button onClick={handleGenerate}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5">
                        📝 Generate Operational Analysis
                      </button>
                    )}
                    {hasNarrative && !isEditing && !isGenerating && (
                      <>
                        <button onClick={handleEdit}
                          className="border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1">
                          ✏️ Edit
                        </button>
                        <button onClick={handleGenerate}
                          className="border border-blue-200 hover:bg-blue-50 text-blue-600 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1">
                          🔄 Regenerate
                        </button>
                        <button onClick={handleClear}
                          className="border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-600 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1">
                          🗑️ Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {narrativeError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-xs text-red-700">
                    <div className="font-bold mb-1">Couldn't generate the Operational Analysis</div>
                    <div>{narrativeError}</div>
                    <div className="mt-1 text-red-600">The schedule analysis above is unaffected — only the narrative requires the report service.</div>
                  </div>
                )}
                {isGenerating && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                    <div className="text-3xl mb-3 animate-pulse">📝</div>
                    <div className="text-sm font-bold text-blue-900">Generating Operational Analysis...</div>
                    <div className="text-xs text-blue-700 mt-1">This usually takes 10-30 seconds. The rest of the page works while this runs.</div>
                  </div>
                )}
                {!isGenerating && !hasNarrative && !narrativeError && (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
                    <div className="text-4xl mb-3">📝</div>
                    <div className="text-sm font-bold text-slate-700 mb-1">No Operational Analysis yet</div>
                    <div className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                      The schedule engine has already analyzed your data above. When you're ready, click <strong>Generate Operational Analysis</strong> to produce a written report with project condition, top three actions, conversations to have this week, and TIA evidence.
                    </div>
                    <button onClick={handleGenerate}
                      className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
                      📝 Generate Operational Analysis
                    </button>
                  </div>
                )}
                {hasNarrative && isEditing && !isGenerating && (
                  <div>
                    <textarea
                      value={narrativeText}
                      onChange={e => setNarrativeText(e.target.value)}
                      rows={20}
                      className="w-full p-4 border border-blue-300 rounded-lg text-xs text-slate-800 font-sans leading-relaxed focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-y bg-white"
                      placeholder="Write your own Operational Analysis here..."
                    />
                    <div className="flex gap-2 mt-2 justify-end">
                      <button onClick={handleEditCancel}
                        className="px-4 py-2 text-slate-600 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50">
                        Cancel
                      </button>
                      <button onClick={handleEditSave}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">
                        Save Changes
                      </button>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-2">Your edits are saved to this version. Switching versions or regenerating will not lose them.</div>
                  </div>
                )}
                {hasNarrative && !isEditing && !isGenerating && (
                  <div className="bg-slate-50 border-l-4 border-blue-500 rounded-r-lg p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {narrativeText}
                  </div>
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
// ProjectProduction — Day 5, v10
// EVM (Earned Value Management) input + visualization tab.
//
// Inputs (all PM-entered):
//   - Total Budget (one number per project, sticky)
//   - Distribution mode: S-curve (default) / Linear / Manual
//   - Per-month: Planned % (auto from distribution, editable in manual),
//                Earned $ (entered as work completes),
//                Actual $ (entered as bills are paid)
//
// Derived:
//   - Per-month Planned $ = totalBudget * plannedPct / 100
//   - Per-month CPI = EV / AC
//   - Per-month SPI = EV / PV
//   - Cumulative PV / EV / AC up to data-date month
//   - Project-level CPI = sum(EV) / sum(AC) up to data-date
//   - Project-level SPI = sum(EV) / sum(PV) up to data-date
//
// Months come from the project's manual contract dates: NTP → Revised
// Contract Completion (fallback to Original Contract Completion). If no
// dates are entered, shows an empty state pointing PM to set them on
// the upload form first.
// =============================================================================
function ProjectProduction({ project, dataDate }: { project: any; dataDate?: string }) {
  const ntp = project.contractDates?.ntp
  const revisedEnd = project.contractDates?.originalContractCompletion  // ContractDates uses originalContractCompletion as the project-end source of truth

  // Local editing state — synced from project.evm on mount and project changes.
  // We hold a draft locally and persist on every change (debounced via
  // updateProjectEvm calling IndexedDB writes). React renders are driven
  // off this local state for snappy edits.
  const [budget, setBudget] = useState<string>(
    project.evm?.totalBudget ? String(project.evm.totalBudget) : ''
  )
  const [distMode, setDistMode] = useState<DistributionMode>(
    project.evm?.distributionMode || 'scurve'
  )
  const [months, setMonths] = useState<EvmMonth[]>(project.evm?.months || [])

  // Sync from project when version/project changes — defensive against
  // multi-window edits or projectStore notifications mid-edit.
  useEffect(() => {
    if (project.evm) {
      setBudget(project.evm.totalBudget ? String(project.evm.totalBudget) : '')
      setDistMode(project.evm.distributionMode || 'scurve')
      setMonths(project.evm.months || [])
    } else {
      setBudget('')
      setDistMode('scurve')
      setMonths([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  function persist(next: Partial<EvmData>) {
    const data: EvmData = {
      totalBudget: next.totalBudget ?? (parseFloat(budget) || 0),
      currency: 'USD',
      distributionMode: next.distributionMode ?? distMode,
      months: next.months ?? months,
    }
    updateProjectEvm(project.id, data)
  }

  // Initial setup — called when PM clicks "Set up EVM" on the empty state.
  // Requires manual NTP and Revised Contract Completion to be set on the
  // upload form first; otherwise we can't generate the month range.
  function setupEvm() {
    if (!ntp || !revisedEnd) return
    const budgetNum = parseFloat(budget) || 0
    const newMonths = buildEvmMonths(ntp, revisedEnd, distMode, months)
    setMonths(newMonths)
    persist({ totalBudget: budgetNum, distributionMode: distMode, months: newMonths })
  }

  function handleBudgetChange(value: string) {
    setBudget(value)
    const budgetNum = parseFloat(value) || 0
    persist({ totalBudget: budgetNum })
  }

  function handleDistChange(mode: DistributionMode) {
    setDistMode(mode)
    // For S-curve / Linear, regenerate percentages. For Manual, leave
    // current values alone — PM is now in control of every row.
    if (mode === 'scurve' || mode === 'linear') {
      const newMonths = buildEvmMonths(ntp, revisedEnd, mode, months)
      setMonths(newMonths)
      persist({ distributionMode: mode, months: newMonths })
    } else {
      persist({ distributionMode: mode })
    }
  }

  function updateMonth(idx: number, field: keyof EvmMonth, value: number) {
    const newMonths = months.map((m, i) =>
      i === idx ? { ...m, [field]: value } : m
    )
    setMonths(newMonths)
    persist({ months: newMonths })
  }

  function regenerateDistribution() {
    if (!ntp || !revisedEnd) return
    const newMonths = buildEvmMonths(ntp, revisedEnd, distMode, months)
    setMonths(newMonths)
    persist({ months: newMonths })
  }

  // EMPTY STATE — no contract dates set
  if (!ntp || !revisedEnd) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex gap-3 items-start">
          <div className="text-2xl">⚠️</div>
          <div>
            <div className="font-bold text-amber-900 mb-1">Set up contract dates first</div>
            <div className="text-sm text-amber-800 leading-relaxed mb-3">
              Project Production needs your manual NTP and Original Contract Completion dates to generate the monthly grid.
              Open <Link href="/dashboard/upload" className="font-bold underline">Upload</Link> and enter them in the Contract Dates section,
              then come back here.
            </div>
            <div className="text-xs text-amber-700">
              Current NTP: <span className="font-mono font-bold">{ntp || '(not set)'}</span>
              {' · '}
              Original Contract Completion: <span className="font-mono font-bold">{revisedEnd || '(not set)'}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const totalBudgetNum = parseFloat(budget) || 0
  const hasMonths = months.length > 0

  // Data-date month for cumulative cutoff (YYYY-MM)
  const cutoff = (() => {
    const d = dataDate ? new Date(dataDate) : new Date()
    if (isNaN(d.getTime())) return undefined
    const yy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${yy}-${mm}`
  })()

  const cumulative = evmCumulative(totalBudgetNum, months, cutoff)

  return (
    <div>
      <h3 className="text-sm font-bold mb-1">Project Production</h3>
      <p className="text-xs text-slate-500 mb-4">
        Earned Value tracking — enter your budget, then per-month earned ($ of physical work completed) and actual ($ billed).
        CPI &amp; SPI are calculated automatically. All data is manually entered, not derived from XER.
      </p>

      {/* Setup controls */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">Total Budget (USD)</label>
            <input type="number" value={budget}
              onChange={e => handleBudgetChange(e.target.value)}
              placeholder="e.g. 25000000"
              className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white" />
            <div className="text-[10px] text-slate-500 mt-1">{totalBudgetNum > 0 ? fmtDollars(totalBudgetNum) : 'Enter total contract value'}</div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">Distribution</label>
            <div className="flex gap-1">
              {(['scurve', 'linear', 'manual'] as DistributionMode[]).map(m => (
                <button key={m} onClick={() => handleDistChange(m)}
                  className={`flex-1 text-xs font-semibold px-2 py-2 rounded-lg transition-colors ${
                    distMode === m ? 'bg-blue-600 text-white' : 'bg-white border border-blue-200 text-slate-700 hover:bg-blue-100'
                  }`}>
                  {m === 'scurve' ? 'S-curve' : m === 'linear' ? 'Linear' : 'Manual'}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {distMode === 'scurve' ? 'Construction-standard S shape' :
               distMode === 'linear' ? 'Equal % every month' :
               'You enter each month manually'}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">Date Range</label>
            <div className="text-xs text-slate-700 px-3 py-2 bg-white border border-blue-200 rounded-lg">
              <div className="font-semibold">{ntp} → {revisedEnd}</div>
              <div className="text-[10px] text-slate-500">{months.length} months</div>
            </div>
            <button onClick={hasMonths ? regenerateDistribution : setupEvm}
              className="mt-1 w-full text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline">
              {hasMonths ? '⟳ Regenerate from dates' : '⟳ Generate monthly grid'}
            </button>
          </div>
        </div>
      </div>

      {!hasMonths ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">💰</div>
          <div className="text-sm font-bold text-slate-700 mb-1">Generate the monthly grid to start</div>
          <div className="text-xs text-slate-500 mb-4">Enter your total budget above, then click "Generate monthly grid".</div>
          <button onClick={setupEvm}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
            Generate monthly grid →
          </button>
        </div>
      ) : (
        <>
          {/* KPI tiles — cumulative to data date */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
            <KpiCell label="Total Budget"     value={fmtDollars(totalBudgetNum)} subtle />
            <KpiCell label="Planned (PV)"     value={fmtDollars(cumulative.pv)} />
            <KpiCell label="Earned (EV)"      value={fmtDollars(cumulative.ev)} valueColor="text-emerald-700" />
            <KpiCell label="Actual (AC)"      value={fmtDollars(cumulative.ac)} valueColor="text-amber-700" />
            <KpiCell label="CPI"              value={fmtRatio(cumulative.cpi)}
              valueColor={cumulative.cpi !== null && cumulative.cpi < 1 ? 'text-red-600' : 'text-emerald-600'}
              subtitle={cumulative.cpi !== null && cumulative.cpi < 1 ? 'Over budget' : 'On / under budget'} />
            <KpiCell label="SPI"              value={fmtRatio(cumulative.spi)}
              valueColor={cumulative.spi !== null && cumulative.spi < 1 ? 'text-red-600' : 'text-emerald-600'}
              subtitle={cumulative.spi !== null && cumulative.spi < 1 ? 'Behind schedule' : 'On / ahead of schedule'} />
          </div>

          {/* Bar chart — PV / EV / AC per month */}
          <EvmBarChart months={months} totalBudget={totalBudgetNum} cutoff={cutoff} />

          {/* Editable monthly table */}
          <div className="mt-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              <div className="col-span-2">Month</div>
              <div className="col-span-1 text-right">Plan %</div>
              <div className="col-span-2 text-right">Planned ($)</div>
              <div className="col-span-2 text-right">Earned ($)</div>
              <div className="col-span-2 text-right">Actual ($)</div>
              <div className="col-span-1 text-right">CPI</div>
              <div className="col-span-1 text-right">SPI</div>
              <div className="col-span-1 text-center">Status</div>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {months.map((m, i) => {
                const pv = (m.plannedPct / 100) * totalBudgetNum
                const cpi = monthCPI(m.earnedDollars, m.actualDollars)
                const spi = monthSPI(m.earnedDollars, pv)
                const isCurrent = cutoff && m.isoMonth === cutoff
                const isPast = cutoff && m.isoMonth < cutoff
                const rowBg = isCurrent ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                return (
                  <div key={m.isoMonth} className={`grid grid-cols-12 gap-2 px-3 py-2 text-xs border-b border-slate-100 last:border-0 ${rowBg} items-center`}>
                    <div className="col-span-2 font-mono font-semibold text-slate-900">{m.label}</div>
                    <div className="col-span-1 text-right">
                      <input type="number" step="0.1"
                        value={m.plannedPct.toFixed(2)}
                        onChange={e => updateMonth(i, 'plannedPct', parseFloat(e.target.value) || 0)}
                        disabled={distMode !== 'manual'}
                        className={`w-full text-right px-1 py-0.5 text-xs border rounded ${distMode === 'manual' ? 'border-slate-200 bg-white' : 'border-transparent bg-transparent text-slate-500'}`}
                      />
                    </div>
                    <div className="col-span-2 text-right text-slate-700 font-mono">{fmtDollars(pv)}</div>
                    <div className="col-span-2 text-right">
                      <input type="number"
                        value={m.earnedDollars || ''}
                        onChange={e => updateMonth(i, 'earnedDollars', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full text-right px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-400" />
                    </div>
                    <div className="col-span-2 text-right">
                      <input type="number"
                        value={m.actualDollars || ''}
                        onChange={e => updateMonth(i, 'actualDollars', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full text-right px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-400" />
                    </div>
                    <div className={`col-span-1 text-right font-bold ${cpi === null ? 'text-slate-300' : cpi < 1 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmtRatio(cpi)}
                    </div>
                    <div className={`col-span-1 text-right font-bold ${spi === null ? 'text-slate-300' : spi < 1 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmtRatio(spi)}
                    </div>
                    <div className="col-span-1 text-center">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isCurrent ? 'bg-blue-100 text-blue-800' : isPast ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                        {isCurrent ? 'NOW' : isPast ? 'PAST' : 'FUTURE'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function KpiCell({ label, value, subtle, valueColor, subtitle }: {
  label: string; value: string; subtle?: boolean; valueColor?: string; subtitle?: string
}) {
  return (
    <div className={`rounded-lg p-3 ${subtle ? 'bg-slate-50' : 'bg-white border border-slate-200'}`}>
      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-base font-bold ${valueColor || 'text-slate-900'} tabular-nums mt-0.5`}>{value}</div>
      {subtitle && <div className="text-[9px] text-slate-500 mt-0.5">{subtitle}</div>}
    </div>
  )
}

// =============================================================================
// EVM Bar Chart — three bars per month (PV, EV, AC)
// Forecast (future) months render PV in lighter blue, EV/AC at 0 (no data
// entered yet). Past + current months render all three at full intensity.
// =============================================================================
function EvmBarChart({ months, totalBudget, cutoff }: {
  months: EvmMonth[]; totalBudget: number; cutoff?: string
}) {
  if (months.length === 0 || totalBudget === 0) return null

  const W = 700
  const H = 240
  const padL = 60, padR = 16, padT = 20, padB = 38
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  // Compute max value across PV/EV/AC for y-axis scaling
  let maxValue = 0
  for (const m of months) {
    const pv = (m.plannedPct / 100) * totalBudget
    maxValue = Math.max(maxValue, pv, m.earnedDollars, m.actualDollars)
  }
  if (maxValue === 0) maxValue = totalBudget / months.length  // sane default

  const stepX = innerW / Math.max(months.length, 1)
  const barW = Math.max(4, Math.min(8, (stepX - 8) / 3))
  const yFor = (v: number) => padT + innerH * (1 - v / maxValue)
  const heightFor = (v: number) => innerH * (v / maxValue)

  // Y-axis gridlines at sensible $ values
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(t => t * maxValue)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="text-[11px] font-bold text-slate-700 mb-2">Monthly Production — Planned vs Earned vs Actual</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* Gridlines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={yFor(v)} x2={W - padR} y2={yFor(v)} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray={v === 0 ? '0' : '2'} />
            <text x={padL - 4} y={yFor(v) + 3} fontSize="8" fill="#94a3b8" textAnchor="end">
              {fmtDollars(v)}
            </text>
          </g>
        ))}
        {/* Bars per month */}
        {months.map((m, i) => {
          const pv = (m.plannedPct / 100) * totalBudget
          const ev = m.earnedDollars || 0
          const ac = m.actualDollars || 0
          const isPast = cutoff && m.isoMonth <= cutoff
          const isFuture = !isPast
          const groupCenter = padL + (i + 0.5) * stepX
          const x1 = groupCenter - barW * 1.5 - 2
          const x2 = groupCenter - barW / 2
          const x3 = groupCenter + barW / 2 + 2
          return (
            <g key={m.isoMonth}>
              {/* PV — blue (lighter if future) */}
              <rect x={x1} y={yFor(pv)} width={barW} height={heightFor(pv)} fill={isFuture ? 'rgba(37,99,235,0.4)' : '#2563eb'} />
              {/* EV — green */}
              {ev > 0 && (
                <rect x={x2} y={yFor(ev)} width={barW} height={heightFor(ev)} fill="#16a34a" />
              )}
              {/* AC — amber */}
              {ac > 0 && (
                <rect x={x3} y={yFor(ac)} width={barW} height={heightFor(ac)} fill="#d97706" />
              )}
              {/* Month label */}
              <text x={groupCenter} y={H - padB + 12} fontSize="8" fill="#64748b" textAnchor="middle">{m.label}</text>
            </g>
          )
        })}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-blue-600 rounded-sm"/>
          <span><span className="font-semibold">PV</span> Planned Value</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-emerald-600 rounded-sm"/>
          <span><span className="font-semibold">EV</span> Earned Value (physical work)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-amber-600 rounded-sm"/>
          <span><span className="font-semibold">AC</span> Actual Cost (billed/paid)</span>
        </div>
        <div className="ml-auto text-slate-500">
          CPI &lt; 1 = over budget · SPI &lt; 1 = behind schedule
        </div>
      </div>
    </div>
  )
}
