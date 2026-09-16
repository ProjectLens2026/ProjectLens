// =============================================================================
// src/lib/approval-readiness/evaluator.ts   (Phase 1)
// =============================================================================
// The Approval Readiness evaluator. CONSUMES the existing construction review
// (runConstructionReview) + the analysis object. It does NOT parse, classify,
// or trace. It:
//   1. maps each ReviewFinding to a primary approval domain
//      (finding type + system + target milestone — ruling 2)
//   2. consolidates related findings into ApprovalFinding professional findings
//      (by target milestone / system) — one primary scoring domain each (ruling 3)
//   3. assigns rule strength, deduction, and critical-gate flag from framework
//   4. scores domains, computes grade, evaluates gates
//
// AR-02 (critical/near-critical) reads P6-supplied fields on the analysis and
// never implies Control Lens recomputed CPM (ruling 5).
// =============================================================================

import type {
  ApprovalFinding, ApprovalReadinessResult, ApprovalMode, ApprovalDomainId, RuleStrength,
} from './types'
import { runConstructionReview, type ReviewFinding, type FindingBucket } from '../construction/engine'
import { computeDeduction, materiality, MODE_LANGUAGE, FRAMEWORK_VERSION, type ProjectTypeKey } from './framework'
import { scoreDomains, totalScore, gradeAndRecommendation, materialityCounts } from './scoring'
import { evaluateGates } from './gates'

const ENGINE_VERSION = '1.0.0'

// The analysis shape we read (all already produced by Control Lens).
interface AnalysisInput {
  traceTasks?: any
  traceRelationships?: any
  wbsNodes?: any
  // P6-supplied schedule signals used by AR-02/03/05 (already computed today)
  negativeFloat?: number
  totalActivities?: number
  noTies?: any[]
  longLeadAtRisk?: number
  longLeadItems?: any[]
  outOfSequence?: any[]
  criticalDrivers?: any[]
  longestPathActivities?: any[]
}

// ---- domain mapping (ruling 2: type + system + milestone, not type alone) ----
function mapDomain(f: ReviewFinding): ApprovalDomainId {
  const sys = (f.system || '').toUpperCase()
  const name = (f.activityName || '').toLowerCase()
  const target = (f.targetMilestone || '').toUpperCase()
  const activityClass = (f.activityClass || '').toUpperCase()

  // Suggested key milestones are advisory schedule-control recommendations,
  // not contractual failures. Route them to the milestone or commissioning
  // domain for visibility while keeping them non-scoring.
  if (f.findingKind === 'KEY_MILESTONE_SUGGESTION') {
    if (/IST|COMMISSION|CONTROLS|READY FOR SERVICE/.test(target) || /IST|COMMISSION|CONTROLS|READY FOR SERVICE/.test(sys)) return 'AR-06'
    return 'AR-01'
  }

  // milestone-integrity on a completion/turnover milestone → AR-08, else AR-01
  if (f.bucket === 'MILESTONE_INTEGRITY') {
    if (/turnover|substantial|final|ready for service|occupancy/.test(name)) return 'AR-08'
    return 'AR-01'
  }
  // commissioning / startup / IST systems → AR-06. Reference-library findings
  // may carry the commissioning meaning in targetMilestone/activityClass even
  // when the contractor's activity name uses different wording.
  if (/IST|FPT|BMS|COMMISSION/.test(sys) || /IST|FPT|COMMISSION/.test(target) || /IST|FPT|COMMISSION/.test(activityClass) || /commission|startup|functional|energiz|ist\b/.test(name)) return 'AR-06'
  // procurement-phase → AR-05
  if (f.phase === 'PROCUREMENT') return 'AR-05'
  // physical construction sequence → AR-04
  if (f.bucket === 'CONSTRUCTION_SEQUENCE' || f.phase === 'CONSTRUCTION') return 'AR-04'
  // relationship-appropriateness / phasing → AR-03 (logic/network)
  if (f.bucket === 'LIKELY_INCORRECT_RELATIONSHIP' || f.bucket === 'PHASING_LOCATION') return 'AR-03'
  // default: logic/network integrity
  return 'AR-03'
}

// bucket → rule strength (conservative; Needs-Review stays EXPECTED/ADVISORY)
function strengthFor(f: ReviewFinding): RuleStrength {
  if (f.ruleStrengthHint) return f.ruleStrengthHint
  switch (f.bucket) {
    case 'CONSTRUCTION_SEQUENCE': return 'REQUIRED'
    case 'MILESTONE_INTEGRITY': return 'REQUIRED'
    case 'ACTUAL_VS_RELATIONSHIP':
      // Procurement-phase submit/review/fabricate/deliver activities are
      // commonly tied to a coarse "Start Procurement Phase" summary link and
      // legitimately begin early. These are Needs-Review, not REQUIRED
      // failures — do not let them penalize like a physical prerequisite.
      if (f.phase === 'PROCUREMENT' || f.phase === 'PRECONSTRUCTION') return 'ADVISORY'
      return 'EXPECTED'
    case 'LIKELY_INCORRECT_RELATIONSHIP': return 'EXPECTED'
    case 'PHASING_LOCATION': return 'ADVISORY'
    case 'NEEDS_REVIEW': return 'ADVISORY'
    default: return 'ADVISORY'
  }
}

// Consolidation key: group conditions that share a PREDECESSOR (they're the
// same root cause — e.g. many activities hanging off one summary/milestone),
// otherwise fall back to phase+discipline+system. Prevents both the
// "General · General" junk drawer and 18 unrelated rows under one finding.
function consolidationKey(f: ReviewFinding): string {
  if (f.findingKind === 'KEY_MILESTONE_SUGGESTION') {
    return `REC:${f.findingKind}:${f.targetMilestone || f.system || f.activityId}`
  }
  if (f.predecessor) return `PRED:${f.predecessor.id}`
  return `GRP:${f.phase || 'NA'}|${f.discipline || 'General'}|${f.system || 'General'}`
}

export function evaluateApprovalReadiness(
  analysis: AnalysisInput,
  opts: { mode: ApprovalMode; projectType?: ProjectTypeKey } = { mode: 'REVIEWER' },
): ApprovalReadinessResult | null {
  const review = runConstructionReview(analysis as any)
  if (!review) return null

  // flatten all ReviewFindings
  const raw: ReviewFinding[] = []
  for (const g of review.groups) for (const d of g.disciplines) for (const s of d.systems) raw.push(...s.findings)

  // ---- consolidate into ApprovalFindings (ruling 3: one primary domain) ----
  const groups = new Map<string, ReviewFinding[]>()
  for (const f of raw) {
    const k = consolidationKey(f)
    const arr = groups.get(k) || []
    arr.push(f)
    groups.set(k, arr)
  }

  const findings: ApprovalFinding[] = []
  let n = 0
  for (const [, evidence] of Array.from(groups.entries())) {
    // representative = highest severity in the cluster
    const rep = evidence.slice().sort((a, b) => b.severity - a.severity)[0]
    const primaryDomain = mapDomain(rep)
    const ruleStrength = strengthFor(rep)
    const severity = rep.severity
    const kind: ApprovalFinding['kind'] = evidence.every(e => e.scoreEligible === false || e.findingKind === 'KEY_MILESTONE_SUGGESTION')
      ? 'RECOMMENDATION'
      : 'FINDING'
    const criticalGate = kind === 'FINDING' && severity >= 5 && (ruleStrength === 'REQUIRED')
    const deduction = kind === 'RECOMMENDATION' ? 0 : computeDeduction(severity, ruleStrength)

    // affected activities — ID + name always, deduped, cap for display
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

    const disc = rep.discipline || 'General'
    const sysLabel = rep.system || 'General'
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
      title: kind === 'RECOMMENDATION'
        ? rep.headline
        : `${disc} · ${sysLabel} — ${evidence.length} related condition${evidence.length === 1 ? '' : 's'}`,
      whatFound: rep.headline + (evidence.length > 1 ? ` (plus ${evidence.length - 1} related)` : ''),
      whyItMatters: rep.detail,
      reviewerCheck: kind === 'RECOMMENDATION'
        ? 'Consider whether this control milestone would improve schedule visibility. No revision is required if the schedule already provides an equivalent owner-approved control point.'
        : MODE_LANGUAGE.REVIEWER.voice,
      preSubmissionNote: kind === 'RECOMMENDATION'
        ? 'Consider adding or mapping this control milestone before submission if it improves clarity. This is not a contractual requirement unless the governing documents require it.'
        : MODE_LANGUAGE.PRE_SUBMISSION.voice,
      referenceRequirement: rep.recommendation,
      affectedActivities: affected.slice(0, 40),
      evidence,
      status: 'NEW',
    })
  }

  // order by materiality then deduction
  findings.sort((a, b) =>
    (a.kind === 'RECOMMENDATION' ? 1 : 0) - (b.kind === 'RECOMMENDATION' ? 1 : 0) ||
    (b.criticalGate ? 1 : 0) - (a.criticalGate ? 1 : 0) ||
    b.severity - a.severity ||
    b.scoreDeduction - a.scoreDeduction
  )

  // ---- score + gates ----
  const domains = scoreDomains(findings)
  const score = totalScore(domains)
  const { grade, recommendation } = gradeAndRecommendation(score)
  const counts = materialityCounts(findings)
  const gates = evaluateGates(findings, opts.projectType || 'ALL')

  return {
    mode: opts.mode,
    totalScore: score,
    grade,
    recommendation: gates.passed ? recommendation : 'REVISE & RESUBMIT — Critical Approval Gate Failed',
    criticalGates: gates,
    counts,
    recommendationCount: findings.filter(f => f.kind === 'RECOMMENDATION').length,
    domains,
    findings,
    meta: {
      engineVersion: ENGINE_VERSION,
      frameworkVersion: FRAMEWORK_VERSION,
      generatedAt: new Date().toISOString(),
    },
  }
}
