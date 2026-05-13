'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface RiskItem {
  category: string
  title: string
  detail: string
  severity: 'critical' | 'high' | 'medium'
}

export default function ProjectLensPage() {
  const [analysis, setAnalysis] = useState<any>(null)
  const [rfis, setRfis] = useState<any[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('pl_last_analysis')
      if (stored) setAnalysis(JSON.parse(stored))
    } catch {}
    try {
      const storedRFIs = localStorage.getItem('pl_rfis')
      if (storedRFIs) setRfis(JSON.parse(storedRFIs))
    } catch {}
  }, [])

  function shortDate(d?: string) {
    if (!d) return '—'
    return d.slice(0, 10)
  }

  // Auto-detect risks from XER findings
  function detectRisks(a: any): RiskItem[] {
    if (!a) return []
    const risks: RiskItem[] = []

    if (a.delayDays > 30) {
      risks.push({
        category: 'TIA',
        title: `Project ${a.delayDays} days behind contract — TIA territory`,
        detail: 'Begin documenting delay events and supporting evidence immediately.',
        severity: 'critical',
      })
    }

    if (a.negativeFloat > 50) {
      risks.push({
        category: 'Critical Path',
        title: `${a.negativeFloat} activities on negative float`,
        detail: 'Critical path is compromised across multiple work fronts.',
        severity: 'critical',
      })
    } else if (a.negativeFloat > 0) {
      risks.push({
        category: 'Critical Path',
        title: `${a.negativeFloat} activities running behind`,
        detail: 'Schedule has activities with negative float requiring intervention.',
        severity: 'high',
      })
    }

    const longLeadAtRisk = (a.longLeadItems || []).filter((t: any) => t.floatDays < 0).length
    if (longLeadAtRisk > 0) {
      risks.push({
        category: 'Procurement',
        title: `${longLeadAtRisk} long lead items with negative float`,
        detail: 'Procurement delays threatening project completion.',
        severity: 'critical',
      })
    }

    if (a.outOfSequence?.length > 20) {
      risks.push({
        category: 'Logic Integrity',
        title: `${a.outOfSequence.length} out-of-sequence violations`,
        detail: 'Schedule logic integrity compromised — work being performed out of planned order.',
        severity: 'high',
      })
    } else if (a.outOfSequence?.length > 5) {
      risks.push({
        category: 'Logic Integrity',
        title: `${a.outOfSequence.length} out-of-sequence violations`,
        detail: 'Some activities running out of planned sequence.',
        severity: 'medium',
      })
    }

    if (a.noTies?.length > 10) {
      risks.push({
        category: 'Schedule Quality',
        title: `${a.noTies.length} activities with no logic ties`,
        detail: 'Schedule quality issues — activities missing predecessors or successors.',
        severity: 'high',
      })
    }

    // Major milestone risk — look for milestones in critical drivers
    const milestones = (a.criticalDrivers || []).filter((t: any) =>
      t.task_type === 'TT_FinMile' || t.task_type === 'TT_Mile' ||
      (t.task_name || '').toUpperCase().includes('MILESTONE') ||
      (t.task_name || '').toUpperCase().includes('SUBSTANTIAL') ||
      (t.task_name || '').toUpperCase().includes('COMPLETION')
    )
    if (milestones.length > 0) {
      risks.push({
        category: 'Milestones',
        title: `Major milestones at risk`,
        detail: `${milestones.length} contractual milestone(s) on critical path.`,
        severity: 'critical',
      })
    }

    if (a.healthScore < 40) {
      risks.push({
        category: 'Overall Health',
        title: 'Project in recovery condition',
        detail: 'Health score below 40 — comprehensive recovery plan required.',
        severity: 'critical',
      })
    }

    return risks
  }

  const risks = detectRisks(analysis)
  const criticalRisks = risks.filter(r => r.severity === 'critical')
  const topLongLead = (analysis?.longLeadItems || []).slice(0, 10)
  const topCritical = (analysis?.criticalDrivers || []).slice(0, 8)
  const submittalCount = (analysis?.longLeadItems?.length || 0) + (analysis?.shortLeadItems?.length || 0)
  
  // RFI summary
  const scheduleImpactingRfis = rfis.filter(r => r.evaluation?.classification === 'SCHEDULE_IMPACTING')
  const potentialRfis = rfis.filter(r => r.evaluation?.classification === 'POTENTIALLY_IMPACTING')
  const infoRfis = rfis.filter(r => r.evaluation?.classification === 'INFORMATIONAL')

  // Change orders — manual entry not yet built
  const changeOrders: any[] = []

  function conditionColor(c?: string) {
    if (c === 'Recovery Required') return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500' }
    if (c === 'Attention Needed') return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' }
    if (c === 'Monitor Closely') return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500' }
    return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' }
  }

  function severityColor(s: string) {
    if (s === 'critical') return 'bg-red-100 text-red-700 border-red-200'
    if (s === 'high') return 'bg-amber-100 text-amber-700 border-amber-200'
    return 'bg-yellow-100 text-yellow-700 border-yellow-200'
  }

  if (!analysis) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <div>
            <span className="font-bold text-slate-900 text-base">Project Lens</span>
            <span className="text-slate-400 text-sm ml-2">· Executive Summary</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                <circle cx="11" cy="11" r="4"/><circle cx="11" cy="11" r="8.5"/>
                <line x1="2.5" y1="11" x2="5" y2="11"/><line x1="17" y1="11" x2="19.5" y2="11"/>
              </svg>
            </div>
            <div className="text-lg font-bold text-slate-700 mb-2">No project analyzed yet</div>
            <div className="text-sm text-slate-500 mb-6">Upload a schedule to see your project executive summary here.</div>
            <Link href="/dashboard/upload"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
              Upload Schedule →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const col = conditionColor(analysis.condition)

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0 no-print">
        <div>
          <span className="font-bold text-slate-900 text-base">Project Lens</span>
          <span className="text-slate-400 text-sm ml-2">· Executive Summary</span>
        </div>
        <div className="ml-auto flex gap-2">
          <Link href="/dashboard/upload" className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400 hover:text-blue-600 font-semibold transition-colors">
            ⬆ Upload New Schedule
          </Link>
          <button onClick={() => window.print()} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            🖨 Print / Save PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="max-w-6xl mx-auto space-y-4">

          {/* HEADER BANNER */}
          <div className={`${col.bg} ${col.border} border rounded-2xl p-5 flex items-start gap-4`}>
            <div className={`w-3 h-3 rounded-full ${col.dot} animate-pulse mt-2 flex-shrink-0`} />
            <div className="flex-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Active Schedule</div>
              <div className="text-2xl font-extrabold text-slate-900 mb-1">{analysis.projectName || 'Untitled Schedule'}</div>
              <div className="text-xs text-slate-500">
                {analysis.fileType || 'Primavera P6'} · Data Date: {shortDate(analysis.dataDate)} ·
                {' '}Contract: {shortDate(analysis.contractEnd)} ·
                {' '}Projected: {shortDate(analysis.projectedEnd)}
              </div>
              <div className={`mt-3 inline-flex items-center gap-2 ${col.text} font-bold text-sm`}>
                <span>{analysis.condition || 'Stable'}</span>
                {analysis.delayDays > 0 && <span>· {analysis.delayDays} days behind contract</span>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-5xl font-extrabold text-slate-900">{analysis.healthScore || 0}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">Health Score / 100</div>
            </div>
          </div>

          {/* KPI STRIP */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Total Activities</div>
              <div className="text-2xl font-extrabold text-slate-900">{analysis.totalActivities || 0}</div>
              <div className="text-[10px] text-slate-400 mt-1">{analysis.complete || 0} complete · {analysis.inProgress || 0} active</div>
            </div>
            <div className="bg-white border border-red-200 rounded-xl p-4">
              <div className="text-[10px] text-red-600 uppercase font-bold tracking-wider mb-1">Negative Float</div>
              <div className="text-2xl font-extrabold text-red-600">{analysis.negativeFloat || 0}</div>
              <div className="text-[10px] text-slate-400 mt-1">Activities behind schedule</div>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl p-4">
              <div className="text-[10px] text-amber-600 uppercase font-bold tracking-wider mb-1">Out-of-Sequence</div>
              <div className="text-2xl font-extrabold text-amber-600">{analysis.outOfSequence?.length || 0}</div>
              <div className="text-[10px] text-slate-400 mt-1">Logic violations</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Days Behind</div>
              <div className={`text-2xl font-extrabold ${analysis.delayDays > 30 ? 'text-red-600' : analysis.delayDays > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {analysis.delayDays > 0 ? '+' : ''}{analysis.delayDays || 0}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">vs contract completion</div>
            </div>
          </div>

          {/* TWO COLUMN GRID */}
          <div className="grid grid-cols-2 gap-4">

            {/* RISKS CARD */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Risks</div>
                  <div className="font-bold text-slate-900 text-base">
                    {risks.length > 0
                      ? `${risks.length} risk${risks.length > 1 ? 's' : ''} detected by ProjectLens`
                      : 'No active risks detected'}
                  </div>
                </div>
                <span className="text-2xl">⚠️</span>
              </div>
              {risks.length > 0 ? (
                <>
                  <div className="text-xs text-slate-600 mb-3 leading-relaxed">
                    Check the full detail in <Link href="/dashboard/risks" className="text-blue-600 font-semibold hover:underline">Risks Assessment →</Link>
                  </div>
                  <div className="space-y-2">
                    {criticalRisks.slice(0, 2).map((r, i) => (
                      <div key={i} className={`text-xs px-3 py-2 rounded-lg border ${severityColor(r.severity)}`}>
                        <div className="font-bold">{r.title}</div>
                      </div>
                    ))}
                    {risks.length > criticalRisks.slice(0, 2).length && (
                      <div className="text-[10px] text-slate-400 text-center pt-1">
                        + {risks.length - Math.min(2, criticalRisks.length)} more in Risks Assessment
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500">Schedule is performing within tolerance.</div>
              )}
            </div>

            {/* RFI CARD */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">RFIs</div>
                  <div className="font-bold text-slate-900 text-base">
                    {rfis.length === 0 ? 'No RFIs evaluated yet' : `${rfis.length} RFI${rfis.length > 1 ? 's' : ''} evaluated`}
                  </div>
                </div>
                <span className="text-2xl">❓</span>
              </div>
              {rfis.length > 0 ? (
                <>
                  <div className="flex gap-2 text-[10px] font-bold mb-3">
                    {scheduleImpactingRfis.length > 0 && (
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{scheduleImpactingRfis.length} Schedule Impact</span>
                    )}
                    {potentialRfis.length > 0 && (
                      <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{potentialRfis.length} Potential</span>
                    )}
                    {infoRfis.length > 0 && (
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{infoRfis.length} Info Only</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {rfis.slice(0, 3).map((r, i) => (
                      <div key={i} className="text-xs text-slate-700 flex gap-2">
                        <span className="font-mono font-bold text-slate-500 flex-shrink-0">
                          {r.evaluation?.rfi_number ? `#${r.evaluation.rfi_number}` : '—'}
                        </span>
                        <span className="truncate">{r.evaluation?.subject || 'Untitled RFI'}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/dashboard/rfis" className="text-xs text-blue-600 font-semibold hover:underline mt-3 inline-block">
                    View all RFI evaluations →
                  </Link>
                </>
              ) : (
                <Link href="/dashboard/rfis" className="text-xs text-blue-600 font-semibold hover:underline">
                  Upload an RFI PDF to evaluate schedule impact →
                </Link>
              )}
            </div>

            {/* SUBMITTALS CARD */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Submittals</div>
                  <div className="font-bold text-slate-900 text-base">
                    {submittalCount > 0
                      ? `${submittalCount} submittal${submittalCount > 1 ? 's' : ''} on schedule`
                      : 'No submittals detected'}
                  </div>
                </div>
                <span className="text-2xl">📋</span>
              </div>
              {submittalCount > 0 ? (
                <>
                  <div className="flex gap-2 text-[10px] font-bold mb-3">
                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{analysis.longLeadItems?.length || 0} Long Lead</span>
                    <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{analysis.shortLeadItems?.length || 0} Short Lead</span>
                  </div>
                  <div className="text-xs text-slate-600 leading-relaxed">
                    {((analysis.longLeadItems || []).filter((t: any) => t.floatDays < 0).length)} on negative float — these need attention this week.
                  </div>
                  <Link href="/dashboard/submittals" className="text-xs text-blue-600 font-semibold hover:underline mt-3 inline-block">
                    View submittal log →
                  </Link>
                </>
              ) : (
                <div className="text-xs text-slate-500">No procurement activities meeting the 20-day threshold in this schedule.</div>
              )}
            </div>

            {/* CHANGE ORDERS CARD */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Change Orders</div>
                  <div className="font-bold text-slate-900 text-base">
                    {changeOrders.length === 0 ? '0 change orders logged' : `${changeOrders.length} change orders`}
                  </div>
                </div>
                <span className="text-2xl">🔄</span>
              </div>
              {changeOrders.length > 0 ? (
                <div className="space-y-1.5">
                  {changeOrders.slice(0, 3).map((co, i) => (
                    <div key={i} className="text-xs text-slate-700">{co.name}</div>
                  ))}
                </div>
              ) : (
                <Link href="/dashboard/changes" className="text-xs text-blue-600 font-semibold hover:underline">
                  Log change orders →
                </Link>
              )}
            </div>
          </div>

          {/* TOP 10 LONG LEAD ITEMS */}
          {topLongLead.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Top 10 Long Lead Items</div>
                  <div className="font-bold text-slate-900 text-base">By float — most critical first</div>
                </div>
                <Link href="/dashboard/submittals" className="text-xs text-blue-600 font-semibold hover:underline">
                  View all →
                </Link>
              </div>
              <div className="space-y-1">
                {topLongLead.map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-[10px] font-bold text-slate-300 w-5">{i + 1}</span>
                    <span className="font-mono font-bold text-slate-700 w-24 truncate">{t.task_code}</span>
                    <span className="flex-1 text-slate-700 truncate">{t.task_name}</span>
                    <span className="text-[10px] text-slate-400">{t.durationDays}d</span>
                    <span className={`font-bold w-12 text-right ${t.floatDays < 0 ? 'text-red-600' : t.floatDays === 0 ? 'text-amber-600' : 'text-green-600'}`}>
                      {t.floatDays}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOP CRITICAL PATH */}
          {topCritical.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">Top Critical Path Activities</div>
                  <div className="font-bold text-slate-900 text-base">Driving completion — sorted by early finish</div>
                </div>
                <Link href="/dashboard/upload" className="text-xs text-blue-600 font-semibold hover:underline">
                  View full critical path →
                </Link>
              </div>
              <div className="space-y-1">
                {topCritical.map((t: any, i: number) => {
                  const float = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
                  const pct = parseFloat(t.phys_complete_pct || '0')
                  return (
                    <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-slate-50 last:border-0">
                      <span className="text-[10px] font-bold text-slate-300 w-5">{i + 1}</span>
                      <span className="font-mono font-bold text-slate-700 w-24 truncate">{t.task_code}</span>
                      <span className="flex-1 text-slate-700 truncate">{t.task_name}</span>
                      <span className="text-[10px] text-slate-400 w-12 text-right">{pct}%</span>
                      <span className={`font-bold w-12 text-right ${float < 0 ? 'text-red-600' : float === 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {float}d
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* FOOTER NOTE */}
          <div className="text-center text-xs text-slate-400 py-4">
            This summary supports your visibility — it does not replace your judgment.
            <br />
            All numbers are derived from the last uploaded XER file.
          </div>
        </div>
      </div>
    </div>
  )
}
