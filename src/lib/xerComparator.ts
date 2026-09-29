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
  fragnetSelectionConfirmed?: boolean
}

export interface TIAValidationIssue {
  code: string
  severity: 'error' | 'warning'
  title: string
  detail: string
  count?: number
}

function comparableDate(value?: string): string {
  return String(value || '').slice(0, 10)
}

// Formal TIA reports must be based on a controlled insertion into a copy of
// the same statused schedule. This deliberately does not make entitlement or
// responsibility conclusions; it only establishes whether the comparison is
// technically suitable for a TIA report.
export function validateTIAComparison(comparison: XERComparison): TIAValidationIssue[] {
  const issues: TIAValidationIssue[] = []
  if (!comparison.fragnetSelectionConfirmed) issues.push({ code: 'FRAGNET_CONFIRMATION_REQUIRED', severity: 'error', title: 'Confirm the fragnet activity selection', detail: 'Review the added activities and explicitly confirm which ones model the event. Keyword matches are suggestions only.' })
  const dataDateA = comparableDate(comparison.projectA?.dataDate)
  const dataDateB = comparableDate(comparison.projectB?.dataDate)

  if (!dataDateA || !dataDateB) {
    issues.push({
      code: 'DATA_DATE_MISSING', severity: 'error',
      title: 'Data date is missing',
      detail: 'Both schedules must carry a verifiable data date before a formal TIA can be generated.',
    })
  } else if (dataDateA !== dataDateB) {
    issues.push({
      code: 'DATA_DATE_MISMATCH', severity: 'error',
      title: 'Schedules have different data dates',
      detail: `Un-impacted: ${dataDateA}; impacted: ${dataDateB}. A fragnet must be inserted into a copy of the same statused schedule.`,
    })
  }

  const fragnetCount = comparison.fragnetActivities?.length || 0
  if (fragnetCount === 0) {
    issues.push({
      code: 'NO_FRAGNET', severity: 'error',
      title: 'No fragnet activities were verified',
      detail: 'The impacted schedule contains no newly added activities that the current detection rules can verify as the delay fragnet.',
    })
  }

  const removedCount = comparison.removed?.length || 0
  if (removedCount > 0) {
    issues.push({
      code: 'ACTIVITIES_REMOVED', severity: 'error', count: removedCount,
      title: `${removedCount} existing ${removedCount === 1 ? 'activity was' : 'activities were'} removed`,
      detail: 'An impacted copy must preserve the un-impacted activity population. Restore or explain the removed activities before reporting.',
    })
  }

  const durationChanges = (comparison.changed || []).filter(c => Math.abs(c.duration_delta_days || 0) > 0)
  if (durationChanges.length > 0) {
    issues.push({
      code: 'EXISTING_DURATIONS_CHANGED', severity: 'error', count: durationChanges.length,
      title: `${durationChanges.length} existing activity ${durationChanges.length === 1 ? 'duration changed' : 'durations changed'}`,
      detail: 'Existing durations must remain unchanged in a controlled prospective insertion unless each change is separately justified.',
    })
  }

  const progressChanges = (comparison.activities || []).filter(c => c.status !== 'added' && c.status !== 'removed' && (Math.abs(c.pct_delta || 0) > 0 || c.a_status !== c.b_status))
  if (progressChanges.length > 0) {
    issues.push({
      code: 'PROGRESS_CHANGED', severity: 'error', count: progressChanges.length,
      title: `${progressChanges.length} existing ${progressChanges.length === 1 ? 'activity has' : 'activities have'} changed progress`,
      detail: 'The two schedules are not the same statused update. Progress changes cannot be attributed to the fragnet insertion.',
    })
  }

  const logicChanges = (comparison.changed || []).filter(c => c.logic_changed).length
  if (logicChanges > 0) {
    issues.push({
      code: 'LOGIC_CHANGED', severity: 'warning', count: logicChanges,
      title: `${logicChanges} existing ${logicChanges === 1 ? 'activity has' : 'activities have'} changed predecessor logic`,
      detail: 'Confirm that these changes are only the intentional fragnet tie-in and tie-out relationships.',
    })
  }

  const addedCount = comparison.added?.length || 0
  if (addedCount > fragnetCount) {
    issues.push({
      code: 'UNCLASSIFIED_ADDITIONS', severity: 'warning', count: addedCount - fragnetCount,
      title: `${addedCount - fragnetCount} added ${addedCount - fragnetCount === 1 ? 'activity is' : 'activities are'} not classified as fragnet work`,
      detail: 'Review and classify all added activities before relying on the calculated time impact.',
    })
  }

  return issues
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

export function compareXER(parsedA: ParsedXER, parsedB: ParsedXER, confirmedFragnetCodes?: string[]): XERComparison {
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
  const confirmedCodes = confirmedFragnetCodes === undefined ? undefined : new Set(confirmedFragnetCodes)
  if (confirmedCodes && Array.from(confirmedCodes).some(code => !bByCode[code] || aByCode[code])) {
    throw new Error('Confirmed fragnet activities must be newly added activity IDs in the impacted schedule.')
  }
  // Internal P6 IDs can change across exports. Compare business activity IDs,
  // relationship types and lag rather than internal predecessor IDs.
  const logicMap = (parsed: ParsedXER) => {
    const map = new Map<string, string[]>()
    for (const r of parsed.relationships) {
      const entries = map.get(r.task_id) || []
      entries.push(JSON.stringify([parsed.tasks[r.pred_task_id]?.task_code || r.pred_task_id, r.pred_type, Number(r.lag_hr_cnt || 0)]))
      map.set(r.task_id, entries)
    }
    return map
  }
  const aLogic = logicMap(parsedA), bLogic = logicMap(parsedB)

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
      const aPreds = (aLogic.get(tA.task_id) || []).sort().join(',')
      const bPreds = (bLogic.get(tB.task_id) || []).sort().join(',')
      const logicChanged = aPreds !== bPreds

      const status = (startDelta !== 0 || finishDelta !== 0 || floatDelta !== 0 || durDelta !== 0 || pctDelta !== 0 || tA.status_code !== tB.status_code || logicChanged) ? 'changed' : 'unchanged'

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

  // Detect fragnet activities — look for activities with specific fragnet keywords
  // in either the task_name OR task_code. Verifies they are NEW in fileB.
  //
  // Day 10 fix: original \bFRAG(NET)?\b regex missed task codes like FRAG01,
  // FRAG-01, FRAG.01 because the digit/separator after FRAG isn't a word boundary.
  // New pattern catches: FRAG, FRAGNET, FRAG01, FRAG-01, FRAG_01, FRAG.01.
  // Avoids false positives: FRAGILE, FRAGRANCE, FRAGMENT (FRAG followed by letters).
  const fragnetKeywordRegexes = [
    /\bFRAG(NET\b|\d|[-_.]\d|\s|$)/,  // FRAG, FRAGNET, FRAG01, FRAG-01 — not FRAGILE
    /\bSCHEDULE\s+ISSUE\b/,     // SCHEDULE ISSUE
    /\bSCHEDULE-ISSUE\b/,
    /\bTIA\b/,                  // TIA as whole word
    /\bDELAY\s+EVENT\b/,        // DELAY EVENT
    /\bCHANGE\s+ORDER\b/,       // CHANGE ORDER
    /\bCO[-\s]\d+\b/,           // CO-1, CO 2, etc.
    /\bRFI\s+IMPACT\b/,         // RFI IMPACT
    /\bDIRECTIVE\b/,            // DIRECTIVE
  ]

  // Build set of activity codes that exist in fileA (un-impacted baseline)
  const codesInA = new Set(Object.values(parsedA.tasks).map(t => t.task_code))

  const detectedFragnetTasks: Task[] = []
  for (const t of Object.values(parsedB.tasks)) {
    if (codesInA.has(t.task_code)) continue
    if (confirmedCodes) {
      if (confirmedCodes.has(t.task_code)) detectedFragnetTasks.push(t)
      continue
    }
    const upper = ((t.task_name || '') + ' ' + (t.task_code || '')).toUpperCase()
    const matchesKeyword = fragnetKeywordRegexes.some(rgx => rgx.test(upper))
    if (!matchesKeyword) continue

    // Skip milestones — fragnets are work activities, not milestone markers
    if (t.task_type === 'TT_FinMile' || t.task_type === 'TT_Mile' || t.task_type === 'TT_StartMile') continue

    // True fragnets are NEW activities (in B but not in A)
    // OR existing activities with their description changed (low chance, but allow)
    const isNew = !codesInA.has(t.task_code)

    // Day 10 fix: matching strong-keyword pattern also widened for FRAG01-style codes
    const hasStrongKeyword = /\bFRAG(NET\b|\d|[-_.]\d|\s|$)|\bSCHEDULE\s+ISSUE\b|\bDELAY\s+EVENT\b/.test(upper)
    if (isNew || hasStrongKeyword) {
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
    fragnetSelectionConfirmed: confirmedCodes !== undefined && confirmedCodes.size > 0,
  }
}
