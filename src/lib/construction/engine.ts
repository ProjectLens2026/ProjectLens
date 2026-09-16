// =============================================================================
// src/lib/construction/engine.ts   (Brick 2 — sequencing review engine)
// =============================================================================
// Raw XER truth stays untouched. Classification is annotation only.
//
// Pipeline:
//   Raw XER → classify → Layer 1 actual-vs-XER compliance
//   → Layer 2 conservative CL routing → milestone consolidation
//   → complete XER graph trace → Sequencing Review memo data
//   → group Phase → Discipline → System.
//
// Phase 1 boundary: detect + trace + compare + recommend. NO CPM/date recompute.
// Relationship-appropriateness is conservative: where CL has no authored rule,
// the finding is NEEDS_REVIEW rather than a fabricated engineering conclusion.
// =============================================================================

import type { Relationship, TraceTask, WbsNode } from '../xerParser'
import { classifyActivity, type ClassificationResult, type ProjectPhase, PHASE_ORDER, PHASE_LABEL } from './classify'
import { RULES } from './library'
import { REFERENCE_CONTROL_MILESTONES } from './referencePaths'
import type { ConstructionRule, ActivityClass, ActivityStage, ScopeLevel } from './types'

export type FindingBucket =
  | 'ACTUAL_VS_RELATIONSHIP'
  | 'CONSTRUCTION_SEQUENCE'
  | 'LIKELY_INCORRECT_RELATIONSHIP'
  | 'MILESTONE_INTEGRITY'
  | 'PHASING_LOCATION'
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

export type Confidence = 'high' | 'medium' | 'low'

export interface XerPathNode {
  id: string
  code: string
  name: string
  phase?: ProjectPhase
  discipline?: string
  system?: string
  stage?: string
  activityClass?: string
  wbsPath?: string
}

export interface XerPathEdge {
  predecessorId: string
  successorId: string
  relationship: string
  lagHours: number
}

/** Complete raw relationship subgraph around the finding. No nodes are removed
 * because they are unclassified. UI may filter this graph for System Path,
 * Critical Path Only, or Immediate Logic without changing raw truth. */
export interface CompleteXerPath {
  focusActivityId: string
  nodes: XerPathNode[]
  edges: XerPathEdge[]
  upstreamNodeIds: string[]
  downstreamNodeIds: string[]
  truncated: boolean
}

export interface SequencingMemo {
  /** Plain-English finding written for a PM/owner, not a P6 diagnostic log. */
  whatControlLensFound: string
  /** Why the condition matters to schedule credibility / construction execution. */
  whyThisMatters: string
  /** Kept for backward compatibility with the first Brick-2 UI. */
  scheduleCondition: string
  xerSequence: string[]
  /** One-sentence translation of FS/SS/FF/SF into normal language. */
  xerLogicMeaning: string
  clReferenceSequence: string[]
  clAssessment: string
  recommendedAction: string
  /** Raw schedule evidence belongs behind Technical Details, not in the headline. */
  technicalDetails: string[]
}

export interface ReviewFinding {
  id: string
  bucket: FindingBucket
  severity: 1 | 2 | 3 | 4 | 5
  confidence: Confidence
  activityId: string
  activityCode: string
  activityName: string
  phase?: ProjectPhase
  discipline?: string
  system?: string
  stage?: string
  activityClass?: string
  targetMilestone?: string
  ruleStrengthHint?: 'REQUIRED' | 'EXPECTED' | 'ADVISORY'
  /** false = recommendation only; display it but do not deduct readiness score. */
  scoreEligible?: boolean
  findingKind?: 'KEY_MILESTONE_SUGGESTION'
  wbsPath?: string
  headline: string
  detail: string
  varianceDays?: number
  predecessor?: { id: string; code: string; name: string; relationship: string; lagDays: number; lagHours?: number }
  supporting?: { id: string; code: string; name: string; note: string }[]
  recommendation: string

  // One finding object feeds both Sequence Problems and the Sequencing Report.
  memo: SequencingMemo
  completeXerPath: CompleteXerPath
}

export interface GroupedReview {
  totalFindings: number
  bucketCounts: Record<FindingBucket, number>
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

const DAY = 86_400_000
function ms(s?: string): number | null {
  if (!s) return null
  const d = new Date(s.replace(' ', 'T'))
  const t = d.getTime()
  return isNaN(t) ? null : t
}
function daysBetween(a: number, b: number): number { return Math.round((a - b) / DAY) }
function looksLikeMilestoneName(n: string): boolean {
  const s = n.toLowerCase()
  return /(complete|completed|readiness|ready for|turnover|substantial|final completion|dry-in|dry in|weather.?tight|available|accepted|approved)/.test(s)
}
function clean(v?: string): string { return (v || '').trim() }
function findingId(n: number): string { const x = String(n); return 'SQ-' + ('000' + x).slice(-3) }
function norm(v?: string): string { return clean(v).toLowerCase() }

/** Lightweight scope comparison only. It does NOT overwrite raw WBS. */
function locationToken(t: TraceTask): string | undefined {
  const source = `${(t as any).wbs_path || ''} ${t.task_name || ''}`
  const patterns = [
    /\b(building|bldg|bld)\s*[-_. ]*([a-z0-9]+)\b/i,
    /\b(area|zone|phase|level|floor)\s*[-_. ]*([a-z0-9]+)\b/i,
    /\b(k\.b\d+|b\d+)\b/i,
  ]
  for (const p of patterns) {
    const m = source.match(p)
    if (m) return m[0].toLowerCase().replace(/\s+/g, ' ')
  }
  return undefined
}

function sameMeaningfulSystem(a?: string, b?: string): boolean {
  const x = norm(a); const y = norm(b)
  return !!x && !!y && x !== 'general' && y !== 'general' && x === y
}
function differentMeaningfulSystem(a?: string, b?: string): boolean {
  const x = norm(a); const y = norm(b)
  return !!x && !!y && x !== 'general' && y !== 'general' && x !== y
}


function classMatches(actual: ActivityClass | undefined, required: ActivityClass | ActivityClass[]): boolean {
  if (!actual) return false
  return Array.isArray(required) ? required.includes(actual) : actual === required
}

function stageMatches(actual: ActivityStage | undefined, required?: ActivityStage | ActivityStage[]): boolean {
  if (!required) return true
  if (!actual) return false
  return Array.isArray(required) ? required.includes(actual) : actual === required
}

function wbsText(t: TraceTask): string {
  const raw = (t as any).wbs_path
  return Array.isArray(raw) ? raw.join(' > ').toLowerCase() : String(raw || '').toLowerCase()
}

function sameWbsBranch(a: TraceTask, b: TraceTask): boolean {
  const aa = wbsText(a).split('>').map(x => x.trim()).filter(Boolean)
  const bb = wbsText(b).split('>').map(x => x.trim()).filter(Boolean)
  if (!aa.length || !bb.length) return false
  const n = Math.min(aa.length, bb.length)
  let shared = 0
  while (shared < n && aa[shared] === bb[shared]) shared++
  return shared >= Math.min(2, n)
}

/** Conservative scope matcher. If a rule asks for a location-based scope but the
 * XER does not expose enough location detail, we do not reject the candidate on
 * location alone; raw graph evidence remains authoritative. */
function scopeMatches(
  triggerId: string,
  candidateId: string,
  scopes: ScopeLevel[],
  tasks: Record<string, TraceTask>,
  cls: Record<string, ClassificationResult>,
): boolean {
  if (scopes.includes('PROJECT_WIDE')) return true
  const trigger = tasks[triggerId]; const candidate = tasks[candidateId]
  if (!trigger || !candidate) return false
  const tc = cls[triggerId]; const cc = cls[candidateId]
  const tl = locationToken(trigger); const cl = locationToken(candidate)

  for (const scope of scopes) {
    if (scope === 'SAME_SYSTEM' && sameMeaningfulSystem(tc?.system, cc?.system)) return true
    if (scope === 'SAME_WBS_BRANCH' && sameWbsBranch(trigger, candidate)) return true
    if (scope === 'SAME_AREA' || scope === 'SAME_BUILDING') {
      if (tl && cl && tl === cl) return true
      if (!tl || !cl) continue
    }
    if (scope === 'SAME_EQUIPMENT_TRAIN') {
      if (sameMeaningfulSystem(tc?.system, cc?.system) && (!tl || !cl || tl === cl)) return true
    }
  }

  // When the authored scope is location-based but location is unavailable, fall
  // back to same-system evidence instead of creating a false missing-activity finding.
  const locationOnly = scopes.every(s => ['SAME_AREA', 'SAME_BUILDING', 'SAME_EQUIPMENT_TRAIN'].includes(s))
  if (locationOnly && (!tl || !cl) && sameMeaningfulSystem(tc?.system, cc?.system)) return true
  return false
}

function ancestorSet(rootId: string, predAdj: Record<string, string[]>): Set<string> {
  const out = new Set<string>()
  const q = [...(predAdj[rootId] || [])]
  while (q.length) {
    const id = q.shift()!
    if (out.has(id)) continue
    out.add(id)
    for (const p of predAdj[id] || []) if (!out.has(p)) q.push(p)
  }
  return out
}

function descendantSet(rootId: string, succAdj: Record<string, string[]>): Set<string> {
  const out = new Set<string>()
  const q = [...(succAdj[rootId] || [])]
  while (q.length) {
    const id = q.shift()!
    if (out.has(id)) continue
    out.add(id)
    for (const p of succAdj[id] || []) if (!out.has(p)) q.push(p)
  }
  return out
}

function ruleApplies(rule: ConstructionRule, cls: Record<string, ClassificationResult>): boolean {
  if (rule.applicability.includes('ALL')) return true
  // Until project type is explicitly stored in the analysis object, enable
  // mission-critical rules only when the XER itself contains strong mission-
  // critical signals. This keeps generic schedules conservative.
  if (rule.applicability.includes('MISSION_CRITICAL')) {
    return Object.values(cls).some(c => c.activityClass && ['IST', 'UPS', 'CRAH', 'EPMS'].includes(c.activityClass))
  }
  return false
}

function nodeFor(id: string, tasks: Record<string, TraceTask>, cls: Record<string, ClassificationResult>): XerPathNode | null {
  const t = tasks[id]; if (!t) return null
  const c = cls[id]
  return {
    id,
    code: t.task_code,
    name: t.task_name,
    phase: c ? c.phase : undefined,
    discipline: c ? c.discipline : undefined,
    system: c ? c.system : undefined,
    stage: c ? c.stage : undefined,
    activityClass: c ? c.activityClass : undefined,
    wbsPath: (t as any).wbs_path,
  }
}

/** Trace the complete connected predecessor/successor subgraph around focus.
 * A safety cap prevents pathological/cyclic XERs from freezing the UI. */
function buildCompletePath(
  focusId: string,
  tasks: Record<string, TraceTask>,
  rels: Relationship[],
  cls: Record<string, ClassificationResult>,
  maxNodes = 250,
): CompleteXerPath {
  const predAdj: Record<string, string[]> = {}
  const succAdj: Record<string, string[]> = {}
  for (const r of rels) {
    if (!r || !r.task_id || !r.pred_task_id) continue
    ;(predAdj[r.task_id] ||= []).push(r.pred_task_id)
    ;(succAdj[r.pred_task_id] ||= []).push(r.task_id)
  }

  const upstream = new Set<string>()
  const downstream = new Set<string>()
  let truncated = false

  const walk = (start: string, adj: Record<string, string[]>, out: Set<string>) => {
    const q = [start]
    const seen = new Set<string>(); seen.add(start)
    while (q.length) {
      const cur = q.shift()!
      for (const next of adj[cur] || []) {
        if (seen.has(next)) continue
        if (upstream.size + downstream.size + 1 >= maxNodes) { truncated = true; return }
        seen.add(next); out.add(next); q.push(next)
      }
    }
  }
  walk(focusId, predAdj, upstream)
  walk(focusId, succAdj, downstream)

  const ids = new Set<string>(); ids.add(focusId)
  upstream.forEach(x => ids.add(x)); downstream.forEach(x => ids.add(x))
  const nodes: XerPathNode[] = []
  ids.forEach(id => { const n = nodeFor(id, tasks, cls); if (n) nodes.push(n) })

  const edges: XerPathEdge[] = []
  for (const r of rels) {
    if (ids.has(r.pred_task_id) && ids.has(r.task_id)) {
      edges.push({
        predecessorId: r.pred_task_id,
        successorId: r.task_id,
        relationship: relLabel(r.pred_type),
        lagHours: parseFloat(r.lag_hr_cnt || '0') || 0,
      })
    }
  }

  return {
    focusActivityId: focusId,
    nodes,
    edges,
    upstreamNodeIds: Array.from(upstream),
    downstreamNodeIds: Array.from(downstream),
    truncated,
  }
}

function knownPhysicalDependency(predName: string, succName: string): boolean {
  const pn = norm(predName); const sn = norm(succName)
  return (
    (/(erosion|sediment|e&s)/.test(pn) && /(clear|grub)/.test(sn)) ||
    (/(footing|foundation|f\/r\/p)/.test(pn) && /(erect|structural steel)/.test(sn)) ||
    (/(cable test|hi-pot|hipot|megger|relay test|protection test)/.test(pn) && /energiz/.test(sn))
  )
}

function referenceSequenceFor(pred: TraceTask, succ: TraceTask, pc?: ClassificationResult, sc?: ClassificationResult): string[] {
  const pn = norm(pred.task_name); const sn = norm(succ.task_name)
  if (/(erosion|sediment|e&s)/.test(pn) && /(clear|grub)/.test(sn)) {
    return ['Limits of Disturbance / Survey Control', 'Erosion & Sediment Controls Installed', 'Required E&S Inspection / Release', 'Clearing & Grubbing']
  }
  if (/(footing|foundation|f\/r\/p)/.test(pn) && /(erect|structural steel)/.test(sn)) {
    return ['Foundation Work Complete', 'Anchor Bolts / Embeds Verified', 'Foundation Acceptance / Release', 'Structural Steel Erection']
  }
  if (/(cable test|hi-pot|hipot|megger|relay test|protection test)/.test(pn) && /energiz/.test(sn)) {
    return ['Equipment Set / Grounded', 'Cable Termination', 'Cable Testing / Phasing', 'Relay / Protection Testing', 'Energization Readiness', 'Energization']
  }
  if (sameMeaningfulSystem(pc && pc.system, sc && sc.system)) {
    return [`${pc && pc.system ? pc.system : 'System'} — predecessor work`, `${sc && sc.system ? sc.system : 'System'} — successor work`, 'Validate location/workfront sequencing against the accepted plan']
  }
  return ['Control Lens reference rule not yet authored for this relationship', 'Preserve actual XER dates', 'Review technical necessity of the relationship before changing logic']
}

function relationMeaning(
  pred: TraceTask,
  succ: TraceTask,
  relationship: string,
  lagDays: number,
): string {
  const lagText = lagDays > 0 ? ` plus a ${lagDays}-day lag` : ''
  if (relationship === 'Finish-to-Start') return `The XER requires ${pred.task_code} — ${pred.task_name} to finish before ${succ.task_code} — ${succ.task_name} can start${lagText}.`
  if (relationship === 'Start-to-Start') return `The XER requires ${pred.task_code} — ${pred.task_name} to start before ${succ.task_code} — ${succ.task_name} can start${lagText}.`
  if (relationship === 'Finish-to-Finish') return `The XER requires ${pred.task_code} — ${pred.task_name} to reach its finish before ${succ.task_code} — ${succ.task_name} can reach its finish${lagText}.`
  if (relationship === 'Start-to-Finish') return `The XER ties the finish of ${succ.task_code} — ${succ.task_name} to the start of ${pred.task_code} — ${pred.task_name}${lagText}. This uncommon relationship should be reviewed carefully.`
  return `The XER links ${pred.task_code} — ${pred.task_name} to ${succ.task_code} — ${succ.task_name} using ${relationship}${lagText}.`
}

function dateLabel(value?: string): string {
  if (!value) return 'no recorded actual date'
  const d = new Date(value.replace(' ', 'T'))
  if (isNaN(d.getTime())) return value
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function actualEvidence(pred: TraceTask, succ: TraceTask, relationship: string): { predDate?: string; succDate?: string; sentence: string } {
  let predDate: string | undefined
  let succDate: string | undefined
  let sentence = ''
  if (relationship === 'Finish-to-Start') {
    predDate = pred.act_end_date; succDate = succ.act_start_date
    sentence = `${succ.task_code} — ${succ.task_name} started on ${dateLabel(succDate)}, while ${pred.task_code} — ${pred.task_name} did not finish until ${dateLabel(predDate)}.`
  } else if (relationship === 'Start-to-Start') {
    predDate = pred.act_start_date; succDate = succ.act_start_date
    sentence = `${succ.task_code} — ${succ.task_name} started on ${dateLabel(succDate)}, before ${pred.task_code} — ${pred.task_name} started on ${dateLabel(predDate)}.`
  } else if (relationship === 'Finish-to-Finish') {
    predDate = pred.act_end_date; succDate = succ.act_end_date
    sentence = `${succ.task_code} — ${succ.task_name} finished on ${dateLabel(succDate)}, before ${pred.task_code} — ${pred.task_name} finished on ${dateLabel(predDate)}.`
  } else {
    predDate = pred.act_start_date; succDate = succ.act_end_date
    sentence = `${succ.task_code} — ${succ.task_name} finished on ${dateLabel(succDate)}, before ${pred.task_code} — ${pred.task_name} started on ${dateLabel(predDate)}.`
  }
  return { predDate, succDate, sentence }
}

function makeMemo(
  succ: TraceTask,
  pred: TraceTask,
  relationship: string,
  lagDays: number,
  lagHours: number,
  variance: number,
  bucket: FindingBucket,
  recommendation: string,
  pc: ClassificationResult,
  sc: ClassificationResult,
): SequencingMemo {
  const logicMeaning = relationMeaning(pred, succ, relationship, lagDays)
  const evidence = actualEvidence(pred, succ, relationship)
  const varianceText = `${variance} day${variance === 1 ? '' : 's'}`

  // The first sentence tells a PM what the schedule says; the second tells them what
  // actually happened. Raw P6 terminology is deliberately pushed to Technical Details.
  const found = `${logicMeaning} Actual progress does not follow that sequence: ${evidence.sentence} The recorded work therefore occurred ${varianceText} earlier than the current XER logic would allow.`

  let why = 'This is a schedule-logic conflict, but it does not by itself prove that the field work was performed incorrectly. The reviewer needs to determine whether the actual dates are wrong, the relationship no longer represents the intended sequence, or the work was legitimately resequenced.'
  let assessment = 'Control Lens found a conflict between recorded actual progress and the accepted XER relationship. No authored construction rule currently establishes that this exact relationship is technically mandatory, so the condition should remain a review item until the project basis is verified.'

  if (bucket === 'CONSTRUCTION_SEQUENCE') {
    why = 'This relationship aligns with a recognized physical, testing, environmental, or permitting prerequisite. Proceeding out of sequence may affect safety, quality, inspections, acceptance, or downstream readiness, so this condition deserves stronger review than a simple P6 date conflict.'
    assessment = 'Control Lens recognizes a construction prerequisite behind this relationship. The schedule conflict may therefore represent a genuine sequencing concern, subject to confirmation against the contract, approved plans, permits, inspection requirements, and field records.'
  } else if (bucket === 'LIKELY_INCORRECT_RELATIONSHIP') {
    why = 'The two activities classify to different construction systems. Cross-system relationships can be valid, but this one may be tying the successor to work that is not its real construction driver. Leaving an unsupported relationship in place can distort float, critical-path visibility, and forecast dates.'
    assessment = 'Control Lens sees a possible cross-system logic problem. The relationship should be preserved only if the contractor can explain the technical or contractual dependency; otherwise the schedule should be tied to the actual construction driver.'
  } else if (bucket === 'PHASING_LOCATION') {
    why = 'The activities appear to belong to the same system but different work areas or locations. The field may have legitimately progressed by workfront, while the XER uses one broad relationship that forces the entire predecessor activity to finish first. If so, the schedule is masking the contractor’s real phasing strategy.'
    assessment = 'Control Lens sees a likely workfront/location issue rather than automatic bad field execution. Confirm the contractor’s area-by-area sequence and, if appropriate, model the work with location-based activities or relationships while preserving truthful actual dates.'
  }

  const technical = [
    `Predecessor: ${pred.task_code} — ${pred.task_name}`,
    `Successor: ${succ.task_code} — ${succ.task_name}`,
    `Relationship: ${relationship}`,
    `Lag: ${lagHours || 0} hour${Math.abs(lagHours || 0) === 1 ? '' : 's'}${lagDays ? ` (approximately ${lagDays} working day${Math.abs(lagDays) === 1 ? '' : 's'} for display)` : ''}`,
    `Measured variance: ${varianceText} earlier than the current XER relationship permits`,
  ]

  return {
    whatControlLensFound: found,
    whyThisMatters: why,
    scheduleCondition: found,
    xerSequence: [`${pred.task_code} — ${pred.task_name}`, `${relationship}${lagDays ? ` + ${lagDays}d lag` : ''}`, `${succ.task_code} — ${succ.task_name}`],
    xerLogicMeaning: logicMeaning,
    clReferenceSequence: referenceSequenceFor(pred, succ, pc, sc),
    clAssessment: assessment,
    recommendedAction: recommendation,
    technicalDetails: technical,
  }
}

export function runConstructionReview(analysis: {
  traceTasks?: Record<string, TraceTask>
  traceRelationships?: Relationship[]
  wbsNodes?: Record<string, WbsNode>
}): GroupedReview | null {
  const tasks = analysis.traceTasks
  const rels = analysis.traceRelationships
  if (!tasks || !rels || Object.keys(tasks).length === 0) return null

  const cls: Record<string, ClassificationResult> = {}
  for (const id of Object.keys(tasks)) {
    cls[id] = classifyActivity({
      task_id: id,
      task_code: tasks[id].task_code,
      task_name: tasks[id].task_name,
      task_type: tasks[id].task_type,
      wbs_path: (tasks[id] as any).wbs_path,
    })
  }

  const predMap: Record<string, { pred: string; type: string; lag: string }[]> = {}
  for (const r of rels) {
    if (!r || !r.task_id) continue
    ;(predMap[r.task_id] ||= []).push({ pred: r.pred_task_id, type: r.pred_type, lag: r.lag_hr_cnt })
  }

  let findings: ReviewFinding[] = []
  let fid = 0

  // LAYER 1 + conservative LAYER 2 routing.
  for (const r of rels) {
    const succ = tasks[r.task_id]; const pred = tasks[r.pred_task_id]
    if (!succ || !pred) continue

    // Actual-vs-XER means ACTUAL dates only. Do not substitute early/forecast dates.
    let requiredMs: number | null = null
    let succActualMs: number | null = null
    let kind = ''
    switch (r.pred_type) {
      case 'PR_FS': requiredMs = ms(pred.act_end_date); succActualMs = ms(succ.act_start_date); kind = 'started before predecessor finished'; break
      case 'PR_SS': requiredMs = ms(pred.act_start_date); succActualMs = ms(succ.act_start_date); kind = 'started before predecessor started'; break
      case 'PR_FF': requiredMs = ms(pred.act_end_date); succActualMs = ms(succ.act_end_date); kind = 'finished before predecessor finished'; break
      case 'PR_SF': requiredMs = ms(pred.act_start_date); succActualMs = ms(succ.act_end_date); kind = 'finished before predecessor started'; break
      default: continue
    }
    if (requiredMs === null || succActualMs === null) continue

    const lagHours = parseFloat(r.lag_hr_cnt || '0') || 0
    // Existing product convention uses 8h/day for display only. CPM/calendar-aware lag
    // interpretation belongs to Phase 2; raw lagHours is also preserved on the finding.
    const lagDays = Math.round(lagHours / 8)
    const variance = daysBetween(requiredMs, succActualMs) - lagDays
    if (variance <= 0) continue

    const sc = cls[r.task_id]
    const pc = cls[r.pred_task_id]
    const predLoc = locationToken(pred)
    const succLoc = locationToken(succ)

    let bucket: FindingBucket = 'NEEDS_REVIEW'
    let severity: ReviewFinding['severity'] = variance >= 30 ? 4 : variance >= 7 ? 3 : 2
    let confidence: Confidence = 'medium'

    const physical = knownPhysicalDependency(pred.task_name, succ.task_name)
    if (physical) {
      bucket = 'CONSTRUCTION_SEQUENCE'; severity = 4; confidence = 'high'
    } else if (sameMeaningfulSystem(pc && pc.system, sc && sc.system) && predLoc && succLoc && predLoc !== succLoc) {
      bucket = 'PHASING_LOCATION'; severity = Math.min(severity, 3) as 2 | 3; confidence = 'medium'
    } else if (differentMeaningfulSystem(pc && pc.system, sc && sc.system)) {
      // Conservative signal, not a declaration: cross-system dependencies can be valid.
      bucket = 'LIKELY_INCORRECT_RELATIONSHIP'; severity = Math.min(severity, 3) as 2 | 3; confidence = 'low'
    }

    const recommendation = physical
      ? 'Verify the accepted construction sequence and actual field dates against the contract, approved plans, permits, and test/inspection prerequisites. If early execution was not authorized, correct the schedule narrative/logic and assess the out-of-sequence condition.'
      : bucket === 'PHASING_LOCATION'
        ? 'Review the contractor’s intended workfront and location sequence. If the activities legitimately progressed in separate areas, model the appropriate area/phase logic rather than changing truthful actual dates.'
        : bucket === 'LIKELY_INCORRECT_RELATIONSHIP'
          ? 'Validate the technical basis for this cross-system relationship. If no direct prerequisite exists, revise the relationship to the correct construction driver; do not alter truthful actual dates merely to satisfy the current XER logic.'
          : 'Confirm whether the actual date, relationship, or milestone definition is the source of the conflict. Until a Control Lens appropriateness rule exists for this pair, retain this as Needs Review and do not make a hard engineering conclusion.'

    const relationship = relLabel(r.pred_type)
    findings.push({
      id: findingId(++fid),
      bucket, severity, confidence,
      activityId: r.task_id,
      activityCode: succ.task_code,
      activityName: succ.task_name,
      phase: sc.phase,
      discipline: sc.discipline,
      system: sc.system,
      stage: sc.stage,
      wbsPath: (succ as any).wbs_path,
      headline: bucket === 'CONSTRUCTION_SEQUENCE'
        ? `Construction sequence needs verification for ${succ.task_code} — ${succ.task_name}`
        : bucket === 'PHASING_LOCATION'
          ? `Current XER logic may not reflect the field phasing for ${succ.task_code} — ${succ.task_name}`
          : bucket === 'LIKELY_INCORRECT_RELATIONSHIP'
            ? `Relationship may not represent the actual construction driver for ${succ.task_code} — ${succ.task_name}`
            : `Recorded progress does not follow the current XER logic for ${succ.task_code} — ${succ.task_name}`,
      detail: relationMeaning(pred, succ, relationship, lagDays),
      varianceDays: variance,
      predecessor: { id: r.pred_task_id, code: pred.task_code, name: pred.task_name, relationship, lagDays, lagHours },
      recommendation,
      memo: makeMemo(succ, pred, relationship, lagDays, lagHours, variance, bucket, recommendation, pc, sc),
      completeXerPath: buildCompletePath(r.task_id, tasks, rels, cls),
    })
  }


  // ---------------------------------------------------------------------------
  // REFERENCE-LIBRARY REVIEW — use the authored construction rules already
  // generated in library.ts. This is additive: it does not replace Layer 1,
  // does not alter dates, and does not recompute CPM.
  // ---------------------------------------------------------------------------
  const predAdj: Record<string, string[]> = {}
  const succAdj: Record<string, string[]> = {}
  for (const r of rels) {
    if (!r?.task_id || !r?.pred_task_id) continue
    ;(predAdj[r.task_id] ||= []).push(r.pred_task_id)
    ;(succAdj[r.pred_task_id] ||= []).push(r.task_id)
  }

  const ruleFindings: ReviewFinding[] = []
  for (const rule of RULES) {
    if (!ruleApplies(rule, cls)) continue

    for (const triggerId of Object.keys(tasks)) {
      const tc = cls[triggerId]
      if (!tc || tc.activityClass !== rule.trigger.activityClass || tc.stage !== rule.trigger.stage) continue

      const trigger = tasks[triggerId]
      const ancestors = ancestorSet(triggerId, predAdj)
      const descendants = descendantSet(triggerId, succAdj)
      const problems: { label: string; kind: 'missing' | 'untied' | 'downstream'; ids: string[] }[] = []
      const supporting: { id: string; code: string; name: string; note: string }[] = []

      for (const req of rule.prerequisites) {
        const requiredClasses = Array.isArray(req.activityClass) ? req.activityClass : [req.activityClass]
        const classResults = requiredClasses.map(requiredClass => {
          const candidates = Object.keys(tasks).filter(id => {
            const c = cls[id]
            return classMatches(c?.activityClass, requiredClass) && stageMatches(c?.stage, req.stage) &&
              scopeMatches(triggerId, id, req.scope, tasks, cls)
          })
          const upstream = candidates.filter(id => ancestors.has(id))
          const downstream = candidates.filter(id => descendants.has(id))
          return { requiredClass, candidates, upstream, downstream }
        })

        const needsAllClasses = req.mode === 'ALL' && requiredClasses.length > 1
        const satisfied = needsAllClasses
          ? classResults.every(x => x.upstream.length > 0)
          : classResults.some(x => x.upstream.length > 0)
        if (satisfied) continue

        const anyCandidate = classResults.some(x => x.candidates.length > 0)
        const anyDownstream = classResults.some(x => x.downstream.length > 0)
        const kind: 'missing' | 'untied' | 'downstream' = !anyCandidate ? 'missing' : anyDownstream ? 'downstream' : 'untied'
        if (req.optional && kind === 'missing') continue

        const ids = classResults.flatMap(x => x.candidates).slice(0, 12)
        problems.push({ label: req.label, kind, ids })
        for (const id of ids.slice(0, 4)) {
          const t = tasks[id]
          if (!t) continue
          supporting.push({
            id,
            code: t.task_code,
            name: t.task_name,
            note: kind === 'downstream' ? `${req.label} appears downstream of the trigger` : `${req.label} exists but is not in the trigger's predecessor path`,
          })
        }
      }

      if (!problems.length) continue

      const labels = problems.map(p => p.label)
      const missing = problems.filter(p => p.kind === 'missing').map(p => p.label)
      const untied = problems.filter(p => p.kind === 'untied').map(p => p.label)
      const downstream = problems.filter(p => p.kind === 'downstream').map(p => p.label)
      const target = String(rule.targetMilestone || '')
      const strength = rule.ruleType === 'HARD' ? 'REQUIRED' : rule.ruleType === 'EXPECTED' ? 'EXPECTED' : 'ADVISORY'
      const bucket: FindingBucket = rule.ruleType === 'HARD' ? 'CONSTRUCTION_SEQUENCE' : 'NEEDS_REVIEW'
      const recommendation = rule.ruleType === 'HARD'
        ? `Verify the ${labels.join(', ')} readiness requirements in the XER path to ${target || trigger.task_name}. Add or correct the logical ties where the prerequisite is genuinely required; preserve truthful actual dates.`
        : `The current path differs from the Control Lens reference sequence. Verify whether the project-specific plan justifies the deviation and clarify or revise the logic as appropriate.`
      const conditionParts = [
        missing.length ? `missing from the scoped schedule: ${missing.join(', ')}` : '',
        untied.length ? `present but not in the predecessor path: ${untied.join(', ')}` : '',
        downstream.length ? `shown downstream of the trigger: ${downstream.join(', ')}` : '',
      ].filter(Boolean)
      const condition = conditionParts.join('; ')

      ruleFindings.push({
        id: findingId(++fid),
        bucket,
        severity: rule.severity,
        confidence: rule.ruleType === 'HARD' ? 'high' : 'medium',
        activityId: triggerId,
        activityCode: trigger.task_code,
        activityName: trigger.task_name,
        phase: tc.phase,
        discipline: tc.discipline || rule.trigger.discipline,
        system: tc.system || rule.trigger.system,
        stage: tc.stage,
        activityClass: tc.activityClass,
        targetMilestone: target,
        ruleStrengthHint: strength,
        wbsPath: (trigger as any).wbs_path,
        headline: `${target || tc.system || 'System'} readiness path is incomplete for ${trigger.task_code} — ${trigger.task_name}`,
        detail: `${rule.findingText} Control Lens found ${problems.length} unsatisfied reference prerequisite${problems.length === 1 ? '' : 's'}: ${condition}.`,
        supporting: supporting.slice(0, 20),
        recommendation,
        memo: {
          whatControlLensFound: `${trigger.task_code} — ${trigger.task_name} does not currently demonstrate the complete Control Lens reference path to ${target || 'the target milestone'}. ${condition}.`,
          whyThisMatters: `The affected prerequisite states support ${target || 'system readiness'}. If they are genuinely required but absent from the driving path, the schedule may overstate readiness, distort float, or allow downstream startup/testing milestones to appear achievable before the system is actually ready.`,
          scheduleCondition: condition,
          xerSequence: [`Trigger: ${trigger.task_code} — ${trigger.task_name}`].concat(supporting.slice(0, 10).map(x => `${x.code} — ${x.name} (${x.note})`)),
          xerLogicMeaning: `Control Lens traced the raw XER predecessor network for the trigger and compared the detected construction states with authored rule ${rule.id}.`,
          clReferenceSequence: rule.recommendedChain.slice().sort((a, b) => a.order - b.order).map(x => x.label),
          clAssessment: rule.ruleType === 'HARD'
            ? `Rule ${rule.id} is a required construction/readiness prerequisite in the current reference library. The path is incomplete and should be verified before relying on ${target || 'the downstream milestone'}.`
            : `Rule ${rule.id} represents an expected/reference sequence. The deviation is a reviewer trigger, not an automatic declaration that the contractor is wrong.`,
          recommendedAction: recommendation,
          technicalDetails: [
            `Reference rule: ${rule.id}`,
            `Rule strength: ${strength}`,
            `Trigger class/stage: ${rule.trigger.activityClass} / ${rule.trigger.stage}`,
            `Target milestone: ${target || '—'}`,
          ].concat(problems.map(p => `${p.label}: ${p.kind}`)),
        },
        completeXerPath: buildCompletePath(triggerId, tasks, rels, cls),
      })
    }
  }


  findings = findings.concat(ruleFindings)

  // ---------------------------------------------------------------------------
  // REFERENCE-PATH PRESENCE / SUGGESTED KEY MILESTONES
  // ---------------------------------------------------------------------------
  // Important boundary:
  //   - These are Control Lens control recommendations, NOT contractual findings.
  //   - They are non-scoring until a future Contract / Owner Profile explicitly
  //     marks the same milestone as required.
  //   - Applicability comes from systems actually detected in the XER, so a
  //     standard building is not forced to carry data-center-only milestones.
  // ---------------------------------------------------------------------------
  const presentClasses = new Set<ActivityClass>()
  for (const id of Object.keys(cls)) {
    const ac = cls[id]?.activityClass
    if (ac) presentClasses.add(ac)
  }

  function milestoneNameMatch(name: string, aliases: string[]): boolean {
    const n = norm(name).replace(/[–—_-]+/g, ' ').replace(/\s+/g, ' ')
    return aliases.some(alias => {
      const a = norm(alias).replace(/[–—_-]+/g, ' ').replace(/\s+/g, ' ')
      if (!a) return false
      if (a === 'rfs') return /(^|\s)rfs($|\s)/.test(n)
      return n.includes(a)
    })
  }

  function isMilestoneTask(t: TraceTask): boolean {
    const tt = String(t.task_type || '')
    return tt === 'TT_Mile' || tt === 'TT_FinMile' || tt === 'TT_StartMile' || looksLikeMilestoneName(t.task_name || '')
  }

  const milestoneSuggestionFindings: ReviewFinding[] = []
  for (const ref of REFERENCE_CONTROL_MILESTONES) {
    const anyClass = ref.appliesIfAnyClass.some(c => presentClasses.has(c))
    const signature = !!ref.appliesIfAllGroups?.length && ref.appliesIfAllGroups.every(group => group.some(c => presentClasses.has(c)))
    if (!anyClass && !signature) continue

    const equivalentTasks = Object.keys(tasks).filter(id => milestoneNameMatch(tasks[id].task_name || '', ref.aliases))
    const equivalentMilestones = equivalentTasks.filter(id => isMilestoneTask(tasks[id]))
    if (equivalentMilestones.length) continue

    // Anchor the recommendation to a real, relevant XER activity so the existing
    // report/trace components need no redesign.
    const relevantIds = Object.keys(tasks).filter(id => {
      const ac = cls[id]?.activityClass
      return !!ac && ref.appliesIfAnyClass.includes(ac)
    })
    const anchorId = equivalentTasks[0] || relevantIds[0]
    if (!anchorId) continue
    const anchor = tasks[anchorId]
    const ac = cls[anchorId]
    const stateExists = equivalentTasks.length > 0

    const condition = stateExists
      ? `An equivalent schedule state was identified (${anchor.task_code} — ${anchor.task_name}), but it is not modeled as an identifiable key milestone.`
      : `Control Lens did not identify an equivalent ${ref.name} milestone in the XER.`
    const recommendation = `Consider adding “${ref.name}” under the ${ref.recommendedWbs} WBS, or map the existing equivalent control point to it. This is a Control Lens schedule-control recommendation, not a contractual requirement unless the governing contract or owner profile requires it.`

    milestoneSuggestionFindings.push({
      id: findingId(++fid),
      bucket: 'NEEDS_REVIEW',
      severity: 1,
      confidence: stateExists ? 'high' : 'medium',
      activityId: anchorId,
      activityCode: anchor.task_code,
      activityName: anchor.task_name,
      phase: ref.approvalArea === 'COMMISSIONING' ? 'STARTUP_COMMISSIONING' : ac.phase,
      discipline: ref.discipline,
      system: ref.system,
      stage: ac.stage,
      activityClass: ac.activityClass,
      targetMilestone: ref.name,
      ruleStrengthHint: 'ADVISORY',
      scoreEligible: false,
      findingKind: 'KEY_MILESTONE_SUGGESTION',
      wbsPath: (anchor as any).wbs_path,
      headline: `Suggested Key Milestone — ${ref.name}`,
      detail: `${condition} ${ref.rationale}`,
      recommendation,
      memo: {
        whatControlLensFound: condition,
        whyThisMatters: ref.rationale,
        scheduleCondition: condition,
        xerSequence: stateExists
          ? [`Existing equivalent state: ${anchor.task_code} — ${anchor.task_name}`]
          : [`Relevant system evidence: ${anchor.task_code} — ${anchor.task_name}`],
        xerLogicMeaning: 'Control Lens compared the systems detected in the XER with its reference control-milestone scaffold. This check does not infer a contract requirement.',
        clReferenceSequence: ref.referencePath,
        clAssessment: `Adding ${ref.name} as a visible control milestone can improve milestone convergence, executive reporting, and downstream readiness review. It remains optional unless project requirements make it mandatory.`,
        recommendedAction: recommendation,
        technicalDetails: [
          `Reference control milestone: ${ref.id}`,
          'Classification: Control Lens recommendation only',
          'Scoring impact: none',
          `Suggested WBS: ${ref.recommendedWbs}`,
        ],
      },
      completeXerPath: buildCompletePath(anchorId, tasks, rels, cls),
    })
  }

  findings = findings.concat(milestoneSuggestionFindings)

  // MILESTONE INTEGRITY — consolidate repetitive predecessor conflicts.
  const milestonePairs = new Set<string>()
  const milestoneFindings: ReviewFinding[] = []
  for (const id of Object.keys(tasks)) {
    const mtask = tasks[id]
    if (!looksLikeMilestoneName(mtask.task_name)) continue
    const mFin = ms(mtask.act_end_date)
    if (mFin === null) continue

    const preds = predMap[id] || []
    const late: { id: string; code: string; name: string; note: string }[] = []
    for (const p of preds) {
      const pt = tasks[p.pred]; if (!pt) continue
      const pFin = ms(pt.act_end_date)
      if (pFin === null || pFin <= mFin) continue
      const by = daysBetween(pFin, mFin)
      late.push({ id: p.pred, code: pt.task_code, name: pt.task_name, note: `finishes ${by}d after the milestone` })
      milestonePairs.add(`${p.pred}->${id}`)
    }

    if (late.length >= 2) {
      const c = cls[id]
      const recommendation = 'Review the milestone definition and its supporting logic. If these activities are genuine prerequisites, they should drive the completion/readiness milestone. If they are not prerequisites, remove the inappropriate relationships and redefine the milestone basis.'
      milestoneFindings.push({
        id: findingId(++fid),
        bucket: 'MILESTONE_INTEGRITY',
        severity: 4,
        confidence: 'high',
        activityId: id,
        activityCode: mtask.task_code,
        activityName: mtask.task_name,
        phase: c.phase,
        discipline: c.discipline,
        system: c.system,
        stage: c.stage,
        wbsPath: (mtask as any).wbs_path,
        headline: `${mtask.task_code} — ${late.length} supporting predecessors finish after this completion/readiness activity`,
        detail: `The activity is recorded complete/ready while ${late.length} supporting predecessors finish later. Control Lens consolidates these as one milestone-integrity problem rather than ${late.length} repetitive violations.`,
        supporting: late.slice(0, 50),
        recommendation,
        memo: {
          whatControlLensFound: `${mtask.task_code} — ${mtask.task_name} is recorded as complete/ready, but ${late.length} activities currently connected as supporting predecessors finished after that declared completion point. The schedule is therefore saying the milestone was achieved while work represented as a prerequisite was still unfinished.`,
          whyThisMatters: `A completion or readiness milestone should give the owner a reliable control point. When ${late.length} linked prerequisites finish later, the milestone can no longer be read at face value and may misstate readiness, downstream starts, float, or contractual status. This is one milestone-integrity issue with ${late.length} pieces of supporting evidence — not ${late.length} separate construction failures.`,
          scheduleCondition: `${mtask.task_code} — ${mtask.task_name} is recorded complete/ready while ${late.length} supporting predecessors finish afterward.`,
          xerSequence: late.slice(0, 12).map(x => `${x.code} — ${x.name} (${x.note})`).concat([`→ ${mtask.task_code} — ${mtask.task_name}`]),
          xerLogicMeaning: `The XER represents these ${late.length} activities as supporting predecessors to ${mtask.task_code} — ${mtask.task_name}, yet the milestone is recorded complete before they finish.`,
          clReferenceSequence: ['Required supporting approvals / prerequisites', '→ Completion / Readiness milestone'],
          clAssessment: 'Control Lens identifies a milestone-definition and logic-integrity problem. First determine which linked activities are true requirements for this milestone. Genuine prerequisites should drive the milestone; unrelated activities should not be connected in a way that falsely defines completion.',
          recommendedAction: recommendation,
          technicalDetails: late.slice(0, 20).map(x => `${x.code} — ${x.name}: ${x.note}`),
        },
        completeXerPath: buildCompletePath(id, tasks, rels, cls),
      })
    }
  }

  // Remove Layer-1 rows represented by consolidated milestone evidence.
  findings = findings.filter(f => {
    if (!f.predecessor) return true
    return !milestonePairs.has(`${f.predecessor.id}->${f.activityId}`)
  }).concat(milestoneFindings)

  // Calibration coverage.
  const N = Object.keys(tasks).length
  let cp = 0, cd = 0, csx = 0, cst = 0, cun = 0
  for (const id of Object.keys(cls)) {
    const c = cls[id]
    if (c.phase) cp++
    if (c.discipline) cd++
    if (c.system) csx++
    if (c.stage) cst++
    if (!c.phase && !c.discipline) cun++
  }
  const pct = (x: number) => N ? Math.round((100 * x) / N) : 0

  const bucketCounts = {} as Record<FindingBucket, number>
  for (const k of Object.keys(BUCKET_LABEL)) bucketCounts[k as FindingBucket] = 0
  for (const f of findings) bucketCounts[f.bucket]++

  const byPhase = new Map<string, ReviewFinding[]>()
  for (const f of findings) {
    const key = f.phase || 'UNCLASSIFIED'
    ;(byPhase.get(key) || byPhase.set(key, []).get(key)!).push(f)
  }

  const orderedPhases = PHASE_ORDER.slice() as (ProjectPhase | 'UNCLASSIFIED')[]
  orderedPhases.push('UNCLASSIFIED')
  const groups = orderedPhases.filter(p => byPhase.has(p)).map(p => {
    const list = byPhase.get(p)!
    const byDisc = new Map<string, ReviewFinding[]>()
    for (const f of list) {
      const d = f.discipline || 'General / Unresolved'
      ;(byDisc.get(d) || byDisc.set(d, []).get(d)!).push(f)
    }
    return {
      phase: p,
      phaseLabel: p === 'UNCLASSIFIED' ? 'Unclassified / Review' : PHASE_LABEL[p as ProjectPhase],
      count: list.length,
      disciplines: Array.from(byDisc.entries()).map(([discipline, dfindings]) => {
        const bySys = new Map<string, ReviewFinding[]>()
        for (const f of dfindings) {
          const s = f.system || 'General / Unresolved'
          ;(bySys.get(s) || bySys.set(s, []).get(s)!).push(f)
        }
        return {
          discipline,
          count: dfindings.length,
          systems: Array.from(bySys.entries()).map(([system, sf]) => ({ system, findings: sf })),
        }
      }),
    }
  })

  return {
    totalFindings: findings.length,
    bucketCounts,
    groups,
    classificationCoverage: {
      phase: pct(cp), discipline: pct(cd), system: pct(csx), stage: pct(cst), unresolved: pct(cun),
    },
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
