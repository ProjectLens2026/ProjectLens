// =============================================================================
// Deterministic schedule-quality benchmark for U.S. building schedules.
//
// Rules in this file use only facts present in the submitted XER. They do not
// infer entitlement, responsibility, excusability, or contract compliance.
// The benchmark is aligned to the core network-quality requirements in UFGS
// 01 32 01.00 10; the governing project specification still controls.
// =============================================================================

import type { ApprovalFinding, RuleStrength } from './types'
import { computeDeduction } from './framework'

type QualityFinding = Omit<ApprovalFinding, 'id' | 'status'>

interface QualityAnalysis {
  traceTasks?: Record<string, any>
  traceRelationships?: any[]
  calendars?: Record<string, any>
  projectSettings?: Record<string, string>
  scheduleOptions?: Record<string, string>
  activityCodeTypes?: Record<string, any>
  taskActivityCodes?: any[]
  noTies?: any[]
  outOfSequence?: any[]
  longLeadItems?: any[]
  [key: string]: unknown
}

const taskId = (task: any) => String(task?.task_id || task?.id || task?.task_code || '')
const taskCode = (task: any) => String(task?.task_code || task?.code || taskId(task) || '—')
const taskName = (task: any) => String(task?.task_name || task?.name || 'Unnamed activity')
const normalized = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const isEnabled = (value: unknown) => ['Y', 'YES', '1', 'TRUE'].includes(String(value || '').trim().toUpperCase())
const isDisabled = (value: unknown) => ['N', 'NO', '0', 'FALSE'].includes(String(value || '').trim().toUpperCase())

function dateOnly(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const parsed = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10)
  return parsed.toISOString().slice(0, 10)
}

function affected(tasks: any[], note: string): ApprovalFinding['affectedActivities'] {
  const unique = new Map<string, ApprovalFinding['affectedActivities'][number]>()
  for (const task of tasks) {
    const id = taskId(task)
    if (!id || unique.has(id)) continue
    unique.set(id, { id, code: taskCode(task), name: taskName(task), note })
  }
  return Array.from(unique.values())
}

function finding(input: {
  primaryDomain: ApprovalFinding['primaryDomain']
  crossReferencedDomains?: ApprovalFinding['crossReferencedDomains']
  ruleStrength: RuleStrength
  severity: 1 | 2 | 3 | 4 | 5
  title: string
  whatFound: string
  whyItMatters: string
  reviewerCheck: string
  preSubmissionNote: string
  referenceRequirement: string
  affectedActivities: ApprovalFinding['affectedActivities']
  criticalGate?: boolean
  confidence?: ApprovalFinding['confidence']
}): QualityFinding {
  return {
    kind: 'FINDING',
    primaryDomain: input.primaryDomain,
    crossReferencedDomains: input.crossReferencedDomains,
    ruleStrength: input.ruleStrength,
    severity: input.severity,
    confidence: input.confidence || 'high',
    criticalGate: input.criticalGate || false,
    scoreDeduction: computeDeduction(input.severity, input.ruleStrength),
    title: input.title,
    whatFound: input.whatFound,
    whyItMatters: input.whyItMatters,
    reviewerCheck: input.reviewerCheck,
    preSubmissionNote: input.preSubmissionNote,
    referenceRequirement: input.referenceRequirement,
    affectedActivities: input.affectedActivities,
    evidence: [],
  }
}

function isStartMilestone(task: any): boolean {
  const text = normalized(`${taskCode(task)} ${taskName(task)} ${task?.task_type || ''}`)
  return /NTP|NOTICE TO PROCEED|PROJECT START|START PROJECT|START MILE/.test(text)
}

function isFinishMilestone(task: any): boolean {
  const text = normalized(`${taskCode(task)} ${taskName(task)} ${task?.task_type || ''}`)
  return /END PROJECT|PROJECT COMPLETE|FINAL COMPLETION|CONTRACT COMPLETION|FINISH MILE/.test(text)
}

export interface OpenEndReview {
  unauthorized: any[]
  allowedStart: any[]
  allowedFinish: any[]
}

export function reviewOpenEndedLogic(analysis: QualityAnalysis): OpenEndReview {
  const tasks = Object.values(analysis.traceTasks || {})
  const relationships = Array.isArray(analysis.traceRelationships) ? analysis.traceRelationships : []
  const hasPredecessor = new Set(relationships.map(rel => String(rel?.task_id || '')).filter(Boolean))
  const hasSuccessor = new Set(relationships.map(rel => String(rel?.pred_task_id || '')).filter(Boolean))
  const candidates = tasks.length ? tasks : (analysis.noTies || [])
  const unauthorized: any[] = []
  const allowedStart: any[] = []
  const allowedFinish: any[] = []

  for (const task of candidates) {
    const id = taskId(task)
    const missingPred = relationships.length ? !hasPredecessor.has(id) : true
    const missingSucc = relationships.length ? !hasSuccessor.has(id) : true
    if (!missingPred && !missingSucc) continue
    const startAllowed = missingPred && isStartMilestone(task)
    const finishAllowed = missingSucc && isFinishMilestone(task)
    if (startAllowed) allowedStart.push(task)
    if (finishAllowed) allowedFinish.push(task)
    if ((missingPred && !startAllowed) || (missingSucc && !finishAllowed)) unauthorized.push(task)
  }
  return { unauthorized, allowedStart, allowedFinish }
}

function isProcurement(task: any): boolean {
  const text = normalized(`${taskCode(task)} ${taskName(task)} ${(task?.wbs_path || []).join(' ')}`)
  return /PROCURE|PROCUREMENT|SUBMITTAL|FABRICAT|DELIVER|MANUFACTUR|PURCHASE|LONG LEAD|LEAD TIME/.test(text)
}

function isDetailedWorkActivity(task: any): boolean {
  const type = normalized(task?.task_type)
  return !/MILE|LEVEL OF EFFORT|LOE|WBS SUMMARY/.test(type)
}

export function buildScheduleQualityFindings(analysis: QualityAnalysis): QualityFinding[] {
  const findings: QualityFinding[] = []
  const tasks = Object.values(analysis.traceTasks || {})
  const relationships = Array.isArray(analysis.traceRelationships) ? analysis.traceRelationships : []

  // P6 calculation method is a gate, not a cosmetic preference. Only evaluate
  // fields that are explicitly present in the submitted SCHEDOPTIONS table.
  const scheduleOptions = analysis.scheduleOptions || {}
  const retainedLogic = scheduleOptions.sched_retained_logic
  const progressOverride = scheduleOptions.sched_progress_override
  const retainedLogicDisabled = retainedLogic !== undefined && retainedLogic !== '' && isDisabled(retainedLogic)
  const progressOverrideEnabled = progressOverride !== undefined && progressOverride !== '' && isEnabled(progressOverride)
  if (retainedLogicDisabled || progressOverrideEnabled) findings.push(finding({
    primaryDomain: 'AR-07',
    crossReferencedDomains: ['AR-03', 'AR-02'],
    ruleStrength: 'REQUIRED',
    severity: 5,
    criticalGate: true,
    title: 'P6 scheduling calculation is not using Retained Logic',
    whatFound: progressOverrideEnabled
      ? 'The submitted SCHEDOPTIONS record shows Progress Override enabled.'
      : 'The submitted SCHEDOPTIONS record shows Retained Logic disabled.',
    whyItMatters: 'Progress Override can ignore unfinished predecessor work when calculating successor dates, disconnecting the update from the approved remaining network.',
    reviewerCheck: 'Set the project scheduling calculation method to Retained Logic, reschedule the project, and review every resulting out-of-sequence condition and date change.',
    preSubmissionNote: 'Recalculate the schedule using Retained Logic and explain legitimate out-of-sequence work in the update narrative.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.17 and 3.12(g) — use Retained Logic; Progress Override is not permitted for the federal benchmark.',
    affectedActivities: [],
  }))

  const projectSettings = analysis.projectSettings || {}
  const criticalPathType = String(projectSettings.critical_path_type || '')
  const criticalDefinitionIsNotLongest = Boolean(criticalPathType && !/LONG/i.test(criticalPathType))
  if (criticalDefinitionIsNotLongest) findings.push(finding({
    primaryDomain: 'AR-02',
    crossReferencedDomains: ['AR-07'],
    ruleStrength: 'REQUIRED',
    severity: 4,
    title: 'P6 critical activity definition is not Longest Path',
    whatFound: `The submitted PROJECT record defines critical activities using "${criticalPathType}" rather than Longest Path.`,
    whyItMatters: 'A float-threshold definition can label many activities critical without identifying the continuous driving chain to contract completion.',
    reviewerCheck: 'Set Define Critical Activities as Longest Path, reschedule, and trace the resulting chain to the governing completion milestone.',
    preSubmissionNote: 'Change the P6 critical activity definition to Longest Path and export a recalculated XER.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.12(f) — define critical activities as the longest path.',
    affectedActivities: [],
  }))

  const incompleteDetailed = tasks.filter(task => task?.status_code !== 'TK_Complete' && isDetailedWorkActivity(task))
  const p6LongestPathFlags = tasks.filter(task => isEnabled(task?.driving_path_flag))
  if (!criticalDefinitionIsNotLongest && incompleteDetailed.length && !p6LongestPathFlags.length) findings.push(finding({
    primaryDomain: 'AR-02',
    crossReferencedDomains: ['AR-07'],
    ruleStrength: 'REQUIRED',
    severity: 4,
    confidence: 'medium',
    title: 'P6 longest-path calculation is not evidenced in the XER',
    whatFound: 'No submitted activity carries the P6 driving-path flag, so the required longest-path calculation cannot be verified from this XER.',
    whyItMatters: 'Without a calculated longest path, the reviewer cannot reliably trace the continuous chain controlling the completion target.',
    reviewerCheck: 'Confirm that Define Critical Activities as Longest Path is enabled, reschedule, and verify that the controlling chain reaches the contract completion milestone.',
    preSubmissionNote: 'Enable and recalculate the P6 longest path, then export a new XER for review.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.12(f) — define critical activities as the longest path.',
    affectedActivities: [],
  }))

  const dataDate = dateOnly(analysis.dataDate)
  const statusDateConflicts = tasks.filter(task => {
    const status = String(task?.status_code || '')
    const actualStart = dateOnly(task?.act_start_date)
    const actualFinish = dateOnly(task?.act_end_date)
    const futureActual = Boolean(dataDate && ((actualStart && actualStart > dataDate) || (actualFinish && actualFinish > dataDate)))
    const finishBeforeStart = Boolean(actualStart && actualFinish && actualFinish < actualStart)
    if (futureActual || finishBeforeStart) return true
    if (status === 'TK_NotStart') return Boolean(actualStart || actualFinish)
    if (status === 'TK_Active') return !actualStart || Boolean(actualFinish)
    if (status === 'TK_Complete') return !actualStart || !actualFinish || Number(task?.remain_drtn_hr_cnt || 0) > 0
    return false
  })
  if (statusDateConflicts.length) findings.push(finding({
    primaryDomain: 'AR-03',
    crossReferencedDomains: ['AR-07'],
    ruleStrength: 'REQUIRED',
    severity: statusDateConflicts.length >= 10 ? 5 : 4,
    criticalGate: statusDateConflicts.length >= 10,
    title: 'Activity status, actual dates, and remaining duration are inconsistent',
    whatFound: `${statusDateConflicts.length} activit${statusDateConflicts.length === 1 ? 'y has' : 'ies have'} a direct status/date inconsistency, a future actual date, an actual finish before actual start, or remaining duration after completion.`,
    whyItMatters: 'Invalid status records corrupt progress, remaining work, relationship calculations, and the credibility of the update data date.',
    reviewerCheck: 'Reconcile each activity against daily reports and approved update records. Preserve truthful actual dates and correct the status or remaining duration.',
    preSubmissionNote: 'Correct the listed status/date inconsistencies before rescheduling and submission.',
    referenceRequirement: 'UFGS 01 32 01.00 10, update/statusing requirements — actual dates and remaining work must represent status through the update data date.',
    affectedActivities: affected(statusDateConflicts, 'Status/date inconsistency'),
  }))

  const openEnds = reviewOpenEndedLogic(analysis).unauthorized
  if (openEnds.length) findings.push(finding({
    primaryDomain: 'AR-03',
    ruleStrength: 'REQUIRED',
    severity: openEnds.length >= 10 ? 5 : 4,
    criticalGate: openEnds.length >= 10,
    title: 'Unauthorized open-ended network logic',
    whatFound: `${openEnds.length} activit${openEnds.length === 1 ? 'y has' : 'ies have'} missing predecessor or successor logic after excluding recognized project-start and project-finish milestones.`,
    whyItMatters: 'Open network ends allow work to float independently of the controlling path and can make dates and total float unreliable.',
    reviewerCheck: 'Identify whether each item is a legitimate approved endpoint. Connect every other activity to the network and rerun the schedule.',
    preSubmissionNote: 'Connect the listed activities to valid predecessor and successor logic, or document the approved endpoint exception.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.11 — only the recognized project start and project finish may remain open ended under the federal benchmark.',
    affectedActivities: affected(openEnds, 'Unauthorized network open end'),
  }))

  const outOfSequence = Array.isArray(analysis.outOfSequence) ? analysis.outOfSequence : []
  if (outOfSequence.length) findings.push(finding({
    primaryDomain: 'AR-03',
    crossReferencedDomains: ['AR-07'],
    ruleStrength: 'REQUIRED',
    severity: outOfSequence.length >= 20 ? 5 : 4,
    criticalGate: outOfSequence.length >= 20,
    title: 'Out-of-sequence progress requires correction or approved justification',
    whatFound: `${outOfSequence.length} activit${outOfSequence.length === 1 ? 'y records' : 'ies record'} progress before submitted predecessor logic was satisfied.`,
    whyItMatters: 'Unresolved out-of-sequence progress can disconnect the statused schedule from the logic used to calculate remaining dates and float.',
    reviewerCheck: 'Preserve truthful actual dates. Correct the remaining logic or provide the case-specific justification and narrative required by the reviewer.',
    preSubmissionNote: 'Reconcile every out-of-sequence condition and explain retained exceptions in the update narrative.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.13 and 3.3.17 — out-of-sequence progress requires case-specific approval and retained logic.',
    affectedActivities: affected(outOfSequence.map(item => item?.task || item), 'Out-of-sequence progress'),
  }))

  const negativeLags = relationships.filter(rel => Number(rel?.lag_hr_cnt || 0) < 0)
  const startToFinish = relationships.filter(rel => /(^|_)SF$/i.test(String(rel?.pred_type || '')))
  const prohibitedRelationships = [...negativeLags, ...startToFinish]
  if (prohibitedRelationships.length) {
    const byId = new Map(tasks.map(task => [taskId(task), task]))
    const related = prohibitedRelationships.flatMap(rel => [byId.get(String(rel?.pred_task_id)), byId.get(String(rel?.task_id))]).filter(Boolean)
    findings.push(finding({
      primaryDomain: 'AR-07',
      crossReferencedDomains: ['AR-03'],
      ruleStrength: 'REQUIRED',
      severity: 4,
      title: 'Prohibited leads or Start-to-Finish relationships detected',
      whatFound: `${negativeLags.length} negative lag${negativeLags.length === 1 ? '' : 's'} and ${startToFinish.length} Start-to-Finish relationship${startToFinish.length === 1 ? '' : 's'} were detected.`,
      whyItMatters: 'Leads and Start-to-Finish relationships can obscure the real work sequence and distort float.',
      reviewerCheck: 'Replace each prohibited relationship with explicit activities and conventional logic that represents the actual execution sequence.',
      preSubmissionNote: 'Remove negative lags and Start-to-Finish relationships before submission.',
      referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.16 — leads (negative lags) and Start-to-Finish relationships are prohibited.',
      affectedActivities: affected(related, 'Connected to prohibited relationship'),
    }))
  }

  const hardConstraints = tasks.filter(task => {
    const constraints = `${task?.cstr_type || ''} ${task?.cstr_type2 || ''}`.toUpperCase()
    return /MANDATORY|CS_MANDSTART|CS_MANDFIN/.test(constraints)
  })
  if (hardConstraints.length) findings.push(finding({
    primaryDomain: 'AR-07',
    crossReferencedDomains: ['AR-02'],
    ruleStrength: 'REQUIRED',
    severity: 5,
    criticalGate: true,
    title: 'Mandatory constraints override CPM network logic',
    whatFound: `${hardConstraints.length} activit${hardConstraints.length === 1 ? 'y carries' : 'ies carry'} a mandatory start or mandatory finish constraint.`,
    whyItMatters: 'Mandatory constraints can force dates independently of the network and prevent the longest path and float from describing the actual controlling sequence.',
    reviewerCheck: 'Remove the mandatory constraints and model the governing contractual or physical requirement with approved milestones and logic.',
    preSubmissionNote: 'Remove mandatory constraints before submission unless the governing specification and authorized reviewer expressly approve the exception.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.8 — mandatory constraints that ignore or affect network logic are prohibited.',
    affectedActivities: affected(hardConstraints, 'Mandatory constraint'),
  }))

  const otherConstraints = tasks.filter(task => {
    const values = [task?.cstr_type, task?.cstr_type2].filter(Boolean).map((value: unknown) => String(value).toUpperCase())
    if (!values.length) return false
    if (values.some(value => /MANDATORY|CS_MANDSTART|CS_MANDFIN/.test(value))) return false
    return !(isStartMilestone(task) || isFinishMilestone(task))
  })
  if (otherConstraints.length) findings.push(finding({
    primaryDomain: 'AR-07',
    crossReferencedDomains: ['AR-02'],
    ruleStrength: 'EXPECTED',
    severity: 3,
    title: 'Non-milestone constraints require contractual basis',
    whatFound: `${otherConstraints.length} non-endpoint activit${otherConstraints.length === 1 ? 'y carries' : 'ies carry'} a date constraint.`,
    whyItMatters: 'Unapproved constraints can consume or create float and mask the network-calculated sequence.',
    reviewerCheck: 'Verify each constraint against a contractual milestone or approved exception. Remove constraints that are being used to force planned dates.',
    preSubmissionNote: 'Retain only contractually supported or approved constraints and explain them in the narrative.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.8 — constrained dates beyond specified milestones require Contracting Officer approval.',
    affectedActivities: affected(otherConstraints, 'Constraint requires basis'),
  }))

  const wrongDurationType = tasks.filter(task => {
    const value = String(task?.duration_type || '').toUpperCase()
    if (!value) return false
    const compact = value.replace(/[^A-Z0-9]/g, '')
    const named = value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
    return !['DTFIXEDDUR2', 'DTFIXEDDRTN2'].includes(compact) && !/^FIXED DURATION\s*(?:&|AND)\s*UNITS$/.test(named)
  })
  if (wrongDurationType.length) findings.push(finding({
    primaryDomain: 'AR-07',
    ruleStrength: 'REQUIRED',
    severity: 4,
    title: 'Activity duration type differs from Fixed Duration & Units',
    whatFound: `${wrongDurationType.length} activit${wrongDurationType.length === 1 ? 'y uses' : 'ies use'} a duration type other than the federal P6 benchmark setting.`,
    whyItMatters: 'Inconsistent duration types can cause remaining duration, resource changes, and dates to react differently across the schedule.',
    reviewerCheck: 'Set the applicable activities to Fixed Duration & Units or document the governing approved exception.',
    preSubmissionNote: 'Correct activity duration types before submission.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.12(c) — Activity Duration Types must be Fixed Duration & Units.',
    affectedActivities: affected(wrongDurationType, 'Noncompliant duration type'),
  }))

  const wrongPercentType = tasks.filter(task => {
    const value = String(task?.complete_pct_type || '').toUpperCase()
    return value && !/PHYS/.test(value)
  })
  if (wrongPercentType.length) findings.push(finding({
    primaryDomain: 'AR-07',
    ruleStrength: 'REQUIRED',
    severity: 4,
    title: 'Percent Complete Type is not Physical',
    whatFound: `${wrongPercentType.length} activit${wrongPercentType.length === 1 ? 'y uses' : 'ies use'} Duration or Units percent complete instead of Physical percent complete.`,
    whyItMatters: 'A non-physical percent-complete method can report progress based on time or resource consumption rather than verified installed work.',
    reviewerCheck: 'Set activity Percent Complete Type to Physical and validate progress against the supporting update records.',
    preSubmissionNote: 'Correct Percent Complete Type and revalidate the submitted progress.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.12(d) — Percent Complete Types must be Physical.',
    affectedActivities: affected(wrongPercentType, 'Percent complete type is not Physical'),
  }))

  const calendars = Object.values(analysis.calendars || {})
  const usedCalendars = new Set(tasks.map(task => String(task?.clndr_id || '')).filter(Boolean))
  const nonProjectCalendars = calendars.filter(calendar => {
    if (!usedCalendars.has(String(calendar?.clndr_id || ''))) return false
    const type = String(calendar?.clndr_type || '').toUpperCase()
    return type && !/PROJECT|CA_PROJECT/.test(type)
  })
  if (nonProjectCalendars.length) findings.push(finding({
    primaryDomain: 'AR-07',
    ruleStrength: 'REQUIRED',
    severity: 4,
    title: 'Global or resource calendars are assigned to project activities',
    whatFound: `${nonProjectCalendars.length} used calendar${nonProjectCalendars.length === 1 ? ' is' : 's are'} not stored at the Project level.`,
    whyItMatters: 'Global or resource calendar changes can alter dates outside the controlled project schedule and undermine repeatability of the submitted XER.',
    reviewerCheck: 'Convert the used calendars to Project-level calendars and confirm holidays, workweeks, seasonal restrictions, cure periods, and acceptance calendars.',
    preSubmissionNote: 'Use Project-level calendars for submitted schedule activities.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.12(b) — calendars must be Project Level, not Global or Resource level.',
    affectedActivities: nonProjectCalendars.map((calendar: any) => ({ id: String(calendar.clndr_id), code: String(calendar.clndr_id), name: String(calendar.clndr_name || 'Unnamed calendar'), note: String(calendar.clndr_type || 'Non-project calendar') })),
  }))

  const nonEightHourCalendars = calendars.filter(calendar =>
    usedCalendars.has(String(calendar?.clndr_id || '')) && Number(calendar?.day_hr_cnt || 0) !== 8,
  )
  if (nonEightHourCalendars.length) findings.push(finding({
    primaryDomain: 'AR-07',
    ruleStrength: 'REQUIRED',
    severity: 4,
    title: 'Used calendars do not use the required 8-hour day',
    whatFound: `${nonEightHourCalendars.length} used calendar${nonEightHourCalendars.length === 1 ? ' has' : 's have'} Hours/Day set to a value other than 8.0.`,
    whyItMatters: 'Nonstandard Hours/Day settings alter displayed durations and conversions and prevent consistent review against the federal time-period basis.',
    reviewerCheck: 'Set Calendar Work Hours/Day to 8.0 and verify the associated work periods before recalculating the schedule.',
    preSubmissionNote: 'Correct the calendar Hours/Day setting and revalidate durations and dates.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.12(e) — retain the default time-period preferences and set Calendar Work Hours/Day to 8.0.',
    affectedActivities: nonEightHourCalendars.map((calendar: any) => ({ id: String(calendar.clndr_id), code: String(calendar.clndr_id), name: String(calendar.clndr_name || 'Unnamed calendar'), note: `${calendar.day_hr_cnt || '—'} hours/day` })),
  }))

  const missingCalendar = tasks.filter(task => isDetailedWorkActivity(task) && !String(task?.clndr_id || '').trim())
  if (missingCalendar.length) findings.push(finding({
    primaryDomain: 'AR-07',
    ruleStrength: 'REQUIRED',
    severity: 4,
    title: 'Detailed activities lack an assigned calendar',
    whatFound: `${missingCalendar.length} detailed activit${missingCalendar.length === 1 ? 'y does' : 'ies do'} not carry a calendar assignment in the submitted XER.`,
    whyItMatters: 'Without an assigned work calendar, planned dates and durations cannot be reproduced or checked against project working-time requirements.',
    reviewerCheck: 'Assign an approved project calendar to every detailed activity and recalculate the schedule.',
    preSubmissionNote: 'Complete calendar assignments before submission.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.10 and 3.12(b) — project calendars must represent the work and be assigned at project level.',
    affectedActivities: affected(missingCalendar, 'Missing activity calendar'),
  }))

  const longPositiveLags = relationships.filter(rel => Number(rel?.lag_hr_cnt || 0) >= 40)
  if (longPositiveLags.length) {
    const byId = new Map(tasks.map(task => [taskId(task), task]))
    const related = longPositiveLags.flatMap(rel => [byId.get(String(rel?.pred_task_id)), byId.get(String(rel?.task_id))]).filter(Boolean)
    findings.push(finding({
      primaryDomain: 'AR-07',
      crossReferencedDomains: ['AR-03'],
      ruleStrength: 'EXPECTED',
      severity: 3,
      title: 'Long positive lags require activity-based justification',
      whatFound: `${longPositiveLags.length} relationship${longPositiveLags.length === 1 ? ' contains' : 's contain'} a positive lag of at least five working days.`,
      whyItMatters: 'Long lags can hide curing, review, delivery, access, or waiting work that should be visible and statusable as activities.',
      reviewerCheck: 'Confirm the basis for each lag. Replace hidden work with named activities where progress must be measured or controlled.',
      preSubmissionNote: 'Replace unjustified long lags with explicit activities and explain any retained lag in the narrative.',
      referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.16 — lags must be reasonable and may not replace realistic durations or proper logic.',
      affectedActivities: affected(related, 'Connected by long positive lag'),
    }))
  }

  const excessiveDurations = tasks.filter(task => {
    if (!isDetailedWorkActivity(task) || isProcurement(task)) return false
    const calendar = (analysis.calendars || {})[String(task?.clndr_id || '')]
    const hoursPerDay = Math.max(1, Number(calendar?.day_hr_cnt || 8))
    return Number(task?.target_drtn_hr_cnt || 0) / hoursPerDay > 20
  })
  if (excessiveDurations.length) findings.push(finding({
    primaryDomain: 'AR-07',
    crossReferencedDomains: ['AR-09'],
    ruleStrength: 'EXPECTED',
    severity: excessiveDurations.length >= 20 ? 4 : 3,
    title: 'Non-procurement activities exceed the reviewable duration benchmark',
    whatFound: `${excessiveDurations.length} non-procurement activit${excessiveDurations.length === 1 ? 'y exceeds' : 'ies exceed'} 20 working days based on the submitted original duration.`,
    whyItMatters: 'Overly broad activities conceal progress, delay causes, workfront handoffs, and near-term accountability between updates.',
    reviewerCheck: 'Break the listed work into measurable, logic-connected activities or provide the project-specific basis for retaining the duration.',
    preSubmissionNote: 'Subdivide excessive durations into measurable work packages unless the governing specification permits the longer activity.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.2 — non-procurement original durations are not to exceed 20 workdays or 30 calendar days.',
    affectedActivities: affected(excessiveDurations, 'Original duration exceeds 20 workdays'),
  }))

  const zeroDurationWork = tasks.filter(task =>
    isDetailedWorkActivity(task) && Number(task?.target_drtn_hr_cnt || 0) <= 0,
  )
  if (zeroDurationWork.length) findings.push(finding({
    primaryDomain: 'AR-09',
    crossReferencedDomains: ['AR-07'],
    ruleStrength: 'EXPECTED',
    severity: 3,
    title: 'Detailed work activities carry zero original duration',
    whatFound: `${zeroDurationWork.length} non-milestone work activit${zeroDurationWork.length === 1 ? 'y has' : 'ies have'} zero original duration.`,
    whyItMatters: 'Zero-duration work behaves like a milestone and cannot represent measurable production, progress, or remaining work.',
    reviewerCheck: 'Convert true events to properly named milestones and assign realistic original durations to executable work activities.',
    preSubmissionNote: 'Correct zero-duration detailed activities before submission.',
    referenceRequirement: 'UFGS 01 32 01.00 10, activity-definition and duration requirements — detailed work must be measurable and duration-supported.',
    affectedActivities: affected(zeroDurationWork, 'Zero-duration detailed work'),
  }))

  const longLeadRisk = (analysis.longLeadItems || []).filter((item: any) =>
    item?.status_code !== 'TK_Complete' && Number(item?.phys_complete_pct || 0) < 100 && Number(item?.floatDays) <= 14,
  )
  if (longLeadRisk.length) findings.push(finding({
    primaryDomain: 'AR-05',
    ruleStrength: 'EXPECTED',
    severity: 3,
    title: 'Procurement items require near-term recovery or confirmation',
    whatFound: `${longLeadRisk.length} incomplete procurement item${longLeadRisk.length === 1 ? ' has' : 's have'} 14 calendar days of float or less. ${longLeadRisk.filter((item: any) => Number(item?.durationDays || 0) > 90).length} exceed the UFGS 90-calendar-day long-lead definition.`,
    whyItMatters: 'Procurement with little or negative float can become a controlling condition before fabrication, delivery, installation, and testing are visible to management.',
    reviewerCheck: 'Confirm submittal approval, release, fabrication, delivery, required-on-site date, installation successor, and supplier recovery information for each item.',
    preSubmissionNote: 'Update the procurement chain and narrative with current vendor dates, required-on-site dates, downstream installation, and mitigation.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.4 — critical submittal, approval, procurement, fabrication, and delivery activities must be represented; long lead is defined as more than 90 calendar days. The 14-day float threshold is a Control Lens early-warning parameter.',
    affectedActivities: affected(longLeadRisk, 'Long-lead item at risk'),
  }))

  const missingWbs = tasks.filter(task => isDetailedWorkActivity(task) && !(task?.wbs_id || task?.wbs_name || task?.wbs_path?.length))
  if (tasks.length && missingWbs.length / tasks.length >= 0.1) findings.push(finding({
    primaryDomain: 'AR-09',
    ruleStrength: 'EXPECTED',
    severity: 3,
    title: 'Material activity population lacks WBS assignment',
    whatFound: `${missingWbs.length} of ${tasks.length} submitted activities do not carry a usable WBS assignment.`,
    whyItMatters: 'Without a dependable WBS, the schedule cannot be filtered and reconciled consistently by project phase, area, system, or responsibility.',
    reviewerCheck: 'Assign the affected activities to the approved project WBS and confirm the hierarchy matches the control and reporting structure.',
    preSubmissionNote: 'Complete the WBS assignment before submission.',
    referenceRequirement: 'U.S. project-control benchmark — the activity network must be organized at a level that supports planning, execution, and review; project-specific coding requirements govern.',
    affectedActivities: affected(missingWbs, 'Missing usable WBS assignment'),
  }))

  const overlengthIds = tasks.filter(task => taskCode(task).length > 10)
  if (overlengthIds.length) findings.push(finding({
    primaryDomain: 'AR-09',
    ruleStrength: 'REQUIRED',
    severity: 4,
    title: 'Activity IDs exceed the 10-character federal limit',
    whatFound: `${overlengthIds.length} activity ID${overlengthIds.length === 1 ? ' exceeds' : 's exceed'} 10 characters.`,
    whyItMatters: 'Overlength identifiers are incompatible with the required federal schedule data structure and can prevent clean transfer into downstream systems.',
    reviewerCheck: 'Revise the listed Activity IDs to 10 characters or fewer using the approved project naming convention.',
    preSubmissionNote: 'Correct overlength Activity IDs before submission and document approved ID changes in an update review.',
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.12(i) — Activity IDs must not exceed 10 characters.',
    affectedActivities: affected(overlengthIds, 'Activity ID exceeds 10 characters'),
  }))

  const activityCodeTypes = Object.values(analysis.activityCodeTypes || {})
  if (activityCodeTypes.length) {
    const requiredCodeGroups = [
      { key: 'WRKP', match: /\bWRKP\b|WORKER/ },
      { key: 'RESP', match: /\bRESP\b|RESPONS/ },
      { key: 'AREA', match: /\bAREA\b/ },
      { key: 'MODF', match: /\bMODF\b|MODIF|CHANGE/ },
      { key: 'BIDI', match: /\bBIDI\b|BID ITEM|CLIN/ },
      { key: 'PHAS', match: /\bPHAS\b|PHASE/ },
      { key: 'CATW', match: /\bCATW\b|CATEGORY OF WORK/ },
      { key: 'FOW', match: /\bFOW\b|FEATURE OF WORK/ },
    ]
    const presentText = activityCodeTypes.map(type => normalized(type?.actv_code_type)).join(' | ')
    const missingGroups = requiredCodeGroups.filter(group => !group.match.test(presentText)).map(group => group.key)
    if (missingGroups.length) findings.push(finding({
      primaryDomain: 'AR-09',
      ruleStrength: 'REQUIRED',
      severity: 4,
      title: 'Required SDEF activity-code dictionary is incomplete',
      whatFound: `The submitted activity-code dictionary does not evidence these standard groups: ${missingGroups.join(', ')}.`,
      whyItMatters: 'Missing standard codes prevent consistent filtering, responsibility assignment, CLIN reconciliation, phase reporting, and definable-feature-of-work control.',
      reviewerCheck: 'Establish the project-level SDEF code dictionary and assign the applicable codes to schedule activities.',
      preSubmissionNote: 'Complete the federal activity-code structure before submission.',
      referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.7 and 3.12(a) — use the mandatory SDEF coding structure and keep Activity Codes at Project level.',
      affectedActivities: [],
    }))

    const nonProjectCodeTypes = activityCodeTypes.filter(type => {
      const scope = String(type?.actv_code_type_scope || '').toUpperCase()
      return scope && scope !== 'AS_PROJECT'
    })
    if (nonProjectCodeTypes.length) findings.push(finding({
      primaryDomain: 'AR-09',
      ruleStrength: 'REQUIRED',
      severity: 4,
      title: 'Activity-code dictionaries are not Project level',
      whatFound: `${nonProjectCodeTypes.length} submitted activity-code type${nonProjectCodeTypes.length === 1 ? ' is' : 's are'} Global, EPS, or otherwise outside Project scope.`,
      whyItMatters: 'Non-project activity codes are not controlled within the submitted project and can change or map inconsistently across systems.',
      reviewerCheck: 'Recreate the affected activity-code types at Project level and verify all assignments.',
      preSubmissionNote: 'Use Project-level activity codes before submission.',
      referenceRequirement: 'UFGS 01 32 01.00 10, 3.12(a) — Activity Codes must be Project Level, not Global or EPS level.',
      affectedActivities: nonProjectCodeTypes.map((type: any) => ({ id: String(type.actv_code_type_id), code: String(type.actv_code_type_id), name: String(type.actv_code_type || 'Unnamed code type'), note: String(type.actv_code_type_scope || 'Non-project scope') })),
    }))
  }

  return findings
}
