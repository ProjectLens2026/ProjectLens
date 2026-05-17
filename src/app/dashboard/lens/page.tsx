'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion } from '@/lib/projectStore'
// Gantt Chart Component
function GanttChart({ activities, drivingPath, dataDate, projectedEnd }: {
  activities: any[]
  drivingPath: any[]
  dataDate: string
  projectedEnd: string
}) {
  const hasZeroNegFloat = activities && activities.length > 0
  const hasDrivingPath = drivingPath && drivingPath.length > 0
  const displayActivities = hasZeroNegFloat ? activities : (hasDrivingPath ? drivingPath : [])
  const mode = hasZeroNegFloat ? 'float' : hasDrivingPath ? 'driving' : 'none'
  function renderGantt(acts: any[]) {
    const start = new Date(dataDate?.replace(' ', 'T') || new Date())
    const end = new Date(projectedEnd?.replace(' ', 'T') || new Date())
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
    function getLeft(dateStr?: string) {
      if (!dateStr) return 0
      const d = new Date(dateStr.replace(' ', 'T'))
      const days = Math.round((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      return Math.max(0, Math.min(100, (days / totalDays) * 100))
    }
    function getWidth(startStr?: string, endStr?: string) {
      if (!startStr || !endStr) return 1
      const s = new Date(startStr.replace(' ', 'T'))
      const e = new Date(endStr.replace(' ', 'T'))
      const days = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
      return Math.max(0.5, Math.min(100, (days / totalDays) * 100))
    }
    function shortDate(d?: string) { return d ? d.slice(0, 10) : '—' }
    const months: { label: string; left: number }[] = []
    const cur = new Date(start)
    cur.setDate(1)
    while (cur <= end) {
      const left = getLeft(cur.toISOString())
      if (left >= 0 && left <= 100) {
        months.push({ label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), left })
      }
      cur.setMonth(cur.getMonth() + 1)
    }
    const displayed = acts.slice(0, 100)
    return (
      <div className="overflow-auto max-h-[550px] border border-slate-200 rounded-xl">
        <div className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
          <div className="flex">
            <div className="w-80 flex-shrink-0 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-r border-slate-200">Activity</div>
            <div className="flex-1 relative h-8 min-w-[600px]">
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 h-full flex items-center" style={{ left: `${m.left}%` }}>
                  <div className="h-full border-l border-slate-300 border-dashed" />
                  <span className="text-[9px] text-slate-400 ml-1 whitespace-nowrap">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {displayed.map((t: any, i: number) => {
          const taskStart = t.act_start_date || t.early_start_date || t.target_start_date || ''
          const taskEnd = t.early_end_date || t.act_end_date || t.target_end_date || ''
          const float = parseFloat(t.total_float_hr_cnt || '0')
          const isComplete = t.status_code === 'TK_Complete'
          const barColor = isComplete ? 'bg-slate-400' : mode === 'driving' ? 'bg-blue-500' : float < 0 ? 'bg-red-500' : 'bg-amber-500'
          const left = getLeft(taskStart)
          const width = getWidth(taskStart, taskEnd)
          const pct = parseFloat(t.phys_complete_pct || '0')
          return (
            <div key={i} className={`flex border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
              <div className="w-80 flex-shrink-0 px-3 py-2 border-r border-slate-100 flex items-center gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono font-bold text-slate-800 truncate">{t.task_code}</div>
                  <div className="text-[10px] text-slate-500 truncate">{t.task_name}</div>
                </div>
                <div className={`ml-auto text-[10px] font-bold flex-shrink-0 ${float < 0 ? 'text-red-600' : float === 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {Math.round(float / 8)}d
                </div>
              </div>
              <div className="flex-1 relative py-2 min-w-[600px] h-10">
                <div className="absolute inset-y-0 flex items-center" style={{ left: `${left}%`, width: `${width}%`, minWidth: '4px' }}>
                  <div className={`relative h-5 w-full rounded-sm ${barColor} opacity-80 overflow-hidden`}>
                    <div className="absolute inset-y-0 left-0 bg-black/20 rounded-l-sm" style={{ width: `${pct}%` }} />
                    {width > 8 && (
                      <div className="absolute inset-0 flex items-center px-1">
                        <span className="text-[9px] text-white font-semibold truncate">{shortDate(taskEnd)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {acts.length > 100 && (
          <div className="text-center py-3 text-xs text-slate-400 border-t border-slate-200">
            Showing first 100 of {acts.length} activities
          </div>
        )}
      </div>
    )
  }
  if (mode === 'none') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex gap-3 items-start">
          <div className="text-2xl">⚠️</div>
          <div>
            <div className="font-bold text-amber-900 mb-1">Gantt chart cannot be displayed</div>
            <div className="text-sm text-amber-800 leading-relaxed mb-3">
              NobelPM could not find any activities with driving path or float data in this schedule.
              This usually means the schedule has not been calculated in P6, or the XER was exported before
              a schedule calculation was run.
            </div>
            <div className="text-xs font-bold text-amber-700 mb-1">What to do:</div>
            <div className="text-xs text-amber-700 leading-relaxed">
              Open the schedule in Primavera P6, run Schedule (F9), then re-export the XER and upload again.
            </div>
          </div>
        </div>
      </div>
    )
  }
  if (mode === 'driving') {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex gap-3 items-start">
            <div className="text-2xl">ℹ️</div>
            <div>
              <div className="font-bold text-blue-900 mb-1">Critical path is showing positive float — here is why</div>
              <div className="text-sm text-blue-800 leading-relaxed mb-3">
                All activities in this schedule carry positive total float — meaning no activity is technically "late" according to the schedule calculation. This is usually caused by:
              </div>
              <div className="space-y-2 text-sm text-blue-800">
                <div className="flex gap-2"><span className="font-bold flex-shrink-0">1.</span><span><span className="font-semibold">No "Must Finish By" constraint on the completion milestone.</span> If the project finish milestone has no hard constraint date, P6 calculates float against an open-ended horizon.</span></div>
                <div className="flex gap-2"><span className="font-bold flex-shrink-0">2.</span><span><span className="font-semibold">Schedule calculated without a project deadline.</span> The scheduler may not have set the contract completion date as a constraint in P6.</span></div>
                <div className="flex gap-2"><span className="font-bold flex-shrink-0">3.</span><span><span className="font-semibold">Float type set to "Finish Float" instead of "Total Float."</span></span></div>
              </div>
              <div className="mt-4 p-3 bg-blue-100 rounded-lg text-xs text-blue-900 leading-relaxed">
                <span className="font-bold">What this means operationally:</span> The schedule is showing a longest path but not a true critical path with float enforcement. The PM should verify in P6 that a "Must Finish By" constraint is set on the contract completion milestone.
              </div>
              <div className="mt-3 text-xs text-blue-700 font-semibold">
                NobelPM is showing the Longest Path (driving path flag = Y) as the best available substitute:
              </div>
            </div>
          </div>
        </div>
        {renderGantt(displayActivities)}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-500" /><span className="text-slate-600">Negative float (behind schedule)</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500" /><span className="text-slate-600">Zero float (on the critical path)</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-slate-400" /><span className="text-slate-600">Complete</span></div>
        <div className="ml-auto text-slate-400">{activities.length} activities · sorted by early finish date</div>
      </div>
      {renderGantt(displayActivities)}
    </div>
  )
}
export default function NobelPMAnalysisPage() {
  const [analysis, setAnalysis] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('gantt')
  // Schedule Filter sub-filter (which slice of activities to show inside
  // the new "Schedule Filter" tab). Replaces the old separate Critical Path
  // and 2-Week Lookahead tabs with a single tab that has multiple filter
  // modes. Two filters ('not-started' and 'finished') are placeholders for
  // now — their data depends on parser changes coming in the next push.
  const [scheduleFilter, setScheduleFilter] = useState<
    'critical' | 'longest' | 'lookahead' | 'not-started' | 'finished'
  >('critical')
  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [])
  function refresh() {
    const p = getActiveProject()
    setProject(p)
    // Show the SELECTED version (V1 / V2 / etc. from sidebar), falling back
    // to the latest version when nothing is explicitly selected. Previously
    // this always called getLatestVersion which ignored sidebar selection
    // and caused clicking V1 to still render V2's data on Full Analysis.
    const v = getActiveVersion(p)
    setVersion(v)
    setAnalysis(v?.analysis || null)
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
  // No active project or no analysis
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
            <div className="text-sm text-slate-500 mb-6">Upload a schedule to see the full 7-tab analysis here. Once analyzed, this page shows the complete breakdown of your active project.</div>
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
  // AI narrative is stored per-version, not per-project. Read from the
  // currently selected version's aiNarrative field (not always v0 like
  // the old code did, which would show V1's narrative even when viewing V2).
  const aiNarrative = version?.aiNarrative || ''
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
        {/* Tabs */}
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="tab-bar flex gap-0 border-b border-slate-100 overflow-x-auto no-print">
            {[
              { id: 'gantt', label: 'Gantt Chart', icon: '📊' },
              { id: 'schedule-filter', label: 'Schedule Filter', icon: '🔎' },
              { id: 'logic', label: 'Sequence Problems', icon: '🔧' },
              { id: 'noties', label: 'No Logic Ties', icon: '⛓️' },
              { id: 'longlead', label: 'Long Lead Items', icon: '📦' },
              { id: 'field', label: 'Field Reality', icon: '👷' },
              { id: 'plain', label: 'Plain Language', icon: '💬' },
              { id: 'ai', label: 'Narrative', icon: '📝' },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === t.id ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-slate-500 hover:text-slate-900'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div className="p-5">
            {/* GANTT CHART */}
            {activeTab === 'gantt' && (
              <div>
                <h3 className="text-sm font-bold mb-1">Critical Path Gantt — activities with 0 or negative float</h3>
                <p className="text-xs text-slate-500 mb-4">Sorted by early finish date. Red = negative float, Orange = zero float, Gray = complete.</p>
                <GanttChart activities={a.ganttActivities || []} drivingPath={a.criticalDrivers || []} dataDate={a.dataDate} projectedEnd={a.projectedEnd} />
              </div>
            )}
            {/* SCHEDULE FILTER — replaces the old Critical Path + 2 Week Lookahead tabs.
                Single tab with a sub-filter selector. Three filters work today using
                data already produced by the XER parser; two are placeholders pending
                the next parser update (act_start_date / act_end_date exposure). */}
            {activeTab === 'schedule-filter' && (
              <div className="tab-pane">
                <h3 className="text-sm font-bold mb-3">Schedule Filter</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Slice the schedule different ways. Pick a filter below.
                </p>
                {/* Sub-filter selector — pill buttons. Disabled state used for
                    placeholder filters (Not Started, Finished) until parser exposes
                    the underlying activity lists. */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {[
                    { id: 'critical',    label: 'Critical Path',          enabled: true,  icon: '🎯' },
                    { id: 'longest',     label: 'Longest Path',           enabled: true,  icon: '📏' },
                    { id: 'lookahead',   label: '2 Week Lookahead',       enabled: true,  icon: '📅' },
                    { id: 'not-started', label: 'Activities Not Started', enabled: true,  icon: '⏸️' },
                    { id: 'finished',    label: 'Activities Finished',    enabled: true,  icon: '✅' },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => f.enabled && setScheduleFilter(f.id as any)}
                      disabled={!f.enabled}
                      className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                        scheduleFilter === f.id && f.enabled
                          ? 'bg-blue-600 text-white'
                          : f.enabled
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                      }`}>
                      {f.icon} {f.label}
                      {!f.enabled && <span className="ml-1 text-[10px] italic">(coming soon)</span>}
                    </button>
                  ))}
                </div>
                {/* CRITICAL PATH sub-filter — activities with zero or negative float.
                    Uses a.criticalDrivers, already computed by the XER parser. */}
                {scheduleFilter === 'critical' && (
                  <div>
                    <p className="text-xs text-slate-500 mb-4">
                      The critical path is the chain of activities controlling project completion. If any of these slips, the whole project slips by that same amount.
                    </p>
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
                {/* LONGEST PATH sub-filter — uses driving_path_flag='Y' from
                    P6 (the actual longest-path marker). Falls back to the
                    Critical Path drivers ONLY if no activities have the
                    flag set, with a clear amber notice explaining why. */}
                {scheduleFilter === 'longest' && (
                  <div>
                    {(a.longestPathActivities && a.longestPathActivities.length > 0) ? (
                      <>
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                          The longest path is the chain of activities that determines when the project finishes — the path with the greatest total duration from start to end. P6 flags these activities with the <span className="font-mono">driving_path_flag</span>. NobelPM shows them here in chronological order.
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
                            <div className="text-center text-[10px] text-slate-400 pt-3">
                              Showing first 50 of {a.longestPathActivities.length} activities on the longest path
                            </div>
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
                {/* 2 WEEK LOOKAHEAD sub-filter — activities starting/finishing within 14
                    calendar days of the schedule's data date. */}
                {scheduleFilter === 'lookahead' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      Activities scheduled to start or finish within 14 calendar days after the data date ({a.dataDate?.slice(0,10) || 'N/A'}). Use this for weekly coordination meetings with field super and trades.
                    </div>
                    {(!a.twoWeekLookahead || a.twoWeekLookahead.length === 0) ? (
                      <div className="text-center py-8 text-slate-400 text-xs">No activities scheduled in next 14 days. Upload a fresh XER if you expect lookahead data.</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 pb-2">
                          <div className="col-span-1">Code</div>
                          <div className="col-span-5">Activity</div>
                          <div className="col-span-2 text-right">Start</div>
                          <div className="col-span-2 text-right">Finish</div>
                          <div className="col-span-1 text-right">% Done</div>
                          <div className="col-span-1 text-right">Float</div>
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
                        {a.twoWeekLookahead.length > 30 && (
                          <div className="text-center text-[10px] text-slate-400 pt-3">
                            Showing first 30 of {a.twoWeekLookahead.length} activities
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* ACTIVITIES NOT STARTED — activities with no actual start
                    date and no physical progress. Sorted by planned start
                    ascending so the soonest-due-to-start are at the top.
                    Useful for "what should have started by now" review. */}
                {scheduleFilter === 'not-started' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      Activities with no actual start date and no physical progress recorded. Sorted by planned start (soonest first). Milestones are excluded — they appear on the dashboard. Use this for "what should already have started" review with the field super.
                    </div>
                    {(!a.notStartedActivities || a.notStartedActivities.length === 0) ? (
                      <div className="text-center py-8 text-slate-400 text-xs">No not-started activities detected. Upload a fresh XER if you expect this data.</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 pb-2">
                          <div className="col-span-1">Code</div>
                          <div className="col-span-5">Activity</div>
                          <div className="col-span-2 text-right">Planned Start</div>
                          <div className="col-span-2 text-right">Planned Finish</div>
                          <div className="col-span-1 text-right">Duration</div>
                          <div className="col-span-1 text-right">Float</div>
                        </div>
                        {a.notStartedActivities.slice(0, 100).map((t: any, i: number) => {
                          const float = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
                          const duration = Math.round(parseFloat(t.target_drtn_hr_cnt || t.remain_drtn_hr_cnt || '0') / 8)
                          return (
                            <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 last:border-0 text-xs items-center">
                              <div className="col-span-1 font-mono font-semibold text-slate-800 truncate" title={t.task_code}>{t.task_code}</div>
                              <div className="col-span-5 text-slate-700 truncate" title={t.task_name}>{t.task_name}</div>
                              <div className="col-span-2 text-right text-slate-600">{(t.early_start_date || t.target_start_date || '').slice(0,10) || '—'}</div>
                              <div className="col-span-2 text-right text-slate-600">{(t.early_end_date || t.target_end_date || '').slice(0,10) || '—'}</div>
                              <div className="col-span-1 text-right text-slate-600">{duration}d</div>
                              <div className={`col-span-1 text-right font-bold ${float < 0 ? 'text-red-600' : float <= 14 ? 'text-amber-600' : 'text-green-600'}`}>{float}d</div>
                            </div>
                          )
                        })}
                        {a.notStartedActivities.length > 100 && (
                          <div className="text-center text-[10px] text-slate-400 pt-3">
                            Showing first 100 of {a.notStartedActivities.length} activities · {a.notStartedActivities.length} total not started
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* ACTIVITIES FINISHED — activities with a populated actual
                    finish date. Sorted by actual finish DESCENDING so most
                    recently completed work appears at the top. Variance
                    column shows finish vs. baseline (positive = late). */}
                {scheduleFilter === 'finished' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      Activities with an actual finish date. Most recently completed appear first. The Variance column shows actual finish vs. planned finish — positive means the activity finished late, negative means it finished early. Milestones are excluded.
                    </div>
                    {(!a.finishedActivities || a.finishedActivities.length === 0) ? (
                      <div className="text-center py-8 text-slate-400 text-xs">No finished activities detected. Upload a fresh XER if you expect this data.</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 pb-2">
                          <div className="col-span-1">Code</div>
                          <div className="col-span-5">Activity</div>
                          <div className="col-span-2 text-right">Actual Start</div>
                          <div className="col-span-2 text-right">Actual Finish</div>
                          <div className="col-span-1 text-right">Duration</div>
                          <div className="col-span-1 text-right">Variance</div>
                        </div>
                        {a.finishedActivities.slice(0, 100).map((t: any, i: number) => {
                          // Calculate variance: actual finish vs planned (target) finish
                          // Positive variance = finished late; negative = early; 0 = on time
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
                          // Actual duration: actual start → actual finish
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
                              <div className="col-span-1 font-mono font-semibold text-slate-800 truncate" title={t.task_code}>{t.task_code}</div>
                              <div className="col-span-5 text-slate-700 truncate" title={t.task_name}>{t.task_name}</div>
                              <div className="col-span-2 text-right text-slate-600">{(t.act_start_date || '').slice(0,10) || '—'}</div>
                              <div className="col-span-2 text-right text-slate-600 font-semibold">{(t.act_end_date || '').slice(0,10) || '—'}</div>
                              <div className="col-span-1 text-right text-slate-600">{actualDuration}d</div>
                              <div className={`col-span-1 text-right font-bold ${variance === null ? 'text-slate-400' : variance > 0 ? 'text-red-600' : variance < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                                {variance === null ? '—' : variance > 0 ? `+${variance}d` : `${variance}d`}
                              </div>
                            </div>
                          )
                        })}
                        {a.finishedActivities.length > 100 && (
                          <div className="text-center text-[10px] text-slate-400 pt-3">
                            Showing first 100 of {a.finishedActivities.length} activities · {a.finishedActivities.length} total finished
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* CONSTRUCTION SEQUENCE PROBLEMS — formerly "Logic Check"
                Renamed and reworked to show full per-violation evidence so
                the PM can review each flagged activity with their scheduler.
                Each affected activity is listed with every violated
                relationship: which predecessor, what dates, how many days
                early, and a plain-language explanation. */}
            {activeTab === 'logic' && (
              <div>
                <h3 className="text-sm font-bold mb-3">
                  Construction Sequence Problems · {a.outOfSequence?.length || 0} affected {a.outOfSequence?.length === 1 ? 'activity' : 'activities'}
                </h3>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                  <div className="font-bold mb-1">What this shows</div>
                  Activities whose actual progress conflicts with the relationship logic
                  in the schedule. For each one, NobelPM lists every violated relationship
                  with full evidence — what the logic required, what actually happened,
                  and how many days earlier the work occurred than the logic allowed.
                  <div className="mt-2">
                    <strong>Review each with your scheduler.</strong> Legitimate fast-tracking
                    (intentional acceleration) and true logic gaps both show up here. The
                    PM and scheduler together decide which is which. Lead values (negative
                    lag) are already accounted for — what you see is genuinely early work.
                  </div>
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
                      const catColor = category === 'Procurement' ? 'text-amber-700'
                                     : category === 'Pre-Construction' ? 'text-blue-700'
                                     : 'text-slate-700'
                      return (
                        <div key={category} className="mb-5">
                          <div className={`text-xs font-bold mb-2 uppercase tracking-wider ${catColor}`}>
                            {category} · {items.length} {items.length === 1 ? 'activity' : 'activities'}
                          </div>
                          <div className="space-y-2">
                            {items.slice(0, 30).map((o: any, i: number) => {
                              // Each entry: activity header + a list of every
                              // violation (one row per violated relationship)
                              const violations = o.violations || []
                              return (
                                <div key={i} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                  {/* Activity header */}
                                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 flex items-center gap-3">
                                    <div className="font-mono font-bold text-xs text-slate-900">{o.task.task_code}</div>
                                    <div className="flex-1 text-xs text-slate-700 truncate">{o.task.task_name}</div>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                      {violations.length} violation{violations.length === 1 ? '' : 's'}
                                    </span>
                                  </div>
                                  {/* Per-violation evidence */}
                                  <div className="divide-y divide-slate-100">
                                    {violations.length === 0 ? (
                                      <div className="px-3 py-2 text-[11px] text-slate-500 italic">
                                        Predecessor {o.pred?.task_code} — relationship logic violated
                                      </div>
                                    ) : violations.map((v: any, vi: number) => (
                                      <div key={vi} className="px-3 py-2 text-[11px] leading-relaxed">
                                        <div className="flex items-start gap-2">
                                          <span className="font-mono font-bold text-slate-700 w-24 flex-shrink-0">{v.pred.task_code}</span>
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0">{v.relTypeLabel}</span>
                                          <span className="flex-1 text-slate-600">{v.pred.task_name}</span>
                                          <span className="text-[10px] font-bold text-red-700 flex-shrink-0">
                                            {v.varianceDays}d early
                                          </span>
                                        </div>
                                        <div className="mt-1 ml-26 text-[10px] text-slate-500 leading-snug">
                                          {v.description}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                            {items.length > 30 && (
                              <div className="text-center text-[10px] text-slate-400 pt-2">
                                Showing first 30 of {items.length} activities in this category
                              </div>
                            )}
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
                  Long lead items are materials or equipment requiring significant time to fabricate and deliver. These are the items that most commonly cause delays. NobelPM sorts by float — most critical first.
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
            {/* NARRATIVE */}
            {activeTab === 'ai' && (
              <div>
                <h3 className="text-sm font-bold mb-1">Operational analysis — how to fix this</h3>
                <p className="text-xs text-slate-500 mb-3">A direct read of what the schedule is telling you, what matters most, and what conversations to have this week.</p>
                {aiNarrative ? (
                  <div className="bg-slate-50 border-l-4 border-blue-500 rounded-r-lg p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {aiNarrative}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 text-center py-8">No narrative available for this version. Upload a new version to generate the narrative.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
