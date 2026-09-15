// =============================================================================
// src/lib/approval-readiness/scoring.ts   (Phase 1)
// =============================================================================
// Turns consolidated ApprovalFinding[] into domain scores, total, grade, and
// materiality counts. Reads ALL numbers from framework.ts — no literals here.
// =============================================================================

import type { ApprovalFinding, DomainScore, Grade } from './types'
import { DOMAINS, domainLabel, gradeFor, materiality } from './framework'

export function scoreDomains(findings: ApprovalFinding[]): DomainScore[] {
  return DOMAINS.map(d => {
    const inDomain = findings.filter(f => f.primaryDomain === d.id)
    const deductions = inDomain.reduce((s, f) => s + f.scoreDeduction, 0)
    const score = Math.max(0, Math.round((d.weight - deductions) * 10) / 10)
    return {
      domain: d.id,
      label: domainLabel(d.id),
      maxPoints: d.weight,
      deductions: Math.round(deductions * 10) / 10,
      score,
      findingCount: inDomain.length,
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
  for (const f of findings) c[materiality(f.severity, f.criticalGate)]++
  return c
}
