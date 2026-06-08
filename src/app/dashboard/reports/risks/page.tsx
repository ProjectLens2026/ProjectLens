'use client'

// =============================================================================
// src/app/dashboard/reports/risks/page.tsx
// =============================================================================
// Risk Register report page wrapper.
//
// Reads the active project + version from projectStore, runs the detectRisks
// logic (mirror of /dashboard/risks page) to compute full risk detail with
// recommendations and action items, then renders the report component.
//
// detectRisks() is COPIED from /dashboard/risks/page.tsx rather than imported,
// to avoid risk of breaking the existing risks page. Any change to risk
// thresholds must be made in BOTH places.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getActiveProject, getActiveVersion,
  Project, ScheduleVersion,
} from '@/lib/projectStore'
import { createClient } from '@/lib/supabase/client'
import { reportNumber } from '@/lib/reports'
import RiskRegisterReport, { RiskItem } from '@/components/reports/RiskRegisterReport'

export default function RiskRegisterPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [version, setVersion] = useState<ScheduleVersion | null>(null)
  const [orgName, setOrgName] = useState<string>('—')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    setVersion(p ? getActiveVersion(p) : null)
    setReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadOrg() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: members } = await supabase
          .from('organization_members')
          .select('org_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
        if (!members || members.length === 0) return
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', members[0].org_id)
          .single()
        if (!cancelled && org?.name) setOrgName(org.name)
      } catch {}
    }
    loadOrg()
    return () => { cancelled = true }
  }, [])

  if (!ready) {
    return <div className="p-6 text-sm text-slate-500">Loading report…</div>
  }
  if (!project || !version) {
    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">
          ‹ Reports
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center mt-4">
          <div className="text-3xl mb-3">📄</div>
          <div className="text-lg font-bold text-slate-700 mb-2">No project loaded</div>
          <div className="text-sm text-slate-500 mb-4">
            Pick a project from the sidebar to generate the Risk Register.
          </div>
          <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const analysis: any = version.analysis || {}
  const risks = detectRisks(analysis)
  const dataDate = version.versionDates?.manualDataDate || analysis.dataDate || version.dataDate || version.uploadedAt

  const projectCode = project.projectId || project.name
  const reportNo = reportNumber(projectCode, 'RISK')
  const versionLabel = version.versionLabel || version.fileName || 'v1 · working draft'

  return (
    <div className="p-6 max-w-[920px] mx-auto h-full overflow-y-auto">
      <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">
        ‹ Reports
      </Link>
      <div className="mt-3">
        <RiskRegisterReport
          orgName={orgName}
          reportNo={reportNo}
          versionLabel={versionLabel}
          project={{
            name: project.name,
            projectId: project.projectId,
            project_code: (project as any).project_code,
            owner: (project as any).owner,
            location: (project as any).location,
          }}
          dataDate={dataDate}
          risks={risks}
        />
      </div>
    </div>
  )
}

// =============================================================================
// detectRisks — MIRROR of the function in src/app/dashboard/risks/page.tsx
// =============================================================================
// Returns the full risk detail (description, recommendation, action items,
// affected activities). Thresholds match the existing risks page exactly;
// if you change one here, change it there too.
// =============================================================================

function detectRisks(a: any): RiskItem[] {
  if (!a) return []
  const risks: RiskItem[] = []

  // TIA Territory
  if (a.delayDays > 30) {
    risks.push({
      id: 'tia',
      category: 'Time Impact',
      title: `Project ${a.delayDays} days behind contract — TIA territory`,
      description: `Project completion has slipped beyond 30 days of contract requirement. Recovery may not be possible within original contract terms.`,
      severity: 'critical',
      detail: `Contract completion date: ${a.contractEnd?.slice(0, 10) || 'N/A'}\nProjected completion: ${a.projectedEnd?.slice(0, 10) || 'N/A'}\nVariance: ${a.delayDays} days late`,
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

  // Construction Sequence Problems
  if (a.outOfSequence?.length > 20) {
    risks.push({
      id: 'oos-severe',
      category: 'Construction Sequence',
      title: `${a.outOfSequence.length} activities with construction sequence problems`,
      description: 'Schedule logic integrity compromised — actual work order conflicts with the planned relationship logic across many activities.',
      severity: 'high',
      detail: 'Construction sequence problems occur when an activity started or finished in a way that violates its relationship logic — for example, an FS successor that started before its predecessor finished, after accounting for any lead/lag. ControlLens reports every activity with at least one violated relationship, with full per-violation evidence available on the Full Analysis > Sequence Problems tab. Some violations are legitimate fast-tracking (TIA evidence); others are true logic gaps. Review each with your scheduler.',
      recommendation: 'Open Full Analysis > Sequence Problems and walk the list with your scheduler. Tag each activity as either intentional acceleration (document for TIA) or logic gap (fix in P6). Coordinate with field super to enforce sequence going forward where needed.',
      actionItems: [
        'Review the per-activity evidence in Full Analysis > Sequence Problems',
        'For each: classify as fast-tracking (legitimate) or logic gap (fix)',
        'Document acceleration efforts — these are TIA evidence',
        'Correct schedule logic in P6 where gaps are real',
        'Coordinate with field super to enforce sequence going forward',
      ],
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
        'Generate list of activities with no ties',
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
