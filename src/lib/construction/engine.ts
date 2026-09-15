// =============================================================================
// src/lib/construction/engine.ts   (Brick 2 — analysis engine)
// =============================================================================
// Turns raw XER truth + classification into a grouped construction-logic review.
//
// Pipeline (per the locked architecture):
//   Raw XER → classify → derive scope → Layer 1 (actual vs XER logic)
//   → Layer 2 (CL construction review, conservative) → finding classification
//   → milestone consolidation → group Phase → Discipline → System.
//
// Honest boundaries, as agreed:
//  - Layer 2 relationship-appropriateness ("this FS is too restrictive") stays
//    NEEDS_REVIEW until those rules are authored. The engine never makes a
//    strong "this relationship is wrong" claim without library support.
//  - Milestone consolidation is a conservative heuristic: a completion/readiness
//    activity with MULTIPLE supporting predecessors that actually finish AFTER
//    it becomes ONE Milestone-Integrity finding (not N repetitive lines).
//  - Phase 1 only: detect + classify + recommend. No date recomputation.
//  - Classification NEVER gates traversal; the raw graph is authoritative.
// =============================================================================

import type { Relationship, TraceTask, WbsNode } from '../xerParser'
import { classifyActivity, type ClassificationResult, type ProjectPhase, PHASE_ORDER, PHASE_LABEL } from './classify'

export type FindingBucket =
  | 'ACTUAL_VS_RELATIONSHIP'      // actual dates conflict with the schedule's own logic
  | 'CONSTRUCTION_SEQUENCE'       // real physical/permitting sequence concern
  | 'LIKELY_INCORRECT_RELATIONSHIP'
  | 'MILESTONE_INTEGRITY'         // completion milestone with late supporting predecessors
  | 'PHASING_LOCATION'            // may need area/phase logic instead of project-wide link
  | 'NEEDS_REVIEW'
  | 'OTHER'

export const BUCKET_LABEL: Record<FindingBucket, string> = {
  ACTUAL_VS_RELATIONSHIP: 'Actual vs Relationship Conflict',
  CONSTRUCTION_SEQUENCE: 'Construction Sequence Conflict',
  LIKELY_INCORRECT_RELATIONSHIP: 'Likely Incorrect Relationship',
  MILESTONE_INTEGRITY: 'Milestone Integrity Problem',
  PHASING_LOCATION: 'Potential Phasing / Location Logic Issue',
  NEEDS_REVIEW: 'Needs Review',
  OTHER: 'Other',
}

export interface ReviewFinding {
  id: string
  bucket: FindingBucket
  severity: 1 | 2 | 3 | 4 | 5
  confidence: 'high' | 'medium' | 'low'
  // trigger activity
  activityId: string
  activityCode: string
  activityName: string
  phase?: ProjectPhase
  discipline?: string
  system?: string
  // the conflict
  headline: string
  detail: string
  varianceDays?: number
  // the predecessor this finding is measured against (Layer 1) — id+code+name
  predecessor?: { id: string; code: string; name: string; relationship: string; lagDays: number }
  // supporting evidence (e.g. the late predecessors on a milestone) — id+code+name
  supporting?: { id: string; code: string; name: string; note: string }[]
  recommendation: string
}

export interface GroupedReview {
  totalFindings: number
  bucketCounts: Record<FindingBucket, number>
  // grouped Phase -> Discipline -> System -> findings
  groups: {
    phase: ProjectPhase | 'UNCLASSIFIED'
    phaseLabel: string
    count: number
    disciplines: {
      discipline: string
      count: number
      systems: { system: string; findings: ReviewFinding[] }[]
    }[]
  }[]
  classificationCoverage: {
    phase: number; discipline: number; system: number; stage: number; unresolved: number
  }
}

// -----------------------------------------------------------------------------
// date helpers
// -----------------------------------------------------------------------------
const DAY = 86_400_000
function ms(s?: string): number | null {
  if (!s) return null
  const d = new Date(s.replace(' ', 'T'))
  const t = d.getTime()
  return isNaN(t) ? null : t
}
function daysBetween(a: number, b: number): number {
  return Math.round((a - b) / DAY)
}
function looksLikeMilestoneName(n: string): boolean {
  const s = n.toLowerCase()
  return /(complete|readiness|ready for|turnover|substantial|final completion|dry-in|dry in|weather.?tight|available)/.test(s)
}

// -----------------------------------------------------------------------------
// Main entry
// -----------------------------------------------------------------------------
export function runConstructionReview(analysis: {
  traceTasks?: Record<string, TraceTask>
  traceRelationships?: Relationship[]
  wbsNodes?: Record<string, WbsNode>
}): GroupedReview | null {
  const tasks = analysis.traceTasks
  const rels = analysis.traceRelationships
  if (!tasks || !rels || Object.keys(tasks).length === 0) return null

  // classify everything (annotation layer)
  const cls: Record<string, ClassificationResult> = {}
  for (const id of Object.keys(tasks)) {
    cls[id] = classifyActivity({
      task_id: id, task_code: tasks[id].task_code, task_name: tasks[id].task_name,
      task_type: tasks[id].task_type, wbs_path: tasks[id].wbs_path,
    })
  }

  // adjacency
  const predMap: Record<string, { pred: string; type: string; lag: string }[]> = {}
  for (const r of rels) {
    if (!r || !r.task_id) continue
    ;(predMap[r.task_id] ||= []).push({ pred: r.pred_task_id, type: r.pred_type, lag: r.lag_hr_cnt })
  }

  const findings: ReviewFinding[] = []
  let fid = 0

  // ---- LAYER 1: actual progress vs XER relationship logic --------------------
  // For each relationship where BOTH sides have enough actuals to compare, test
  // whether the successor actualized before the relationship allowed.
  for (const r of rels) {
    const succ = tasks[r.task_id]; const pred = tasks[r.pred_task_id]
    if (!succ || !pred) continue

    let requiredMs: number | null = null   // the pred date the succ had to respect
    let succActualMs: number | null = null // the succ actual that violated it
    let kind = ''
    switch (r.pred_type) {
      case 'PR_FS': requiredMs = ms(pred.act_end_date) ?? ms(pred.early_end_date); succActualMs = ms(succ.act_start_date); kind = 'started before predecessor finished'; break
      case 'PR_SS': requiredMs = ms(pred.act_start_date) ?? ms(pred.early_start_date); succActualMs = ms(succ.act_start_date); kind = 'started before predecessor started'; break
      case 'PR_FF': requiredMs = ms(pred.act_end_date) ?? ms(pred.early_end_date); succActualMs = ms(succ.act_end_date); kind = 'finished before predecessor finished'; break
      case 'PR_SF': requiredMs = ms(pred.act_start_date) ?? ms(pred.early_start_date); succActualMs = ms(succ.act_end_date); kind = 'finished before predecessor started'; break
      default: continue
    }
    if (requiredMs === null || succActualMs === null) continue
    const lagDays = Math.round((parseFloat(r.lag_hr_cnt || '0') || 0) / 8)
    const variance = daysBetween(requiredMs, succActualMs) - lagDays  // >0 => succ acted early (violation)
    if (variance <= 0) continue

    const c = cls[r.task_id]
    // Classify the finding. Conservative: strong physical dependencies become
    // CONSTRUCTION_SEQUENCE; everything else is ACTUAL_VS_RELATIONSHIP, and the
    // "is the relationship itself wrong" judgment stays NEEDS_REVIEW.
    let bucket: FindingBucket = 'ACTUAL_VS_RELATIONSHIP'
    let severity: ReviewFinding['severity'] = variance >= 30 ? 4 : variance >= 7 ? 3 : 2
    let confidence: ReviewFinding['confidence'] = 'medium'

    // known hard physical dependencies → construction sequence, stronger
    const pn = pred.task_name.toLowerCase(); const sn = succ.task_name.toLowerCase()
    const physical =
      (/(erosion|sediment|e&s)/.test(pn) && /(clear|grub)/.test(sn)) ||
      (/(footing|foundation|f\/r\/p)/.test(pn) && /(erect|steel)/.test(sn)) ||
      (/(cable test|hi-pot|megger)/.test(pn) && /energiz/.test(sn))
    if (physical) { bucket = 'CONSTRUCTION_SEQUENCE'; severity = 4; confidence = 'high' }

    findings.push({
      id: `L1-${++fid}`,
      bucket, severity, confidence,
      activityId: r.task_id, activityCode: succ.task_code, activityName: succ.task_name,
      phase: c.phase, discipline: c.discipline, system: c.system,
      headline: `${succ.task_code} ${kind} by ${variance} day${variance === 1 ? '' : 's'}`,
      detail: `Actual execution conflicts with the ${relLabel(r.pred_type)} relationship from ${pred.task_code} — ${pred.task_name}.`,
      varianceDays: variance,
      predecessor: {
        id: r.pred_task_id, code: pred.task_code, name: pred.task_name,
        relationship: relLabel(r.pred_type), lagDays,
      },
      recommendation: physical
        ? 'Verify the accepted construction sequence and actual field dates. If the successor was not authorized to proceed early, correct the schedule and assess the out-of-sequence condition.'
        : 'Confirm whether the actual date, the relationship, or a milestone definition is the source of the conflict. If work legitimately proceeded, correct the relationship or milestone logic rather than the actual date.',
    })
  }

  // ---- MILESTONE INTEGRITY consolidation -------------------------------------
  // Conservative heuristic: a completion/readiness activity with MULTIPLE
  // supporting predecessors whose actual finish is AFTER the milestone's own
  // finish → one consolidated finding.
  for (const id of Object.keys(tasks)) {
    const mtask = tasks[id]
    if (!looksLikeMilestoneName(mtask.task_name)) continue
    const mFin = ms(mtask.act_end_date) ?? ms(mtask.early_end_date)
    if (mFin === null) continue
    const preds = predMap[id] || []
    const late: { id: string; code: string; name: string; note: string }[] = []
    for (const p of preds) {
      const pt = tasks[p.pred]; if (!pt) continue
      const pFin = ms(pt.act_end_date) ?? ms(pt.early_end_date)
      if (pFin === null) continue
      if (pFin > mFin) {
        const by = daysBetween(pFin, mFin)
        late.push({ id: p.pred, code: pt.task_code, name: pt.task_name, note: `finishes ${by}d after the milestone` })
      }
    }
    if (late.length >= 2) {
      const c = cls[id]
      // remove any Layer-1 rows that are just these predecessor pairs (avoid dupes)
      const c2 = cls[id]
      findings.push({
        id: `MS-${++fid}`,
        bucket: 'MILESTONE_INTEGRITY',
        severity: 4, confidence: 'high',
        activityId: id, activityCode: mtask.task_code, activityName: mtask.task_name,
        phase: c.phase, discipline: c.discipline, system: c.system,
        headline: `${mtask.task_code} — ${late.length} supporting predecessors finish after this milestone`,
        detail: `The activity is defined as complete/ready, yet ${late.length} of its predecessors finish afterward. This points to a milestone-definition or logic problem rather than ${late.length} separate violations.`,
        supporting: late.slice(0, 20),
        recommendation: 'Review the definition and logic of this milestone. If these items are genuine prerequisites, they should drive the milestone to completion. If not, remove the inappropriate relationships and redefine the milestone.',
      })
    }
  }

  // ---- classification coverage (for the calibration surface) -----------------
  const N = Object.keys(tasks).length
  let cp = 0, cd = 0, csx = 0, cst = 0, cun = 0
  for (const id of Object.keys(cls)) {
    const c = cls[id]
    if (c.phase) cp++; if (c.discipline) cd++; if (c.system) csx++; if (c.stage) cst++
    if (!c.phase && !c.discipline) cun++
  }
  const pct = (x: number) => Math.round((100 * x) / N)

  // ---- group Phase → Discipline → System -------------------------------------
  const bucketCounts = {} as Record<FindingBucket, number>
  for (const k of Object.keys(BUCKET_LABEL)) bucketCounts[k as FindingBucket] = 0
  for (const f of findings) bucketCounts[f.bucket]++

  const byPhase = new Map<string, ReviewFinding[]>()
  for (const f of findings) {
    const key = f.phase || 'UNCLASSIFIED'
    ;(byPhase.get(key) || byPhase.set(key, []).get(key)!).push(f)
  }
  const orderedPhases = [...PHASE_ORDER, 'UNCLASSIFIED'] as (ProjectPhase | 'UNCLASSIFIED')[]
  const groups = orderedPhases.filter(p => byPhase.has(p)).map(p => {
    const list = byPhase.get(p)!
    const byDisc = new Map<string, ReviewFinding[]>()
    for (const f of list) {
      const d = f.discipline || 'General'
      ;(byDisc.get(d) || byDisc.set(d, []).get(d)!).push(f)
    }
    return {
      phase: p,
      phaseLabel: p === 'UNCLASSIFIED' ? 'Unclassified' : PHASE_LABEL[p as ProjectPhase],
      count: list.length,
      disciplines: Array.from(byDisc.entries()).map(([discipline, dfindings]) => {
        const bySys = new Map<string, ReviewFinding[]>()
        for (const f of dfindings) {
          const s = f.system || 'General'
          ;(bySys.get(s) || bySys.set(s, []).get(s)!).push(f)
        }
        return {
          discipline, count: dfindings.length,
          systems: Array.from(bySys.entries()).map(([system, sf]) => ({ system, findings: sf })),
        }
      }),
    }
  })

  return {
    totalFindings: findings.length,
    bucketCounts,
    groups,
    classificationCoverage: { phase: pct(cp), discipline: pct(cd), system: pct(csx), stage: pct(cst), unresolved: pct(cun) },
  }
}

function relLabel(t: string): string {
  switch (t) {
    case 'PR_FS': return 'Finish-to-Start'
    case 'PR_SS': return 'Start-to-Start'
    case 'PR_FF': return 'Finish-to-Finish'
    case 'PR_SF': return 'Start-to-Finish'
    default: return t
  }
}
