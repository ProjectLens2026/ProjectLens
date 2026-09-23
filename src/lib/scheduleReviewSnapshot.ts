// =============================================================================
// src/lib/scheduleReviewSnapshot.ts
// =============================================================================
// Canonical, version-level bridge between the Full CPM Analysis and the
// Review Schedule workspace.
//
// The Full CPM Analysis remains the detailed evidence surface. Review Schedule
// consumes this snapshot so it does not invent a second interpretation of the
// same XER. Raw technical signals are kept separate from approval findings:
// negative float or delay is important project status, but is not automatically
// a contractual rejection reason. Material findings and critical gates continue
// to come from the deterministic Approval Readiness evaluator.
// =============================================================================

import { evaluateApprovalReadiness } from './approval-readiness/evaluator'
import type {
  ApprovalFinding,
  ApprovalMode,
  ApprovalReadinessResult,
  ReadinessStatus,
} from './approval-readiness/types'
import type { ProjectTypeKey } from './approval-readiness/framework'

export type TechnicalSignalId =
  | 'CONTRACT_DELAY'
  | 'NEGATIVE_FLOAT'
  | 'OUT_OF_SEQUENCE'
  | 'OPEN_ENDS'
  | 'LONG_LEAD_AT_RISK'

export type TechnicalSignalTreatment =
  | 'STATUS_ONLY'
  | 'REVIEW_REQUIRED'
  | 'SUPPORTING_EVIDENCE'

export interface ScheduleTechnicalSignal {
  id: TechnicalSignalId
  label: string
  count: number
  treatment: TechnicalSignalTreatment
  summary: string
  /** Route/tab where the reviewer can inspect the detailed CPM evidence. */
  evidenceLocation: string
}

export interface CanonicalReviewFinding extends ApprovalFinding {
  /** Stable across reruns when the rule meaning and affected activities match. */
  sourceKey: string
  affectedActivityCount: number
  evidenceCount: number
}

export interface ScheduleReviewReconciliation {
  technicalSignalGroups: number
  technicalOccurrences: number
  detectedFindings: number
  recommendations: number
  consolidatedConcerns: number
  blockingFindings: number
  affectedActivities: number
}

export interface ScheduleDecisionIntegrity {
  readinessStatus: ReadinessStatus
  criticalGatesPassed: boolean
  hasBlockingFindings: boolean
  internallyConsistent: boolean
  explanation: string
}

export interface ScheduleReviewSnapshot {
  schemaVersion: '1.0.0'
  versionId?: string
  generatedAt: string
  health: {
    score: number | null
    condition: string
    delayDays: number
  }
  technicalSignals: ScheduleTechnicalSignal[]
  approval: ApprovalReadinessResult
  findings: CanonicalReviewFinding[]
  reconciliation: ScheduleReviewReconciliation
  decisionIntegrity: ScheduleDecisionIntegrity
}

export interface BuildScheduleReviewSnapshotOptions {
  versionId?: string
  mode?: ApprovalMode
  projectType?: ProjectTypeKey
}

interface ScheduleAnalysisLike {
  healthScore?: number
  condition?: string
  delayDays?: number
  negativeFloat?: number
  outOfSequence?: unknown[]
  noTies?: unknown[]
  longLeadAtRisk?: number
  longLeadItems?: unknown[]
  [key: string]: unknown
}

function finiteCount(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.round(numeric))
}

function listCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function normalized(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Small deterministic FNV-1a hash. This is an identity helper, not security.
function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, '0')
}

export function reviewFindingSourceKey(finding: ApprovalFinding): string {
  const affected = (finding.affectedActivities || [])
    .map(activity => normalized(activity.code || activity.id))
    .filter(Boolean)
    .sort()
    .join('|')
  const identity = [
    finding.primaryDomain,
    finding.kind || 'FINDING',
    finding.ruleStrength,
    normalized(finding.title),
    affected,
  ].join('::')
  return `CLF-${stableHash(identity)}`
}

function canonicalizeFinding(finding: ApprovalFinding): CanonicalReviewFinding {
  return {
    ...finding,
    sourceKey: reviewFindingSourceKey(finding),
    affectedActivityCount: new Set(
      (finding.affectedActivities || []).map(activity => activity.id || activity.code).filter(Boolean),
    ).size,
    evidenceCount: Array.isArray(finding.evidence) ? finding.evidence.length : 0,
  }
}

export function buildScheduleTechnicalSignals(analysis: ScheduleAnalysisLike): ScheduleTechnicalSignal[] {
  const signals: ScheduleTechnicalSignal[] = []
  const delayDays = finiteCount(analysis.delayDays)
  const negativeFloat = finiteCount(analysis.negativeFloat)
  const outOfSequence = listCount(analysis.outOfSequence)
  const openEnds = listCount(analysis.noTies)
  const longLeadAtRisk = Math.max(
    finiteCount(analysis.longLeadAtRisk),
    Array.isArray(analysis.longLeadItems)
      ? analysis.longLeadItems.filter((item: any) => {
          if (item?.status_code === 'TK_Complete') return false
          const percent = Number(item?.phys_complete_pct || 0)
          const floatDays = Number(item?.floatDays)
          return percent < 100 && Number.isFinite(floatDays) && floatDays <= 14
        }).length
      : 0,
  )

  if (delayDays > 0) signals.push({
    id: 'CONTRACT_DELAY',
    label: 'Forecast beyond contract completion',
    count: delayDays,
    treatment: 'STATUS_ONLY',
    summary: `The current XER forecast is ${delayDays} calendar day${delayDays === 1 ? '' : 's'} beyond the contractual completion position. Entitlement and approval impact require the governing contract basis and approved time modifications.`,
    evidenceLocation: 'Full CPM Analysis → Schedule Filters',
  })

  if (negativeFloat > 0) signals.push({
    id: 'NEGATIVE_FLOAT',
    label: 'Activities carrying negative float',
    count: negativeFloat,
    treatment: 'SUPPORTING_EVIDENCE',
    summary: `${negativeFloat} activit${negativeFloat === 1 ? 'y carries' : 'ies carry'} negative float. This measures schedule pressure; it is not, by itself, a separate approval deficiency for every activity.`,
    evidenceLocation: 'Full CPM Analysis → Schedule Filters',
  })

  if (outOfSequence > 0) signals.push({
    id: 'OUT_OF_SEQUENCE',
    label: 'Recorded progress conflicts with submitted logic',
    count: outOfSequence,
    treatment: 'REVIEW_REQUIRED',
    summary: `${outOfSequence} activit${outOfSequence === 1 ? 'y requires' : 'ies require'} review against the current relationship network. The detailed relationship evidence remains in Full CPM Analysis.`,
    evidenceLocation: 'Full CPM Analysis → Sequence Problems',
  })

  if (openEnds > 0) signals.push({
    id: 'OPEN_ENDS',
    label: 'Incomplete predecessor or successor logic',
    count: openEnds,
    treatment: 'REVIEW_REQUIRED',
    summary: `${openEnds} incomplete activit${openEnds === 1 ? 'y has' : 'ies have'} at least one open network end. Legitimate project-start and project-finish endpoints must be distinguished from missing logic during review.`,
    evidenceLocation: 'Full CPM Analysis → No Logic Ties',
  })

  if (longLeadAtRisk > 0) signals.push({
    id: 'LONG_LEAD_AT_RISK',
    label: 'Long-lead procurement items at risk',
    count: longLeadAtRisk,
    treatment: 'REVIEW_REQUIRED',
    summary: `${longLeadAtRisk} incomplete long-lead item${longLeadAtRisk === 1 ? ' has' : 's have'} 14 calendar days of float or less and should be reviewed against required-on-site and downstream installation dates.`,
    evidenceLocation: 'Full CPM Analysis → Long Lead Items',
  })

  return signals
}

function decisionIntegrity(
  approval: ApprovalReadinessResult,
  findings: CanonicalReviewFinding[],
): ScheduleDecisionIntegrity {
  const readinessStatus = approval.readinessStatus || 'REVIEW_REQUIRED'
  const blocking = findings.filter(finding => finding.kind !== 'RECOMMENDATION' && finding.criticalGate)
  const criticalGatesPassed = approval.criticalGates.passed
  const claimsReady = readinessStatus === 'READY' || readinessStatus === 'READY_WITH_COMMENTS'
  const internallyConsistent = !(claimsReady && (!criticalGatesPassed || blocking.length > 0))

  return {
    readinessStatus,
    criticalGatesPassed,
    hasBlockingFindings: blocking.length > 0,
    internallyConsistent,
    explanation: internallyConsistent
      ? approval.readinessReason || 'The readiness conclusion is consistent with the current critical gates and material findings.'
      : 'The calculated readiness label conflicts with an unresolved critical gate or blocking CPM finding. The schedule must not be represented as approval-ready until the conflict is resolved.',
  }
}

export function buildScheduleReviewSnapshot(
  analysis: ScheduleAnalysisLike | null | undefined,
  options: BuildScheduleReviewSnapshotOptions = {},
): ScheduleReviewSnapshot | null {
  if (!analysis) return null

  const approval = evaluateApprovalReadiness(analysis as any, {
    mode: options.mode || 'REVIEWER',
    projectType: options.projectType || 'ALL',
  })
  if (!approval) return null

  const findings = approval.findings.map(canonicalizeFinding)
  const technicalSignals = buildScheduleTechnicalSignals(analysis)
  const detectedFindings = findings.filter(finding => finding.kind !== 'RECOMMENDATION')
  const recommendations = findings.filter(finding => finding.kind === 'RECOMMENDATION')
  const blockingFindings = detectedFindings.filter(finding => finding.criticalGate)
  const affectedActivities = new Set(
    detectedFindings.flatMap(finding =>
      (finding.affectedActivities || []).map(activity => activity.id || activity.code).filter(Boolean),
    ),
  )

  return {
    schemaVersion: '1.0.0',
    versionId: options.versionId,
    generatedAt: approval.meta.generatedAt,
    health: {
      score: Number.isFinite(Number(analysis.healthScore)) ? Number(analysis.healthScore) : null,
      condition: String(analysis.condition || 'Not calculated'),
      delayDays: finiteCount(analysis.delayDays),
    },
    technicalSignals,
    approval,
    findings,
    reconciliation: {
      technicalSignalGroups: technicalSignals.length,
      technicalOccurrences: technicalSignals.reduce((sum, signal) => sum + signal.count, 0),
      detectedFindings: detectedFindings.length,
      recommendations: recommendations.length,
      consolidatedConcerns: detectedFindings.length,
      blockingFindings: blockingFindings.length,
      affectedActivities: affectedActivities.size,
    },
    decisionIntegrity: decisionIntegrity(approval, findings),
  }
}

