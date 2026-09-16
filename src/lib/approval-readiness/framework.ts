// =============================================================================
// src/lib/approval-readiness/framework.ts   (Phase 1)
// =============================================================================
// SINGLE SOURCE OF TRUTH for every Approval Readiness number: domain weights,
// grade thresholds, per-severity deductions, critical-gate definitions, and
// project applicability. Nothing here may be hardcoded in UI components or the
// evaluator — they read from this file so the framework can be calibrated
// against real schedules without touching logic or screens.
//
// Strong defaults are set now; all are configurable.
// =============================================================================

import type { ApprovalDomainId, RuleStrength, Grade } from './types'

export const FRAMEWORK_VERSION = '1.0.0'

// --------------------------------------------------------- Domain weights (=100)
export interface DomainDef {
  id: ApprovalDomainId
  label: string
  weight: number   // max points
}

export const DOMAINS: DomainDef[] = [
  { id: 'AR-01', label: 'Contract Dates & Major Milestones', weight: 15 },
  { id: 'AR-02', label: 'Critical / Longest / Near-Critical Paths', weight: 15 },
  { id: 'AR-03', label: 'Logic & Network Integrity', weight: 15 },
  { id: 'AR-04', label: 'Construction / System Sequencing', weight: 15 },
  { id: 'AR-05', label: 'Procurement & Long-Lead Readiness', weight: 10 },
  { id: 'AR-06', label: 'Startup / Testing / Commissioning', weight: 10 },
  { id: 'AR-07', label: 'Constraints / Lags / Calendars / Durations', weight: 10 },
  { id: 'AR-08', label: 'Completion / Turnover Credibility', weight: 5 },
  { id: 'AR-09', label: 'WBS / Activity Detail / Coding', weight: 5 },
]
// (15+15+15+15+10+10+10+5+5 = 100)

export function domainLabel(id: ApprovalDomainId): string {
  return DOMAINS.find(d => d.id === id)?.label ?? id
}
export function domainWeight(id: ApprovalDomainId): number {
  return DOMAINS.find(d => d.id === id)?.weight ?? 0
}

// ------------------------------------------------------------- Grade thresholds
// Configurable. Calibrate against real XERs.
export interface GradeBand { grade: Grade; min: number; recommendation: string }

export const GRADE_BANDS: GradeBand[] = [
  { grade: 'A',   min: 95, recommendation: 'Approval Ready / No Material Comments' },
  { grade: 'A-',  min: 90, recommendation: 'Approval Ready with Minor Comments' },
  { grade: 'B+',  min: 85, recommendation: 'Approved with Comments' },
  { grade: 'B',   min: 80, recommendation: 'Approved with Comments / Reviewer Judgment' },
  { grade: 'C',   min: 70, recommendation: 'Revise & Resubmit' },
  { grade: 'D/F', min: 0,  recommendation: 'Not Approval Ready' },
]

export function gradeFor(score: number): GradeBand {
  for (const b of GRADE_BANDS) if (score >= b.min) return b
  return GRADE_BANDS[GRADE_BANDS.length - 1]
}

// -------------------------------------------------- Deduction model (per finding)
// A consolidated finding deducts from its PRIMARY domain only (ruling 3).
// Base deduction by severity, scaled by rule strength. All configurable.
export const SEVERITY_DEDUCTION: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0.5,
  2: 1,
  3: 2,
  4: 4,
  5: 6,
}

export const STRENGTH_MULTIPLIER: Record<RuleStrength, number> = {
  REQUIRED: 1.0,   // full weight — a real prerequisite failure
  EXPECTED: 0.45,  // deviation triggers verification, modest penalty
  ADVISORY: 0.15,  // "needs review" observation — should barely move the score
}

// A single finding can never remove more than this from one domain.
export const MAX_DEDUCTION_PER_FINDING = 8

// Diminishing returns: within a domain, the Nth finding (sorted by size desc)
// is weighted by DIMINISHING_WEIGHTS[N] (falling back to the tail). This makes
// the score measure MATERIAL concern, not raw violation count — 15 similar
// review items don't linearly wipe a domain; a reviewer notes the pattern once.
export const DIMINISHING_WEIGHTS = [1.0, 0.5, 0.3, 0.2, 0.15]
export const DIMINISHING_TAIL = 0.08

// Non-critical findings can remove at most this fraction of a domain's weight.
// A domain only goes below this floor when a genuine REQUIRED failure of
// severity >= this threshold exists (a real, material deficiency).
export const DOMAIN_SOFT_CAP_FRAC = 0.6
export const REQUIRED_FAILURE_SEVERITY = 4

export function computeDeduction(
  severity: 1 | 2 | 3 | 4 | 5,
  strength: RuleStrength,
): number {
  const raw = SEVERITY_DEDUCTION[severity] * STRENGTH_MULTIPLIER[strength]
  return Math.min(MAX_DEDUCTION_PER_FINDING, Math.round(raw * 10) / 10)
}

// ----------------------------------------------------------- Materiality buckets
// How a finding's severity maps to the Critical/Major/Minor headline counts.
export function materiality(severity: 1 | 2 | 3 | 4 | 5, criticalGate: boolean): 'critical' | 'major' | 'minor' {
  if (criticalGate || severity >= 5) return 'critical'
  if (severity >= 3) return 'major'
  return 'minor'
}

// ---------------------------------------------------------- Critical gates
// A schedule can score high yet still be REVISE & RESUBMIT if a gate fails.
// Gates are configurable and project-type aware. `universal` gates apply to
// every project; others only when the project type matches.
export type ProjectTypeKey = 'ALL' | 'DATA_CENTER' | 'HOSPITAL' | 'MISSION_CRITICAL'

export interface CriticalGateDef {
  id: string
  label: string
  universal: boolean
  projectTypes?: ProjectTypeKey[]
  // the gate fails if a finding matching this predicate exists (evaluated in gates.ts)
  triggerDomains: ApprovalDomainId[]
  // minimum severity within those domains that trips the gate
  minSeverity: 1 | 2 | 3 | 4 | 5
  reason: string
}

export const CRITICAL_GATES: CriticalGateDef[] = [
  {
    id: 'GATE_CONTRACT_COMPLETION', label: 'Contract Completion Credibility',
    universal: true, triggerDomains: ['AR-01'], minSeverity: 5,
    reason: 'A material deficiency affects contract completion or a required contractual milestone.',
  },
  {
    id: 'GATE_CRITICAL_PATH', label: 'Critical / Longest Path Credibility',
    universal: true, triggerDomains: ['AR-02'], minSeverity: 5,
    reason: 'The critical/longest path is not credible.',
  },
  {
    id: 'GATE_NETWORK_INTEGRITY', label: 'Network Integrity',
    universal: true, triggerDomains: ['AR-03'], minSeverity: 5,
    reason: 'Severe logic/network integrity deficiency undermines schedule reliability.',
  },
  {
    id: 'GATE_TURNOVER', label: 'Ready for Service / Turnover Credibility',
    universal: true, triggerDomains: ['AR-08'], minSeverity: 5,
    reason: 'Completion/turnover path is not credible.',
  },
  // Project-specific example gates (only when project type matches)
  {
    id: 'GATE_PERMANENT_POWER', label: 'Permanent Power Readiness',
    universal: false, projectTypes: ['DATA_CENTER', 'MISSION_CRITICAL'],
    triggerDomains: ['AR-06'], minSeverity: 4,
    reason: 'Permanent Power / critical power path deficiency on a mission-critical project.',
  },
  {
    id: 'GATE_IST', label: 'Ready for Integrated Systems Testing',
    universal: false, projectTypes: ['DATA_CENTER', 'MISSION_CRITICAL'],
    triggerDomains: ['AR-06'], minSeverity: 4,
    reason: 'Integrated Systems Testing readiness path deficiency on a mission-critical project.',
  },
]

export function activeGates(projectType: ProjectTypeKey): CriticalGateDef[] {
  return CRITICAL_GATES.filter(g => g.universal || (g.projectTypes || []).includes(projectType))
}

// ------------------------------------------------------------- Mode language
export const MODE_LANGUAGE = {
  PRE_SUBMISSION: {
    label: 'Pre-Submission Check',
    voice: 'This condition may result in a reviewer comment. Verify the identified sequence before formal submission.',
  },
  REVIEWER: {
    label: 'Reviewer Check',
    voice: 'Contractor to verify the identified sequence and revise the schedule where appropriate or provide supporting clarification.',
  },
}
