// =============================================================================
// src/lib/approval-readiness/types.ts
// =============================================================================
// Approval Readiness is the decision-support layer over Control Lens schedule
// intelligence. It combines the construction review with CL Path Intelligence
// so the owner/reviewer can judge whether the submitted XER is credible enough
// to use as a project-control baseline.
// =============================================================================

import type { ReviewFinding } from '../construction/engine'
import type { ProjectPhase } from '../construction/classify'

export type ApprovalDomainId =
  | 'AR-01' // Contract Dates & Major Milestones
  | 'AR-02' // Critical / Longest / Near-Critical Paths
  | 'AR-03' // Logic & Network Integrity
  | 'AR-04' // Construction / System Sequencing
  | 'AR-05' // Procurement & Long-Lead Readiness
  | 'AR-06' // Startup / Testing / Commissioning
  | 'AR-07' // Constraints / Lags / Calendars / Durations
  | 'AR-08' // Completion / Turnover Credibility
  | 'AR-09' // WBS / Activity Detail / Coding

export type RuleStrength = 'REQUIRED' | 'EXPECTED' | 'ADVISORY'
export type ApprovalMode = 'PRE_SUBMISSION' | 'REVIEWER'
export type Grade = 'A' | 'A-' | 'B+' | 'B' | 'C' | 'D/F'
export type FindingStatus = 'NEW' | 'OPEN' | 'RESPONDED' | 'PARTIALLY_ADDRESSED' | 'CLOSED' | 'DISMISSED'
export type ApprovalItemKind = 'FINDING' | 'RECOMMENDATION'
export type ReadinessStatus = 'NOT_READY' | 'REVIEW_REQUIRED' | 'READY_WITH_COMMENTS' | 'READY'

export interface ApprovalFinding {
  id: string
  kind?: ApprovalItemKind
  primaryDomain: ApprovalDomainId
  crossReferencedDomains?: ApprovalDomainId[]

  phase?: ProjectPhase
  discipline?: string
  system?: string
  targetMilestone?: string

  ruleStrength: RuleStrength
  severity: 1 | 2 | 3 | 4 | 5
  confidence: 'high' | 'medium' | 'low'
  criticalGate: boolean
  scoreDeduction: number

  title: string
  whatFound: string
  whyItMatters: string
  reviewerCheck: string
  preSubmissionNote: string
  referenceRequirement: string

  affectedActivities: { id: string; code: string; name: string; note?: string }[]
  evidence: ReviewFinding[]

  status: FindingStatus
  previousSubmissionRef?: string
}

export interface DomainScore {
  domain: ApprovalDomainId
  label: string
  maxPoints: number
  deductions: number
  score: number
  findingCount: number
  recommendationCount?: number
}

export interface ApprovalProjectUnderstanding {
  projectNature: string
  deliveryNature: string[]
  areas: string[]
  systems: string[]
  completionTarget?: { id: string; code: string; name: string; finish?: string }
}

export interface ApprovalPathStatus {
  label: string
  status: 'CREDIBLE' | 'REVIEW_REQUIRED' | 'UNRESOLVED'
  activityCount: number
  note: string
}

export interface ApprovalReadinessResult {
  mode: ApprovalMode
  totalScore: number
  grade: Grade
  recommendation: string

  // Reviewer-facing readiness conclusion. This is intentionally separate from
  // the numerical score so a high score cannot hide a critical path/gate issue.
  readinessStatus?: ReadinessStatus
  readinessLabel?: string
  readinessReason?: string

  criticalGates: {
    passed: boolean
    failed: { gateId: string; label: string; reason: string }[]
  }
  counts: { critical: number; major: number; minor: number }
  recommendationCount?: number
  domains: DomainScore[]
  findings: ApprovalFinding[]

  // Nature-of-work and path credibility from CL Path Intelligence.
  projectUnderstanding?: ApprovalProjectUnderstanding
  pathReview?: {
    criticalPath: ApprovalPathStatus | null
    longestPath: ApprovalPathStatus | null
  }

  meta: {
    engineVersion: string
    frameworkVersion: string
    generatedAt: string
  }
}
