'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion } from '@/lib/projectStore'
interface Risk {
  id: string
  category: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium'
  detail: string
  recommendation: string
  affectedActivities?: any[]
  actionItems: string[]
  // For Construction Sequence Problems risks, this carries the FULL list of
  // affected activities (each entry has .task, .predecessors[], .violations[]).
  // Renders as a scrollable inline table inside the expanded risk so the PM
  // can review all 44 (or however many) activities without leaving the Risks
  // page. Each row shows the activity ID + name + primary violation reason
  // (predecessor task code + relationship type + variance in days).
  sequenceProblems?: any[]
}
export default function RisksPage() {
  const [project, setProject] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [filter, setFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all')
  const [expandedRisk, setExpandedRisk] = useState<string | null>(null)
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
    // and caused the "click V2 still sees V1" bug along with the apparent
    // doubling of risk counts.
    const v = getActiveVersion(p)
    setVersion(v)
    setAnalysis(v?.analysis || null)
  }
  function detectRisks(a: any): Risk[] {
    if (!a) return []
    const risks: Risk[] = []
    // TIA Territory
    if (a.delayDays > 30) {
      risks.push({
        id: 'tia',
        category: 'Time Impact',
        title: `Project ${a.delayDays} days behind contract — TIA territory`,
        description: `Project completion has slipped beyond 30 days of contract requirement. Recovery may not be possible within original contract terms.`,
        severity: 'critical',
        detail: `Contract completion date: ${a.contractEnd?.slice(0,10) || 'N/A'}\nProjected completion: ${a.projectedEnd?.slice(0,10) || 'N/A'}\nVariance: ${a.delayDays} days late`,
        recommendation: 'Begin formal Time Impact Analysis documentation immediately. Compile delay event records, RFIs, change orders, and owner-caused delays. Prepare for contract amendment discussion.',
        actionItems: [
          'Document all delay events with dates and supporting evidence',
          'Identify compensable vs non-compensable time',
          'Prepare TIA submission to owner per contract requirements',
          'Schedule meeting with owner to discuss time extension',
          'Update schedule with realistic completion approach',
        ],
      })
    }
    // Critical path compromised
    if (a.negativeFloat > 50) {
      risks.push({
        id: 'crit-path-severe',
        category: 'Critical Path',
        title: `${a.negativeFloat} activities running on negative float`,
        description: `The critical path is compromised across multiple work fronts. Recovery requires comprehensive plan, not isolated fixes.`,
        severity: 'critical',
        detail: `${a.negativeFloat} of ${a.totalActivities} total activities (${Math.round((a.negativeFloat / a.totalActivities) * 100)}%) are running behind schedule. This is far beyond normal critical path activity count and indicates systemic schedule issues.`,
        recommendation: 'Schedule a workshop with scheduler, superintendent, and key trades. Review whether activities can run concurrently, durations can be compressed with overtime, or whether rebaseline is needed.',
        affectedActivities: (a.criticalDrivers || []).slice(0, 10),
        actionItems: [
          'Workshop with scheduler and field super to identify recovery options',
          'Identify activities that can be fast-tracked or run in parallel',
          'Discuss overtime and additional crews with subcontractors',
          'If recovery not possible, prepare for rebaseline',
          'Communicate honest schedule status to owner',
        ],
      })
    } else if (a.negativeFloat > 0) {
      risks.push({
        id: 'crit-path',
        category: 'Critical Path',
        title: `${a.negativeFloat} activities running behind`,
        description: 'Schedule has activities with negative float requiring intervention. Smaller scale than full critical path compromise but still needs attention.',
        severity: 'high',
        detail: `${a.negativeFloat} activities are currently late. Review each to determine if recovery is possible.`,
        recommendation: 'Address negative float activities in this week\'s coordination meeting. Identify root cause for each (manpower, procurement, weather, owner decisions).',
        affectedActivities: (a.criticalDrivers || []).slice(0, 10),
        actionItems: [
          'Review each negative-float activity with field super',
          'Identify root cause (resources, predecessors, owner decisions)',
          'Develop recovery actions for each',
          'Set check-in dates for each recovery action',
        ],
      })
    }
    // Long lead at risk
    const longLeadAtRisk = (a.longLeadItems || []).filter((t: any) => t.floatDays < 0)
    if (longLeadAtRisk.length > 0) {
      risks.push({
        id: 'longlead',
        category: 'Procurement',
        title: `${longLeadAtRisk.length} long lead items at risk`,
        description: 'Critical procurement items with negative float — delivery delays will directly impact project completion.',
        severity: 'critical',
        detail: `These items have lead times of 35+ days and are already running behind. Each day of further delay translates directly into project completion delay.`,
        recommendation: 'Call vendors today for status updates. Escalate to executive level if delivery not confirmed. Identify alternate suppliers if needed.',
        affectedActivities: longLeadAtRisk,
        actionItems: [
          'Call vendor for each item to confirm delivery date',
          'Get written commitment from vendor on dates',
          'Identify alternate suppliers as backup',
          'Notify owner of procurement delay risk',
          'Update schedule with realistic delivery dates',
        ],
      })
    }
    // Construction Sequence Problems — count is unique affected activities
    // (matches P6's Schedule Log convention). A single activity with multiple
    // violating predecessors counts once. Full per-violation evidence is
    // available in the Lens > Sequence Problems tab for review.
    if (a.outOfSequence?.length > 20) {
      risks.push({
        id: 'oos-severe',
        category: 'Construction Sequence',
        title: `${a.outOfSequence.length} activities with construction sequence problems`,
        description: 'Schedule logic integrity compromised — actual work order conflicts with the planned relationship logic across many activities.',
        severity: 'high',
        detail: 'Construction sequence problems occur when an activity started or finished in a way that violates its relationship logic — for example, an FS successor that started before its predecessor finished, after accounting for any lead/lag. NobelPM reports every activity with at least one violated relationship, with full per-violation evidence available on the Full Analysis > Sequence Problems tab. Some violations are legitimate fast-tracking (TIA evidence); others are true logic gaps. Review each with your scheduler.',
        recommendation: 'Open Full Analysis > Sequence Problems and walk the list with your scheduler. Tag each activity as either intentional acceleration (document for TIA) or logic gap (fix in P6). Coordinate with field super to enforce sequence going forward where needed.',
        actionItems: [
          'Review the per-activity evidence in Full Analysis > Sequence Problems',
          'For each: classify as fast-tracking (legitimate) or logic gap (fix)',
          'Document acceleration efforts — these are TIA evidence',
          'Correct schedule logic in P6 where gaps are real',
          'Coordinate with field super to enforce sequence going forward',
        ],
        // Full list of affected activities for inline display below the
        // recommendation. Each entry includes .task, .predecessors[],
        // .violations[] so the UI can show ID + name + violation reason.
        sequenceProblems: a.outOfSequence,
      })
    } else if (a.outOfSequence?.length > 5) {
      risks.push({
        id: 'oos',
        category: 'Construction Sequence',
        title: `${a.outOfSequence.length} activities with construction sequence problems`,
        description: 'Some activities have actual progress conflicting with relationship logic. May indicate field acceleration or schedule logic issues.',
        severity: 'medium',
        detail: 'Construction sequence problems in moderate numbers often signal intentional acceleration — but each one makes float calculations less reliable. Review the full per-violation evidence on the Full Analysis > Sequence Problems tab.',
        recommendation: 'Open Full Analysis > Sequence Problems and review with your scheduler. Document acceleration where intentional; fix logic gaps where the schedule was wrong.',
        actionItems: [
          'Open Full Analysis > Sequence Problems for the full list',
          'Walk each with your scheduler to classify',
          'Document acceleration efforts as TIA evidence',
          'Fix true logic errors in the schedule',
        ],
        sequenceProblems: a.outOfSequence,
      })
    }
    // No logic ties
    if (a.noTies?.length > 10) {
      risks.push({
        id: 'noties',
        category: 'Schedule Quality',
        title: `${a.noTies.length} activities with no logic ties`,
        description: 'Schedule quality issue — activities are not properly connected to predecessors or successors.',
        severity: 'high',
        detail: 'Activities without logic ties "float" in the schedule. Their delays don\'t propagate through CPM analysis. The schedule cannot be trusted to predict completion accurately.',
        recommendation: 'Have scheduler review and add proper relationships. This is a fundamental schedule quality issue that should be resolved before relying on float analysis.',
        actionItems: [
          'Generate list of activities with no ties (already in NobelPM)',
          'Have scheduler add proper predecessors and successors',
          'Re-run schedule calculation',
          'Verify critical path makes sense after corrections',
        ],
      })
    }
    // Health score critical
    if (a.healthScore < 40) {
      risks.push({
        id: 'health',
        category: 'Overall Health',
        title: 'Project in recovery condition',
        description: `Health score at ${a.healthScore}/100 indicates the project requires comprehensive recovery action, not isolated fixes.`,
        severity: 'critical',
        detail: 'A health score below 40 means multiple schedule indicators are simultaneously in poor condition. Delay, critical path, logic integrity, and procurement are likely all impacted.',
        recommendation: 'Convene executive-level recovery meeting. Single-front interventions will not be sufficient. Consider rebaseline, additional resources, or contract amendment.',
        actionItems: [
          'Executive review meeting with PM, super, scheduler, and senior leadership',
          'Identify top 3 recovery priorities',
          'Allocate resources and budget for recovery',
          'Set weekly review cadence with executive team',
          'Communicate recovery plan to owner',
        ],
      })
    }
    // Milestones at risk
    const milestonesAtRisk = (a.milestones || []).filter((m: any) => {
      const float = parseFloat(m.total_float_hr_cnt || '0') / 8
      return float < 0
    })
    if (milestonesAtRisk.length > 0) {
      risks.push({
        id: 'milestones',
        category: 'Milestones',
        title: `${milestonesAtRisk.length} contractual milestone(s) at risk`,
        description: 'One or more contract milestones are projected to be missed based on current schedule.',
        severity: 'critical',
        detail: 'Milestone slippage often triggers contract penalties, liquidated damages, or breach of contract claims depending on contract terms.',
        recommendation: 'Identify each milestone slipping and root cause. Owner should be notified per contract notification requirements (usually within 7 days of awareness).',
        affectedActivities: milestonesAtRisk.slice(0, 10),
        actionItems: [
          'Document each milestone slip with date and cause',
          'Notify owner per contract notice requirements',
          'Prepare recovery plan for each milestone',
          'Discuss potential time extension if recovery not possible',
        ],
      })
    }
    return risks.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2 }
      return order[a.severity] - order[b.severity]
    })
  }
  if (!project) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <span className="font-bold text-slate-900 text-base">Risks & Issues</span>
          <span className="text-slate-400 text-sm ml-2">· No active project</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">⚠</span>
            </div>
            <div className="text-lg font-bold text-slate-700 mb-2">Select a project first</div>
            <div className="text-sm text-slate-500 mb-6">Risks & Issues are scoped to a specific project version.</div>
            <Link href="/dashboard/projects" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700">
              Go to Projects →
            </Link>
          </div>
        </div>
      </div>
    )
  }
  if (!analysis) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <span className="font-bold text-slate-900 text-base">Risks & Issues</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name}</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-sm text-slate-500">No analysis available yet. Upload a schedule first.</div>
        </div>
      </div>
    )
  }
  const allRisks = detectRisks(analysis)
  const filtered = filter === 'all' ? allRisks : allRisks.filter(r => r.severity === filter)
  const counts = {
    critical: allRisks.filter(r => r.severity === 'critical').length,
    high: allRisks.filter(r => r.severity === 'high').length,
    medium: allRisks.filter(r => r.severity === 'medium').length,
  }
  function sevStyle(sev: string) {
    if (sev === 'critical') return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-900', badge: 'bg-red-100 text-red-700', icon: '🚨' }
    if (sev === 'high') return { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900', badge: 'bg-amber-100 text-amber-700', icon: '⚠️' }
    return { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-900', badge: 'bg-yellow-100 text-yellow-700', icon: '⚡' }
  }
  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Risks & Issues</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name} · {allRisks.length} risk{allRisks.length !== 1 ? 's' : ''} detected</span>
        </div>
        <button onClick={() => window.print()} className="ml-auto text-xs border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-400 font-semibold">
          🖨 Print
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-3">
          {/* Filter buttons */}
          <div className="flex gap-2 no-print">
            <button onClick={() => setFilter('all')}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              All ({allRisks.length})
            </button>
            <button onClick={() => setFilter('critical')}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${filter === 'critical' ? 'bg-red-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              🚨 Critical ({counts.critical})
            </button>
            <button onClick={() => setFilter('high')}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${filter === 'high' ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              ⚠️ High ({counts.high})
            </button>
            <button onClick={() => setFilter('medium')}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${filter === 'medium' ? 'bg-yellow-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              ⚡ Medium ({counts.medium})
            </button>
          </div>
          {/* Risk cards */}
          {filtered.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-lg font-bold text-slate-700">No risks detected in this category</div>
              <div className="text-sm text-slate-500 mt-1">NobelPM did not identify any matching issues in the schedule.</div>
            </div>
          ) : (
            filtered.map(risk => {
              const style = sevStyle(risk.severity)
              const isExpanded = expandedRisk === risk.id
              return (
                <div key={risk.id} className={`bg-white border-2 ${style.border} rounded-2xl overflow-hidden`}>
                  <button onClick={() => setExpandedRisk(isExpanded ? null : risk.id)}
                    className={`w-full ${style.bg} px-5 py-4 flex items-start gap-3 hover:opacity-90 transition-opacity text-left`}>
                    <div className="text-2xl flex-shrink-0">{style.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge} uppercase tracking-wider`}>{risk.severity}</span>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">{risk.category}</span>
                      </div>
                      <div className={`text-base font-bold ${style.text}`}>{risk.title}</div>
                      <div className={`text-xs ${style.text} opacity-80 mt-1`}>{risk.description}</div>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0 mt-1">{isExpanded ? '▼' : '▶'}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-5 py-4 border-t border-slate-200 bg-white">
                      <div className="mb-4">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Detail</div>
                        <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{risk.detail}</div>
                      </div>
                      <div className="mb-4">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">NobelPM Recommendation</div>
                        <div className={`text-sm font-medium ${style.text} bg-slate-50 border-l-4 ${style.border} p-3 rounded-r-lg leading-relaxed`}>
                          {risk.recommendation}
                        </div>
                      </div>
                      <div className="mb-4">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Action Items</div>
                        <ul className="space-y-1.5">
                          {risk.actionItems.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                              <span className="text-blue-600 font-bold flex-shrink-0">{i + 1}.</span>
                              <span>{a}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {risk.affectedActivities && risk.affectedActivities.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Affected Activities ({risk.affectedActivities.length})
                          </div>
                          <div className="space-y-1 bg-slate-50 rounded-lg p-2">
                            {risk.affectedActivities.slice(0, 8).map((t: any, i: number) => {
                              const float = parseFloat(t.total_float_hr_cnt || '0') / 8
                              return (
                                <div key={i} className="flex items-center gap-3 text-xs py-1 border-b border-slate-100 last:border-0">
                                  <span className="font-mono font-bold text-slate-700 w-24 truncate">{t.task_code}</span>
                                  <span className="flex-1 text-slate-700 truncate">{t.task_name}</span>
                                  <span className={`font-bold ${float < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                                    {Math.round(float)}d
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {/* CONSTRUCTION SEQUENCE PROBLEMS — full activity list
                          Shown only on the Construction Sequence Problems risks
                          (oos-severe / oos). For each affected activity, shows
                          the activity ID, name, and a one-line summary of the
                          violation reason (predecessor task + relationship
                          type + how many days early). Scrollable so 40+ rows
                          don't blow up the page. Click "Open Full Analysis >
                          Sequence Problems" for the deeper per-violation
                          evidence with dates and explanations. */}
                      {risk.sequenceProblems && risk.sequenceProblems.length > 0 && (
                        <div className="mt-4">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            All Affected Activities ({risk.sequenceProblems.length})
                          </div>
                          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <div className="bg-slate-50 border-b-2 border-slate-200 px-3 py-2 grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                              <div className="col-span-2">Activity ID</div>
                              <div className="col-span-4">Activity Name</div>
                              <div className="col-span-2">Predecessor</div>
                              <div className="col-span-1 text-center">Rel</div>
                              <div className="col-span-2 text-right">Variance</div>
                              <div className="col-span-1 text-center">Violations</div>
                            </div>
                            <div className="max-h-[420px] overflow-y-auto">
                              {risk.sequenceProblems.map((o: any, i: number) => {
                                // Use the primary (first / worst) violation for the
                                // headline row. The full per-violation evidence with
                                // dates lives on Lens > Sequence Problems for the
                                // deeper drill-down. Here we just want each PM-readable
                                // row to identify the activity and the reason.
                                const primary = (o.violations && o.violations[0]) || null
                                const predCode = primary?.pred?.task_code || o.pred?.task_code || '—'
                                const predName = primary?.pred?.task_name || o.pred?.task_name || ''
                                const relLabel = primary?.relTypeLabel || (o.relType?.replace(/^PR_/, '')) || '—'
                                const variance = primary?.varianceDays
                                const violationCount = (o.violations?.length || o.predecessors?.length || 1)
                                return (
                                  <div key={i} className={`grid grid-cols-12 gap-2 px-3 py-2 text-xs border-b border-slate-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                                    <div className="col-span-2 font-mono font-bold text-slate-900 truncate">{o.task.task_code}</div>
                                    <div className="col-span-4 text-slate-700 truncate" title={o.task.task_name}>{o.task.task_name}</div>
                                    <div className="col-span-2 font-mono text-slate-600 truncate" title={predName}>{predCode}</div>
                                    <div className="col-span-1 text-center">
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{relLabel}</span>
                                    </div>
                                    <div className="col-span-2 text-right font-bold text-red-600">
                                      {variance !== undefined ? `${variance}d early` : '—'}
                                    </div>
                                    <div className="col-span-1 text-center text-slate-500">
                                      {violationCount}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <div className="mt-2 text-[10px] text-slate-500 italic">
                            One row per affected activity. The "Predecessor" column shows the first violating predecessor; activities with multiple violated relationships are noted in the "Violations" count. Full per-relationship evidence (dates, lag, plain-language explanation) is on Full Analysis &rarr; Sequence Problems.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
          {allRisks.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-lg font-bold text-green-900">No risks detected</div>
              <div className="text-sm text-green-700 mt-1">NobelPM analyzed this schedule and did not identify any critical patterns.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
