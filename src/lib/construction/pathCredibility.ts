// =============================================================================
// src/lib/construction/pathCredibility.ts
// Control Lens path credibility review — construction truth layered on top of
// P6/XER path truth. This module DOES NOT recalculate CPM.
//
// P6 tells us which activities are critical / longest-path based on the network.
// Control Lens asks whether that reported path is credible from a construction,
// startup, commissioning, and turnover standpoint.
// =============================================================================

import type { Task } from '../xerParser'
import { classifyActivity } from './classify'

export type PathCredibilityStatus = 'CREDIBLE' | 'REVIEW_REQUIRED' | 'SEQUENCE_CONFLICT'
export type PathCredibilityLevel = 'CONFLICT' | 'REVIEW'

export interface PathCredibilityFinding {
  id: string
  level: PathCredibilityLevel
  confidence: 'high' | 'medium'
  title: string
  detail: string
  evidence: string[]
}

export interface PathCredibilityResult {
  status: PathCredibilityStatus
  checkedActivities: number
  findings: PathCredibilityFinding[]
}

function toMs(v?: string | null): number | null {
  if (!v) return null
  const t = new Date(String(v).replace(' ', 'T')).getTime()
  return Number.isFinite(t) ? t : null
}

/** P6-style displayed start: actual when present, otherwise current early/forecast. */
export function pathActivityStart(t: any): string {
  return t?.act_start_date || t?.early_start_date || t?.target_start_date || ''
}

/** P6-style displayed finish: actual when present, otherwise current early/forecast. */
export function pathActivityFinish(t: any): string {
  return t?.act_end_date || t?.early_end_date || t?.target_end_date || ''
}

export function sortPathActivitiesByFinish<T extends { task_code?: string | number | null }>(activities: T[]): T[] {
  return [...(activities || [])].sort((a, b) => {
    const af = toMs(pathActivityFinish(a))
    const bf = toMs(pathActivityFinish(b))
    if (af !== null && bf !== null && af !== bf) return af - bf
    if (af !== null && bf === null) return -1
    if (af === null && bf !== null) return 1

    const as = toMs(pathActivityStart(a))
    const bs = toMs(pathActivityStart(b))
    if (as !== null && bs !== null && as !== bs) return as - bs
    return String(a?.task_code || '').localeCompare(String(b?.task_code || ''))
  })
}

function cls(t: any) {
  return classifyActivity({
    task_id: String(t?.task_id || t?.id || t?.task_code || ''),
    task_code: String(t?.task_code || ''),
    task_name: String(t?.task_name || ''),
    task_type: t?.task_type,
    wbs_path: t?.wbs_path,
  })
}

function codeName(t: any): string {
  return `${t?.task_code || '—'} — ${t?.task_name || 'Unnamed activity'}`
}

function earliestStart(tasks: any[]): { task: any; ms: number } | null {
  let best: { task: any; ms: number } | null = null
  for (const t of tasks) {
    const ms = toMs(pathActivityStart(t))
    if (ms === null) continue
    if (!best || ms < best.ms) best = { task: t, ms }
  }
  return best
}

function latestFinish(tasks: any[]): { task: any; ms: number } | null {
  let best: { task: any; ms: number } | null = null
  for (const t of tasks) {
    const ms = toMs(pathActivityFinish(t))
    if (ms === null) continue
    if (!best || ms > best.ms) best = { task: t, ms }
  }
  return best
}

function pushOnce(findings: PathCredibilityFinding[], finding: PathCredibilityFinding) {
  if (!findings.some(f => f.id === finding.id)) findings.push(finding)
}

export function evaluatePathCredibility(
  pathActivities: Task[] | any[],
  allProjectTasks?: Record<string, any> | any[],
): PathCredibilityResult {
  const path = sortPathActivitiesByFinish(pathActivities || [])
  const universe: any[] = Array.isArray(allProjectTasks)
    ? allProjectTasks
    : allProjectTasks && typeof allProjectTasks === 'object'
      ? Object.values(allProjectTasks)
      : path

  const pathC = path.map(t => ({ t, c: cls(t) }))
  const allC = universe.map(t => ({ t, c: cls(t) }))
  const findings: PathCredibilityFinding[] = []

  // ---------------------------------------------------------------------------
  // HARD CHECK 1 — IST must not begin before visible functional testing finishes.
  // ---------------------------------------------------------------------------
  const pathIst = pathC.filter(x => x.c.activityClass === 'IST' || x.c.stage === 'IST')
  const pathFpt = pathC.filter(x =>
    ['ELECTRICAL_FPT', 'MECHANICAL_FPT', 'CONTROLS_FPT', 'LIFE_SAFETY_FPT'].includes(String(x.c.activityClass || '')) ||
    x.c.stage === 'FUNCTIONAL_TEST'
  )
  if (pathIst.length && pathFpt.length) {
    const istStart = earliestStart(pathIst.map(x => x.t))
    const fptFinish = latestFinish(pathFpt.map(x => x.t))
    if (istStart && fptFinish && istStart.ms < fptFinish.ms) {
      pushOnce(findings, {
        id: 'PC-IST-BEFORE-FPT',
        level: 'CONFLICT',
        confidence: 'high',
        title: 'IST begins before functional testing is complete',
        detail: 'The reported driving path places Integrated Systems Testing before completion of functional testing shown on the same path. This is a construction/commissioning sequence conflict unless the activities have a project-specific definition that changes their meaning.',
        evidence: [codeName(istStart.task), codeName(fptFinish.task)],
      })
    }
  }

  // ---------------------------------------------------------------------------
  // HARD CHECK 2 — final acceptance/completion must not precede IST completion.
  // ---------------------------------------------------------------------------
  const pathAcceptance = pathC.filter(x =>
    x.c.stage === 'ACCEPT' || /substantial completion|final completion|ready for service|turnover/i.test(x.t?.task_name || '')
  )
  if (pathIst.length && pathAcceptance.length) {
    const istFinish = latestFinish(pathIst.map(x => x.t))
    const acceptanceStart = earliestStart(pathAcceptance.map(x => x.t))
    if (istFinish && acceptanceStart && acceptanceStart.ms < istFinish.ms) {
      pushOnce(findings, {
        id: 'PC-ACCEPT-BEFORE-IST',
        level: 'CONFLICT',
        confidence: 'high',
        title: 'Completion / acceptance is scheduled before IST completes',
        detail: 'The reported path reaches completion or acceptance before Integrated Systems Testing is complete. Where IST is part of the project delivery requirement, this sequence is not credible and the schedule logic should be corrected or specifically justified.',
        evidence: [codeName(acceptanceStart.task), codeName(istFinish.task)],
      })
    }
  }

  // ---------------------------------------------------------------------------
  // HARD CHECK 3 — same-system startup should not precede installation completion.
  // Conservative: only compare activities classified to the same meaningful system.
  // ---------------------------------------------------------------------------
  const startups = pathC.filter(x => x.c.stage === 'STARTUP')
  for (const s of startups) {
    if (!s.c.system) continue
    const installs = pathC.filter(x => x.c.system === s.c.system && x.c.stage === 'SET')
    const installFinish = latestFinish(installs.map(x => x.t))
    const startupStart = toMs(pathActivityStart(s.t))
    if (installFinish && startupStart !== null && startupStart < installFinish.ms) {
      pushOnce(findings, {
        id: `PC-STARTUP-BEFORE-INSTALL-${s.c.system}`,
        level: 'CONFLICT',
        confidence: 'high',
        title: `${s.c.system} startup begins before installation is complete`,
        detail: 'Control Lens found a same-system startup activity beginning before the latest installation/set activity on the reported path finishes. Verify the activity definitions and logic; if these represent the same equipment/system, the sequence should be corrected.',
        evidence: [codeName(s.t), codeName(installFinish.task)],
      })
    }
  }

  // ---------------------------------------------------------------------------
  // HARD CHECK 4 — energization should not precede same-system testing/termination.
  // ---------------------------------------------------------------------------
  const energize = pathC.filter(x => x.c.stage === 'ENERGIZE')
  for (const e of energize) {
    if (!e.c.system) continue
    const prereq = pathC.filter(x =>
      x.c.system === e.c.system && ['TEST', 'TERMINATE', 'GROUND', 'CONNECT'].includes(String(x.c.stage || ''))
    )
    const prereqFinish = latestFinish(prereq.map(x => x.t))
    const energizeStart = toMs(pathActivityStart(e.t))
    if (prereqFinish && energizeStart !== null && energizeStart < prereqFinish.ms) {
      pushOnce(findings, {
        id: `PC-ENERGIZE-BEFORE-READY-${e.c.system}`,
        level: 'CONFLICT',
        confidence: 'high',
        title: `${e.c.system} energization precedes required readiness work`,
        detail: 'The path shows energization beginning before same-system testing/termination/connection work shown on the path is complete. Confirm whether the activities refer to different equipment or phases; otherwise this is a sequencing conflict.',
        evidence: [codeName(e.t), codeName(prereqFinish.task)],
      })
    }
  }

  // ---------------------------------------------------------------------------
  // GOVERNANCE CHECKS — path may be mathematically valid but bypass key systems.
  // These are review findings, not declarations that P6 is wrong.
  // ---------------------------------------------------------------------------
  const projectHasIst = allC.some(x => x.c.activityClass === 'IST' || x.c.stage === 'IST')
  const projectHasFpt = allC.some(x =>
    ['ELECTRICAL_FPT', 'MECHANICAL_FPT', 'CONTROLS_FPT', 'LIFE_SAFETY_FPT'].includes(String(x.c.activityClass || '')) ||
    x.c.stage === 'FUNCTIONAL_TEST'
  )
  const projectHasCx = allC.some(x => x.c.phase === 'STARTUP_COMMISSIONING')
  const pathHasCx = pathC.some(x => x.c.phase === 'STARTUP_COMMISSIONING')
  const pathHasCompletion = pathAcceptance.length > 0 || pathC.some(x => x.c.phase === 'CLOSEOUT')

  if (projectHasIst && pathHasCompletion && pathIst.length === 0) {
    pushOnce(findings, {
      id: 'PC-PATH-BYPASSES-IST',
      level: 'REVIEW',
      confidence: 'medium',
      title: 'Reported path reaches completion without IST',
      detail: 'IST exists elsewhere in the uploaded schedule, but it is not represented on this reported driving path to completion. Confirm whether IST is genuinely non-driving or whether the network bypasses an important commissioning convergence point.',
      evidence: [],
    })
  }

  if (projectHasFpt && pathHasCompletion && pathFpt.length === 0) {
    pushOnce(findings, {
      id: 'PC-PATH-BYPASSES-FPT',
      level: 'REVIEW',
      confidence: 'medium',
      title: 'Reported path reaches completion without functional testing',
      detail: 'Functional testing exists elsewhere in the schedule but does not appear on this reported path to completion. Verify that testing is properly tied to acceptance/turnover and is truly non-driving.',
      evidence: [],
    })
  }

  if (projectHasCx && pathHasCompletion && !pathHasCx) {
    pushOnce(findings, {
      id: 'PC-PATH-BYPASSES-CX',
      level: 'REVIEW',
      confidence: 'medium',
      title: 'Reported path bypasses startup / commissioning work',
      detail: 'The project contains startup/commissioning activities, but none appear on this path to completion. A superintendent/PM review should confirm whether completion is genuinely controlled by another path or whether commissioning logic is disconnected.',
      evidence: [],
    })
  }

  // Procurement order — review, because early release / partial release can be legitimate.
  const bySystem = new Map<string, { t: any; c: any }[]>()
  for (const x of pathC) {
    if (!x.c.system) continue
    if (!bySystem.has(x.c.system)) bySystem.set(x.c.system, [])
    bySystem.get(x.c.system)!.push(x)
  }
  for (const [system, rows] of bySystem) {
    const approvals = rows.filter(x => x.c.stage === 'APPROVE')
    const deliveries = rows.filter(x => x.c.stage === 'DELIVER')
    const approvalFinish = latestFinish(approvals.map(x => x.t))
    const deliveryStart = earliestStart(deliveries.map(x => x.t))
    if (approvalFinish && deliveryStart && deliveryStart.ms < approvalFinish.ms) {
      pushOnce(findings, {
        id: `PC-PROCUREMENT-ORDER-${system}`,
        level: 'REVIEW',
        confidence: 'medium',
        title: `${system} fabrication/delivery starts before approval completes`,
        detail: 'This may be legitimate under an early-release or phased approval strategy, but the path should be reviewed to confirm the schedule reflects the actual procurement authorization sequence.',
        evidence: [codeName(deliveryStart.task), codeName(approvalFinish.task)],
      })
    }
  }

  const hasConflict = findings.some(f => f.level === 'CONFLICT')
  const status: PathCredibilityStatus = hasConflict
    ? 'SEQUENCE_CONFLICT'
    : findings.length
      ? 'REVIEW_REQUIRED'
      : 'CREDIBLE'

  return { status, checkedActivities: path.length, findings }
}
