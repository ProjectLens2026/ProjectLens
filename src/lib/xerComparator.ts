import { Task, Relationship, ParsedXER } from './xerParser'

export interface ActivityComparison {
  task_id: string
  task_code: string
  task_name: string
  status: 'unchanged' | 'added' | 'removed' | 'changed'
  // Schedule A (un-impacted)
  a_start?: string
  a_finish?: string
  a_duration_days?: number
  a_float_days?: number
  a_pct_complete?: number
  a_status?: string
  // Schedule B (impacted)
  b_start?: string
  b_finish?: string
  b_duration_days?: number
  b_float_days?: number
  b_pct_complete?: number
  b_status?: string
  // Deltas
  start_delta_days?: number
  finish_delta_days?: number
  duration_delta_days?: number
  float_delta_days?: number
  pct_delta?: number
  logic_changed?: boolean
}

export interface MilestoneMovement {
  task_code: string
  task_name: string
  a_finish?: string
  b_finish?: string
  delta_days: number
}

export interface CriticalPathComparison {
  unimpactedPath: Task[]
  impactedPath: Task[]
  divergesAt?: string
  totalDelayDays: number
  unimpactedEnd?: string
  impactedEnd?: string
}

export interface FragnetActivity {
  task_id: string
  task_code: string
  task_name: string
  start?: string
  finish?: string
  duration_days?: number
  affected_successors: AffectedActivity[]
  category?: 'owner' | 'force_majeure' | 'third_party' | 'subcontractor' | 'contractor' | 'excusable'
  description?: string
}

export interface AffectedActivity {
  task_code: string
  task_name: string
  original_start?: string  // from Schedule A
  new_start?: string       // from Schedule B
  original_finish?: string
  new_finish?: string
  delay_days: number
}

export interface XERComparison {
  projectA: { name: string; end: string; dataDate: string }
  projectB: { name: string; end: string; dataDate: string }
  totalDelayDays: number
  activities: ActivityComparison[]
  added: ActivityComparison[]
  removed: ActivityComparison[]
  changed: ActivityComparison[]
  milestoneMovements: MilestoneMovement[]
  criticalPath: CriticalPathComparison
  detectedFragnetWBS: string[]      // WBS names that look like fragnet/schedule issue
  fragnetActivities: FragnetActivity[]
}

function getEffectiveStart(t: Task): string {
  return t.act_start_date || t.early_start_date || t.target_start_date || ''
}

function getEffectiveFinish(t: Task): string {
  // Always use scheduled finish (what P6 calculates), never baseline finish
  return t.act_end_date || t.early_end_date || t.target_end_date || ''
}

function daysBetween(d1: string, d2: string): number {
  if (!d1 || !d2) return 0
  try {
    const date1 = new Date(d1.replace(' ', 'T'))
    const date2 = new Date(d2.replace(' ', 'T'))
    return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24))
  } catch {
    return 0
  }
}

function hoursToDays(hrs: string | number): number {
  const h = typeof hrs === 'string' ? parseFloat(hrs || '0') : hrs
  return isNaN(h) ? 0 : Math.round(h / 8)
}

export function compareXER(parsedA: ParsedXER, parsedB: ParsedXER): XERComparison {
  const activitiesMap: Map<string, ActivityComparison> = new Map()

  // Build comparison by task_code (more stable than task_id across exports)
  const aByCode: Record<string, Task> = {}
  const bByCode: Record<string, Task> = {}

  for (const t of Object.values(parsedA.tasks)) {
    if (t.task_code) aByCode[t.task_code] = t
  }
  for (const t of Object.values(parsedB.tasks)) {
    if (t.task_code) bByCode[t.task_code] = t
  }

  // Activities in both
  for (const code of Object.keys(bByCode)) {
    const tA = aByCode[code]
    const tB = bByCode[code]
    if (tA) {
      const aStart = getEffectiveStart(tA)
      const aFinish = getEffectiveFinish(tA)
      const bStart = getEffectiveStart(tB)
      const bFinish = getEffectiveFinish(tB)
      const aFloat = hoursToDays(tA.total_float_hr_cnt || '0')
      const bFloat = hoursToDays(tB.total_float_hr_cnt || '0')
      const aDur = hoursToDays(tA.target_drtn_hr_cnt || '0')
      const bDur = hoursToDays(tB.target_drtn_hr_cnt || '0')
      const aPct = parseFloat(tA.phys_complete_pct || '0')
      const bPct = parseFloat(tB.phys_complete_pct || '0')

      const startDelta = daysBetween(aStart, bStart)
      const finishDelta = daysBetween(aFinish, bFinish)
      const floatDelta = bFloat - aFloat
      const durDelta = bDur - aDur
      const pctDelta = bPct - aPct

      // Check logic change
      const aPreds = (parsedA.predMap[tA.task_id] || []).sort().join(',')
      const bPreds = (parsedB.predMap[tB.task_id] || []).sort().join(',')
      const logicChanged = aPreds !== bPreds

      const status = (startDelta !== 0 || finishDelta !== 0 || floatDelta !== 0 || durDelta !== 0 || logicChanged) ? 'changed' : 'unchanged'

      activitiesMap.set(code, {
        task_id: tB.task_id, task_code: code, task_name: tB.task_name,
        status,
        a_start: aStart, a_finish: aFinish, a_duration_days: aDur, a_float_days: aFloat,
        a_pct_complete: aPct, a_status: tA.status_code,
        b_start: bStart, b_finish: bFinish, b_duration_days: bDur, b_float_days: bFloat,
        b_pct_complete: bPct, b_status: tB.status_code,
        start_delta_days: startDelta, finish_delta_days: finishDelta,
        duration_delta_days: durDelta, float_delta_days: floatDelta,
        pct_delta: pctDelta, logic_changed: logicChanged,
      })
    } else {
      // Added in B
      const bStart = getEffectiveStart(tB)
      const bFinish = getEffectiveFinish(tB)
      activitiesMap.set(code, {
        task_id: tB.task_id, task_code: code, task_name: tB.task_name,
        status: 'added',
        b_start: bStart, b_finish: bFinish,
        b_duration_days: hoursToDays(tB.target_drtn_hr_cnt || '0'),
        b_float_days: hoursToDays(tB.total_float_hr_cnt || '0'),
        b_pct_complete: parseFloat(tB.phys_complete_pct || '0'),
        b_status: tB.status_code,
      })
    }
  }
  // Activities removed (in A but not B)
  for (const code of Object.keys(aByCode)) {
    if (!bByCode[code]) {
      const tA = aByCode[code]
      activitiesMap.set(code, {
        task_id: tA.task_id, task_code: code, task_name: tA.task_name,
        status: 'removed',
        a_start: getEffectiveStart(tA), a_finish: getEffectiveFinish(tA),
        a_duration_days: hoursToDays(tA.target_drtn_hr_cnt || '0'),
        a_float_days: hoursToDays(tA.total_float_hr_cnt || '0'),
        a_pct_complete: parseFloat(tA.phys_complete_pct || '0'),
        a_status: tA.status_code,
      })
    }
  }

  const activities = Array.from(activitiesMap.values())
  const added = activities.filter(a => a.status === 'added')
  const removed = activities.filter(a => a.status === 'removed')
  const changed = activities.filter(a => a.status === 'changed')

  // Milestone movements
  const milestoneMovements: MilestoneMovement[] = []
  for (const c of activities) {
    if (c.status === 'unchanged') continue
    const taskB = parsedB.tasks[c.task_id]
    const taskA = c.task_id ? Object.values(parsedA.tasks).find(t => t.task_code === c.task_code) : null
    const isMilestone = (taskB?.task_type === 'TT_Mile' || taskB?.task_type === 'TT_FinMile') ||
                        (taskA?.task_type === 'TT_Mile' || taskA?.task_type === 'TT_FinMile') ||
                        c.task_code.toUpperCase().startsWith('MM-')
    if (isMilestone && (c.finish_delta_days || 0) !== 0) {
      milestoneMovements.push({
        task_code: c.task_code, task_name: c.task_name,
        a_finish: c.a_finish, b_finish: c.b_finish,
        delta_days: c.finish_delta_days || 0,
      })
    }
  }
  milestoneMovements.sort((a, b) => Math.abs(b.delta_days) - Math.abs(a.delta_days))

  // Critical path comparison
  const unimpactedPath = Object.values(parsedA.tasks)
    .filter(t => t.driving_path_flag === 'Y')
    .sort((a, b) => (a.early_start_date || '').localeCompare(b.early_start_date || ''))
  const impactedPath = Object.values(parsedB.tasks)
    .filter(t => t.driving_path_flag === 'Y')
    .sort((a, b) => (a.early_start_date || '').localeCompare(b.early_start_date || ''))

  const totalDelayDays = daysBetween(parsedA.projectedEnd, parsedB.projectedEnd)

  // Find where paths diverge
  let divergesAt: string | undefined
  for (let i = 0; i < Math.min(unimpactedPath.length, impactedPath.length); i++) {
    if (unimpactedPath[i].task_code !== impactedPath[i].task_code) {
      divergesAt = impactedPath[i].task_code
      break
    }
  }

  // Detect fragnet WBS - look for tasks in WBS containing fragnet/schedule issue keywords
  const fragnetKeywords = ['FRAG', 'SCHEDULE ISSUE', 'SCHEDULE-ISSUE', 'TIA', 'DELAY EVENT']
  const detectedFragnetTasks: Task[] = []
  for (const t of Object.values(parsedB.tasks)) {
    const upper = (t.task_name || '').toUpperCase() + ' ' + (t.task_code || '').toUpperCase()
    if (fragnetKeywords.some(k => upper.includes(k))) {
      detectedFragnetTasks.push(t)
    }
  }

  // Build fragnet activities with affected successors
  const fragnetActivities: FragnetActivity[] = detectedFragnetTasks.map(t => {
    const succIds = parsedB.succMap[t.task_id] || []
    const affected_successors: AffectedActivity[] = succIds.map(sid => {
      const successor = parsedB.tasks[sid]
      if (!successor) return null
      const successorA = Object.values(parsedA.tasks).find(x => x.task_code === successor.task_code)
      const origStart = successorA ? getEffectiveStart(successorA) : ''
      const newStart = getEffectiveStart(successor)
      const origFinish = successorA ? getEffectiveFinish(successorA) : ''
      const newFinish = getEffectiveFinish(successor)
      return {
        task_code: successor.task_code,
        task_name: successor.task_name,
        original_start: origStart, new_start: newStart,
        original_finish: origFinish, new_finish: newFinish,
        delay_days: daysBetween(origStart, newStart),
      }
    }).filter(Boolean) as AffectedActivity[]

    return {
      task_id: t.task_id,
      task_code: t.task_code,
      task_name: t.task_name,
      start: getEffectiveStart(t),
      finish: getEffectiveFinish(t),
      duration_days: hoursToDays(t.target_drtn_hr_cnt || '0'),
      affected_successors,
    }
  })

  const detectedFragnetWBS = Array.from(new Set(detectedFragnetTasks.map(t => t.task_code)))

  return {
    projectA: { name: parsedA.projectName, end: parsedA.projectedEnd, dataDate: parsedA.dataDate },
    projectB: { name: parsedB.projectName, end: parsedB.projectedEnd, dataDate: parsedB.dataDate },
    totalDelayDays,
    activities,
    added, removed, changed,
    milestoneMovements,
    criticalPath: {
      unimpactedPath, impactedPath, divergesAt,
      totalDelayDays,
      unimpactedEnd: parsedA.projectedEnd, impactedEnd: parsedB.projectedEnd,
    },
    detectedFragnetWBS,
    fragnetActivities,
  }
}
