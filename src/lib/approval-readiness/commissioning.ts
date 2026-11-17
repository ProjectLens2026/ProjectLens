import type { ApprovalFinding } from './types'
export interface CommissioningCheck {
  id: string; phase: string; level: number; label: string
  status: 'IDENTIFIED' | 'CLARIFICATION_REQUIRED' | 'NOT_EXPLICIT'
  observation: string; action: string
  activities: { id: string; code: string; name: string }[]
}
const LEVELS = [
  { level: 1, label: 'Factory testing', pattern: /\bL\s*1\b|\blevel[ -]*1\b|\b(?:FWT|FAT)\b|factory (?:witness|acceptance) test/i },
  { level: 2, label: 'Pre-startup checks', pattern: /\bL\s*2\b|\blevel[ -]*2\b|pre[- ]?(?:startup|functional)|installation verification/i },
  { level: 3, label: 'Startup and energization', pattern: /\bL\s*3\b|\blevel[ -]*3\b|\bstart[- ]?up\b|\benergiz(?:ation|e|ing)\b/i },
  { level: 4, label: 'Functional performance testing', pattern: /\bL\s*4\b|\blevel[ -]*4\b|\bFPT\b|functional performance test/i },
  { level: 5, label: 'Integrated systems testing', pattern: /\bL\s*5\b|\blevel[ -]*5\b|\bIST\b|integrated systems? test/i },
]
const recordOnly = /close\s*out|closeout|\bprep(?:aration)?\b|\breport|\bsubmit|\bapprov|\bscript|\bplan\b/i
// Candidate phase aliases; POD remains separate until explicitly mapped.
export function commissioningPhase(task: any): string | null {
  const direct = `${task.task_name || ''} ${task.task_code || ''}`
  const pattern = /\b(ROMP|PH(?:ASE)?|POD)\s*[-_ ]*0*(\d+)\b/gi
  const matches = Array.from(direct.matchAll(pattern))
  const fallback = Array.from(String((task.wbs_path || []).join(' > ')).matchAll(pattern))
  const match = matches[0] || fallback[fallback.length - 1]
  return match ? `${match[1].toUpperCase() === 'POD' ? 'POD' : 'PH'}${Number(match[2])}` : null
}
export function reviewCommissioning(analysis: any): CommissioningCheck[] {
  const tasks = Object.values(analysis.traceTasks || {}) as any[]
  const relevant = tasks.filter(t => LEVELS.some(d => d.pattern.test(t.task_name || '')) || /\b(?:H2C|PFHO|commissioning|turnover)\b/i.test(t.task_name || ''))
  const phases = Array.from(new Set(relevant.map(commissioningPhase).filter(Boolean))) as string[]
  if (!phases.length) phases.push('Project')
  phases.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const outgoing = new Map<string, string[]>()
  for (const r of analysis.traceRelationships || []) {
    // FF/SS ties alone do not establish finish-before-start readiness.
    if (!['PR_FS', 'FS'].includes(r.pred_type) || !Number.isFinite(Number(r.lag_hr_cnt)) || Number(r.lag_hr_cnt) < 0) continue
    outgoing.set(String(r.pred_task_id), [...(outgoing.get(String(r.pred_task_id)) || []), String(r.task_id)])
  }
  function reaches(from: string, to: string): boolean {
    const seen = new Set([from]); const queue = [from]
    for (let i = 0; i < queue.length; i++) for (const next of outgoing.get(queue[i]) || []) {
      if (next === to && next !== from) return true
      if (!seen.has(next)) { seen.add(next); queue.push(next) }
    }
    return false
  }
  return phases.flatMap(phase => {
    const scope = tasks.filter(t => phase === 'Project' || commissioningPhase(t) === phase)
    return LEVELS.map((def, index): CommissioningCheck => {
      const matched = scope.filter(t => def.pattern.test(t.task_name || ''))
      const execution = matched.filter(t => !recordOnly.test(t.task_name || ''))
      const activities = matched.map(t => ({ id: String(t.task_id), code: String(t.task_code || t.task_id), name: String(t.task_name) }))
      const refs = activities.map(t => `${t.code} (${t.name})`).join('; ')
      let status: CommissioningCheck['status'] = execution.length ? 'IDENTIFIED' : matched.length ? 'CLARIFICATION_REQUIRED' : 'NOT_EXPLICIT'
      let observation = execution.length
        ? `The schedule identifies ${def.label.toLowerCase()}: ${refs}. This identifies schedule coverage, not field completion or acceptance.`
        : matched.length
          ? `The schedule references L${def.level} in ${refs}, but does not separately identify the testing or startup work. It may be included in a broader activity.`
          : `No activity name in ${phase} explicitly identifies ${def.label.toLowerCase()}. The work may be included elsewhere or may not apply to this scope.`
      let action = `Confirm the equipment covered, prerequisites and acceptance steps against the project's commissioning plan.`
      if (index > 0 && execution.length) {
        const previous = scope.filter(t => LEVELS[index - 1].pattern.test(t.task_name || '') && !recordOnly.test(t.task_name || ''))
        const unlinked = execution.filter(t => !previous.some(p => reaches(String(p.task_id), String(t.task_id))))
        if (unlinked.length) {
          status = 'CLARIFICATION_REQUIRED'
          observation += ` A finish-to-start path from L${def.level - 1} was not identified for ${unlinked.map(t => t.task_code || t.task_id).join(', ')}. Other relationship types may be present.`
          action += ` Explain the sequence and show how the required checks prevent the next testing step from starting too early. Revise the logic where needed.`
        } else observation += ` A finish-to-start path from the preceding level was identified; equipment-by-equipment coverage still needs confirmation.`
      }
      if (!execution.length) action = `Confirm whether this work applies and identify the activities covering it, including shared or broader activities. If applicable work is not covered, add it and its prerequisite and acceptance links.`
      return { id: `CX-${phase}-L${def.level}`, phase, level: def.level, label: def.label, status, observation, action, activities }
    })
  })
}
export function commissioningFindings(checks: CommissioningCheck[]): ApprovalFinding[] {
  return checks.filter(c => c.status !== 'IDENTIFIED').map(c => ({
    id: c.id, kind: 'FINDING', primaryDomain: 'AR-06', ruleStrength: 'ADVISORY',
    authority: 'REVIEWER_JUDGMENT', commentDisposition: 'CLARIFICATION',
    severity: 2, confidence: 'medium', criticalGate: false, scoreDeduction: 0,
    title: `${c.phase} — Clarify L${c.level} ${c.label.toLowerCase()}`,
    whatFound: c.observation,
    whyItMatters: 'The schedule should show the applicable commissioning work and how testing steps connect. Activity names alone do not prove a complete system sequence.',
    reviewerCheck: c.action, preSubmissionNote: c.action,
    referenceRequirement: 'Data center commissioning scaffold. Confirm against the approved project commissioning plan; no contract clause has been inferred.',
    affectedActivities: c.activities, evidence: [], status: 'NEW',
  }))
}
