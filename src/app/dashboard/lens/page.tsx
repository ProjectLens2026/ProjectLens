'use client'
// =============================================================================
// Schedule Analysis page — focused selector + Control Lens path intelligence
//
// One analysis selector replaces the prior row of competing pills.
// Control Lens path review is summary-first: high-value reviewer concerns first,
// detailed activity evidence only when the reviewer intentionally selects it.
// =============================================================================
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion, updateVersionNarrative } from '@/lib/projectStore'
import { activityToGanttRange, type FloatPath } from '@/lib/multipleFloatPaths'
import type { Task } from '@/lib/xerParser'
import { evaluatePathCredibility, pathActivityStart, pathActivityFinish, sortPathActivitiesByFinish, type PathCredibilityResult } from '@/lib/construction/pathCredibility'
import { analyzeCLPathIntelligence } from '@/lib/construction/clPathIntelligence'

export default function ControlLensAnalysisPage() {
  const [analysis, setAnalysis] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('schedule-filter')
  const [scheduleFilter, setScheduleFilter] = useState<
    'cl-summary' | 'cl-critical' | 'cl-longest' | 'critical' | 'lookahead' | 'not-started' | 'finished'
  >('cl-summary')
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
    const requestedTab = new URLSearchParams(window.location.search).get('tab')
    if (requestedTab && ['schedule-filter', 'logic', 'noties', 'longlead', 'field', 'plain', 'ai'].includes(requestedTab)) {
      setActiveTab(requestedTab)
    }
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

  // P6 truth is displayed first and sorted chronologically by current finish.
  // Control Lens then reviews that P6-reported path for construction credibility.
  const criticalPathActivities = useMemo(
    () => sortPathActivitiesByFinish(analysis?.criticalDrivers || []),
    [analysis?.criticalDrivers],
  )
  const longestPathActivities = useMemo(
    () => sortPathActivitiesByFinish(analysis?.longestPathActivities || []),
    [analysis?.longestPathActivities],
  )

  const clPathIntelligence = useMemo(() => {
    try { return analyzeCLPathIntelligence(analysis) }
    catch (e) { console.error('[Lens] CL Path Intelligence failed:', e); return null }
  }, [analysis])

  const clFindingGroups = useMemo(() => {
    if (!clPathIntelligence?.findings) return [] as any[]
    const severityRank: Record<string, number> = { HIGH: 3, MEDIUM: 2, REVIEW: 1 }
    const grouped = new Map<string, any>()
    for (const f of clPathIntelligence.findings) {
      const key = String(f.title || 'Reviewer check').trim().toLowerCase()
      const existing = grouped.get(key)
      if (!existing) {
        grouped.set(key, { ...f, count: 1, evidence: Array.from(new Set(f.evidence || [])) })
      } else {
        existing.count += 1
        existing.evidence = Array.from(new Set([...(existing.evidence || []), ...(f.evidence || [])]))
        if ((severityRank[f.severity] || 0) > (severityRank[existing.severity] || 0)) existing.severity = f.severity
      }
    }
    return Array.from(grouped.values()).sort((a: any, b: any) =>
      (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0) || b.count - a.count
    )
  }, [clPathIntelligence])

  const highPriorityGroups = clFindingGroups.filter((g: any) => g.severity === 'HIGH')
  const reviewGroups = clFindingGroups.filter((g: any) => g.severity !== 'HIGH')

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
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
          <Link href="/dashboard/approval" className="text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap">
            ← Back to Review Schedule
          </Link>
          <div className="h-6 border-l border-slate-200" />
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
        <Link href="/dashboard/approval" className="text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap">
          ← Back to Review Schedule
        </Link>
        <div className="h-6 border-l border-slate-200" />
        <div>
          <span className="font-bold text-slate-900 text-base">Full Analysis</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name}</span>
        </div>
        <div className="ml-auto flex gap-2">
          <Link href="/dashboard" className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400 hover:text-blue-600 font-semibold">
            Overview
          </Link>
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
              <div className="text-xs text-slate-500 mt-0.5">{a.fileType || 'Primavera P6 XER'} · Data date: {fmtDate(a.dataDate) || 'N/A'}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Contract completion</div>
              <div className="text-sm font-bold text-red-600">{fmtDate(a.contractEnd) || 'N/A'} <span className="text-xs font-normal text-slate-500">· Projected {fmtDate(a.projectedEnd) || 'N/A'}</span></div>
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
                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-6">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900">Schedule Analysis</h3>
                    <p className="text-xs text-slate-500 mt-1">Choose exactly what you want to review. Control Lens keeps the decision summary separate from detailed schedule evidence.</p>
                  </div>
                  <div className="w-full lg:w-[360px]">
                    <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Select analysis</label>
                    <select value={scheduleFilter} onChange={e => setScheduleFilter(e.target.value as any)}
                      className="w-full border-2 border-slate-300 rounded-lg bg-white px-3 py-2.5 text-sm font-bold text-slate-900 shadow-sm focus:outline-none focus:border-blue-500">
                      <option value="cl-summary">Approval Summary — Control Lens</option>
                      <option value="cl-critical">CL Critical Path</option>
                      <option value="cl-longest">CL Longest Path</option>
                      <option value="critical">P6 Critical Activities</option>
                      <option value="lookahead">2 Week Lookahead</option>
                      <option value="not-started">Activities Not Started</option>
                      <option value="finished">Activities Finished</option>
                    </select>
                  </div>
                </div>

                {/* P6 CRITICAL ACTIVITIES — submitted schedule truth only */}
                {scheduleFilter === 'critical' && (
                  <div>
                    <div className="mb-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">P6 Critical Activities</div>
                          <p className="text-xs text-slate-500 mt-1">Activities identified as critical by the uploaded P6/XER schedule. This is the submitted critical-activity set — not a Control Lens reconstructed path. Activities are ordered by current Finish date, earliest first.</p>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
                          {criticalPathActivities.length} activities
                        </div>
                      </div>
                    </div>
                    <PathActivityTable activities={criticalPathActivities} showRemaining />
                    {criticalPathActivities.length === 0 && (
                      <div className="text-center py-8 text-slate-400 text-xs">No P6 critical activities detected.</div>
                    )}

                    <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 leading-relaxed">
                      <div className="font-bold text-slate-800 mb-1">Control Lens interpretation</div>
                      Critical activities can belong to different branches of the network and do not, by themselves, prove one continuous critical path. Control Lens therefore does not run construction-path credibility against this list as if it were one chain. Control Lens evaluates path credibility separately through its nature-of-work and readiness analysis so this P6 activity set remains submitted schedule evidence only.
                    </div>
                  </div>
                )}

                {/* CONTROL LENS APPROVAL SUMMARY — summary first, evidence on demand */}
                {scheduleFilter === 'cl-summary' && (
                  <div>
                    {!clPathIntelligence ? (
                      <div className="text-center py-8 text-slate-400 text-sm">Project understanding is not available for this version. Re-upload the XER if relationship/task evidence is missing.</div>
                    ) : (
                      <>
                        <div className="rounded-xl border-2 border-slate-300 bg-white p-5 mb-4">
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                            <div>
                              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-700">Control Lens Approval Summary</div>
                              <div className="text-xl font-extrabold text-slate-950 mt-1">{clPathIntelligence.understanding.projectNature}</div>
                              <div className="text-sm font-semibold text-slate-600 mt-2">{clPathIntelligence.understanding.deliveryNature.join(' → ')}</div>
                            </div>
                            {clPathIntelligence.understanding.completionTarget && (
                              <div className="rounded-lg bg-slate-950 text-white px-4 py-3 min-w-[190px]">
                                <div className="text-[9px] font-extrabold uppercase tracking-wider text-slate-300">Completion target</div>
                                <div className="font-mono text-sm font-bold mt-1">{clPathIntelligence.understanding.completionTarget.code}</div>
                                <div className="text-sm font-extrabold mt-0.5">{fmtDate(clPathIntelligence.understanding.completionTarget.finish)}</div>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Detected areas</div>
                              <div className="text-sm font-bold text-slate-800 mt-1 leading-relaxed">{clPathIntelligence.understanding.areas.join(' · ') || 'Review Required'}</div>
                            </div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Detected systems</div>
                              <div className="text-sm font-bold text-slate-800 mt-1 leading-relaxed">{clPathIntelligence.understanding.systems.join(' · ') || 'Review Required'}</div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-5">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div className="text-base font-extrabold text-red-950">High-Priority Concerns</div>
                              <span className="rounded-full bg-red-700 text-white text-xs font-extrabold px-2.5 py-1">{highPriorityGroups.length}</span>
                            </div>
                            {highPriorityGroups.length === 0 ? (
                              <div className="text-sm text-red-800">No high-priority path concern identified by the current scaffold.</div>
                            ) : (
                              <div className="space-y-3">
                                {highPriorityGroups.slice(0, 5).map((g: any) => (
                                  <div key={g.id} className="border-t border-red-200 pt-3 first:border-t-0 first:pt-0">
                                    <div className="text-sm font-extrabold text-red-950">{g.title}{g.count > 1 ? ` (${g.count})` : ''}</div>
                                    <div className="text-xs font-medium text-red-900 mt-1 leading-relaxed">{g.detail}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div className="text-base font-extrabold text-amber-950">Review Items</div>
                              <span className="rounded-full bg-amber-700 text-white text-xs font-extrabold px-2.5 py-1">{reviewGroups.length}</span>
                            </div>
                            {reviewGroups.length === 0 ? (
                              <div className="text-sm text-amber-800">No additional review item identified.</div>
                            ) : (
                              <div className="space-y-3">
                                {reviewGroups.slice(0, 5).map((g: any) => (
                                  <div key={g.id} className="border-t border-amber-200 pt-3 first:border-t-0 first:pt-0">
                                    <div className="text-sm font-extrabold text-amber-950">{g.title}{g.count > 1 ? ` (${g.count})` : ''}</div>
                                    <div className="text-xs font-medium text-amber-900 mt-1 leading-relaxed">{g.count > 1 && /area completion milestone/i.test(g.title)
                                      ? `${g.count} submitted area/building completion states occur before later readiness, startup, commissioning, training or turnover work. Review the affected completion logic rather than reading each activity as a separate issue.`
                                      : g.detail}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <button type="button" onClick={() => setScheduleFilter('cl-critical')} className="text-left rounded-xl border-2 border-blue-200 bg-blue-50 p-5 hover:border-blue-400 transition-colors">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-base font-extrabold text-slate-950">🎯 CL Critical Path</div>
                                <div className="text-xs font-semibold text-slate-600 mt-1">Nature-of-work / readiness path</div>
                              </div>
                              <span className="text-sm font-extrabold text-blue-700">View Path →</span>
                            </div>
                            {clPathIntelligence.criticalPath && <div className="text-xs font-medium text-slate-700 mt-3 leading-relaxed">{clPathIntelligence.criticalPath.connectionNote}</div>}
                          </button>
                          <button type="button" onClick={() => setScheduleFilter('cl-longest')} className="text-left rounded-xl border-2 border-violet-200 bg-violet-50 p-5 hover:border-violet-400 transition-colors">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-base font-extrabold text-slate-950">📏 CL Longest Path</div>
                                <div className="text-xs font-semibold text-slate-600 mt-1">Longest credible submitted work-state chain</div>
                              </div>
                              <span className="text-sm font-extrabold text-violet-700">View Path →</span>
                            </div>
                            {clPathIntelligence.longestPath && <div className="text-xs font-medium text-slate-700 mt-3 leading-relaxed">{clPathIntelligence.longestPath.connectionNote}</div>}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* CL CRITICAL PATH — detail only when selected */}
                {scheduleFilter === 'cl-critical' && (
                  <div>
                    <button onClick={() => setScheduleFilter('cl-summary')} className="text-xs font-bold text-blue-700 mb-4">← Back to Approval Summary</button>
                    <div className="border-2 border-blue-200 rounded-xl p-5 bg-white">
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-2xl">🎯</span>
                        <div className="flex-1">
                          <div className="text-xl font-extrabold text-slate-950">CL Critical Path</div>
                          <div className="text-xs uppercase tracking-wider font-extrabold text-slate-500 mt-1">Nature-of-work / readiness path</div>
                        </div>
                        {clPathIntelligence?.criticalPath && (
                          <span className={`text-xs font-extrabold px-3 py-1.5 rounded-full ${clPathIntelligence.criticalPath.connectionToTarget === 'SUBMITTED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {clPathIntelligence.criticalPath.connectionToTarget === 'SUBMITTED' ? 'CONNECTED' : 'LOGIC GAP'}
                          </span>
                        )}
                      </div>
                      {clPathIntelligence?.criticalPath ? (
                        <>
                          <p className="text-sm font-semibold text-slate-700 leading-relaxed mb-3">{clPathIntelligence.criticalPath.basis}</p>
                          <div className={`text-sm font-bold rounded-lg px-4 py-3 mb-4 ${clPathIntelligence.criticalPath.connectionToTarget === 'SUBMITTED' ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                            {clPathIntelligence.criticalPath.connectionNote}
                          </div>
                          <PathActivityTable activities={clPathIntelligence.criticalPath.activities} showRemaining />
                        </>
                      ) : <div className="text-sm text-slate-400 py-6">Control Lens could not establish a credible readiness endpoint for the selected completion target.</div>}
                    </div>
                  </div>
                )}

                {/* CL LONGEST PATH — detail only when selected */}
                {scheduleFilter === 'cl-longest' && (
                  <div>
                    <button onClick={() => setScheduleFilter('cl-summary')} className="text-xs font-bold text-blue-700 mb-4">← Back to Approval Summary</button>
                    <div className="border-2 border-violet-200 rounded-xl p-5 bg-white">
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-2xl">📏</span>
                        <div className="flex-1">
                          <div className="text-xl font-extrabold text-slate-950">CL Longest Path</div>
                          <div className="text-xs uppercase tracking-wider font-extrabold text-slate-500 mt-1">Longest credible submitted work-state chain</div>
                        </div>
                      </div>
                      {clPathIntelligence?.longestPath ? (
                        <>
                          <p className="text-sm font-semibold text-slate-700 leading-relaxed mb-3">{clPathIntelligence.longestPath.basis}</p>
                          <div className={`text-sm font-bold rounded-lg px-4 py-3 mb-4 ${clPathIntelligence.longestPath.connectionToTarget === 'SUBMITTED' ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
                            {clPathIntelligence.longestPath.connectionNote}
                          </div>
                          <PathActivityTable activities={clPathIntelligence.longestPath.activities} showRemaining />
                        </>
                      ) : <div className="text-sm text-slate-400 py-6">Control Lens could not establish a credible longest work-state chain from the available XER evidence.</div>}
                    </div>
                  </div>
                )}

                {/* 2 WEEK LOOKAHEAD (existing) */}
                {scheduleFilter === 'lookahead' && (
                  <div>
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                      Activities scheduled to start or finish within 14 calendar days after the data date ({fmtDate(a.dataDate) || 'N/A'}).
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
                              <div className="col-span-2 text-right text-slate-600">{fmtDate(pathActivityStart(t))}</div>
                              <div className="col-span-2 text-right text-slate-600 font-semibold">{fmtDate(pathActivityFinish(t))}</div>
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
                              <div className="col-span-2 text-right text-slate-600">{fmtDate(pathActivityStart(t)) || '—'}</div>
                              <div className="col-span-2 text-right text-slate-600">{fmtDate(pathActivityFinish(t)) || '—'}</div>
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
                              <div className="col-span-2 text-right text-slate-600">{fmtDate((t.act_start_date || '')) || '—'}</div>
                              <div className="col-span-2 text-right text-slate-600 font-semibold">{fmtDate((t.act_end_date || '')) || '—'}</div>
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
                        <div className="text-slate-600 mt-1 leading-relaxed">Contract completion was {fmtDate(a.contractEnd)}. Projected completion is now {fmtDate(a.projectedEnd)}.</div>
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
// PathActivityTable — P6/XER path truth. No Control Lens interpretation here.
// =============================================================================
function PathActivityTable({ activities, showRemaining = false }: { activities: any[]; showRemaining?: boolean }) {
  const ordered = sortPathActivitiesByFinish(activities || [])
  return (
    <div className="mb-5">
      <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 pb-2">
        <div className="col-span-1">Code</div>
        <div className="col-span-4">Activity</div>
        <div className="col-span-2 text-right">Start</div>
        <div className="col-span-2 text-right">Finish</div>
        <div className="col-span-1 text-right">Float</div>
        {showRemaining ? <div className="col-span-1 text-right">Remain</div> : <div className="col-span-1" />}
        <div className="col-span-1 text-right">Status</div>
      </div>
      {ordered.map((t: any, i: number) => {
        const fl = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
        const pct = parseFloat(t.phys_complete_pct || '0')
        return (
          <div key={`${t.task_id || t.task_code}-${i}`} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 last:border-0 text-xs items-center">
            <div className="col-span-1 font-mono font-semibold text-slate-800 truncate" title={t.task_code}>{t.task_code}</div>
            <div className="col-span-4 text-slate-700" title={t.task_name}>{t.task_name}</div>
            <div className="col-span-2 text-right text-slate-600">{fmtDate(pathActivityStart(t))}</div>
            <div className="col-span-2 text-right text-slate-700 font-semibold">{fmtDate(pathActivityFinish(t))}</div>
            <div className={`col-span-1 text-right font-bold ${fl < 0 ? 'text-red-600' : fl === 0 ? 'text-amber-700' : 'text-emerald-600'}`}>{fl}d</div>
            {showRemaining
              ? <div className="col-span-1 text-right text-slate-500">{Math.round(parseFloat(t.remain_drtn_hr_cnt || '0') / 8)}d</div>
              : <div className="col-span-1" />}
            <div className="col-span-1 text-right">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${t.status_code === 'TK_Complete' ? 'bg-green-100 text-green-700' : t.status_code === 'TK_Active' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                {t.status_code === 'TK_Complete' ? 'Done' : t.status_code === 'TK_Active' ? `${pct}%` : 'Not started'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PathCredibilityPanel({ result, title, compact = false }: { result: PathCredibilityResult; title: string; compact?: boolean }) {
  const status = result.status
  const tone = status === 'SEQUENCE_CONFLICT'
    ? { box: 'bg-red-50 border-red-200', text: 'text-red-900', badge: 'bg-red-700 text-white', label: 'SEQUENCE CONFLICT' }
    : status === 'REVIEW_REQUIRED'
      ? { box: 'bg-amber-50 border-amber-200', text: 'text-amber-900', badge: 'bg-amber-600 text-white', label: 'REVIEW REQUIRED' }
      : { box: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-900', badge: 'bg-emerald-700 text-white', label: 'NO PATH CONFLICT FOUND' }

  return (
    <div className={`border rounded-lg ${compact ? 'mt-3 p-3' : 'mt-5 p-4'} ${tone.box}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`text-[10px] font-bold px-2 py-1 rounded ${tone.badge}`}>{tone.label}</div>
        <div className={`text-xs font-extrabold ${tone.text}`}>{title}</div>
        <div className="ml-auto text-[10px] text-slate-500">{result.checkedActivities} path activities checked</div>
      </div>
      {result.findings.length === 0 ? (
        <div className="text-[11px] text-slate-600 leading-relaxed">
          Control Lens checked the reported path against the currently authored construction-sequence rules and did not identify a path-level conflict. This does not replace project-specific reviewer judgment.
        </div>
      ) : (
        <div className="space-y-2">
          {result.findings.map(f => (
            <div key={f.id} className="bg-white/80 border border-white rounded p-2.5">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${f.level === 'CONFLICT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{f.level}</span>
                <span className="text-[11px] font-bold text-slate-800">{f.title}</span>
                <span className="text-[9px] text-slate-400 uppercase">{f.confidence} confidence</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1 leading-relaxed">{f.detail}</div>
              {f.evidence.length > 0 && (
                <div className="text-[10px] text-slate-500 mt-1.5"><span className="font-semibold">Evidence:</span> {f.evidence.join(' · ')}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// fmtDate — format dates as "Jan 06, 2026" everywhere on this page.
// Module-scope so both the main component and the PathCard sub-component use it.
// Accepts the various forms P6 XER hands us ('2026-01-06 00:00', '2026-01-06', etc.)
// =============================================================================
function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const iso = d.slice(0, 10)  // "2026-01-06"
  const parts = iso.split('-')
  if (parts.length !== 3) return d
  const [y, m, day] = parts
  const mIdx = parseInt(m, 10) - 1
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (mIdx < 0 || mIdx > 11) return d
  return `${monthNames[mIdx]} ${day}, ${y}`
}

// =============================================================================
// PathCard — renders a single Float Path with Gantt chart, name, explanation,
// and expandable activity list.
// =============================================================================
function PathCard({ path, expanded, onToggle, projectStart, projectEnd, allProjectTasks }: {
  path: FloatPath
  expanded: boolean
  onToggle: () => void
  projectStart: string
  projectEnd: string
  allProjectTasks?: Record<string, any>
}) {
  const orderedActivities = sortPathActivitiesByFinish(path.activities || [])
  const credibility = evaluatePathCredibility(orderedActivities, allProjectTasks)

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
          {orderedActivities.length} activities · {floatLabel} · drives to <span className="font-semibold">FINAL COMPLETION</span>
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
              {orderedActivities.slice(0, 12).map((t, i) => {
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
                          title={`${fmtDate(t.early_start_date) || ''} → ${fmtDate(t.early_end_date) || ''}`}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
              {orderedActivities.length > 12 && (
                <div className="text-center text-[11px] text-slate-500 pt-2">Showing first 12 of {orderedActivities.length} activities · scroll the table below for full list</div>
              )}
            </div>

            {/* Project start / end date labels */}
            <div className="flex items-center mt-2 pt-2 border-t border-slate-200">
              <div className="w-48 text-[10px] text-slate-400 italic">Timeline →</div>
              <div className="flex-1 flex justify-between text-[10px] text-slate-500">
                <span>{fmtDate(projectStart) || ''}</span>
                <span>{fmtDate(projectEnd) || ''}</span>
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
            {orderedActivities.map((t, i) => {
              const fl = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
              return (
                <div key={i} className="grid grid-cols-12 gap-2 py-1.5 border-b border-slate-100 text-xs items-center last:border-0">
                  <div className="col-span-2 font-mono font-semibold text-slate-800 truncate">{t.task_code}</div>
                  <div className="col-span-5 text-slate-700 truncate">{t.task_name}</div>
                  <div className="col-span-2 text-right text-slate-600">{fmtDate(pathActivityStart(t))}</div>
                  <div className="col-span-2 text-right text-slate-600">{fmtDate(pathActivityFinish(t))}</div>
                  <div className={`col-span-1 text-right font-bold ${fl < 0 ? 'text-red-600' : fl === 0 ? 'text-amber-700' : 'text-emerald-600'}`}>{fl}d</div>
                </div>
              )
            })}
          </div>

          <PathCredibilityPanel result={credibility} title="Control Lens Construction Path Review" compact />
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
    // Pick interval based on total months. "Jan 06, 2026" labels are ~12 chars
    // so we space them out more aggressively than for shorter labels.
    const intervalMonths = months <= 4 ? 1 : months <= 8 ? 2 : months <= 18 ? 3 : months <= 36 ? 6 : 12

    const ticks: { leftPct: number; label: string }[] = []
    const startDate = new Date(start)
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    // Bump to first interval-aligned month at or after the start
    while (cursor.getTime() < start) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    let safety = 0
    while (cursor.getTime() <= end && safety < 60) {
      safety++
      const leftPct = ((cursor.getTime() - start) / total) * 100
      const y = cursor.getFullYear()
      const m = monthNames[cursor.getMonth()]
      const d = String(cursor.getDate()).padStart(2, '0')
      const label = `${m} ${d}, ${y}`
      ticks.push({ leftPct, label })
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + intervalMonths, 1)
    }
    return ticks
  } catch {
    return []
  }
}
