// =============================================================================
// src/lib/approval-readiness/scoring.ts   (Phase 1)
// =============================================================================
// Turns consolidated ApprovalFinding[] into domain scores, total, grade, and
// materiality counts. Reads ALL numbers from framework.ts — no literals here.
// =============================================================================

import type { ApprovalFinding, DomainScore, Grade } from './types'
import {
  DOMAINS, domainLabel, gradeFor, materiality,
  DIMINISHING_WEIGHTS, DIMINISHING_TAIL, DOMAIN_SOFT_CAP_FRAC, REQUIRED_FAILURE_SEVERITY,
} from './framework'

export function scoreDomains(findings: ApprovalFinding[]): DomainScore[] {
  return DOMAINS.map(d => {
    const inDomain = findings.filter(f => f.primaryDomain === d.id)
    const scoringFindings = inDomain.filter(f => f.kind !== 'RECOMMENDATION')
    const recommendations = inDomain.filter(f => f.kind === 'RECOMMENDATION')

    // Diminishing returns: sort each finding's deduction desc, weight the Nth
    // by DIMINISHING_WEIGHTS[N] (tail after). Many small items asymptote.
    const sorted = scoringFindings.map(f => f.scoreDeduction).sort((a, b) => b - a)
    let deductions = 0
    sorted.forEach((ded, i) => {
      const w = i < DIMINISHING_WEIGHTS.length ? DIMINISHING_WEIGHTS[i] : DIMINISHING_TAIL
      deductions += ded * w
    })

    // Soft cap: review-level noise can't remove more than a fraction of the
    // domain — UNLESS a genuine REQUIRED failure of real severity exists.
    const hasRealFailure = scoringFindings.some(
      f => f.ruleStrength === 'REQUIRED' && f.severity >= REQUIRED_FAILURE_SEVERITY,
    )
    if (!hasRealFailure) {
      deductions = Math.min(deductions, d.weight * DOMAIN_SOFT_CAP_FRAC)
    }

    deductions = Math.round(deductions * 10) / 10
    const score = Math.max(0, Math.round((d.weight - deductions) * 10) / 10)
    return {
      domain: d.id,
      label: domainLabel(d.id),
      maxPoints: d.weight,
      deductions,
      score,
      findingCount: scoringFindings.length,
      recommendationCount: recommendations.length,
    }
  })
}

export function totalScore(domains: DomainScore[]): number {
  const raw = domains.reduce((s, d) => s + d.score, 0)
  return Math.max(0, Math.min(100, Math.round(raw)))
}

export function gradeAndRecommendation(score: number): { grade: Grade; recommendation: string } {
  const band = gradeFor(score)
  return { grade: band.grade, recommendation: band.recommendation }
}

export function materialityCounts(findings: ApprovalFinding[]): { critical: number; major: number; minor: number } {
  const c = { critical: 0, major: 0, minor: 0 }
  for (const f of findings) {
    if (f.kind === 'RECOMMENDATION') continue
    c[materiality(f.severity, f.criticalGate)]++
  }
  return c
}
