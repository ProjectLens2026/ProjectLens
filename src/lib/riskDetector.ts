// =============================================================================
// Risk Category Detector — Day 5, v9
//
// Single source of truth for HOW MANY risk categories a project has, broken
// down by severity. Used by:
//   - Executive Dashboard /dashboard → RisksTile
//   - Enterprise Dashboard /dashboard/enterprise → Risks column
//
// IMPORTANT: This MIRRORS the detectRisks() function in
// src/app/dashboard/risks/page.tsx exactly. The risks page keeps its own
// inline copy for now (per founder direction not to touch that file).
// If you change a threshold here, change it there too.
//
// Each entry returned represents ONE detected category, not one affected
// activity. Activity counts (319 negative-float, 80 OOS, etc.) are detail
// on the risks page; the dashboard tile just shows "how many categories
// triggered" so it stays meaningful as a tile.
//
// Categories (max 7):
//   Time Impact          (delayDays > 30) → critical
//   Critical Path        (negativeFloat > 50 critical, > 0 high)
//   Procurement          (long-lead items with float < 0) → critical
//   Construction Sequence (OOS > 20 high, > 5 medium)
//   Schedule Quality     (noTies > 10) → high
//   Overall Health       (healthScore < 40) → critical
//   Milestones           (any milestone with float < 0) → critical
// =============================================================================

export type RiskSeverity = 'critical' | 'high' | 'medium'

export interface RiskCategory {
  id: string
  category: string
  severity: RiskSeverity
}

export function detectRiskCategories(a: any): RiskCategory[] {
  if (!a) return []
  const risks: RiskCategory[] = []

  // TIA Territory
  if (a.delayDays > 30) {
    risks.push({ id: 'tia', category: 'Time Impact', severity: 'critical' })
  }
  // Critical Path
  if (a.negativeFloat > 50) {
    risks.push({ id: 'crit-path-severe', category: 'Critical Path', severity: 'critical' })
  } else if (a.negativeFloat > 0) {
    risks.push({ id: 'crit-path', category: 'Critical Path', severity: 'high' })
  }
  // Procurement — long-lead items with negative float
  const longLeadAtRisk = (a.longLeadItems || []).filter((t: any) => t.floatDays < 0)
  if (longLeadAtRisk.length > 0) {
    risks.push({ id: 'longlead', category: 'Procurement', severity: 'critical' })
  }
  // Construction Sequence Problems
  if (a.outOfSequence?.length > 20) {
    risks.push({ id: 'oos-severe', category: 'Construction Sequence', severity: 'high' })
  } else if (a.outOfSequence?.length > 5) {
    risks.push({ id: 'oos', category: 'Construction Sequence', severity: 'medium' })
  }
  // No logic ties — Schedule Quality
  if (a.noTies?.length > 10) {
    risks.push({ id: 'noties', category: 'Schedule Quality', severity: 'high' })
  }
  // Overall Health
  if (a.healthScore < 40) {
    risks.push({ id: 'health', category: 'Overall Health', severity: 'critical' })
  }
  // Milestones at risk — any contractual milestone with negative float
  const milestonesAtRisk = (a.milestones || []).filter((m: any) => {
    const float = parseFloat(m.total_float_hr_cnt || '0') / 8
    return float < 0
  })
  if (milestonesAtRisk.length > 0) {
    risks.push({ id: 'milestones', category: 'Milestones', severity: 'critical' })
  }

  return risks
}

// Convenience: count categories by severity in one call. Used by both
// dashboards to avoid recomputing the filter three times.
export function countRiskCategories(a: any) {
  const risks = detectRiskCategories(a)
  return {
    all: risks.length,
    critical: risks.filter(r => r.severity === 'critical').length,
    high: risks.filter(r => r.severity === 'high').length,
    medium: risks.filter(r => r.severity === 'medium').length,
  }
}
