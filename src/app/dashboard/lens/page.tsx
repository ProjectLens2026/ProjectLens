'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion, updateVersionNarrative } from '@/lib/projectStore'

// =============================================================================
// Gantt Chart Component — P6-style time scale + zoom + pan
//
// PREVIOUS: percent-based widths. Bars compressed unreadably for long
// projects (a 3-year schedule with 100 activities became a wall of slivers).
//
// NOW: pixel-based widths driven by Time Scale (Year/Quarter/Month/Week)
// and Zoom (− Fit +). Bars stay readable at any project length. Chart
// auto-scrolls horizontally when its content exceeds the viewport.
// User can drag the chart area to pan, just like in P6.
// =============================================================================

type Scale = 'year' | 'quarter' | 'month' | 'week'

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

  // Chart date window — from the schedule's data date through projected end.
  // If either is missing we default to "now → now + 1 year" so the chart
  // still renders without throwing.
  const chartStart = new Date(dataDate?.replace(' ', 'T') || new Date())
  const chartEnd = new Date(projectedEnd?.replace(' ', 'T') ||
    new Date(Date.now() + 365 * 86400000).toISOString())
  const totalDays = Math.max(1, Math.round((chartEnd.getTime() - chartStart.getTime()) / 86400000))

  // Auto-select sensible scale based on project duration. PMs running a
  // 5-year megaproject see a Year view by default; a 2-week lookahead opens
  // in Week view. They can switch anytime.
  function pickDefaultScale(): Scale {
    if (totalDays > 365 * 5) return 'year'
    if (totalDays > 365 * 2) return 'quarter'
    if (totalDays < 60) return 'week'
    return 'month'
  }

  const [scale, setScale] = useState<Scale>(pickDefaultScale)
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const chartScrollRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<{ startX: number; startScroll: number } | null>(null)

  // Pixels per day at zoom=1 for each scale. Quarter/Year are intentionally
  // thin so big projects fit. Zoom multiplies these. Week is wide enough to
  // read activity codes inside bars.
  const BASE_PX_PER_DAY: Record<Scale, number> = {
    week: 14,
    month: 3.5,
    quarter: 1.3,
    year: 0.45,
  }
  const pxPerDay = BASE_PX_PER_DAY[scale] * zoom
  const chartWidth = Math.max(400, totalDays * pxPerDay)

  // Layout constants
  const ACTIVITY_COL_WIDTH = 320
  const ROW_HEIGHT = 40
  const HEADER_HEIGHT = 48

  function dayDiff(d: Date) {
    return Math.max(0, (d.getTime() - chartStart.getTime()) / 86400000)
  }

  // Fit-to-viewport — compute zoom so the whole chart visible without scroll.
  // Useful after zooming way in and wanting to reset.
  function fitToView() {
    if (!chartScrollRef.current) return
    const viewWidth = chartScrollRef.current.clientWidth - ACTIVITY_COL_WIDTH - 20
    if (viewWidth <= 0) return
    const neededPxPerDay = viewWidth / totalDays
    const newZoom = neededPxPerDay / BASE_PX_PER_DAY[scale]
    setZoom(Math.max(0.15, Math.min(8, newZoom)))
  }

  // Build major (labeled) + minor (unlabeled, lighter) tick marks for the
  // date header. Major ticks anchor the header text; minor ticks give the
  // PM eye-guides between them inside each row.
  function buildTicks() {
    const majors: { left: number; label: string }[] = []
    const minors: { left: number }[] = []
    const cur = new Date(chartStart)
    cur.setHours(0, 0, 0, 0)

    if (scale === 'year') {
      cur.setMonth(0, 1)
      while (cur <= chartEnd) {
        const left = dayDiff(cur) * pxPerDay
        if (left >= -50 && left <= chartWidth + 50) {
          majors.push({ left, label: cur.getFullYear().toString() })
        }
        // Quarters as minor ticks within each year
        for (let q = 1; q < 4; q++) {
          const minCur = new Date(cur); minCur.setMonth(q * 3)
          const minLeft = dayDiff(minCur) * pxPerDay
          if (minLeft >= 0 && minLeft <= chartWidth) minors.push({ left: minLeft })
        }
        cur.setFullYear(cur.getFullYear() + 1)
      }
    } else if (scale === 'quarter') {
      cur.setMonth(Math.floor(cur.getMonth() / 3) * 3, 1)
      while (cur <= chartEnd) {
        const left = dayDiff(cur) * pxPerDay
        const q = Math.floor(cur.getMonth() / 3) + 1
        if (left >= -50 && left <= chartWidth + 50) {
          majors.push({ left, label: `Q${q} '${cur.getFullYear().toString().slice(-2)}` })
        }
        for (let m = 1; m < 3; m++) {
          const minCur = new Date(cur); minCur.setMonth(minCur.getMonth() + m)
          const minLeft = dayDiff(minCur) * pxPerDay
          if (minLeft >= 0 && minLeft <= chartWidth) minors.push({ left: minLeft })
        }
        cur.setMonth(cur.getMonth() + 3)
      }
    } else if (scale === 'month') {
      cur.setDate(1)
      while (cur <= chartEnd) {
        const left = dayDiff(cur) * pxPerDay
        if (left >= -50 && left <= chartWidth + 50) {
          majors.push({ left, label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) })
        }
        // Mid-month minor tick
        const mid = new Date(cur); mid.setDate(15)
        const midLeft = dayDiff(mid) * pxPerDay
        if (midLeft >= 0 && midLeft <= chartWidth) minors.push({ left: midLeft })
        cur.setMonth(cur.getMonth() + 1)
      }
    } else if (scale === 'week') {
      // Snap to the nearest Monday on/before chartStart
      const day = cur.getDay()  // 0=Sun, 1=Mon
      const offsetToMonday = day === 0 ? -6 : 1 - day
      cur.setDate(cur.getDate() + offsetToMonday)
      while (cur <= chartEnd) {
        const left = dayDiff(cur) * pxPerDay
        if (left >= -50 && left <= chartWidth + 50) {
          majors.push({ left, label: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })
        }
        cur.setDate(cur.getDate() + 7)
      }
    }
    return { majors, minors }
  }
  const { majors, minors } = buildTicks()

  // Data date marker — vertical dashed red line at the schedule's data date
  // (which is x=0 by construction). We render it as a "Today/Data Date"
  // anchor so the PM can see at a glance what's behind/ahead.
  const dataDateLeft = 0  // chartStart === dataDate by definition

  // Drag-to-pan handlers. Clicking-and-dragging anywhere in the timeline
  // (not on a bar) pans the chart left/right, matching P6's behavior.
  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-gantt-bar]')) return
    if (!chartScrollRef.current) return
    dragStateRef.current = {
      startX: e.clientX,
      startScroll: chartScrollRef.current.scrollLeft,
    }
    setIsDragging(true)
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragStateRef.current || !chartScrollRef.current) return
    const dx = e.clientX - dragStateRef.current.startX
    chartScrollRef.current.scrollLeft = dragStateRef.current.startScroll - dx
  }
  function onMouseUp() {
    dragStateRef.current = null
    setIsDragging(false)
  }

  function renderGantt(acts: any[]) {
    const displayed = acts.slice(0, 100)

    return (
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">

        {/* P6-style toolbar: Time Scale + Zoom controls */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-200 bg-slate-50 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-600 uppercase mr-1">Time Scale</span>
            {(['year', 'quarter', 'month', 'week'] as Scale[]).map(s => (
              <button key={s} onClick={() => setScale(s)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded transition-colors ${
                  scale === s ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-200 bg-white border border-slate-200'
                }`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-slate-300"></div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-600 uppercase mr-1">Zoom</span>
            <button onClick={() => setZoom(z => Math.max(0.15, z * 0.7))}
              title="Zoom out (compress bars)"
              className="w-7 h-7 flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-base leading-none">
              −
            </button>
            <button onClick={fitToView}
              title="Fit entire chart to viewport width"
              className="px-2.5 h-7 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-[10px] font-semibold">
              Fit
            </button>
            <button onClick={() => setZoom(z => Math.min(8, z * 1.4))}
              title="Zoom in (enlarge bars)"
              className="w-7 h-7 flex items-center justify-center rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-base leading-none">
              +
            </button>
            <span className="text-[10px] text-slate-500 ml-1 font-mono">{Math.round(zoom * 100)}%</span>
          </div>
          <div className="w-px h-5 bg-slate-300"></div>
          <div className="text-[10px] text-slate-500 hidden md:block">
            {acts.length} activities · {totalDays}d span
          </div>
          <div className="text-[10px] text-slate-400 ml-auto hidden lg:block">
            Drag chart to pan · Shift+wheel to scroll horizontally
          </div>
        </div>

        {/* Scrollable chart body */}
        <div
          ref={chartScrollRef}
          className={`overflow-auto max-h-[600px] relative ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {/* Inner wide content — holds activity column + chart area as
              a single scrollable surface so the data-date marker scrolls
              correctly with the timeline. */}
          <div className="relative" style={{ width: (ACTIVITY_COL_WIDTH + chartWidth) + 'px' }}>

            {/* Header row — sticky to top of chart body */}
            <div className="flex sticky top-0 z-20 bg-slate-50 border-b-2 border-slate-300" style={{ height: HEADER_HEIGHT + 'px' }}>
              {/* Top-left corner — sticky both top & left */}
              <div className="sticky left-0 z-30 bg-slate-100 border-r-2 border-slate-300 flex-shrink-0 px-3 py-2 flex flex-col justify-center"
                style={{ width: ACTIVITY_COL_WIDTH + 'px' }}>
                <div className="text-[10px] font-bold text-slate-600 uppercase">Activity</div>
                <div className="text-[9px] text-slate-400">Code · Name · Float</div>
              </div>
              {/* Date scale header */}
              <div className="relative flex-shrink-0" style={{ width: chartWidth + 'px' }}>
                {majors.map((m, i) => (
                  <div key={'M' + i} className="absolute top-0 h-full" style={{ left: m.left + 'px' }}>
                    <div className="h-full border-l border-slate-400"></div>
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-bold text-slate-700 whitespace-nowrap">{m.label}</span>
                  </div>
                ))}
                {minors.map((m, i) => (
                  <div key={'m' + i} className="absolute top-6 h-6 border-l border-slate-200" style={{ left: m.left + 'px' }}></div>
                ))}
              </div>
            </div>

            {/* Activity rows */}
            {displayed.map((t: any, i: number) => {
              const taskStart = t.act_start_date || t.early_start_date || t.target_start_date || ''
              const taskEnd = t.early_end_date || t.act_end_date || t.target_end_date || ''
              const floatHr = parseFloat(t.total_float_hr_cnt || '0')
              const isComplete = t.status_code === 'TK_Complete'
              const barColor = isComplete ? 'bg-slate-400' : mode === 'driving' ? 'bg-blue-500' : floatHr < 0 ? 'bg-red-500' : 'bg-amber-500'
              const pct = parseFloat(t.phys_complete_pct || '0')
              const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'

              let barLeft = 0, barWidth = 0, hasBar = false
              if (taskStart && taskEnd) {
                const sDate = new Date(taskStart.replace(' ', 'T'))
                const eDate = new Date(taskEnd.replace(' ', 'T'))
                if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
                  barLeft = dayDiff(sDate) * pxPerDay
                  barWidth = Math.max(3, ((eDate.getTime() - sDate.getTime()) / 86400000) * pxPerDay)
                  hasBar = true
                }
              }

              return (
                <div key={i} className={`flex group border-b border-slate-100 ${rowBg}`} style={{ height: ROW_HEIGHT + 'px' }}>
                  {/* Sticky activity column */}
                  <div className={`sticky left-0 z-10 border-r border-slate-200 flex-shrink-0 px-3 py-2 flex items-center gap-2 ${rowBg} group-hover:bg-blue-50/40`}
                    style={{ width: ACTIVITY_COL_WIDTH + 'px' }}>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-mono font-bold text-slate-800 truncate" title={t.task_code}>{t.task_code}</div>
                      <div className="text-[10px] text-slate-500 truncate" title={t.task_name}>{t.task_name}</div>
                    </div>
                    <div className={`text-[10px] font-bold flex-shrink-0 ${floatHr < 0 ? 'text-red-600' : floatHr === 0 ? 'text-amber-600' : 'text-green-600'}`}>
                      {Math.round(floatHr / 8)}d
                    </div>
                  </div>

                  {/* Timeline area for this activity */}
                  <div className="relative flex-shrink-0 group-hover:bg-blue-50/30" style={{ width: chartWidth + 'px' }}>
                    {/* Vertical grid lines mirror the major ticks */}
                    {majors.map((m, mi) => (
                      <div key={'g' + mi} className="absolute top-0 h-full border-l border-slate-100 pointer-events-none" style={{ left: m.left + 'px' }}></div>
                    ))}
                    {/* The bar */}
                    {hasBar && (
                      <div
                        data-gantt-bar
                        className={`absolute rounded-sm overflow-hidden ${barColor} shadow-sm`}
                        style={{ left: barLeft + 'px', width: barWidth + 'px', top: '8px', height: '24px' }}
                        title={`${t.task_code}: ${t.task_name}\n${taskStart.slice(0,10)} → ${taskEnd.slice(0,10)}\nFloat: ${Math.round(floatHr / 8)}d · ${pct}% complete`}
                      >
                        {/* Progress overlay */}
                        <div className="absolute inset-y-0 left-0 bg-black/30 pointer-events-none" style={{ width: pct + '%' }}></div>
                        {/* Bar label if wide enough */}
                        {barWidth > 80 && (
                          <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
                            <span className="text-[9px] text-white font-bold truncate drop-shadow">
                              {t.task_code}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Data Date marker — full-height dashed line, scrolls with content.
                Positioned in the inner wide container so it stays aligned with
                bars as the user pans the chart. Sits OVER bars (z-15) but
                UNDER the sticky activity column (z-10... wait, marker has higher).
                The sticky activity column has z-10, marker has z-15, so marker
                would actually appear ABOVE the sticky column visually when they
                overlap. That's fine — the column is sticky on left and marker
                only appears at dataDateLeft (=0 in chart area), so they don't
                actually visually overlap. */}
            <div className="absolute top-0 bottom-0 pointer-events-none z-[8]"
              style={{ left: (ACTIVITY_COL_WIDTH + dataDateLeft) + 'px' }}>
              <div className="h-full border-l-2 border-dashed border-red-500 opacity-70"></div>
              <div className="absolute top-0 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-b whitespace-nowrap shadow">
                DATA DATE
              </div>
            </div>

            {acts.length > 100 && (
              <div className="sticky left-0 z-10 text-center py-3 text-xs text-slate-400 border-t border-slate-200 bg-white" style={{ width: '100%' }}>
                Showing first 100 of {acts.length} activities
              </div>
            )}
          </div>
        </div>
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
              ControlLens could not find any activities with driving path or float data in this schedule.
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
                ControlLens is showing the Longest Path (driving path flag = Y) as the best available substitute:
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

export default function ControlLensAnalysisPage() {
  const [analysis, setAnalysis] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('gantt')
  const [scheduleFilter, setScheduleFilter] = useState<
    'critical' | 'longest' | 'lookahead' | 'not-started' | 'finished'
  >('critical')

  // Operational Analysis (narrative) — on-demand state.
  // - narrativeText: editable copy of the narrative the PM is currently
  //   seeing / editing
  // - isGenerating: true while /api/generate-narrative is in flight
  // - isEditing: true when PM has clicked Edit and is in textarea mode
  // - narrativeError: error message from a failed generation attempt
  const [narrativeText, setNarrativeText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [narrativeError, setNarrativeError] = useState<string | null>(null)

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [])

  // Whenever the active version changes (user switches V1 vs V2 in the
  // sidebar), pull its saved narrative into local state. Drop any in-flight
  // editing state since it belongs to the previous version.
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

  // Generate / Regenerate — calls the on-demand narrative route. The
  // result is saved back to the version so it persists across reloads
  // and version switches.
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

  // PM clicked Edit — switch to textarea mode. They can either Save or
  // Cancel. Save persists to the version. Cancel restores the last saved
  // narrative from the version itself.
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

  // Clear wipes the saved narrative for this version. PM gets a confirm
  // because regenerating later will cost a fresh API call.
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
              { id: 'ai', label: 'Operational Analysis', icon: '📝' },
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
            {/* SCHEDULE FILTER */}
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
                  {/* Header action buttons */}
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

                {/* Error message — only shown after a failed generation attempt */}
                {narrativeError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-xs text-red-700">
                    <div className="font-bold mb-1">Couldn't generate the Operational Analysis</div>
                    <div>{narrativeError}</div>
                    <div className="mt-1 text-red-600">The schedule analysis above is unaffected — only the narrative requires the report service.</div>
                  </div>
                )}

                {/* Loading state */}
                {isGenerating && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                    <div className="text-3xl mb-3 animate-pulse">📝</div>
                    <div className="text-sm font-bold text-blue-900">Generating Operational Analysis...</div>
                    <div className="text-xs text-blue-700 mt-1">This usually takes 10-30 seconds. The rest of the page works while this runs.</div>
                  </div>
                )}

                {/* Empty state — never generated */}
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

                {/* Edit mode — textarea + Save/Cancel */}
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

                {/* Read mode — show the narrative */}
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
