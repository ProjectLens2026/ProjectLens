import type {
  ApprovalDomainId,
  ApprovalFinding,
  ApprovalReadinessResult,
  CommentDisposition,
  RuleAuthority,
  RuleStrength,
} from './types'
import { computeDeduction } from './framework'

type FindingDraft = Omit<ApprovalFinding, 'id' | 'status'>
type Check = NonNullable<ApprovalReadinessResult['standardPractice']>['checks'][number]

interface StandardAnalysis {
  traceTasks?: Record<string, any>
  traceRelationships?: any[]
  calendars?: Record<string, any>
  dataDate?: string
  reviewBasis?: { scheduleType?: string }
}

export interface StandardPracticeReview {
  findings: FindingDraft[]
  profile: NonNullable<ApprovalReadinessResult['standardPractice']>
}

const taskId = (task: any) => String(task?.task_id || task?.id || task?.task_code || '')
const taskCode = (task: any) => String(task?.task_code || task?.code || taskId(task) || '—')
const taskName = (task: any) => String(task?.task_name || task?.name || 'Unnamed activity')
const norm = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const isDetailed = (task: any) => !/MILE|LEVEL OF EFFORT|LOE|WBS SUMMARY/.test(norm(task?.task_type))
const isProcurement = (task: any) => /PROCURE|SUBMITTAL|FABRICAT|DELIVER|MANUFACTUR|PURCHASE|LONG LEAD/.test(norm(`${taskName(task)} ${(task?.wbs_path || []).join(' ')}`))

function calendarHours(task: any, calendars: Record<string, any>): number {
  const calendar = calendars[String(task?.clndr_id || '')]
  return Math.max(1, Number(calendar?.day_hr_cnt || 8))
}

function activities(tasks: any[], note: string): ApprovalFinding['affectedActivities'] {
  return tasks.slice(0, 40).map(task => ({ id: taskId(task), code: taskCode(task), name: taskName(task), note }))
}

function draft(input: {
  domain: ApprovalDomainId
  strength: RuleStrength
  authority: RuleAuthority
  disposition: CommentDisposition
  severity: 1 | 2 | 3 | 4 | 5
  title: string
  found: string
  why: string
  action: string
  reference: string
  affected?: ApprovalFinding['affectedActivities']
  gate?: boolean
}): FindingDraft {
  const recommendation = input.disposition === 'ADVISORY' || input.disposition === 'SUPPORTING_EVIDENCE'
  return {
    kind: recommendation ? 'RECOMMENDATION' : 'FINDING',
    primaryDomain: input.domain,
    ruleStrength: input.strength,
    authority: input.authority,
    commentDisposition: input.disposition,
    severity: input.severity,
    confidence: 'high',
    criticalGate: Boolean(input.gate && input.disposition === 'REQUIRED_CORRECTION'),
    scoreDeduction: recommendation ? 0 : computeDeduction(input.severity, input.strength),
    title: input.title,
    whatFound: input.found,
    whyItMatters: input.why,
    reviewerCheck: input.action,
    preSubmissionNote: input.action,
    referenceRequirement: input.reference,
    affectedActivities: input.affected || [],
    evidence: [],
  }
}

export function evaluateStandardPractice(analysis: StandardAnalysis): StandardPracticeReview {
  const tasks = Object.values(analysis.traceTasks || {})
  const relationships = Array.isArray(analysis.traceRelationships) ? analysis.traceRelationships : []
  const calendars = analysis.calendars || {}
  const scheduleType = String(analysis.reviewBasis?.scheduleType || '').toLowerCase()
  const reviewType: 'BASELINE' | 'UPDATE' = /baseline|rebaseline/.test(scheduleType) ? 'BASELINE' : 'UPDATE'
  const findings: FindingDraft[] = []
  const checks: Check[] = []

  const add = (check: Omit<Check, 'findingId'>, finding?: FindingDraft) => {
    if (finding) findings.push(finding)
    checks.push(check)
  }

  const relationshipKeys = new Map<string, any[]>()
  for (const rel of relationships) {
    const key = [rel?.pred_task_id, rel?.task_id, norm(rel?.pred_type), Number(rel?.lag_hr_cnt || 0)].join('|')
    relationshipKeys.set(key, [...(relationshipKeys.get(key) || []), rel])
  }
  const duplicateRelationships = Array.from(relationshipKeys.values()).filter(group => group.length > 1).flatMap(group => group.slice(1))
  add({ id: 'SP-DUP-REL', label: 'Duplicate relationships', domain: 'AR-03', target: '0', actual: String(duplicateRelationships.length), count: duplicateRelationships.length, status: duplicateRelationships.length ? 'REQUIRED' : 'PASS' }, duplicateRelationships.length ? draft({
    domain: 'AR-03', strength: 'REQUIRED', authority: 'TECHNICAL_INTEGRITY', disposition: 'REQUIRED_CORRECTION', severity: 4,
    title: 'Duplicate schedule relationships detected',
    found: `${duplicateRelationships.length} duplicate relationship record${duplicateRelationships.length === 1 ? '' : 's'} repeat the same predecessor, successor, relationship type, and lag.`,
    why: 'Duplicate ties can distort schedule calculations, complicate logic reconciliation, and provide no additional CPM meaning.',
    action: 'Remove the duplicate relationship records, reschedule, and verify the controlling and near-critical paths.',
    reference: 'CPM network technical-integrity check.',
  }) : undefined)

  const negativeLags = relationships.filter(rel => Number(rel?.lag_hr_cnt || 0) < 0)
  add({ id: 'SP-NEG-LAG', label: 'Negative lag / leads', domain: 'AR-07', target: '0 preferred', actual: String(negativeLags.length), count: negativeLags.length, status: negativeLags.length ? 'CLARIFICATION' : 'PASS' }, negativeLags.length ? draft({
    domain: 'AR-07', strength: 'EXPECTED', authority: 'STANDARD_PRACTICE', disposition: 'CLARIFICATION', severity: 3,
    title: 'Negative lag requires explicit justification',
    found: `${negativeLags.length} relationship${negativeLags.length === 1 ? ' uses' : 's use'} negative lag.`,
    why: 'Negative lag models work before the stated predecessor event and can conceal the measurable activity or handoff that actually controls the successor.',
    action: 'Replace the lead with measurable work and transparent logic, or document the project-specific basis for retaining it.',
    reference: 'CPMReview standard-practice benchmark; contractual treatment depends on the Project Control Basis.',
  }) : undefined)

  const startToFinish = relationships.filter(rel => /(^|_)SF$/i.test(String(rel?.pred_type || '')))
  add({ id: 'SP-SF', label: 'Start-to-Finish relationships', domain: 'AR-03', target: '0 preferred', actual: String(startToFinish.length), count: startToFinish.length, status: startToFinish.length ? 'CLARIFICATION' : 'PASS' }, startToFinish.length ? draft({
    domain: 'AR-03', strength: 'EXPECTED', authority: 'STANDARD_PRACTICE', disposition: 'CLARIFICATION', severity: 3,
    title: 'Start-to-Finish relationships require logic review',
    found: `${startToFinish.length} Start-to-Finish relationship${startToFinish.length === 1 ? ' is' : 's are'} present.`,
    why: 'Start-to-Finish logic is unusual in construction schedules and can reverse the apparent cause-and-effect sequence.',
    action: 'Confirm the intended dependency and replace it with transparent activity-based logic unless the relationship is genuinely required.',
    reference: 'CPMReview standard-practice benchmark; contractual treatment depends on the Project Control Basis.',
  }) : undefined)

  const positiveLags = relationships.filter(rel => Number(rel?.lag_hr_cnt || 0) > 0)
  const longPositiveLags = positiveLags.filter(rel => Number(rel?.lag_hr_cnt || 0) / 8 >= 20)
  const positiveLagPct = relationships.length ? (positiveLags.length / relationships.length) * 100 : 0
  add({ id: 'SP-POS-LAG', label: 'Positive-lag relationships', domain: 'AR-07', target: '<5% benchmark', actual: `${positiveLagPct.toFixed(1)}%`, count: positiveLags.length, status: positiveLagPct >= 5 ? 'ADVISORY' : 'PASS' }, positiveLagPct >= 5 ? draft({
    domain: 'AR-07', strength: 'ADVISORY', authority: 'STANDARD_PRACTICE', disposition: 'ADVISORY', severity: 2,
    title: 'Positive lag usage exceeds the standard-practice benchmark',
    found: `${positiveLags.length} of ${relationships.length} relationships (${positiveLagPct.toFixed(1)}%) contain positive lag.`,
    why: 'Frequent lag can hide work, cure periods, delivery intervals, or approval periods that should be visible and statusable.',
    action: 'Review the lag population and replace material waiting periods with measurable activities where practical.',
    reference: 'CPMReview standard-practice benchmark: positive lag below 5%.',
  }) : undefined)
  add({ id: 'SP-LONG-LAG', label: 'Long positive lags', domain: 'AR-07', target: '0 preferred', actual: String(longPositiveLags.length), count: longPositiveLags.length, status: longPositiveLags.length ? 'ADVISORY' : 'PASS' }, longPositiveLags.length ? draft({
    domain: 'AR-07', strength: 'ADVISORY', authority: 'STANDARD_PRACTICE', disposition: 'ADVISORY', severity: 2,
    title: 'Long positive lags should be represented as activities',
    found: `${longPositiveLags.length} relationship${longPositiveLags.length === 1 ? ' contains' : 's contain'} at least 20 nominal working days of lag.`,
    why: 'Long lags are not independently statusable and can conceal the work or waiting condition controlling downstream dates.',
    action: 'Replace long lags with named, measurable activities or document the reason for retaining each exception.',
    reference: 'CPMReview standard-practice benchmark: long waiting periods should be modeled as activities.',
  }) : undefined)

  const fsCount = relationships.filter(rel => /(^|_)FS$/i.test(String(rel?.pred_type || ''))).length
  const fsPct = relationships.length ? (fsCount / relationships.length) * 100 : 100
  add({ id: 'SP-FS-RATIO', label: 'Finish-to-Start relationships', domain: 'AR-03', target: '≥90% benchmark', actual: `${fsPct.toFixed(1)}%`, count: fsCount, status: fsPct < 90 ? 'ADVISORY' : 'PASS' }, fsPct < 90 ? draft({
    domain: 'AR-03', strength: 'ADVISORY', authority: 'STANDARD_PRACTICE', disposition: 'ADVISORY', severity: 2,
    title: 'Finish-to-Start relationship ratio is below the standard benchmark',
    found: `${fsCount} of ${relationships.length} relationships (${fsPct.toFixed(1)}%) are Finish-to-Start.`,
    why: 'A high concentration of overlapping SS/FF logic may reduce transparency and make the controlling sequence harder to validate.',
    action: 'Review overlapping logic for constructability and retain SS/FF relationships that represent genuine execution dependencies.',
    reference: 'CPMReview standard-practice benchmark: at least 90% Finish-to-Start; this is advisory unless required by the project.',
  }) : undefined)

  const detailed = tasks.filter(isDetailed)
  const longActivities = detailed.filter(task => !isProcurement(task) && Number(task?.target_drtn_hr_cnt || 0) / calendarHours(task, calendars) > 20)
  const longDurationPct = detailed.length ? (longActivities.length / detailed.length) * 100 : 0
  add({ id: 'SP-LONG-DURATION', label: 'Long non-procurement activities', domain: 'AR-09', target: '<5% benchmark', actual: `${longDurationPct.toFixed(1)}%`, count: longActivities.length, status: longDurationPct >= 5 ? 'ADVISORY' : 'PASS' }, longDurationPct >= 5 ? draft({
    domain: 'AR-09', strength: 'ADVISORY', authority: 'STANDARD_PRACTICE', disposition: 'ADVISORY', severity: 2,
    title: 'Long activities exceed the standard-practice benchmark',
    found: `${longActivities.length} of ${detailed.length} detailed activities (${longDurationPct.toFixed(1)}%) exceed 20 working days, excluding apparent procurement activities.`,
    why: 'Long activities can conceal progress, handoffs, production problems, and the cause of delay between updates.',
    action: 'Subdivide long work into measurable activities where practical or document the project-specific basis for each retained exception.',
    reference: 'CPMReview standard-practice benchmark: detailed non-procurement work should normally not exceed 20 working days.',
    affected: activities(longActivities, 'Exceeds 20 working days'),
  }) : undefined)

  const names = new Map<string, any[]>()
  for (const task of detailed) {
    const key = norm(taskName(task))
    if (key) names.set(key, [...(names.get(key) || []), task])
  }
  const duplicateNames = Array.from(names.values()).filter(group => group.length > 1).flat()
  add({ id: 'SP-DUP-NAME', label: 'Duplicate activity descriptions', domain: 'AR-09', target: 'Explain duplicates', actual: String(duplicateNames.length), count: duplicateNames.length, status: duplicateNames.length ? 'CLARIFICATION' : 'PASS' }, duplicateNames.length ? draft({
    domain: 'AR-09', strength: 'EXPECTED', authority: 'REVIEWER_JUDGMENT', disposition: 'CLARIFICATION', severity: 2,
    title: 'Duplicate activity descriptions require differentiation',
    found: `${duplicateNames.length} activities share a description with at least one other detailed activity.`,
    why: 'Duplicate descriptions may be valid across areas, but without location, phase, system, or deliverable context they are difficult to status and reconcile.',
    action: 'Confirm that each duplicate represents distinct work and revise names to identify the applicable area, phase, system, or deliverable.',
    reference: 'CPMReview schedule-clarity review.',
    affected: activities(duplicateNames, 'Duplicate description'),
  }) : undefined)

  const baselineProgress = reviewType === 'BASELINE' ? tasks.filter(task => {
    const status = String(task?.status_code || '')
    return status === 'TK_Active' || status === 'TK_Complete' || Boolean(task?.act_start_date || task?.act_end_date)
  }) : []
  if (reviewType === 'BASELINE') add({ id: 'SP-BASELINE-PROGRESS', label: 'Baseline progress', domain: 'AR-03', target: '0 unless authorized', actual: String(baselineProgress.length), count: baselineProgress.length, status: baselineProgress.length ? 'REQUIRED' : 'PASS' }, baselineProgress.length ? draft({
    domain: 'AR-03', strength: 'REQUIRED', authority: 'TECHNICAL_INTEGRITY', disposition: 'REQUIRED_CORRECTION', severity: 4,
    title: 'Baseline contains progress or actual dates',
    found: `${baselineProgress.length} activit${baselineProgress.length === 1 ? 'y contains' : 'ies contain'} progress or actual dates in a schedule identified as a baseline.`,
    why: 'An unexplained progressed baseline does not preserve a clean pre-performance plan and can invalidate later variance comparisons.',
    action: 'Remove unintended progress or document why this submission is a statused/reconstructed baseline and obtain reviewer acceptance.',
    reference: 'CPM baseline technical-integrity check; authorized reconstructed baselines require documented reviewer disposition.',
    affected: activities(baselineProgress, 'Progress or actual date in baseline'),
  }) : undefined)

  const float = { negative: 0, zero: 0, oneToTenDays: 0, elevenToThirtyDays: 0, thirtyOneToSixtyDays: 0, overSixtyDays: 0 }
  for (const task of tasks.filter(task => String(task?.status_code || '') !== 'TK_Complete')) {
    const days = Number(task?.total_float_hr_cnt || 0) / calendarHours(task, calendars)
    if (days < 0) float.negative++
    else if (days === 0) float.zero++
    else if (days <= 10) float.oneToTenDays++
    else if (days <= 30) float.elevenToThirtyDays++
    else if (days <= 60) float.thirtyOneToSixtyDays++
    else float.overSixtyDays++
  }

  return { findings, profile: { profile: 'CPMREVIEW_STANDARD', reviewType, checks, floatDistribution: float } }
}
