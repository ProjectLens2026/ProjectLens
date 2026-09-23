// =============================================================================
// src/lib/approval-readiness/evaluator.ts
// =============================================================================
// Approval Readiness combines two evidence streams:
//   1) Construction / relationship review findings from runConstructionReview()
//   2) CL Path Intelligence — nature-of-work, readiness, completion and path
//      credibility review.
//
// The score is secondary. A material path/turnover gate can make the schedule
// NOT READY even when the arithmetic score remains high.
// =============================================================================

import type {
  ApprovalFinding, ApprovalReadinessResult, ApprovalMode, ApprovalDomainId,
  RuleStrength, ReadinessStatus,
} from './types'
import { runConstructionReview, type ReviewFinding } from '../construction/engine'
import { analyzeCLPathIntelligence, type CLPathFinding, type CLSeverity } from '../construction/clPathIntelligence'
import { computeDeduction, FRAMEWORK_VERSION, type ProjectTypeKey } from './framework'
import { scoreDomains, totalScore, gradeAndRecommendation, materialityCounts } from './scoring'
import { evaluateGates } from './gates'
import { buildScheduleQualityFindings } from './qualityRules'

const ENGINE_VERSION = '2.1.0'

interface AnalysisInput {
  traceTasks?: any
  traceRelationships?: any
  wbsNodes?: any
  allTasksForPaths?: any[]
  negativeFloat?: number
  totalActivities?: number
  noTies?: any[]
  longLeadAtRisk?: number
  longLeadItems?: any[]
  outOfSequence?: any[]
  criticalDrivers?: any[]
  longestPathActivities?: any[]
  calendars?: Record<string, any>
  projectSettings?: Record<string, string>
  scheduleOptions?: Record<string, string>
  activityCodeTypes?: Record<string, any>
  taskActivityCodes?: any[]
}

function norm(s: any): string {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function mapDomain(f: ReviewFinding): ApprovalDomainId {
  const sys = (f.system || '').toUpperCase()
  const name = (f.activityName || '').toLowerCase()
  const target = (f.targetMilestone || '').toUpperCase()
  const activityClass = (f.activityClass || '').toUpperCase()

  if (f.findingKind === 'KEY_MILESTONE_SUGGESTION') {
    if (/IST|COMMISSION|CONTROLS|READY FOR SERVICE/.test(target) || /IST|COMMISSION|CONTROLS|READY FOR SERVICE/.test(sys)) return 'AR-06'
    return 'AR-01'
  }
  if (f.bucket === 'MILESTONE_INTEGRITY') {
    if (/turnover|substantial|final|ready for service|occupancy/.test(name)) return 'AR-08'
    return 'AR-01'
  }
  if (/IST|FPT|BMS|COMMISSION/.test(sys) || /IST|FPT|COMMISSION/.test(target) || /IST|FPT|COMMISSION/.test(activityClass) || /commission|startup|functional|energiz|ist\b/.test(name)) return 'AR-06'
  if (f.phase === 'PROCUREMENT') return 'AR-05'
  if (f.bucket === 'CONSTRUCTION_SEQUENCE' || f.phase === 'CONSTRUCTION') return 'AR-04'
  if (f.bucket === 'LIKELY_INCORRECT_RELATIONSHIP' || f.bucket === 'PHASING_LOCATION') return 'AR-03'
  return 'AR-03'
}

function strengthFor(f: ReviewFinding): RuleStrength {
  if (f.ruleStrengthHint) return f.ruleStrengthHint
  switch (f.bucket) {
    case 'CONSTRUCTION_SEQUENCE': return 'REQUIRED'
    case 'MILESTONE_INTEGRITY': return 'REQUIRED'
    case 'ACTUAL_VS_RELATIONSHIP':
      if (f.phase === 'PROCUREMENT' || f.phase === 'PRECONSTRUCTION') return 'ADVISORY'
      return 'EXPECTED'
    case 'LIKELY_INCORRECT_RELATIONSHIP': return 'EXPECTED'
    case 'PHASING_LOCATION': return 'ADVISORY'
    case 'NEEDS_REVIEW': return 'ADVISORY'
    default: return 'ADVISORY'
  }
}

// Consolidate by issue meaning, not by every individual predecessor. Approval
// Readiness should show the reviewer the concern once and keep the affected
// activities as evidence underneath it.
function consolidationKey(f: ReviewFinding): string {
  if (f.findingKind === 'KEY_MILESTONE_SUGGESTION') {
    return `REC:${f.findingKind}:${f.targetMilestone || f.system || f.activityId}`
  }
  return [
    'ISSUE', f.bucket, f.findingKind || '', f.phase || 'NA',
    f.discipline || 'General', f.system || 'General', norm(f.headline),
  ].join('|')
}

function impactForDomain(domain: ApprovalDomainId): string {
  switch (domain) {
    case 'AR-01': return 'If milestone support is incomplete or inconsistent, the contract-date forecast may not represent the work that must actually be completed.'
    case 'AR-02': return 'If the controlling chain does not represent the real work required for completion, critical/longest-path reporting and float-based decisions may be misleading.'
    case 'AR-03': return 'Contradictory, missing, or misapplied logic reduces confidence that schedule dates and float represent an executable network.'
    case 'AR-04': return 'A schedule can be mathematically valid while sequencing work in a way that is not physically credible. That weakens the schedule as a control tool.'
    case 'AR-05': return 'If procurement is not tied to installation and required-on-site dates, long-lead risk can remain hidden until it affects construction.'
    case 'AR-06': return 'Startup, testing, commissioning, and utility readiness must support downstream acceptance. Missing links can make operational readiness appear earlier than it is.'
    case 'AR-07': return 'Calendar, lag, constraint, or duration conditions can distort dates and float if they do not reflect the intended execution plan.'
    case 'AR-08': return 'The schedule may show an area or project complete before the applicable turnover, acceptance, training, or readiness work is actually finished.'
    case 'AR-09': return 'Weak activity structure or coding makes the schedule harder to review, update, trace, and use as a dependable project-control record.'
    default: return 'This condition may reduce confidence in the submitted schedule as a project-control baseline.'
  }
}

function pathProfile(title: string, severity: CLSeverity): {
  primaryDomain: ApprovalDomainId
  crossReferencedDomains: ApprovalDomainId[]
  ruleStrength: RuleStrength
  findingSeverity: 1 | 2 | 3 | 4 | 5
  kind: ApprovalFinding['kind']
  why: string
  reviewer: string
  preSubmission: string
  reference: string
} {
  const t = title.toLowerCase()

  if (t.includes('substantial completion lacks')) return {
    primaryDomain: 'AR-08', crossReferencedDomains: ['AR-02', 'AR-06'], ruleStrength: 'REQUIRED', findingSeverity: 5, kind: 'FINDING',
    why: 'The completion milestone can be reached in the submitted network without demonstrating the readiness work that normally establishes turnover and acceptance. That can make the completion forecast look achievable before the facility is actually ready.',
    reviewer: 'Confirm the readiness states required for Substantial Completion and connect the applicable startup, testing, commissioning, training and acceptance chain into the completion milestone, or provide the contractual basis for excluding those states.',
    preSubmission: 'Before submission, confirm that Substantial Completion is supported by the applicable readiness and acceptance activities. Add or correct the logic where those states are required.',
    reference: 'Completion should be supported by the applicable physical completion → startup/testing → commissioning → training/acceptance states.',
  }
  if (t.includes('cross-scope predecessor')) return {
    primaryDomain: 'AR-03', crossReferencedDomains: ['AR-04'], ruleStrength: 'EXPECTED', findingSeverity: 4, kind: 'FINDING',
    why: 'An area-completion milestone should not be controlled by unrelated work unless there is a real contractual or physical dependency. Cross-scope links can distort float and completion responsibility.',
    reviewer: 'Verify whether the cross-area predecessor is intentional. If not, correct the relationship or relabel the milestone so the schedule reflects the actual dependency.',
    preSubmission: 'Verify the cross-area relationship before submission and correct any link that does not represent a real dependency.',
    reference: 'Area completion logic should be supported by work that actually controls that area, plus intentional project-wide dependencies.',
  }
  if (t.includes('area completion milestone occurs before')) return {
    primaryDomain: 'AR-08', crossReferencedDomains: ['AR-06'], ruleStrength: 'EXPECTED', findingSeverity: 4, kind: 'FINDING',
    why: 'The schedule distinguishes construction completion from later readiness work, but the later work still has to support the appropriate turnover or project-completion milestone. Otherwise the schedule can report an area complete while readiness work remains.',
    reviewer: 'Confirm what the area-completion milestone means. If it is intended to represent turnover readiness, tie the remaining startup/commissioning/training/acceptance work into it or use a separate readiness milestone.',
    preSubmission: 'Clarify whether the area milestone means physical construction complete or turnover ready, and align the downstream readiness logic accordingly.',
    reference: 'Construction complete and turnover ready are different control states; each should be clearly represented and logically connected to the appropriate completion target.',
  }
  if (t.includes('electrical distribution chain')) return {
    primaryDomain: 'AR-06', crossReferencedDomains: ['AR-02'], ruleStrength: 'REQUIRED', findingSeverity: 5, kind: 'FINDING',
    why: 'Electrical distribution equipment may be installed, but without a connected energization/testing/readiness sequence the schedule cannot demonstrate when usable permanent power is actually available.',
    reviewer: 'Verify the submitted electrical sequence through installation, protection/testing, energization and acceptance. Connect the applicable readiness activities to downstream startup and completion milestones.',
    preSubmission: 'Demonstrate the electrical readiness chain through testing and energization before submission, or map the equivalent activities if different terminology is used.',
    reference: 'Distribution equipment → connections/protection testing → pre-energization readiness → energization → downstream startup/acceptance.',
  }
  if (t.includes('generator installation')) return {
    primaryDomain: 'AR-06', crossReferencedDomains: [], ruleStrength: 'REQUIRED', findingSeverity: 5, kind: 'FINDING',
    why: 'Installing the generator does not establish emergency-power readiness. Startup, source/ATS verification, load testing and acceptance are the states that prove the system can perform.',
    reviewer: 'Verify the generator sequence after installation and identify the submitted activities for startup, ATS/source verification, load-bank or functional testing, and acceptance. Add or reconnect missing states as applicable.',
    preSubmission: 'Show the generator readiness sequence beyond installation, including the applicable startup and testing states, before submission.',
    reference: 'Generator set → fuel/gas and electrical/controls connections → startup → transfer/source verification → load/functional test → acceptance.',
  }
  if (t.includes('natural-gas utility readiness')) return {
    primaryDomain: 'AR-06', crossReferencedDomains: ['AR-05'], ruleStrength: 'EXPECTED', findingSeverity: 3, kind: 'FINDING',
    why: 'Gas piping alone does not prove that utility service is available. Equipment that depends on gas cannot be started or accepted until the provider interface, meter/service, and turn-on readiness are established.',
    reviewer: 'Confirm the utility-provider release, meter/service availability, pressure/turn-on state, and the downstream equipment that depends on gas service. Map the equivalent activities if they use different names.',
    preSubmission: 'Identify or add the gas-service readiness state and connect it to gas-dependent startup activities.',
    reference: 'Utility/provider work → service/meter readiness → turn-on/availability → gas-dependent equipment startup and testing.',
  }
  if (t.includes('switchgear is not explicitly')) return {
    primaryDomain: 'AR-06', crossReferencedDomains: ['AR-05'], ruleStrength: 'ADVISORY', findingSeverity: 2, kind: 'RECOMMENDATION',
    why: 'The schedule may already represent the required electrical distribution equipment under MDP/panel terminology. The issue is mapping, not automatically missing scope.',
    reviewer: 'Map the submitted MDP/panel activities to the project electrical one-line and confirm whether they represent the required switchgear/distribution state.',
    preSubmission: 'Confirm the equipment mapping so the reviewer can trace the distribution path without relying on terminology assumptions.',
    reference: 'Use project-equipment mapping before declaring a required electrical state missing.',
  }
  if (t.includes('integrated-systems test') || t.includes('ist activity')) return {
    primaryDomain: 'AR-06', crossReferencedDomains: [], ruleStrength: 'ADVISORY', findingSeverity: 2, kind: 'RECOMMENDATION',
    why: 'Integrated testing is project-specific. Its absence is only material when the contract, commissioning plan, or owner requirements call for combined-system testing.',
    reviewer: 'Confirm whether the governing commissioning requirements require integrated-systems testing. If required, identify the readiness, test and deficiency-closeout activities in the schedule.',
    preSubmission: 'Confirm IST applicability against the commissioning requirements and add/map the activities only when required.',
    reference: 'Applicability must come from the governing commissioning/owner requirements, not from a generic keyword rule.',
  }

  return {
    primaryDomain: 'AR-02', crossReferencedDomains: [],
    ruleStrength: severity === 'HIGH' ? 'EXPECTED' : 'ADVISORY',
    findingSeverity: severity === 'HIGH' ? 4 : severity === 'MEDIUM' ? 3 : 2,
    kind: severity === 'REVIEW' ? 'RECOMMENDATION' : 'FINDING',
    why: 'The condition affects confidence that the submitted schedule represents the work that actually controls completion.',
    reviewer: 'Verify the identified condition against the project requirements and submitted XER logic, then revise or clarify the schedule as appropriate.',
    preSubmission: 'Verify the identified condition before submission and revise or clarify the schedule as appropriate.',
    reference: 'Control Lens nature-of-work and path-credibility review.',
  }
}

function readinessConclusion(gatesPassed: boolean, counts: { critical: number; major: number; minor: number }): {
  status: ReadinessStatus; label: string; reason: string
} {
  if (!gatesPassed) return {
    status: 'NOT_READY',
    label: 'NOT READY FOR APPROVAL',
    reason: 'At least one critical approval gate failed. Resolve the material path, network, milestone, or turnover condition before relying on this schedule as the control baseline.',
  }
  if (counts.critical > 0 || counts.major >= 2) return {
    status: 'REVIEW_REQUIRED',
    label: 'REVIEWER ACTION REQUIRED',
    reason: 'Material schedule conditions remain. The schedule should not be accepted solely on score; the identified logic, sequencing and readiness issues require reviewer resolution.',
  }
  if (counts.major > 0 || counts.minor > 0) return {
    status: 'READY_WITH_COMMENTS',
    label: 'READY FOR APPROVAL REVIEW — COMMENTS REMAIN',
    reason: 'No critical gate failed, but comments remain that should be resolved or documented during the approval review.',
  }
  return {
    status: 'READY',
    label: 'READY FOR APPROVAL REVIEW',
    reason: 'Current Control Lens checks did not identify a material condition that blocks approval review. The authorized reviewer still makes the final decision.',
  }
}

export function evaluateApprovalReadiness(
  analysis: AnalysisInput,
  opts: { mode: ApprovalMode; projectType?: ProjectTypeKey } = { mode: 'REVIEWER' },
): ApprovalReadinessResult | null {
  const review = runConstructionReview(analysis as any)
  if (!review) return null

  const raw: ReviewFinding[] = []
  for (const g of review.groups) for (const d of g.disciplines) for (const s of d.systems) raw.push(...s.findings)

  const groups = new Map<string, ReviewFinding[]>()
  for (const f of raw) {
    const k = consolidationKey(f)
    const arr = groups.get(k) || []
    arr.push(f)
    groups.set(k, arr)
  }

  const findings: ApprovalFinding[] = []
  let n = 0

  for (const evidence of Array.from(groups.values())) {
    const rep = evidence.slice().sort((a, b) => b.severity - a.severity)[0]
    const primaryDomain = mapDomain(rep)
    const ruleStrength = strengthFor(rep)
    const severity = rep.severity
    const kind: ApprovalFinding['kind'] = evidence.every(e => e.scoreEligible === false || e.findingKind === 'KEY_MILESTONE_SUGGESTION')
      ? 'RECOMMENDATION' : 'FINDING'
    const criticalGate = kind === 'FINDING' && severity >= 5 && ruleStrength === 'REQUIRED'
    const deduction = kind === 'RECOMMENDATION' ? 0 : computeDeduction(severity, ruleStrength)

    const seen = new Set<string>()
    const affected: ApprovalFinding['affectedActivities'] = []
    for (const e of evidence) {
      if (!seen.has(e.activityId)) {
        seen.add(e.activityId)
        affected.push({ id: e.activityId, code: e.activityCode, name: e.activityName })
      }
      if (e.predecessor && !seen.has(e.predecessor.id)) {
        seen.add(e.predecessor.id)
        affected.push({ id: e.predecessor.id, code: e.predecessor.code, name: e.predecessor.name, note: `predecessor (${e.predecessor.relationship})` })
      }
    }

    const specificReference = rep.memo?.clReferenceSequence?.length
      ? rep.memo.clReferenceSequence.join(' → ')
      : rep.recommendation

    findings.push({
      id: `CL-${String(++n).padStart(3, '0')}`,
      kind,
      primaryDomain,
      phase: rep.phase,
      discipline: rep.discipline,
      system: rep.system,
      ruleStrength,
      severity,
      confidence: rep.confidence,
      criticalGate,
      scoreDeduction: deduction,
      title: rep.headline,
      whatFound: `${rep.detail}${evidence.length > 1 ? ` Control Lens identified ${evidence.length} related activities under this same condition.` : ''}`,
      whyItMatters: impactForDomain(primaryDomain),
      reviewerCheck: kind === 'RECOMMENDATION'
        ? (rep.recommendation || 'Confirm whether this recommendation is applicable to the project and map an equivalent control point where appropriate.')
        : (rep.recommendation || 'Verify the identified condition and revise the schedule where appropriate or provide supporting clarification.'),
      preSubmissionNote: kind === 'RECOMMENDATION'
        ? `Before submission, confirm whether this recommendation is applicable. ${rep.recommendation || ''}`.trim()
        : `Before submission, address or explain this condition. ${rep.recommendation || ''}`.trim(),
      referenceRequirement: specificReference,
      affectedActivities: affected.slice(0, 40),
      evidence,
      status: 'NEW',
    })
  }

  // -------------------------------------------------------------------------
  // CL Path Intelligence — the nature-of-work / engineering credibility layer.
  // Group repeated path findings by title so 79 affected activities become one
  // reviewer concern with evidence, not 79 yellow boxes.
  // -------------------------------------------------------------------------
  const path = analyzeCLPathIntelligence(analysis as any)
  if (path) {
    const pathGroups = new Map<string, CLPathFinding[]>()
    for (const f of path.findings) {
      const arr = pathGroups.get(f.title) || []
      arr.push(f)
      pathGroups.set(f.title, arr)
    }

    const traceTasks = Object.values((analysis as any).traceTasks || {}) as any[]
    const byCode = new Map<string, any>()
    for (const t of traceTasks) if (t?.task_code) byCode.set(String(t.task_code).trim(), t)

    for (const group of Array.from(pathGroups.values())) {
      const rep = group[0]
      const profile = pathProfile(rep.title, rep.severity)
      const codes = Array.from(new Set(group.reduce<string[]>((all, f) => all.concat(f.evidence || []), [])))
      const affected = codes.slice(0, 40).map(code => {
        const t = byCode.get(code)
        return {
          id: String(t?.task_id || code),
          code,
          name: String(t?.task_name || 'Submitted XER evidence'),
          note: 'CL path evidence',
        }
      })
      const isRecommendation = profile.kind === 'RECOMMENDATION'
      findings.push({
        id: `CL-${String(++n).padStart(3, '0')}`,
        kind: profile.kind,
        primaryDomain: profile.primaryDomain,
        crossReferencedDomains: profile.crossReferencedDomains,
        ruleStrength: profile.ruleStrength,
        severity: profile.findingSeverity,
        confidence: rep.severity === 'REVIEW' ? 'medium' : 'high',
        criticalGate: !isRecommendation && profile.findingSeverity >= 5 && profile.ruleStrength === 'REQUIRED',
        scoreDeduction: isRecommendation ? 0 : computeDeduction(profile.findingSeverity, profile.ruleStrength),
        title: rep.title,
        whatFound: `${rep.detail}${group.length > 1 ? ` This pattern occurs in ${group.length} submitted completion/readiness conditions.` : ''}`,
        whyItMatters: profile.why,
        reviewerCheck: profile.reviewer,
        preSubmissionNote: profile.preSubmission,
        referenceRequirement: profile.reference,
        affectedActivities: affected,
        evidence: [],
        status: 'NEW',
      })
    }

    // Explicitly surface the CL path-to-completion gap under AR-02. This is the
    // reviewer question the old readiness score could not answer.
    if (path.criticalPath?.connectionToTarget === 'REFERENCE_GAP') {
      const cpCodes = path.criticalPath.activities
        .map((t: any) => String(t?.task_code || '').trim())
        .filter(Boolean)
      const cpAffected = Array.from(new Set(cpCodes)).slice(-12).map(code => {
        const t = byCode.get(code)
        return { id: String(t?.task_id || code), code, name: String(t?.task_name || 'Submitted XER activity'), note: 'CL critical-path review' }
      })
      findings.push({
        id: `CL-${String(++n).padStart(3, '0')}`,
        kind: 'FINDING',
        primaryDomain: 'AR-02',
        crossReferencedDomains: ['AR-08', 'AR-06'],
        ruleStrength: 'REQUIRED',
        severity: 5,
        confidence: 'high',
        criticalGate: true,
        scoreDeduction: computeDeduction(5, 'REQUIRED'),
        title: 'CL critical path does not close into the completion target',
        whatFound: path.criticalPath.connectionNote,
        whyItMatters: 'Control Lens can identify a credible readiness chain from the submitted work, but the submitted relationship network does not close that chain into the completion target. The P6-reported critical/longest path can therefore bypass work that appears necessary for actual readiness.',
        reviewerCheck: 'Trace the controlling completion logic to the target milestone and confirm that the applicable readiness/acceptance chain is relationship-connected. Correct the logic or provide the basis for the current path before approval.',
        preSubmissionNote: 'Before submission, close the applicable readiness chain into the completion target or provide the basis for the current path.',
        referenceRequirement: 'The controlling path to completion should represent the real work states required to achieve the selected completion milestone.',
        affectedActivities: cpAffected,
        evidence: [],
        status: 'NEW',
      })
    }
  }

  // -------------------------------------------------------------------------
  // U.S. building / federal CPM quality benchmark. These rules use direct XER
  // evidence (network ends, relationship types/lags, durations, procurement
  // risk and WBS assignment). They deliberately do not infer delay ownership,
  // entitlement, excusability, or project-specific contractual applicability.
  // -------------------------------------------------------------------------
  const qualityFindings = buildScheduleQualityFindings(analysis as any)
  for (const quality of qualityFindings) {
    const qualityText = norm(`${quality.title} ${quality.whatFound}`)
    const overlapping = findings.find(existing => {
      if (existing.kind === 'RECOMMENDATION') return false
      const existingText = norm(`${existing.title} ${existing.whatFound}`)
      if (existingText === qualityText || norm(existing.title) === norm(quality.title)) return true
      if (qualityText.includes('out of sequence') && (existingText.includes('out of sequence') || existingText.includes('recorded progress does not follow'))) return true
      if (qualityText.includes('open ended') && (existingText.includes('open ended') || existingText.includes('no logic ties'))) return true
      if (qualityText.includes('long lead procurement') && existingText.includes('long lead')) return true
      return false
    })
    if (overlapping) {
      const combinedActivities = new Map(
        [...overlapping.affectedActivities, ...quality.affectedActivities].map(activity => [activity.id, activity]),
      )
      Object.assign(overlapping, quality, {
        id: overlapping.id,
        status: overlapping.status,
        evidence: overlapping.evidence,
        affectedActivities: Array.from(combinedActivities.values()).slice(0, 40),
      })
      continue
    }
    findings.push({
      ...quality,
      id: `CL-${String(++n).padStart(3, '0')}`,
      status: 'NEW',
    })
  }

  findings.sort((a, b) =>
    (a.kind === 'RECOMMENDATION' ? 1 : 0) - (b.kind === 'RECOMMENDATION' ? 1 : 0) ||
    (b.criticalGate ? 1 : 0) - (a.criticalGate ? 1 : 0) ||
    b.severity - a.severity ||
    b.scoreDeduction - a.scoreDeduction
  )

  const domains = scoreDomains(findings)
  const score = totalScore(domains)
  const { grade, recommendation } = gradeAndRecommendation(score)
  const counts = materialityCounts(findings)
  const gates = evaluateGates(findings, opts.projectType || 'ALL')
  const readiness = readinessConclusion(gates.passed, counts)

  const toPathStatus = (p: any, label: string) => p ? {
    label,
    status: p.connectionToTarget === 'SUBMITTED' ? 'CREDIBLE' as const : p.connectionToTarget === 'REFERENCE_GAP' ? 'REVIEW_REQUIRED' as const : 'UNRESOLVED' as const,
    activityCount: Array.isArray(p.activities) ? p.activities.length : 0,
    note: String(p.connectionNote || ''),
  } : null

  return {
    mode: opts.mode,
    totalScore: score,
    grade,
    recommendation: gates.passed ? recommendation : 'REVISE & RESUBMIT — Critical Approval Gate Failed',
    readinessStatus: readiness.status,
    readinessLabel: readiness.label,
    readinessReason: readiness.reason,
    criticalGates: gates,
    counts,
    recommendationCount: findings.filter(f => f.kind === 'RECOMMENDATION').length,
    domains,
    findings,
    projectUnderstanding: path?.understanding,
    pathReview: path ? {
      criticalPath: toPathStatus(path.criticalPath, 'CL Critical Path'),
      longestPath: toPathStatus(path.longestPath, 'CL Longest Path'),
    } : undefined,
    meta: {
      engineVersion: ENGINE_VERSION,
      frameworkVersion: FRAMEWORK_VERSION,
      generatedAt: new Date().toISOString(),
    },
  }
}
