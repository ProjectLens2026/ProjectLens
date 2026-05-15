'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getActiveProject, getLatestVersion, getActiveProjectRFIs } from '@/lib/projectStore'

export default function DashboardPage() {
  const [analysis, setAnalysis] = useState<any>(null)
  const [rfis, setRfis] = useState<any[]>([])
  const [project, setProject] = useState<any>(null)

  useEffect(() => {
    refresh()
    // Poll for active project changes
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [])

  function refresh() {
    const p = getActiveProject()
    setProject(p)
    // Always show the latest version
    const latest = getLatestVersion(p)
    setAnalysis(latest?.analysis || null)
    setRfis(getActiveProjectRFIs())
  }

  function formatMonthDay(d?: string) {
    if (!d) return '—'
    try {
      const date = new Date(d.replace(' ', 'T'))
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch { return d.slice(0, 10) }
  }

  function lastUpdatedLabel() {
    return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  // EMPTY STATE
  if (!analysis) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <div>
            <span className="font-bold text-slate-900 text-base">Executive Dashboard</span>
            <span className="text-slate-400 text-sm ml-2">· No active project</span>
          </div>
          <Link href="/dashboard/upload" className="ml-auto text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-semibold">
            + Upload Schedule
          </Link>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">📊</span>
            </div>
            <div className="text-lg font-bold text-slate-700 mb-2">Welcome to NobelPM</div>
            <div className="text-sm text-slate-500 mb-6">Upload a schedule to see your executive dashboard come to life with real project intelligence.</div>
            <Link href="/dashboard/upload"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
              Upload First Schedule →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // CALCULATIONS FROM XER
  const totalActivities = analysis.totalActivities || 0
  const complete = analysis.complete || 0
  const inProgress = analysis.inProgress || 0
  const completePct = totalActivities ? Math.round((complete / totalActivities) * 100) : 0
  const delayDays = analysis.delayDays || 0
  const negativeFloat = analysis.negativeFloat || 0
  const outOfSequence = analysis.outOfSequence?.length || 0
  const noTies = analysis.noTies?.length || 0
  const longLead = analysis.longLeadItems || []
  const shortLead = analysis.shortLeadItems || []
  const longLeadAtRisk = longLead.filter((t: any) => t.floatDays < 0).length
  const condition = analysis.condition || 'Stable'
  const healthScore = analysis.healthScore || 0
  const projectName = project?.name || analysis.projectName || 'Untitled Schedule'

  // CONDITION STYLING
  const condStyle = (() => {
    if (condition === 'Recovery Required') return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900', subText: 'text-red-800/70', icon: '🔴', btnBorder: 'border-red-300', btnText: 'text-red-800', btnHover: 'hover:bg-red-100' }
    if (condition === 'Attention Needed') return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', subText: 'text-amber-800/70', icon: '⚠️', btnBorder: 'border-amber-300', btnText: 'text-amber-800', btnHover: 'hover:bg-amber-100' }
    if (condition === 'Monitor Closely') return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-900', subText: 'text-yellow-800/70', icon: '👁', btnBorder: 'border-yellow-300', btnText: 'text-yellow-800', btnHover: 'hover:bg-yellow-100' }
    return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900', subText: 'text-green-800/70', icon: '✅', btnBorder: 'border-green-300', btnText: 'text-green-800', btnHover: 'hover:bg-green-100' }
  })()

  const conditionMessage = (() => {
    if (condition === 'Recovery Required') return 'Project is in recovery condition. Significant intervention required to protect contract completion.'
    if (condition === 'Attention Needed') return 'Project is under pressure in key areas. Timely actions required to protect schedule and turnover readiness.'
    if (condition === 'Monitor Closely') return 'Project is performing acceptably but several indicators warrant close monitoring this week.'
    return 'Project is performing within tolerance. Continue current management approach.'
  })()

  // AUTO-DETECT RISKS (same logic as NobelPM page)
  const risks: Array<{category: string, title: string, severity: string}> = []
  if (delayDays > 30) risks.push({ category: 'TIA', title: `Project ${delayDays} days behind contract`, severity: 'critical' })
  if (negativeFloat > 50) risks.push({ category: 'Critical Path', title: `${negativeFloat} activities on negative float`, severity: 'critical' })
  else if (negativeFloat > 0) risks.push({ category: 'Critical Path', title: `${negativeFloat} activities running behind`, severity: 'high' })
  if (longLeadAtRisk > 0) risks.push({ category: 'Procurement', title: `${longLeadAtRisk} long lead items at risk`, severity: 'critical' })
  if (outOfSequence > 20) risks.push({ category: 'Logic', title: `${outOfSequence} out-of-sequence violations`, severity: 'high' })
  else if (outOfSequence > 5) risks.push({ category: 'Logic', title: `${outOfSequence} out-of-sequence violations`, severity: 'medium' })
  if (noTies > 10) risks.push({ category: 'Quality', title: `${noTies} activities with no logic ties`, severity: 'high' })

  // 4 KPI CARDS — all from XER
  const metrics = [
    {
      label: 'Days Behind Contract',
      val: delayDays > 0 ? `+${delayDays}` : `${delayDays}`,
      sub: delayDays > 0 ? 'Past contract completion' : 'On or ahead of contract',
      delta: delayDays > 30 ? '↓ TIA territory' : delayDays > 0 ? '↓ Recovery needed' : '✓ Healthy',
      color: delayDays > 30 ? 'text-red-600' : delayDays > 0 ? 'text-amber-600' : 'text-green-600',
      border: delayDays > 30 ? 'border-red-100' : delayDays > 0 ? 'border-amber-100' : 'border-green-100',
      href: '/dashboard/tia',
    },
    {
      label: 'Work Complete',
      val: `${completePct}%`,
      sub: `${complete} of ${totalActivities} activities`,
      delta: completePct >= 75 ? '✓ Closeout phase' : completePct >= 40 ? '→ Construction active' : '→ Early phase',
      color: 'text-blue-600',
      border: 'border-blue-100',
      href: '/dashboard/lens',
    },
    {
      label: 'Long Lead at Risk',
      val: `${longLeadAtRisk}`,
      sub: `${longLead.length} long lead total`,
      delta: longLeadAtRisk > 0 ? '↓ Negative float' : '✓ All clear',
      color: longLeadAtRisk > 0 ? 'text-red-600' : 'text-green-600',
      border: longLeadAtRisk > 0 ? 'border-red-100' : 'border-green-100',
      href: '/dashboard/submittals',
    },
    {
      label: 'Risks Detected',
      val: `${risks.length}`,
      sub: 'Auto-detected by NobelPM',
      delta: risks.filter(r => r.severity === 'critical').length > 0 ? `${risks.filter(r => r.severity === 'critical').length} critical` : risks.length > 0 ? 'Review recommended' : '✓ No risks flagged',
      color: risks.filter(r => r.severity === 'critical').length > 0 ? 'text-red-600' : risks.length > 0 ? 'text-amber-600' : 'text-green-600',
      border: risks.filter(r => r.severity === 'critical').length > 0 ? 'border-red-100' : risks.length > 0 ? 'border-amber-100' : 'border-green-100',
      href: '/dashboard/risks',
    },
  ]

  // IMMEDIATE ATTENTION AREAS — derived from risks
  const attention: Array<{icon: string, title: string, desc: string, badge: string, badgeColor: string, href: string}> = []
  if (longLeadAtRisk > 0) {
    const topItem = longLead.find((t: any) => t.floatDays < 0)
    attention.push({
      icon: '🛒',
      title: 'Procurement Exposure',
      desc: `${longLeadAtRisk} long lead item${longLeadAtRisk > 1 ? 's' : ''} on negative float${topItem ? `, starting with ${topItem.task_code}` : ''}. Vendor coordination required this week.`,
      badge: 'High Impact',
      badgeColor: 'bg-red-100 text-red-700',
      href: '/dashboard/submittals',
    })
  }
  if (negativeFloat > 20) {
    attention.push({
      icon: '📅',
      title: 'Schedule Compression',
      desc: `${negativeFloat} activities running behind. Critical path may be in compression — review float distribution and recovery options.`,
      badge: negativeFloat > 100 ? 'High Impact' : 'Medium Impact',
      badgeColor: negativeFloat > 100 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
      href: '/dashboard/risks',
    })
  }
  if (outOfSequence > 10) {
    attention.push({
      icon: '🔧',
      title: 'Out-of-Sequence Work',
      desc: `${outOfSequence} activities started before their predecessors completed. Schedule logic integrity issue — review with scheduler.`,
      badge: outOfSequence > 50 ? 'High Impact' : 'Medium Impact',
      badgeColor: outOfSequence > 50 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
      href: '/dashboard/risks',
    })
  }
  if (delayDays > 30) {
    attention.push({
      icon: '⚖️',
      title: 'TIA Territory',
      desc: `Project is ${delayDays} days behind contract completion. Begin documenting delay events and prepare for time impact analysis.`,
      badge: 'High Impact',
      badgeColor: 'bg-red-100 text-red-700',
      href: '/dashboard/risks',
    })
  }
  if (noTies > 10) {
    attention.push({
      icon: '🔗',
      title: 'Schedule Quality Issue',
      desc: `${noTies} activities have no predecessor or successor relationships. Schedule integrity at risk — needs scheduler review.`,
      badge: 'Medium Impact',
      badgeColor: 'bg-amber-100 text-amber-700',
      href: '/dashboard/risks',
    })
  }
  // Default safe state
  if (attention.length === 0) {
    attention.push({
      icon: '✅',
      title: 'No Immediate Concerns',
      desc: 'NobelPM did not detect any critical patterns in this schedule. Continue normal monitoring.',
      badge: 'Stable',
      badgeColor: 'bg-green-100 text-green-700',
      href: '/dashboard/lens',
    })
  }

  // UPCOMING MILESTONES — filter to next 14 calendar days
  const now = new Date()
  const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const milestoneActivities = (analysis.milestones || []).filter((m: any) => {
    const dateStr = m.early_end_date || m.target_end_date
    if (!dateStr) return false
    try {
      const d = new Date(dateStr.replace(' ', 'T'))
      return d >= now && d <= twoWeeksFromNow
    } catch { return false }
  })

  // Fallback if no milestones in window — show top critical path items
  const milestonesDisplay = milestoneActivities.length > 0
    ? milestoneActivities.slice(0, 5)
    : (analysis.criticalDrivers || []).slice(0, 5)

  function milestoneRisk(t: any) {
    const float = parseFloat(t.total_float_hr_cnt || '0') / 8
    if (float < -10) return { label: 'High', color: 'bg-red-100 text-red-700' }
    if (float < 0) return { label: 'Med', color: 'bg-amber-100 text-amber-700' }
    return { label: 'Low', color: 'bg-green-100 text-green-700' }
  }

  function milestoneStatus(t: any) {
    if (t.status_code === 'TK_Active') return { label: 'Active', color: 'bg-blue-100 text-blue-700' }
    const float = parseFloat(t.total_float_hr_cnt || '0') / 8
    if (float < -10) return { label: 'Delayed', color: 'bg-red-100 text-red-700' }
    if (float < 0) return { label: 'At Risk', color: 'bg-amber-100 text-amber-700' }
    return { label: 'On Track', color: 'bg-green-100 text-green-700' }
  }

  // OPERATIONAL PRESSURE — derived from XER metrics
  const pressureProcurement = longLead.length > 0 ? Math.min(100, Math.round((longLeadAtRisk / longLead.length) * 100)) : 0
  const pressureCompression = totalActivities > 0 ? Math.min(100, Math.round((negativeFloat / totalActivities) * 100 * 3)) : 0
  const pressureCoordination = Math.min(100, Math.round(outOfSequence / 5))
  const pressureLogic = Math.min(100, Math.round(noTies / 2))
  const pressureRFI = rfis.filter(r => r.evaluation?.classification === 'SCHEDULE_IMPACTING').length * 30

  function levelFromPct(p: number) {
    if (p > 70) return { label: 'High', color: 'text-red-600', bar: 'bg-red-500' }
    if (p > 40) return { label: 'Med', color: 'text-amber-600', bar: 'bg-amber-500' }
    return { label: 'Low', color: 'text-green-600', bar: 'bg-green-500' }
  }

  const pressure = [
    { label: 'Procurement', pct: pressureProcurement, level: levelFromPct(pressureProcurement) },
    { label: 'Schedule Compression', pct: pressureCompression, level: levelFromPct(pressureCompression) },
    { label: 'Out-of-Sequence', pct: pressureCoordination, level: levelFromPct(pressureCoordination) },
    { label: 'Schedule Quality', pct: pressureLogic, level: levelFromPct(pressureLogic) },
    { label: 'RFI Impact', pct: Math.min(100, pressureRFI), level: levelFromPct(Math.min(100, pressureRFI)) },
  ]

  // RECOMMENDED FOLLOW-UP — generated from findings
  const actions: string[] = []
  if (longLeadAtRisk > 0) {
    const topItem = longLead.find((t: any) => t.floatDays < 0)
    if (topItem) actions.push(`Call vendor for ${topItem.task_code} ${topItem.task_name?.slice(0, 50)} — confirm delivery and escalate if needed`)
  }
  if (delayDays > 30) actions.push(`Begin TIA documentation — project is ${delayDays} days behind contract completion`)
  if (negativeFloat > 50) actions.push(`Review critical path with scheduler — ${negativeFloat} activities running behind requires recovery plan`)
  if (outOfSequence > 20) actions.push(`Discuss out-of-sequence work with field super — ${outOfSequence} violations indicate sequencing issues`)
  if (noTies > 10) actions.push(`Have scheduler review ${noTies} activities missing predecessor/successor relationships`)
  if (rfis.filter(r => r.evaluation?.classification === 'SCHEDULE_IMPACTING').length > 0) {
    actions.push(`Address ${rfis.filter(r => r.evaluation?.classification === 'SCHEDULE_IMPACTING').length} schedule-impacting RFI(s) — fragnets need to be added to the schedule`)
  }
  if (actions.length === 0) {
    actions.push('Continue weekly schedule monitoring — no immediate actions flagged')
    actions.push('Review long lead procurement status with vendors')
    actions.push('Verify upcoming inspection dates with QC team')
  }

  // COMMUNICATION SUMMARY — short version
  const commSummary = (() => {
    const parts: string[] = []
    if (delayDays > 30) parts.push(`Project is ${delayDays} days behind contract completion`)
    else if (delayDays > 0) parts.push(`Project is ${delayDays} days behind plan`)
    else parts.push('Project is on or ahead of contract')
    if (longLeadAtRisk > 0) parts.push(`${longLeadAtRisk} long lead item(s) at risk`)
    if (negativeFloat > 0) parts.push(`${negativeFloat} activities on negative float`)
    if (outOfSequence > 10) parts.push(`${outOfSequence} out-of-sequence violations detected`)
    return parts.join('. ') + '. Immediate coordination recommended with vendors, scheduler, and owner.'
  })()

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0 no-print">
        <div>
          <span className="font-bold text-slate-900 text-base">Executive Dashboard</span>
          <span className="text-slate-400 text-sm ml-2">· {projectName}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">Last updated: {lastUpdatedLabel()}</span>
          <Link href="/dashboard/lens" className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors">🔍 NobelPM Analysis</Link>
          <Link href="/dashboard/upload" className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-semibold">+ Upload Schedule</Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Condition banner */}
        <div className={`${condStyle.bg} ${condStyle.border} border rounded-xl p-4 flex items-center gap-4`}>
          <span className="text-2xl">{condStyle.icon}</span>
          <div className="flex-1">
            <div className={`font-bold text-base ${condStyle.text}`}>{condition} · Health {healthScore}/100</div>
            <div className={`text-sm mt-0.5 ${condStyle.subText}`}>{conditionMessage}</div>
          </div>
          <Link href="/dashboard/lens" className={`text-xs border ${condStyle.btnBorder} ${condStyle.btnText} px-3 py-2 rounded-lg ${condStyle.btnHover} transition-colors whitespace-nowrap font-medium`}>
            Full Lens Analysis →
          </Link>
        </div>

        {/* Key Dates & Durations */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Key Dates & Durations</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
            <div className="bg-slate-50 rounded-lg p-2.5">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Data Date</div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">{analysis.dataDate?.slice(0,10) || '—'}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">As of XER upload</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2.5">
              <div className="text-[9px] font-bold text-blue-700 uppercase tracking-wider">Project Start / NTP</div>
              <div className="text-sm font-bold text-blue-900 mt-0.5">{analysis.projectStartDate?.slice(0,10) || '—'}</div>
              <div className="text-[9px] text-blue-600 mt-0.5">{analysis.projectStartSource || '—'}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-2.5">
              <div className="text-[9px] font-bold text-amber-700 uppercase tracking-wider">Substantial Completion</div>
              <div className="text-sm font-bold text-amber-900 mt-0.5">{analysis.substantialCompletionDate?.slice(0,10) || 'Not Defined'}</div>
              <div className="text-[9px] text-amber-600 mt-0.5">{analysis.substantialCompletionMilestone || '—'}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2.5">
              <div className="text-[9px] font-bold text-red-700 uppercase tracking-wider">Final Completion</div>
              <div className="text-sm font-bold text-red-900 mt-0.5">{analysis.finalCompletionDate?.slice(0,10) || analysis.projectedEnd?.slice(0,10) || '—'}</div>
              <div className="text-[9px] text-red-600 mt-0.5">{analysis.finalCompletionMilestone || (analysis.finalCompletionDate ? '' : 'From projected end')}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Contract End</div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">{analysis.contractEnd?.slice(0,10) || '—'}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">Per contract</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Projected End</div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">{analysis.projectedEnd?.slice(0,10) || '—'}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">Per current schedule</div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Original Duration</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">{analysis.originalDurationDays || 0}<span className="text-xs font-normal text-slate-500 ml-1">days</span></div>
              </div>
              <div className="text-center">
                <div className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Remaining Duration</div>
                <div className="text-lg font-bold text-blue-700 mt-0.5">{analysis.remainingDurationDays || 0}<span className="text-xs font-normal text-blue-500 ml-1">days</span></div>
              </div>
              <div className="text-center">
                <div className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Duration at Completion</div>
                <div className={`text-lg font-bold mt-0.5 ${(analysis.durationAtCompletion || 0) > (analysis.originalDurationDays || 0) ? 'text-red-700' : 'text-green-700'}`}>
                  {analysis.durationAtCompletion || 0}<span className="text-xs font-normal text-slate-500 ml-1">days</span>
                  {(analysis.durationAtCompletion || 0) > (analysis.originalDurationDays || 0) && (
                    <span className="text-[10px] text-red-600 ml-2">(+{(analysis.durationAtCompletion || 0) - (analysis.originalDurationDays || 0)}d)</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-3">
          {metrics.map(m => (
            <Link key={m.label} href={m.href} className={`bg-white border ${m.border} rounded-xl p-4 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer block`}>
              <div className="text-xs text-slate-500 font-medium mb-1">{m.label}</div>
              <div className={`text-2xl font-extrabold ${m.color}`}>{m.val}</div>
              <div className="text-xs text-slate-400 mt-1">{m.sub}</div>
              <div className={`text-xs font-semibold mt-1 ${m.color}`}>{m.delta}</div>
            </Link>
          ))}
        </div>

        {/* Attention + Milestones */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Immediate Attention Areas</div>
            <div className="space-y-2">
              {attention.slice(0, 5).map((a, i) => (
                <Link key={i} href={a.href} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
                  <span className="text-lg flex-shrink-0 mt-0.5">{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 text-xs">{a.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{a.desc}</div>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1.5 ${a.badgeColor}`}>{a.badge}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">2 Weeks Lookahead</div>
            {milestonesDisplay.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-6">No milestones scheduled in next 14 days</div>
            ) : (
              <>
                <div className="grid grid-cols-4 text-[10px] text-slate-400 font-semibold uppercase mb-2 px-1">
                  <span className="col-span-2">Milestone</span><span>Status</span><span>Risk</span>
                </div>
                {milestonesDisplay.map((m: any, i: number) => {
                  const status = milestoneStatus(m)
                  const risk = milestoneRisk(m)
                  return (
                    <div key={i} className="grid grid-cols-4 items-center gap-1 py-2 border-b border-slate-50 last:border-0">
                      <div className="col-span-2 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 leading-tight truncate">{m.task_name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{formatMonthDay(m.early_end_date || m.target_end_date)}</div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.color} w-fit`}>{status.label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${risk.color} w-fit`}>{risk.label}</span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Pressure + Actions + Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Operational Pressure</div>
            <div className="space-y-2.5">
              {pressure.map(p => (
                <div key={p.label} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-32 flex-shrink-0">{p.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`${p.level.bar} h-full rounded-full bar-animated`} style={{ width: `${p.pct}%` }} />
                  </div>
                  <span className={`text-[10px] font-bold w-8 text-right ${p.level.color}`}>{p.level.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Recommended Follow-Up</div>
            <div className="space-y-2">
              {actions.slice(0, 6).map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  </div>
                  <span className="text-xs text-slate-600 leading-relaxed">{a}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Communication Summary</div>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r-lg text-xs text-blue-900 leading-relaxed mb-3">
              {commSummary}
            </div>
            <div className="space-y-2">
              <Link href="/dashboard/lens" className="w-full bg-blue-600 text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5">
                🔍 Full Lens Analysis
              </Link>
              <Link href="/dashboard/tia" className="w-full border border-slate-200 text-slate-600 text-xs font-semibold py-2 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors flex items-center justify-center">
                📑 TIA Comparison
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
