// =============================================================================
// src/lib/approval-readiness/types.ts   (Phase 1)
// =============================================================================
// Approval Readiness is a NEW decision-support layer that CONSUMES existing
// Control Lens analysis + construction findings. It does not parse XER, does
// not re-classify, does not re-trace, and does not modify ReviewFinding.
//
// Ruling 1: ApprovalFinding WRAPS ReviewFinding[] as evidence. ReviewFinding
//   stays the analysis truth; ApprovalFinding adds consolidation, approval
//   interpretation, scoring, gates, status, and reviewer/pre-submission voice.
// Ruling 3: each consolidated finding has ONE primary scoring domain. Other
//   domains may be cross-referenced but never receive a duplicate deduction.
// =============================================================================

import type { ReviewFinding } from '../construction/engine'
import type { ProjectPhase } from '../construction/classify'

// The nine approval domains (AR-01 … AR-09). Weights live in framework.ts.
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

// REQUIRED = contract/deterministic prerequisite; EXPECTED = normal practice,
// deviation triggers verification; ADVISORY = best-practice observation.
export type RuleStrength = 'REQUIRED' | 'EXPECTED' | 'ADVISORY'

export type ApprovalMode = 'PRE_SUBMISSION' | 'REVIEWER'

export type Grade = 'A' | 'A-' | 'B+' | 'B' | 'C' | 'D/F'

export type FindingStatus =
  | 'NEW' | 'OPEN' | 'RESPONDED' | 'PARTIALLY_ADDRESSED' | 'CLOSED' | 'DISMISSED'

// ---------------------------------------------------------------------------
// The canonical Approval Readiness finding — the full spec fields.
// ---------------------------------------------------------------------------
export interface ApprovalFinding {
  id: string                       // e.g. CL-007
  primaryDomain: ApprovalDomainId  // ONE scoring domain (ruling 3)
  crossReferencedDomains?: ApprovalDomainId[]

  phase?: ProjectPhase
  discipline?: string
  system?: string
  targetMilestone?: string

  ruleStrength: RuleStrength
  severity: 1 | 2 | 3 | 4 | 5
  confidence: 'high' | 'medium' | 'low'
  criticalGate: boolean            // does this trip a critical approval gate?
  scoreDeduction: number           // points removed from the primary domain

  // memo content
  title: string                    // e.g. "Permanent Power Readiness"
  whatFound: string                // "What Control Lens Found"
  whyItMatters: string             // "Why This Matters"
  reviewerCheck: string            // reviewer-voice action
  preSubmissionNote: string        // pre-submission-voice note
  referenceRequirement: string     // reference sequence / rule cited

  // traceability — the affected activities (ID + name always)
  affectedActivities: { id: string; code: string; name: string; note?: string }[]
  // the underlying analysis truth this wraps (ruling 1)
  evidence: ReviewFinding[]

  // iteration tracking (data model must not preclude it)
  status: FindingStatus
  previousSubmissionRef?: string
}

// A domain's computed score.
export interface DomainScore {
  domain: ApprovalDomainId
  label: string
  maxPoints: number
  deductions: number
  score: number                    // maxPoints - deductions (floored at 0)
  findingCount: number
}

// The full evaluation result the UI + PDF consume.
export interface ApprovalReadinessResult {
  mode: ApprovalMode
  totalScore: number               // 0..100
  grade: Grade
  recommendation: string
  criticalGates: {
    passed: boolean
    failed: { gateId: string; label: string; reason: string }[]
  }
  counts: { critical: number; major: number; minor: number }
  domains: DomainScore[]
  findings: ApprovalFinding[]      // consolidated, ordered by materiality

  // provenance stamps so a changed result is explainable
  meta: {
    engineVersion: string
    frameworkVersion: string
    generatedAt: string
  }
}
