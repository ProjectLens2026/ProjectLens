import { detectRiskCategories } from '@/lib/riskDetector'

export function floatDays(t: any): number {
  if (!t) return 0
  if (typeof t.floatDays === 'number' && Number.isFinite(t.floatDays)) return Math.round(t.floatDays)
  const h = parseFloat(t.total_float_hr_cnt || '0')
  return Number.isFinite(h) ? Math.round(h / 8) : 0
}

export function workCompletePct(a: any): number {
  if (typeof a?.workCompletePct === 'number' && Number.isFinite(a.workCompletePct)) return a.workCompletePct
  const total = Number(a?.totalActivities || 0)
  const done = Number(a?.complete || 0)
  return total > 0 ? (done / total) * 100 : 0
}

export function projectedEnd(a: any): string | undefined {
  return a?.projectedEnd
    || a?.projected_end
    || a?.forecastFinish
    || a?.forecast_finish
    || a?.projectedFinish
    || a?.finalCompletionDate
    || a?.finalCompletion
    || a?.final_completion
    || a?.substantialCompletionDate
    || undefined
}

export function daysBetween(start?: string, finish?: string): number {
  if (!start || !finish) return 0
  const a = new Date(start)
  const b = new Date(finish)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function criticalFloatDays(a: any): number {
  const rows = Array.isArray(a?.criticalDrivers) ? a.criticalDrivers : []
  if (!rows.length) return 0
  return Math.min(...rows.map(floatDays))
}

export function milestoneRisks(a: any): any[] {
  return (Array.isArray(a?.milestones) ? a.milestones : []).filter((m: any) => floatDays(m) < 0)
}

export function buildFloatBuckets(a: any) {
  const traceTasks = a?.traceTasks && typeof a.traceTasks === 'object' ? Object.values(a.traceTasks) : []
  const source: any[] = traceTasks.length
    ? traceTasks as any[]
    : (Array.isArray(a?.ganttActivities) ? a.ganttActivities : [])
  const vals = source.map(floatDays)
  const count = (fn: (n: number) => boolean) => vals.filter(fn).length
  return [
    { label: '≤ 0d', count: count(n => n <= 0), color: '#dc2626' },
    { label: '1–7d', count: count(n => n >= 1 && n <= 7), color: '#f59e0b' },
    { label: '8–14d', count: count(n => n >= 8 && n <= 14), color: '#2563eb' },
    { label: '15–30d', count: count(n => n >= 15 && n <= 30), color: '#64748b' },
    { label: '> 30d', count: count(n => n > 30), color: '#16a34a' },
  ]
}

export function buildRiskItems(a: any): any[] {
  const cats = detectRiskCategories(a)
  const longLeadAtRisk = (a?.longLeadItems || []).filter((t: any) => floatDays(t) < 0)
  const milestones = milestoneRisks(a)
  const critical = Array.isArray(a?.criticalDrivers) ? a.criticalDrivers : []
  const noTies = Array.isArray(a?.noTies) ? a.noTies : []
  const oos = Array.isArray(a?.outOfSequence) ? a.outOfSequence : []

  return cats.map(c => {
    if (c.id === 'tia') return {
      ...c,
      title: 'Contract completion exposure',
      description: `The current schedule indicates approximately ${Math.max(0, Number(a?.delayDays || 0))} days of completion delay against the controlling completion date.`,
      detail: 'Review the driving path, documented delay events, approved time extensions, and current recovery position before relying on the forecast.',
      recommendation: 'Confirm the contractual basis for the current completion date and document the schedule events driving the forecast variance.',
      affectedActivities: critical.slice(0, 10),
      actionItems: ['Verify the controlling contract completion date.', 'Confirm the current driving path and near-critical paths.', 'Document delay events and any approved time extensions.'],
    }
    if (c.id.startsWith('crit-path')) return {
      ...c,
      title: 'Negative-float / critical-path pressure',
      description: `${Number(a?.negativeFloat || 0)} activities are currently reported with negative float.`,
      detail: 'Negative float indicates the active network is forecasting completion pressure against a required date or schedule constraint.',
      recommendation: 'Review the driving chain, constraints, remaining durations, and recovery logic before accepting the forecast.',
      affectedActivities: critical.slice(0, 10),
      actionItems: ['Trace the driving path to the controlling completion milestone.', 'Verify remaining durations and constraints.', 'Confirm whether a recovery plan is required.'],
    }
    if (c.id === 'longlead') return {
      ...c,
      title: 'Long-lead procurement exposure',
      description: `${longLeadAtRisk.length} long-lead item${longLeadAtRisk.length === 1 ? '' : 's'} currently show negative float.`,
      detail: 'Procurement activities with insufficient float can directly constrain installation, startup, and turnover milestones.',
      recommendation: 'Confirm submittal, release, fabrication, delivery, and required-on-site dates for the exposed items.',
      affectedActivities: longLeadAtRisk.slice(0, 10),
      actionItems: ['Confirm vendor commitments and current delivery dates.', 'Trace each exposed delivery to downstream installation.', 'Document mitigation for any item without adequate float.'],
    }
    if (c.id.startsWith('oos')) return {
      ...c,
      title: 'Out-of-sequence execution',
      description: `${oos.length} out-of-sequence activit${oos.length === 1 ? 'y is' : 'ies are'} identified in the stored schedule analysis.`,
      detail: 'Actual progress that conflicts with recorded predecessor logic can reduce forecast credibility until the network is reviewed and statused consistently.',
      recommendation: 'Review each material out-of-sequence condition and confirm whether the logic, actual dates, or remaining sequence requires correction.',
      affectedActivities: oos.map((x: any) => x.task).filter(Boolean).slice(0, 10),
      sequenceProblems: oos,
      actionItems: ['Validate actual dates against field records.', 'Confirm retained-logic/progress-override treatment.', 'Revise logic only where the schedule of record is demonstrably inaccurate.'],
    }
    if (c.id === 'noties') return {
      ...c,
      title: 'Open-ended or isolated logic',
      description: `${noTies.length} activities are reported without complete logic ties.`,
      detail: 'Untied activities can interrupt network continuity and weaken the credibility of path-based forecasts.',
      recommendation: 'Review open starts/finishes and confirm each exception is intentional and contractually acceptable.',
      affectedActivities: noTies.slice(0, 10),
      actionItems: ['Identify valid open-end exceptions.', 'Add missing predecessors/successors where required.', 'Re-run the schedule quality check after revision.'],
    }
    if (c.id === 'health') return {
      ...c,
      title: 'Overall schedule health requires attention',
      description: `The current schedule health score is ${Number(a?.healthScore || 0)}/100.`,
      detail: 'The score reflects combined schedule pressure and quality conditions and should be reviewed with the underlying evidence rather than used by itself.',
      recommendation: 'Prioritize the highest-materiality schedule conditions and confirm corrective actions with the scheduler and project team.',
      affectedActivities: critical.slice(0, 10),
      actionItems: ['Review the schedule quality findings.', 'Assign owners and due dates to corrective actions.', 'Re-evaluate after the next schedule revision.'],
    }
    return {
      ...c,
      title: 'Milestone completion exposure',
      description: `${milestones.length} milestone${milestones.length === 1 ? '' : 's'} currently show negative float.`,
      detail: 'Milestone float erosion can signal exposure to contractual, owner, or key project control dates.',
      recommendation: 'Trace each affected milestone to its driving predecessors and verify the controlling date basis.',
      affectedActivities: milestones.slice(0, 10),
      actionItems: ['Confirm which milestones are contractual versus project-control milestones.', 'Trace driving predecessors.', 'Document recovery or mitigation where required.'],
    }
  })
}

export function buildExecutiveSCurve(project: any): any[] {
  const months = project?.evm?.months
  if (!Array.isArray(months) || months.length === 0) return []
  let planned = 0
  let actual = 0
  return months.map((m: any) => {
    planned += Number(m?.plannedPct || 0)
    actual += Number(m?.earnedPct || 0)
    return {
      label: m?.label || m?.isoMonth || '',
      planned: Math.max(0, Math.min(100, planned)),
      actual: Math.max(0, Math.min(100, actual)),
    }
  })
}
