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
import type { ContractDates, ScheduleRequirementsBasis } from '../projectStore'
import {
  detectFinalCompletionTarget,
  isAdministrativeTermMilestone,
  isPostCompletionAdministrativeWork,
  taskFinishDate,
  taskIdentity,
} from '../completionBoundary'

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
  reviewBasis?: {
    contractDates?: ContractDates
    scheduleRequirements?: ScheduleRequirementsBasis
  }
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

function isMilestone(task: any): boolean {
  return /MILE/.test(normalized(task?.task_type)) || isStartMilestone(task) || isFinishMilestone(task)
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

function isReviewApprovalTask(task: any): boolean {
  const text = normalized(`${taskCode(task)} ${taskName(task)} ${(task?.wbs_path || []).join(' ')}`)
  return /REVIEW|APPROV|ACCEPT/.test(text) && /SUBMITTAL|SHOP DRAWING|RFI|DOCUMENT|OWNER|AE|A E|DESIGN|REVIEW|APPROV/.test(text)
}

function calendarWorkingDays(calendar: any): number {
  const dayHours = Number(calendar?.day_hr_cnt || 0)
  const weekHours = Number(calendar?.week_hr_cnt || 0)
  if (dayHours > 0 && weekHours > 0) return Math.max(0, Math.min(7, Math.round(weekHours / dayHours)))
  const name = normalized(calendar?.clndr_name)
  if (/7 DAY|SEVEN DAY|24 7/.test(name)) return 7
  if (/6 DAY|SIX DAY|MON SAT/.test(name)) return 6
  if (/5 DAY|FIVE DAY|MON FRI/.test(name)) return 5
  return 0
}

function contractualDates(dates?: ContractDates): Set<string> {
  const result = new Set<string>()
  for (const value of [
    dates?.ntp,
    dates?.substantialCompletion,
    dates?.originalContractCompletion,
    dates?.currentSubstantialCompletion,
    dates?.currentFinalCompletion,
    ...(dates?.contractMilestones || []).flatMap(item => [item.date, item.currentDate]),
  ]) {
    const normalizedDate = dateOnly(value)
    if (normalizedDate) result.add(normalizedDate)
  }
  return result
}

function constraintDates(task: any): string[] {
  return [task?.cstr_date, task?.cstr_date2].map(dateOnly).filter(Boolean)
}

export function buildScheduleQualityFindings(analysis: QualityAnalysis): QualityFinding[] {
  const findings: QualityFinding[] = []
  const tasks = Object.values(analysis.traceTasks || {})
  const relationships = Array.isArray(analysis.traceRelationships) ? analysis.traceRelationships : []
  const isPrimavera = analysis.sourceFormat !== 'MS_PROJECT_XML'
  const basisDates = analysis.reviewBasis?.contractDates
  const requirements = analysis.reviewBasis?.scheduleRequirements
  const authorizedDates = contractualDates(basisDates)

  const finalCompletionTarget = detectFinalCompletionTarget(tasks)
  if (!finalCompletionTarget?.task || !finalCompletionTarget.date) findings.push(finding({
    primaryDomain: 'AR-01',
    crossReferencedDomains: ['AR-02', 'AR-03'],
    ruleStrength: 'REQUIRED',
    severity: 5,
    criticalGate: true,
    title: 'Final Completion / End Project milestone is not identified',
    whatFound: 'The submitted schedule does not contain a dated finish milestone clearly identified as Final Completion, End Project, Project Completion, Contract Completion, or Final Acceptance.',
    whyItMatters: 'A project-level administrative term or latest activity date cannot define the construction completion forecast. Without an explicit completion milestone, delay and controlling-path conclusions are not reliable.',
    reviewerCheck: 'Add or correctly identify the milestone that closes the construction CPM network, tie the controlling completion work into it, and recalculate the schedule.',
    preSubmissionNote: 'Establish the explicit Final Completion / End Project milestone before submission.',
    referenceRequirement: 'Project-specific final completion requirement and approved CPM completion network.',
    affectedActivities: [],
  }))

  if (finalCompletionTarget?.task && finalCompletionTarget.date) {
    const finalDate = dateOnly(finalCompletionTarget.date)
    const finalId = taskIdentity(finalCompletionTarget.task)
    const postFinal = tasks.filter(task => {
      if (taskIdentity(task) === finalId) return false
      const finish = dateOnly(taskFinishDate(task))
      return Boolean(finish && finalDate && finish > finalDate)
    })
    const administrative = postFinal.filter(isPostCompletionAdministrativeWork)
    const operational = postFinal.filter(task => !isPostCompletionAdministrativeWork(task))

    if (operational.length) findings.push(finding({
      primaryDomain: 'AR-01',
      crossReferencedDomains: ['AR-02', 'AR-03'],
      ruleStrength: 'REQUIRED',
      severity: 5,
      criticalGate: true,
      title: 'Project work is scheduled after Final Completion',
      whatFound: `${operational.length} non-administrative activit${operational.length === 1 ? 'y finishes' : 'ies finish'} after ${taskCode(finalCompletionTarget.task)} — ${taskName(finalCompletionTarget.task)}.`,
      whyItMatters: 'Final Completion must close the project delivery network. Operational work after that milestone means the completion milestone is misplaced, mislabeled, or not logically tied to all remaining project scope.',
      reviewerCheck: 'Move Final Completion to the true end of project work or correct the remaining-work logic. Do not use an administrative term date as the project completion forecast.',
      preSubmissionNote: 'Resolve every non-administrative activity scheduled beyond Final Completion.',
      referenceRequirement: 'Project-specific final completion requirement and approved CPM completion network.',
      affectedActivities: affected(operational, 'Finishes after the Final Completion / End Project milestone'),
    }))

    if (administrative.length) {
      const adminMilestones = tasks.filter(isAdministrativeTermMilestone)
      const adminMilestoneIds = new Set(adminMilestones.map(taskIdentity))
      const successors = new Map<string, string[]>()
      for (const rel of relationships) {
        const predecessor = String(rel?.pred_task_id || '')
        const successor = String(rel?.task_id || '')
        if (!predecessor || !successor) continue
        successors.set(predecessor, [...(successors.get(predecessor) || []), successor])
      }
      const reachesAdminTerm = (start: string): boolean => {
        const queue = [start]
        const visited = new Set<string>()
        while (queue.length) {
          const current = queue.shift()!
          if (visited.has(current)) continue
          visited.add(current)
          if (current !== start && adminMilestoneIds.has(current)) return true
          queue.push(...(successors.get(current) || []))
        }
        return false
      }
      const unconnected = administrative.filter(task => {
        const id = taskIdentity(task)
        return !adminMilestoneIds.has(id) && !reachesAdminTerm(id)
      })

      if (!adminMilestones.length || unconnected.length) findings.push(finding({
        primaryDomain: 'AR-01',
        crossReferencedDomains: ['AR-03', 'AR-07'],
        ruleStrength: 'REQUIRED',
        severity: 4,
        title: 'Post-completion administrative closeout is not tied to an administrative-term milestone',
        whatFound: !adminMilestones.length
          ? `${administrative.length} final-payment, retainage, or closeout-document activit${administrative.length === 1 ? 'y is' : 'ies are'} scheduled after Final Completion, but no Administrative Term milestone is identified.`
          : `${unconnected.length} post-completion administrative activit${unconnected.length === 1 ? 'y does' : 'ies do'} not drive the identified Administrative Term milestone.`,
        whyItMatters: 'Final invoice, retainage release, and closeout-document review may remain after Final Completion, but they belong to a separate administrative closeout chain and must not extend the project completion forecast.',
        reviewerCheck: 'Tie the applicable administrative closeout activities to a clearly labeled Administrative Term milestone, or remove the administrative term if the contract does not require it.',
        preSubmissionNote: 'Separate administrative closeout from the Final Completion network and complete its logic.',
        referenceRequirement: 'Project-specific administrative closeout, final payment, retainage, and document-acceptance provisions.',
        affectedActivities: affected(unconnected.length ? unconnected : administrative, 'Post-completion administrative closeout requires a separate administrative-term chain'),
      }))
      else findings.push(finding({
        primaryDomain: 'AR-01',
        crossReferencedDomains: ['AR-03'],
        ruleStrength: 'EXPECTED',
        severity: 2,
        title: 'Administrative closeout continues after Final Completion',
        whatFound: `${administrative.length} final-payment, retainage, or closeout-document activit${administrative.length === 1 ? 'y is' : 'ies are'} scheduled after Final Completion and tied to the separate Administrative Term milestone.`,
        whyItMatters: 'These activities are visible for administrative control but are excluded from the project completion forecast and contractual delay calculation.',
        reviewerCheck: 'Confirm that these are administrative closeout obligations only and that no remaining construction or commissioning scope is hidden in this chain.',
        preSubmissionNote: 'Confirm the post-completion administrative chain and retain it separately from the Final Completion network.',
        referenceRequirement: 'Project-specific administrative closeout, final payment, retainage, and document-acceptance provisions.',
        affectedActivities: affected(administrative, 'Administrative closeout after Final Completion; excluded from project delay'),
      }))
    }
  }

  if (!basisDates?.originalContractCompletion) findings.push(finding({
    primaryDomain: 'AR-01',
    ruleStrength: 'REQUIRED',
    severity: 5,
    criticalGate: true,
    title: 'Contract completion date is not established in the project basis',
    whatFound: 'The project basis does not contain an original contractual completion date. The P6 administrative term date is not a substitute.',
    whyItMatters: 'Forecast variance and delay cannot be stated reliably until the governing contractual completion date and approved modifications are recorded.',
    reviewerCheck: 'Record the original contractual completion date and any approved time modifications from an authorized source before making an approval decision.',
    preSubmissionNote: 'Complete the contractual date basis before submission review.',
    referenceRequirement: 'Project-specific contract completion requirement; the authorized contract basis governs.',
    affectedActivities: [],
  }))

  const reviewDuration = Number(requirements?.reviewApprovalDuration || 0)
  const reviewDurationBasis = requirements?.reviewApprovalDurationBasis || 'NOT_SET'
  if (!reviewDuration || reviewDurationBasis === 'NOT_SET') findings.push(finding({
    primaryDomain: 'AR-01',
    crossReferencedDomains: ['AR-07'],
    ruleStrength: 'REQUIRED',
    severity: 5,
    criticalGate: true,
    title: 'Contract review and approval duration is not captured',
    whatFound: 'The project basis does not state the contractual review/approval duration or whether it is measured in calendar days or working days.',
    whyItMatters: 'The schedule cannot validate owner/architect review activities without the governing review period.',
    reviewerCheck: 'Record the contract review duration and day basis, then rerun the schedule review.',
    preSubmissionNote: 'Capture the review/approval duration from the governing contract requirement.',
    referenceRequirement: requirements?.specificationSection || 'Project-specific review and approval requirement.',
    affectedActivities: [],
  }))

  const reviewTasks = tasks.filter(isReviewApprovalTask)
  if (reviewDuration > 0 && reviewDurationBasis !== 'NOT_SET') {
    if (!reviewTasks.length) findings.push(finding({
      primaryDomain: 'AR-01',
      crossReferencedDomains: ['AR-05', 'AR-07'],
      ruleStrength: 'REQUIRED',
      severity: 5,
      criticalGate: true,
      title: 'Required review and approval activities are not represented',
      whatFound: `No identifiable review/approval activity was found for the contract allowance of ${reviewDuration} ${reviewDurationBasis === 'CALENDAR_DAYS' ? 'calendar' : 'working'} days.`,
      whyItMatters: 'Omitting the review period can pull procurement, release, fabrication, and downstream construction earlier than the contract permits.',
      reviewerCheck: 'Add explicit review/approval activities, assign the correct calendar, duration, predecessor, and successor logic, and recalculate the schedule.',
      preSubmissionNote: 'Represent the contractual review/approval period as statusable schedule activities.',
      referenceRequirement: requirements?.specificationSection || 'Project-specific review and approval requirement.',
      affectedActivities: [],
    }))
    else {
      const mismatched = reviewTasks.filter(task => {
        const calendar = (analysis.calendars || {})[String(task?.clndr_id || '')]
        const hoursPerDay = Math.max(1, Number(calendar?.day_hr_cnt || 8))
        const taskDays = Number(task?.target_drtn_hr_cnt || 0) / hoursPerDay
        const durationMismatch = Math.abs(taskDays - reviewDuration) > 0.01
        const calendarMismatch = reviewDurationBasis === 'CALENDAR_DAYS' && calendarWorkingDays(calendar) !== 7
        return durationMismatch || calendarMismatch
      })
      if (mismatched.length) findings.push(finding({
        primaryDomain: 'AR-01',
        crossReferencedDomains: ['AR-07', 'AR-05'],
        ruleStrength: 'REQUIRED',
        severity: 5,
        criticalGate: true,
        title: 'Review and approval activities do not match the contract allowance',
        whatFound: `${mismatched.length} identified review/approval activit${mismatched.length === 1 ? 'y does' : 'ies do'} not use the required ${reviewDuration} ${reviewDurationBasis === 'CALENDAR_DAYS' ? 'calendar-day' : 'working-day'} duration${reviewDurationBasis === 'CALENDAR_DAYS' ? ' on a 7-day calendar' : ''}.`,
        whyItMatters: 'An incorrect review allowance can distort procurement release, fabrication, delivery, float, and the controlling path.',
        reviewerCheck: 'Correct the activity durations and calendars to the project-basis requirement, then recalculate the schedule.',
        preSubmissionNote: 'Align all applicable review/approval activities with the contract allowance.',
        referenceRequirement: requirements?.specificationSection || 'Project-specific review and approval requirement.',
        affectedActivities: affected(mismatched, 'Review duration or calendar differs from project basis'),
      }))
    }
  }

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
  const criticalDefinitionIsNotLongest = isPrimavera && Boolean(criticalPathType && !/LONG/i.test(criticalPathType))
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
  if (isPrimavera && !criticalDefinitionIsNotLongest && incompleteDetailed.length && !p6LongestPathFlags.length) findings.push(finding({
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

  const constrainedTasks = tasks.filter(task => [task?.cstr_type, task?.cstr_type2].some(value => String(value || '').trim()))
  const unauthorizedConstraints = constrainedTasks.filter(task => {
    const dates = constraintDates(task)
    return !isMilestone(task) || dates.length === 0 || dates.some(value => !authorizedDates.has(value))
  })
  if (unauthorizedConstraints.length) findings.push(finding({
    primaryDomain: 'AR-07',
    crossReferencedDomains: ['AR-02', 'AR-01'],
    ruleStrength: 'REQUIRED',
    severity: 5,
    criticalGate: true,
    title: 'Schedule constraints are not supported by contractual milestone dates',
    whatFound: `${unauthorizedConstraints.length} constrained activit${unauthorizedConstraints.length === 1 ? 'y is' : 'ies are'} not a milestone tied to a date recorded in the project contract basis.`,
    whyItMatters: 'Constraints can force dates and float independently of the CPM network. Only authorized contractual milestone constraints may remain without a documented exception.',
    reviewerCheck: 'Remove each unsupported constraint or record the authorized contractual milestone and date in the project basis, then recalculate the schedule.',
    preSubmissionNote: 'Retain constraints only on authorized contractual milestones and explain approved exceptions.',
    referenceRequirement: requirements?.specificationSection || 'Project-specific contractual milestone and constraint requirements govern.',
    affectedActivities: affected(unauthorizedConstraints, 'Constraint is not supported by the project contract basis'),
  }))

  const wrongDurationType = isPrimavera ? tasks.filter(task => {
    const value = String(task?.duration_type || '').toUpperCase()
    if (!value) return false
    const compact = value.replace(/[^A-Z0-9]/g, '')
    const named = value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
    return !['DTFIXEDDUR2', 'DTFIXEDDRTN2'].includes(compact) && !/^FIXED DURATION\s*(?:&|AND)\s*UNITS$/.test(named)
  }) : []
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
  const calendarById = new Map(calendars.map((calendar: any) => [String(calendar?.clndr_id || ''), calendar]))
  const missingCalendarPolicies = [
    requirements?.saturdayWorkPolicy === undefined || requirements?.saturdayWorkPolicy === 'NOT_SET' ? 'Saturday work' : '',
    requirements?.weatherCalendarPolicy === undefined || requirements?.weatherCalendarPolicy === 'NOT_SET' ? 'weather calendar' : '',
    requirements?.procurementCalendarBasis === undefined || requirements?.procurementCalendarBasis === 'NOT_SET' ? 'procurement calendar' : '',
  ].filter(Boolean)
  if (missingCalendarPolicies.length) findings.push(finding({
    primaryDomain: 'AR-07',
    crossReferencedDomains: ['AR-01'],
    ruleStrength: 'REQUIRED',
    severity: 5,
    criticalGate: true,
    title: 'Contract calendar requirements are not fully captured',
    whatFound: `The project basis does not establish: ${missingCalendarPolicies.join(', ')}.`,
    whyItMatters: 'Calendar compliance cannot be judged without knowing the permitted workweek, weather-calendar requirement, and procurement time basis.',
    reviewerCheck: 'Complete the project calendar requirements and rerun the schedule review.',
    preSubmissionNote: 'Record the governing calendar policies before approval review.',
    referenceRequirement: requirements?.specificationSection || 'Project-specific work-calendar requirements govern.',
    affectedActivities: [],
  }))

  if (requirements?.saturdayWorkPolicy === 'PROHIBITED') {
    const saturdayWork = tasks.filter(task => {
      if (!isDetailedWorkActivity(task) || isProcurement(task) || isReviewApprovalTask(task)) return false
      const calendar = calendarById.get(String(task?.clndr_id || ''))
      return calendarWorkingDays(calendar) >= 6
    })
    if (saturdayWork.length) findings.push(finding({
      primaryDomain: 'AR-07',
      ruleStrength: 'REQUIRED',
      severity: 5,
      criticalGate: true,
      title: 'Construction activities use calendars that permit Saturday work',
      whatFound: `${saturdayWork.length} construction activit${saturdayWork.length === 1 ? 'y is' : 'ies are'} assigned to a six- or seven-day calendar although Saturday work is prohibited by the project basis.`,
      whyItMatters: 'Permitting unapproved Saturday work can calculate earlier dates and additional float that are not achievable under the contract workweek.',
      reviewerCheck: 'Assign the approved construction calendar or record an authorized calendar exception in the project basis.',
      preSubmissionNote: 'Remove unapproved Saturday work from construction calendars and recalculate the schedule.',
      referenceRequirement: requirements.specificationSection || 'Project-specific permitted workweek requirement.',
      affectedActivities: affected(saturdayWork, 'Assigned calendar permits Saturday work'),
    }))
  }

  if (requirements?.weatherCalendarPolicy === 'REQUIRED') {
    const weatherCalendars = calendars.filter((calendar: any) =>
      usedCalendars.has(String(calendar?.clndr_id || ''))
      && /WEATHER|ADVERSE|WINTER|RAIN|SEASON/.test(normalized(calendar?.clndr_name)),
    )
    if (!weatherCalendars.length) findings.push(finding({
      primaryDomain: 'AR-07',
      ruleStrength: 'REQUIRED',
      severity: 5,
      criticalGate: true,
      title: 'Required weather calendar is not assigned',
      whatFound: 'No used project calendar is identified as the required weather/adverse-condition calendar.',
      whyItMatters: 'Weather-sensitive work may otherwise be calculated on days the contract does not recognize as workable.',
      reviewerCheck: 'Create or identify the approved weather calendar, assign it to applicable activities, and verify the contract weather allowances.',
      preSubmissionNote: 'Assign the required weather calendar before submission.',
      referenceRequirement: requirements.specificationSection || 'Project-specific weather-calendar requirement.',
      affectedActivities: [],
    }))
  }

  if (requirements?.procurementCalendarBasis === 'SEVEN_DAY') {
    const procurementNotSevenDay = tasks.filter(task => {
      if (!isProcurement(task) || !isDetailedWorkActivity(task)) return false
      const calendar = calendarById.get(String(task?.clndr_id || ''))
      return calendarWorkingDays(calendar) !== 7
    })
    if (procurementNotSevenDay.length) findings.push(finding({
      primaryDomain: 'AR-07',
      crossReferencedDomains: ['AR-05'],
      ruleStrength: 'REQUIRED',
      severity: 5,
      criticalGate: true,
      title: 'Procurement activities are not assigned to a seven-day calendar',
      whatFound: `${procurementNotSevenDay.length} procurement activit${procurementNotSevenDay.length === 1 ? 'y is' : 'ies are'} not assigned to a verified seven-day calendar.`,
      whyItMatters: 'Calendar-day submittal, fabrication, shipping, and delivery periods will be misstated when calculated on a five- or six-day work calendar.',
      reviewerCheck: 'Assign the approved seven-day procurement calendar to the applicable procurement chain and recalculate the schedule.',
      preSubmissionNote: 'Correct procurement calendar assignments before submission.',
      referenceRequirement: requirements.specificationSection || 'Project-specific procurement calendar requirement.',
      affectedActivities: affected(procurementNotSevenDay, 'Procurement calendar is not seven-day'),
    }))
  }

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
    referenceRequirement: 'UFGS 01 32 01.00 10, 3.3.4 — critical submittal, approval, procurement, fabrication, and delivery activities must be represented; long lead is defined as more than 90 calendar days. The 14-day float threshold is an early-warning review parameter.',
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
