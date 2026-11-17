import type { ApprovalFinding } from './types'
import { commissioningPhase } from './commissioning'
import { detectFinalCompletionTarget, detectPhaseTurnoverTarget, taskFinishDate } from '../completionBoundary'

export interface PlanningComment extends ApprovalFinding { sourceFindingIds: string[] }
export interface PhasePathSummary {
  phase: string
  milestones: { code: string; name: string; date: string; complete: boolean }[]
  candidates: { id: string; code: string; name: string; basis: string }[]
  pathNumbers: string[]
}
export interface PlanningReview {
  comments: PlanningComment[]
  phases: PhasePathSummary[]
  endpoint?: { code: string; name: string; date: string; basis: 'EXPLICIT_FINAL' | 'TURNOVER_REVIEW_BOUNDARY' }
  rawFindingCount: number
  excludedTechnicalCount: number
  disposition: 'REVIEW_REQUIRED' | 'NO_MATERIAL_COMMENT_IDENTIFIED'
  note: string
}
const text = (task: any) => `${task?.task_code || ''} ${task?.task_name || ''}`
const complete = (task: any) => task?.status_code === 'TK_Complete'
const id = (task: any) => String(task?.task_id || task?.id || '')
const phaseSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })
function labels(phases: string[]): string {
  const sorted = Array.from(new Set(phases)).sort(phaseSort)
  const numbers = sorted.map(p => /^PH(\d+)$/.exec(p)?.[1]).filter(Boolean).map(Number)
  if (numbers.length === sorted.length && numbers.length > 1 && numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1)) return `Phases ${numbers[0]}–${numbers[numbers.length - 1]}`
  return sorted.map(p => p.replace(/^PH(\d+)$/, 'Phase $1')).join(', ') || 'Project'
}
function refs(activities: ApprovalFinding['affectedActivities'], limit = 4): string {
  return activities.slice(0, limit).map(a => `${a.code} (${a.name})`).join('; ')
}
const technicalOnly = /out[- ]of[- ]sequence|missing predecessor|missing successor|open[- ]end|negative lag|positive lag|relationship (?:type|mix)|FS relationship|constraint|calendar|original duration|remaining duration|duplicate activit|zero duration|coding|WBS detail|activity descriptions|final completion|after final|actual date|actual start|actual finish|recorded progress|progress date|relationship may not represent the actual construction driver/i

export function buildPlanningReview(analysis: any, findings: ApprovalFinding[]): PlanningReview {
  const tasks = Object.values(analysis.traceTasks || {}) as any[]
  const byId = new Map(tasks.map(t => [id(t), t]))
  const relationships = (analysis.traceRelationships || []) as any[]
  const predecessors = new Map<string, string[]>()
  for (const r of relationships) predecessors.set(String(r.task_id), [...(predecessors.get(String(r.task_id)) || []), String(r.pred_task_id)])
  const milestones = tasks.filter(t => /MILE/i.test(t.task_type || '') && /\bNEA\b|\bH2C\b|\bPFHO\b|phase.*(?:handover|turnover)/i.test(text(t)))
  const datedFinal = detectFinalCompletionTarget(tasks)
  const explicitFinal = datedFinal?.date ? datedFinal : null
  const endpoint = analysis.facilityType === 'DATA_CENTER' ? detectPhaseTurnoverTarget(tasks) || explicitFinal : explicitFinal || detectPhaseTurnoverTarget(tasks)
  const targets = [...milestones, ...(endpoint ? [endpoint.task] : [])]
  function upstream(targetIds: string[]): Map<string, number> {
    const distance = new Map<string, number>(); const queue = targetIds.map(key => ({ key, depth: 0 }))
    for (let i = 0; i < queue.length; i++) {
      const { key, depth } = queue[i]
      for (const pred of predecessors.get(key) || []) if (pred && !distance.has(pred) && !targetIds.includes(pred)) {
        distance.set(pred, depth + 1); queue.push({ key: pred, depth: depth + 1 })
      }
    }
    return distance
  }
  const ancestors = upstream(targets.map(id))
  const isPathCandidate = (task: any) => {
    if (!task || complete(task) || !ancestors.has(id(task))) return false
    const value = String(task.total_float_hr_cnt ?? '').trim()
    return task.driving_path_flag === 'Y' || (value !== '' && Number.isFinite(Number(value)) && Number(value) <= 0)
  }
  const relevantIds = new Set(tasks.filter(isPathCandidate).map(id))
  const phases = Array.from(new Set(milestones.map(t => commissioningPhase(t) || 'Shared'))).sort(phaseSort).map(phase => {
    const selected = milestones.filter(t => (commissioningPhase(t) || 'Shared') === phase)
    const distances = upstream(selected.filter(t => !complete(t)).map(id))
    const candidates = tasks.filter(t => distances.has(id(t)) && isPathCandidate(t) && !/MILE/i.test(t.task_type || ''))
      .sort((a, b) => (distances.get(id(a))! - distances.get(id(b))!) || String(a.task_code).localeCompare(String(b.task_code)))
    // The report shows a few nearest work candidates, not the entire ancestor network.
    return { phase, milestones: selected.map(t => ({ code: String(t.task_code), name: String(t.task_name), date: String(t.early_end_date || t.target_end_date || '').slice(0, 10), complete: complete(t) })),
      candidates: candidates.slice(0, 3).map(t => ({ id: id(t), code: String(t.task_code), name: String(t.task_name), basis: t.driving_path_flag === 'Y' ? 'P6 longest-path flag; connected to turnover' : 'Nonpositive total float; connected to turnover' })),
      pathNumbers: Array.from(new Set(candidates.map(t => String(t.float_path || '')).filter(Boolean))).sort(phaseSort),
    }
  })
  const comments: PlanningComment[] = []
  const push = (key: string, title: string, observation: string, action: string, source: ApprovalFinding[] = [], affectedActivities: ApprovalFinding['affectedActivities'] = []) => {
    const unique = new Map<string, ApprovalFinding['affectedActivities'][number]>()
    for (const a of [...affectedActivities, ...source.flatMap(f => f.affectedActivities)]) unique.set(a.id || a.code, a)
    const required = source.some(f => f.commentDisposition === 'REQUIRED_CORRECTION' || (f.authority === 'PROJECT_REQUIREMENT' && f.ruleStrength === 'REQUIRED'))
    comments.push({ id: `PLAN-${key}`, kind: 'FINDING', primaryDomain: source[0]?.primaryDomain || 'AR-02',
      title, whatFound: observation, reviewerCheck: action, preSubmissionNote: action,
      whyItMatters: 'The review focuses on the work and sequence supporting the stated turnover dates.',
      referenceRequirement: source.find(f => f.authority === 'PROJECT_REQUIREMENT')?.referenceRequirement || 'Submitted XER paths and commissioning scope; confirm project-specific requirements.',
      ruleStrength: required ? 'REQUIRED' : 'ADVISORY', authority: required ? 'PROJECT_REQUIREMENT' : 'REVIEWER_JUDGMENT', commentDisposition: required ? 'REQUIRED_CORRECTION' : 'CLARIFICATION',
      severity: required ? 4 : 2, confidence: 'medium', criticalGate: required, scoreDeduction: 0,
      affectedActivities: Array.from(unique.values()), evidence: [], status: 'NEW', sourceFindingIds: source.map(f => f.id),
    })
  }
  const activeTargets = targets.filter(t => !complete(t))
  if (activeTargets.length && !relevantIds.size) push('PATH-BASIS', 'Identify the work controlling the turnover dates',
    'Turnover milestones are present, but no incomplete activity connected to them has a usable P6 longest-path flag or nonpositive total float. A controlling path cannot be established from this export.',
    'Provide the current calculated paths to the phase milestones, including multiple float paths where available. Identify the work driving each turnover.')
  else if (activeTargets.length) push('PATH-BASIS', 'Confirm the controlling paths to phase turnover',
    `The phase summary identifies incomplete work connected to turnover with P6 longest-path flags or nonpositive total float. These are path candidates; shared critical float alone does not prove a continuous driving chain.`,
    'Confirm the driving chain to each phase milestone and explain shared power, cooling or commissioning restrictions. Provide target-specific multiple float paths where available.')
  // Shared L1/L2/L3/L4/L5 questions become one comment per level across phases.
  const cx = findings.filter(f => /^CX-/.test(f.id))
  for (let level = 1; level <= 5; level++) {
    const selected = cx.filter(f => new RegExp(`-L${level}$`).test(f.id))
    if (!selected.length) continue
    const phaseNames = selected.map(f => /^CX-(.+)-L\d+$/.exec(f.id)?.[1] || 'Project')
    const names = ['', 'factory testing', 'pre-startup checks', 'startup and energization', 'functional performance testing', 'integrated systems testing (IST)']
    const examples = selected.flatMap(f => f.affectedActivities)
    const observation = level === 5
      ? `${labels(phaseNames)} reference L5 closeout or do not clearly identify IST execution and acceptance. Closeout preparation alone does not show that IST is covered.`
      : level === 1
        ? `${labels(phaseNames)} do not clearly show factory-test coverage. Shared procurement or factory-testing activities may cover more than one phase.`
        : `${labels(phaseNames)} have recurring questions about L${level} ${names[level]} and its prerequisite links.${examples.length ? ` Examples: ${refs(examples, 2)}.` : ''}`
    push(`CX-L${level}`, `${labels(phaseNames)} — clarify ${names[level]}`, observation,
      level === 5 ? 'Identify the IST, correction, retesting and acceptance work, and show how it connects to phase turnover. Add the applicable work and links where coverage is missing.'
      : level === 1 ? 'Identify the shared or phase-specific factory testing that applies. Show how it supports equipment delivery, installation and testing; do not duplicate shared scope in every phase.'
      : `Confirm the L${level} scope and the checks required before the next step. Identify shared work and correct the links where needed.`, selected)
  }
  const futurePhases = Array.from(new Set(milestones.filter(t => !complete(t)).map(t => commissioningPhase(t)).filter(Boolean))) as string[]
  const forecastFinish = (t: any) => String(t.early_end_date || t.target_end_date || '').slice(0, 10)
  const forecastStart = (t: any) => String(t.early_start_date || t.target_start_date || '').slice(0, 10)
  const studies: { phase: string; study: any; energization: any }[] = []
  for (const phase of futurePhases) {
    const scope = tasks.filter(t => commissioningPhase(t) === phase)
    const energization = scope.find(t => !complete(t) && /L3|L 3|energization/i.test(t.task_name || '') && !/ready|prep|report/i.test(t.task_name || ''))
    if (!energization || !forecastStart(energization)) continue
    for (const study of scope.filter(t => /study|studies|protection setting/i.test(t.task_name || '') && !complete(t))) {
      if (forecastFinish(study) && forecastFinish(study) > forecastStart(energization)) studies.push({ phase, study, energization })
    }
  }
  if (studies.length) {
    const examples = studies.slice(0, 2).map(s => `${s.study.task_code} finishes ${forecastFinish(s.study)}, while ${s.energization.task_code} starts ${forecastStart(s.energization)}`).join('; ')
    push('STUDY-SEQUENCE', `${labels(studies.map(s => s.phase))} — confirm studies before energization`,
      `Electrical studies or protection-setting work is scheduled after L3 starts. ${examples}. The submissions may be final records rather than pre-energization approvals.`,
      'Confirm which studies, approvals and protection settings are required before energization. Show those steps before the applicable equipment is energized, and keep final-record submissions separate.', [],
      studies.flatMap(s => [s.study, s.energization]).map(t => ({ id: id(t), code: t.task_code, name: t.task_name })))
  }
  const gaps: { phase: string; prep: any; turnover: any; days: number }[] = []
  const tabGaps: { phase: string; tab: any; h2c: any; days: number }[] = []
  const calendarGap = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
  for (const phase of futurePhases) {
    const scope = tasks.filter(t => commissioningPhase(t) === phase)
    const pfho = scope.find(t => /MILE/i.test(t.task_type || '') && /\bPFHO\b/i.test(text(t)) && !complete(t))
    const prep = scope.find(t => /L4.*L5.*close|L4.*L5.*prep/i.test(t.task_name || '') && !complete(t))
    if (pfho && prep && forecastFinish(pfho) && forecastFinish(prep)) {
      const days = calendarGap(forecastFinish(prep), forecastFinish(pfho))
      if (days > 0) gaps.push({ phase, prep, turnover: pfho, days })
    }
    const h2c = scope.find(t => /MILE/i.test(t.task_type || '') && /\bH2C\b/i.test(text(t)) && !complete(t))
    const tab = scope.find(t => /\bTAB\b|test.*balanc/i.test(t.task_name || '') && !complete(t) && !/report|review|approv/i.test(t.task_name || ''))
    const approval = scope.some(t => /TAB|balanc/i.test(t.task_name || '') && /review|approv|accept/i.test(t.task_name || ''))
    if (h2c && tab && !approval && forecastFinish(tab) && forecastFinish(h2c)) {
      const days = calendarGap(forecastFinish(tab), forecastFinish(h2c))
      if (days > 0) tabGaps.push({ phase, tab, h2c, days })
    }
  }
  if (gaps.length) push('TURNOVER-WORK', `${labels(gaps.map(g => g.phase))} — explain the work between closeout preparation and turnover`,
    `L4/L5 closeout preparation finishes before PFHO, with gaps of ${Math.min(...gaps.map(g => g.days))}–${Math.max(...gaps.map(g => g.days))} calendar days. The dates alone do not explain the remaining turnover work.`,
    'Identify the remaining tests, corrections, documents and acceptance steps holding each turnover. Show that work and its links, or explain the approved waiting period. These calendar gaps are separate from P6 lag durations.', [],
    gaps.flatMap(g => [g.prep, g.turnover]).map(t => ({ id: id(t), code: t.task_code, name: t.task_name })))
  if (tabGaps.length) push('TAB-ACCEPTANCE', `${labels(tabGaps.map(g => g.phase))} — show TAB review and acceptance before H2C`,
    `TAB finishes before H2C, but separate TAB review or acceptance activities are not identified in the same phase scope. The forecast gaps range from ${Math.min(...tabGaps.map(g => g.days))} to ${Math.max(...tabGaps.map(g => g.days))} calendar days. Review may be covered by shared or broader activities.`,
    'Identify TAB report submission, required engineer review, comment closure and any other H2C acceptance work. Confirm the scope and show the links supporting the H2C dates.', [],
    tabGaps.flatMap(g => [g.tab, g.h2c]).map(t => ({ id: id(t), code: t.task_code, name: t.task_name })))
  const targetIds = new Set(milestones.filter(t => !complete(t)).map(id))
  const crossPhase = relationships.filter(r => targetIds.has(String(r.task_id)) && byId.has(String(r.pred_task_id))
    && /MILE/i.test(byId.get(String(r.pred_task_id))?.task_type || '')
    && commissioningPhase(byId.get(String(r.pred_task_id))) && commissioningPhase(byId.get(String(r.task_id)))
    && commissioningPhase(byId.get(String(r.pred_task_id))) !== commissioningPhase(byId.get(String(r.task_id))))
  if (crossPhase.length) {
    const examples = crossPhase.slice(0, 3).map(r => `${byId.get(String(r.pred_task_id))?.task_code} → ${byId.get(String(r.task_id))?.task_code} (${String(r.pred_type || '').replace('PR_', '')}, lag ${r.lag_hr_cnt || '0'} hours)`).join('; ')
    const affected = crossPhase.flatMap(r => [byId.get(String(r.pred_task_id)), byId.get(String(r.task_id))])
    push('PHASING', `${labels(affected.map(t => commissioningPhase(t)).filter(Boolean) as string[])} — explain shared turnover restrictions`,
      `Phase turnover milestones depend on other phases. These links can hold turnover even when the local work is ready. Examples: ${examples}.`,
      'Identify the shared power, cooling, access, testing crew or acceptance restriction behind these links. Show the actual work where a milestone tie or lag hides the restriction; retain justified dependencies.', [],
      affected.map(t => ({ id: id(t), code: t.task_code, name: t.task_name })))
  }
  // Repeated technical housekeeping stays in Overview / Schedule Analysis.
  const material = findings.filter(f => !/^CX-/.test(f.id) && !technicalOnly.test(f.title)
    && (['AR-02','AR-04','AR-05','AR-06','AR-08'].includes(f.primaryDomain)
      || (f.primaryDomain === 'AR-01' && f.authority === 'PROJECT_REQUIREMENT'))
    && (f.authority === 'PROJECT_REQUIREMENT' || f.affectedActivities.some(a => relevantIds.has(a.id))))
  const families = new Map<string, ApprovalFinding[]>()
  for (const f of material) {
    const s = `${f.title} ${f.system || ''} ${f.whatFound}`
    const key = f.primaryDomain === 'AR-05' ? 'PROCUREMENT'
      : /switchgear|energiz|feeder|catcher|USB|COP|EPMS|power|MV cable|transformer|generator|UPS|interlock/i.test(s) ? 'POWER'
      : /TAB|cooling|chill|mechanical|CRAH|pump|flush|CHW|hydronic/i.test(s) ? 'COOLING'
      : /IST|commission|FPT|startup|start.up|acceptance/i.test(s) ? 'COMMISSIONING'
      : /BMS|controls|point.to.point/i.test(s) ? 'CONTROLS'
      : f.primaryDomain === 'AR-02' ? 'PATH'
      : f.primaryDomain === 'AR-01' || f.primaryDomain === 'AR-08' ? 'TURNOVER' : 'CONSTRUCTION'
    const disposition = f.authority === 'PROJECT_REQUIREMENT' && f.ruleStrength === 'REQUIRED' ? 'REQUIRED' : 'CLARIFY'
    const group = `${key}-${disposition}`; families.set(group, [...(families.get(group) || []), f])
  }
  const copy: Record<string, [string, string]> = {
    POWER: ['Confirm the power and energization sequence', 'Show the applicable normal and catcher power paths, feeders or loops, cable termination, pre-energization checks, study approvals, protection settings and transfer/interlock testing. Confirm which work controls the affected phase turnovers.'],
    COOLING: ['Confirm cooling readiness before commissioning', 'Show the cooling and TAB work required for the affected turnover dates, including controls checks and any required review or acceptance. Identify shared-system restrictions.'],
    COMMISSIONING: ['Confirm the commissioning and acceptance sequence', 'Show the remaining tests, corrections, retesting and acceptance steps through turnover. Identify any shared crews or equipment restricting concurrent phases.'],
    CONTROLS: ['Confirm controls and monitoring readiness', 'Show the required BMS/EPMS checks and acceptance links to the affected phase turnovers.'],
    PROCUREMENT: ['Confirm long-lead deliveries supporting turnover', 'Confirm the delivery, installation and testing dates for long-lead equipment on the turnover paths. Identify outstanding approvals and provide recovery actions where delivery threatens the required sequence.'],
    PATH: ['Confirm critical and longest-path support', 'Confirm the current driving work and target-specific paths. Resolve the identified path concern before relying on the forecast.'],
    TURNOVER: ['Confirm the turnover milestone basis', 'Confirm the applicable milestone requirements and show the remaining work supporting turnover.'],
    CONSTRUCTION: ['Confirm construction readiness on turnover paths', 'Confirm the remaining construction work and the sequence that supports the affected turnover milestones. Provide recovery actions for the controlling restrictions.'],
  }
  for (const [key, source] of Array.from(families)) {
    const family = key.split('-')[0], [title, action] = copy[family]
    const affected = source.flatMap(f => f.affectedActivities).filter(a => relevantIds.has(a.id))
    const phaseNames = affected.map(a => commissioningPhase(byId.get(a.id))).filter(Boolean) as string[]
    // Retain a representative issue, not a list of every activity-level detection.
    const example = source.find(f => f.affectedActivities.some(a => relevantIds.has(a.id))) || source[0]
    const detail = example.whatFound.length > 400 ? example.whatFound.slice(0, 397) + '…' : example.whatFound
    const subject = labels(phaseNames)
    const verb = new Set(phaseNames).size === 1 ? 'has' : 'have'
    push(key, `${labels(phaseNames)} — ${title.toLowerCase()}`, `${subject} ${verb} ${family.toLowerCase()} sequencing or readiness questions on turnover-path candidates. Example: ${detail}`, action, source, affected)
  }
  return { comments, phases, endpoint: endpoint ? { code: String(endpoint.task.task_code), name: String(endpoint.task.task_name), date: String(endpoint.date || '').slice(0,10), basis: endpoint.task === explicitFinal?.task ? 'EXPLICIT_FINAL' : 'TURNOVER_REVIEW_BOUNDARY' } : undefined,
    rawFindingCount: findings.length, excludedTechnicalCount: findings.filter(f => technicalOnly.test(f.title)).length,
    disposition: comments.length ? 'REVIEW_REQUIRED' : 'NO_MATERIAL_COMMENT_IDENTIFIED',
    note: 'Planning review of turnover paths, long-lead work and system readiness. Routine statistics remain in Overview / Schedule Analysis. Path candidates are not a recalculated CPM or an approval decision.',
  }
}
