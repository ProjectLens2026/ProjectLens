export interface Task {
  task_id: string
  task_code: string
  task_name: string
  status_code: string
  task_type: string
  phys_complete_pct: string
  total_float_hr_cnt: string
  remain_drtn_hr_cnt: string
  target_drtn_hr_cnt: string
  act_drtn_hr_cnt?: string
  driving_path_flag: string
  early_start_date: string
  early_end_date: string
  act_start_date: string
  act_end_date: string
  target_start_date: string
  target_end_date: string
  clndr_id: string
}
export interface Calendar {
  clndr_id: string
  clndr_name: string
  clndr_type: string
  day_hr_cnt: string
  week_hr_cnt: string
}
export interface Relationship {
  task_id: string
  pred_task_id: string
  pred_type: string
  lag_hr_cnt: string
}
export interface ParsedXER {
  projectName: string
  dataDate: string
  contractEnd: string
  projectedEnd: string
  tasks: Record<string, Task>
  relationships: Relationship[]
  predMap: Record<string, string[]>
  succMap: Record<string, string[]>
  calendars: Record<string, Calendar>
}
export interface XERAnalysis {
  totalActivities: number
  complete: number
  inProgress: number
  notStarted: number
  negativeFloat: number
  outOfSequence: OutOfSequence[]
  noTies: Task[]
  longLeadItems: LongLeadItem[]
  shortLeadItems: LongLeadItem[]
  criticalDrivers: Task[]
  ganttActivities: Task[]
  inProgressActivities: Task[]
  milestones: Task[]
  twoWeekLookahead?: Task[]
  notStartedActivities?: Task[]
  finishedActivities?: Task[]
  longestPathActivities?: Task[]
  submittals?: Task[]
  allTasksForPaths?: Task[]  // Day 10 — Multiple Float Paths source data
  healthScore: number
  condition: string
  delayDays: number
  dataDate?: string
  projectStartDate?: string
  projectStartSource?: string
  substantialCompletionDate?: string
  substantialCompletionMilestone?: string
  finalCompletionDate?: string
  finalCompletionMilestone?: string
  originalDurationDays?: number
  remainingDurationDays?: number
  actualDurationDays?: number
  durationAtCompletion?: number
  workCompletePct?: number
  completedAtThreshold?: number
  workInProgressCount?: number
  workInProgressAvgPct?: number
  workNotStartedCount?: number
  constructionActivityCount?: number
  excludedFromWorkPctCount?: number
  excludedMilestoneCount?: number
  excludedSubmittalCount?: number
  excludedProcurementCount?: number
  excludedDesignCount?: number
  excludedCloseoutCount?: number
  longLeadTotal?: number
  longLeadAtRisk?: number
  risksDetected?: number
  criticalRisks?: number
  risksCritical?: number
  risksHigh?: number
  risksMedium?: number
}
export interface SequenceViolation {
  pred: Task
  relType: string
  relTypeLabel: string
  predDate: string
  succDate: string
  requiredDate: string
  lagHours: number
  varianceDays: number
  description: string
}
export interface OutOfSequence {
  task: Task
  pred: Task
  predecessors: Task[]
  category: string
  violations: SequenceViolation[]
  relType?: string
}
export interface LongLeadItem extends Task {
  durationDays: number
  remainingDays: number
  floatDays: number
  calendarName: string
}
const LONG_LEAD_KEYWORDS = ['PROC', 'PRO-', 'FABRICAT', 'DELIVER', 'PROCURE', 'LONG LEAD', 'LEAD TIME']
export function hoursToDays(hours: string | number, calendar?: Calendar): number {
  const h = typeof hours === 'string' ? parseFloat(hours || '0') : hours
  if (isNaN(h) || h === 0) return 0
  if (!calendar) return Math.round(h / 8)
  const dayHr = parseFloat(calendar.day_hr_cnt || '8')
  const weekHr = parseFloat(calendar.week_hr_cnt || '40')
  if (weekHr >= 56) return Math.round(h / (weekHr / 7))
  if (weekHr >= 44) return Math.round(h / (weekHr / 6))
  return Math.round(h / dayHr)
}
export function parseXER(content: string): ParsedXER {
  const lines = content.split(/\r?\n/)
  let currentTable: string | null = null
  let currentFields: string[] = []
  const tasks: Record<string, Task> = {}
  const relationships: Relationship[] = []
  const calendars: Record<string, Calendar> = {}
  let projectName = ''
  let dataDate = ''
  let contractEnd = ''
  let projectedEnd = ''
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('%T')) {
      currentTable = line.split('\t')[1] || ''
      currentFields = []
    } else if (line.startsWith('%F')) {
      currentFields = line.split('\t').slice(1)
    } else if (line.startsWith('%R')) {
      const values = line.split('\t').slice(1)
      if (currentTable === 'PROJECT') {
        const row: any = {}
        currentFields.forEach((f, i) => row[f] = values[i])
        projectName = row.proj_short_name || ''
        dataDate = row.last_recalc_date || ''
        contractEnd = row.plan_end_date || ''
        projectedEnd = row.scd_end_date || ''
      } else if (currentTable === 'CALENDAR') {
        const cal: any = {}
        currentFields.forEach((f, i) => cal[f] = values[i] || '')
        calendars[cal.clndr_id] = cal as Calendar
      } else if (currentTable === 'TASK') {
        const task: any = {}
        currentFields.forEach((f, i) => task[f] = values[i] || '')
        tasks[task.task_id] = task as Task
      } else if (currentTable === 'TASKPRED') {
        const rel: any = {}
        currentFields.forEach((f, i) => rel[f] = values[i] || '')
        relationships.push(rel as Relationship)
      }
    }
  }
  const predMap: Record<string, string[]> = {}
  const succMap: Record<string, string[]> = {}
  for (const r of relationships) {
    if (!predMap[r.task_id]) predMap[r.task_id] = []
    predMap[r.task_id].push(r.pred_task_id)
    if (!succMap[r.pred_task_id]) succMap[r.pred_task_id] = []
    succMap[r.pred_task_id].push(r.task_id)
  }
  return { projectName, dataDate, contractEnd, projectedEnd, tasks, relationships, predMap, succMap, calendars }
}
export function analyzeXER(parsed: ParsedXER): XERAnalysis {
  const { tasks, relationships, predMap, succMap, calendars } = parsed
  const taskArr = Object.values(tasks)
  const getCalendar = (t: Task) => calendars[t.clndr_id]
  // ==========================================================================
  // STATUS COUNTS — single source of truth for not-started/complete/in-progress.
  //
  // FIX (Day 7): align the COUNTS with the LISTS shown on the Schedule Filter
  // page. Previously the counts used status_code while the lists used
  // act_start_date / act_end_date / phys_complete_pct heuristics, so a PM
  // would see "100 not started" in a tile but the list would show 80 or 120.
  // Now both come from status_code, which is what P6 itself uses for its
  // "Not Started" and "Completed" activity filters. Result: ControlLens
  // matches P6's filter counts exactly.
  // ==========================================================================
  const complete = taskArr.filter(t => t.status_code === 'TK_Complete').length
  const inProgress = taskArr.filter(t => t.status_code === 'TK_Active').length
  const notStarted = taskArr.filter(t => t.status_code === 'TK_NotStart').length
  const negativeFloat = taskArr.filter(t => {
    const f = parseFloat(t.total_float_hr_cnt || '0')
    return !isNaN(f) && f < 0
  }).length

  // ============================================================================
  // CONSTRUCTION SEQUENCE PROBLEMS — unchanged from v13
  // ============================================================================
  const HOUR_MS = 60 * 60 * 1000
  const DAY_MS = 24 * HOUR_MS
  const dateMs = (s: string | undefined): number | null => {
    if (!s) return null
    const d = new Date(s.replace(' ', 'T'))
    const ms = d.getTime()
    return isNaN(ms) ? null : ms
  }
  const fmtDate = (ms: number): string => {
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const relTypeLabel = (predType: string): string => {
    switch (predType) {
      case 'PR_FS': return 'FS'
      case 'PR_SS': return 'SS'
      case 'PR_FF': return 'FF'
      case 'PR_SF': return 'SF'
      default: return predType.replace(/^PR_/, '')
    }
  }
  // -------------------------------------------------------------------------
  // Out-of-Sequence detection (Day 12 — matches Primavera P6 Schedule Log)
  //
  // P6 flags an activity as out-of-sequence when:
  //   - The SUCCESSOR has actualized (started or finished) the date that this
  //     relationship constrains
  //   - BUT the PREDECESSOR has NOT yet actualized the date this relationship
  //     requires (per the FS/SS/FF/SF rule)
  //
  // Practical examples:
  //   FS:  succ has act_start but pred has no act_end → OOS
  //   SS:  succ has act_start but pred has no act_start → OOS
  //   FF:  succ has act_end   but pred has no act_end → OOS
  //   SF:  succ has act_end   but pred has no act_start → OOS
  //
  // This is the CLASSIC real-world OOS — "you progressed a successor without
  // updating its predecessor's status." It does NOT include "date mismatch
  // between two completed activities" which P6 treats as already-resolved.
  //
  // Dedupe by successor task_id — one activity counts once regardless of how
  // many of its predecessors are missing actuals. Matches P6's count.
  // -------------------------------------------------------------------------
  const oosMap = new Map<string, OutOfSequence>()
  for (const r of relationships) {
    const t = tasks[r.task_id]
    const p = tasks[r.pred_task_id]
    if (!t || !p) continue

    let predAnchorDate = ''
    let succActualDate = ''
    let predAnchorKind = ''     // what the predecessor needed to do (finished/started)
    let succActualKind = ''     // what the successor already did (finished/started)

    switch (r.pred_type) {
      case 'PR_FS':
        predAnchorDate = p.act_end_date
        succActualDate = t.act_start_date
        predAnchorKind = 'finished'
        succActualKind = 'started'
        break
      case 'PR_SS':
        predAnchorDate = p.act_start_date
        succActualDate = t.act_start_date
        predAnchorKind = 'started'
        succActualKind = 'started'
        break
      case 'PR_FF':
        predAnchorDate = p.act_end_date
        succActualDate = t.act_end_date
        predAnchorKind = 'finished'
        succActualKind = 'finished'
        break
      case 'PR_SF':
        predAnchorDate = p.act_start_date
        succActualDate = t.act_end_date
        predAnchorKind = 'started'
        succActualKind = 'finished'
        break
      default:
        continue
    }

    // P6 OOS rule: succ has its required actual, pred does not.
    // Skip if either condition fails (no OOS to report).
    const succHasActual = !!succActualDate && dateMs(succActualDate) !== null
    const predHasActual = !!predAnchorDate && dateMs(predAnchorDate) !== null
    if (!succHasActual || predHasActual) continue

    const relLabel = relTypeLabel(r.pred_type)
    const description =
      `${t.task_code} ${succActualKind} ${succActualDate.slice(0, 16)}, ` +
      `but predecessor ${p.task_code} has not ${predAnchorKind} yet (${relLabel}).`

    const violation: SequenceViolation = {
      pred: p,
      relType: r.pred_type,
      relTypeLabel: relLabel,
      predDate: '',                                    // pred hasn't acted yet
      succDate: succActualDate,
      requiredDate: '',                                // no required date — pred is missing
      lagHours: parseFloat(r.lag_hr_cnt || '0'),
      varianceDays: 0,                                 // not applicable; pred never started
      description,
    }

    let category = 'Other'
    if (t.task_code?.includes('PRO-') || t.task_code?.includes('PROC')) category = 'Procurement'
    else if (t.task_code?.includes('PRE-CON')) category = 'Pre-Construction'

    const existing = oosMap.get(t.task_id)
    if (existing) {
      existing.predecessors.push(p)
      existing.violations.push(violation)
      if (existing.category === 'Other' && category !== 'Other') {
        existing.category = category
      }
    } else {
      oosMap.set(t.task_id, {
        task: t,
        pred: p,
        predecessors: [p],
        category,
        violations: [violation],
        relType: r.pred_type,
      })
    }
  }
  const outOfSequence: OutOfSequence[] = Array.from(oosMap.values())
    .sort((a, b) => (a.task.task_code || '').localeCompare(b.task.task_code || ''))

  // No logic ties
  const noTies: Task[] = []
  for (const t of taskArr) {
    if (t.status_code === 'TK_Complete') continue
    const hasPred = predMap[t.task_id]?.length > 0
    const hasSucc = succMap[t.task_id]?.length > 0
    if (!hasPred || !hasSucc) noTies.push(t)
  }

  // Long lead & short lead — unchanged
  const longLeadItems: LongLeadItem[] = []
  const shortLeadItems: LongLeadItem[] = []
  for (const t of taskArr) {
    const upper = (t.task_name || '').toUpperCase() + ' ' + (t.task_code || '').toUpperCase()
    if (!LONG_LEAD_KEYWORDS.some(k => upper.includes(k))) continue
    const cal = getCalendar(t)
    const durationDays = hoursToDays(t.target_drtn_hr_cnt || '0', cal)
    if (durationDays < 20) continue
    const remainingDays = hoursToDays(t.remain_drtn_hr_cnt || '0', cal)
    const floatDays = hoursToDays(t.total_float_hr_cnt || '0', cal)
    const calendarName = cal?.clndr_name || 'Standard'
    const item: LongLeadItem = { ...t, durationDays, remainingDays, floatDays, calendarName }
    if (durationDays >= 35) longLeadItems.push(item)
    else shortLeadItems.push(item)
  }
  longLeadItems.sort((a, b) => a.floatDays - b.floatDays)
  shortLeadItems.sort((a, b) => a.floatDays - b.floatDays)
  const longLeadTotal = longLeadItems.length
  const longLeadAtRisk = longLeadItems.filter(item => {
    if (item.status_code === 'TK_Complete') return false
    const pct = parseFloat(item.phys_complete_pct || '0')
    if (!isNaN(pct) && pct >= 100) return false
    return item.floatDays <= 14
  }).length

  // Milestones — for dashboard display
  const milestones = taskArr
    .filter(t => {
      const isMilestone = t.task_type === 'TT_FinMile' || t.task_type === 'TT_Mile'
      const upper = (t.task_name || '').toUpperCase()
      const looksMilestone = upper.includes('MILESTONE') || upper.includes('SUBSTANTIAL') ||
                              upper.includes('COMPLETION') || upper.includes('TURNOVER') ||
                              upper.includes('OCCUPANCY') || upper.includes('NTP') ||
                              upper.includes('FINAL') || upper.includes('BENEFICIAL')
      return (isMilestone || looksMilestone) && t.status_code !== 'TK_Complete'
    })
    .sort((a, b) => {
      const fa = a.early_end_date || a.target_end_date || ''
      const fb = b.early_end_date || b.target_end_date || ''
      return fa.localeCompare(fb)
    })
    .slice(0, 10)

  const criticalDrivers = taskArr
    .filter(t => {
      const f = parseFloat(t.total_float_hr_cnt || '999')
      return f <= 0 && t.status_code !== 'TK_Complete'
    })
    .sort((a, b) => {
      const fa = a.early_end_date || a.act_end_date || ''
      const fb = b.early_end_date || b.act_end_date || ''
      return fa.localeCompare(fb)
    })
  const ganttActivities = taskArr
    .filter(t => {
      const f = parseFloat(t.total_float_hr_cnt || '999')
      return f <= 0
    })
    .sort((a, b) => {
      const fa = a.early_end_date || a.act_end_date || a.target_end_date || ''
      const fb = b.early_end_date || b.act_end_date || b.target_end_date || ''
      return fa.localeCompare(fb)
    })
  const inProgressActivities = taskArr
    .filter(t => t.status_code === 'TK_Active')
    .sort((a, b) => parseFloat(a.total_float_hr_cnt || '0') - parseFloat(b.total_float_hr_cnt || '0'))

  // Two-week lookahead — unchanged
  let twoWeekLookahead: Task[] = []
  if (parsed.dataDate) {
    const dataDateObj = new Date(parsed.dataDate.replace(' ', 'T'))
    if (!isNaN(dataDateObj.getTime())) {
      const windowEndMs = dataDateObj.getTime() + 14 * 24 * 60 * 60 * 1000
      const inWindow = (dateStr: string | undefined): boolean => {
        if (!dateStr) return false
        const d = new Date(dateStr.replace(' ', 'T'))
        if (isNaN(d.getTime())) return false
        const ms = d.getTime()
        return ms >= dataDateObj.getTime() && ms <= windowEndMs
      }
      twoWeekLookahead = taskArr
        .filter(t => {
          if (t.status_code === 'TK_Complete') return false
          const startStr = t.early_start_date || t.target_start_date
          const endStr = t.early_end_date || t.target_end_date
          return inWindow(startStr) || inWindow(endStr)
        })
        .sort((a, b) => {
          const aStr = a.early_start_date || a.target_start_date || ''
          const bStr = b.early_start_date || b.target_start_date || ''
          return aStr.localeCompare(bStr)
        })
    }
  }

  // ==========================================================================
  // ACTIVITIES NOT STARTED — Day 7 fix
  //
  // PRIMARY rule: match P6 exactly using status_code === 'TK_NotStart'. P6's
  // "Not Started" filter is status-code-based; the count tile (notStarted)
  // above already uses this. The list now matches.
  //
  // Removed previous restrictions:
  //   - No longer filtering on empty act_start_date (status_code already does that)
  //   - No longer filtering on phys_complete_pct === 0 (same)
  //   - No longer excluding milestones — P6 includes them in the filter and
  //     PMs need to see "Not Started" milestones (NTP, key dates, etc.)
  //
  // Sort by planned start ascending — soonest-due-to-start at the top.
  // ==========================================================================
  const notStartedActivities = taskArr
    .filter(t => t.status_code === 'TK_NotStart')
    .sort((a, b) => {
      const aStr = a.early_start_date || a.target_start_date || ''
      const bStr = b.early_start_date || b.target_start_date || ''
      return aStr.localeCompare(bStr)
    })

  // ==========================================================================
  // ACTIVITIES FINISHED — Day 7 fix
  //
  // PRIMARY rule: match P6 exactly using status_code === 'TK_Complete'. The
  // count tile (complete) above already uses this; the list now matches.
  //
  // Removed previous restrictions:
  //   - No longer filtering on populated act_end_date (status_code is canonical)
  //   - No longer excluding milestones — P6 includes them; PMs need to see
  //     completed milestones (NTP achieved, key dates hit, etc.)
  //
  // Sort by actual finish DESCENDING — most recently completed at the top.
  // ==========================================================================
  const finishedActivities = taskArr
    .filter(t => t.status_code === 'TK_Complete')
    .sort((a, b) => {
      const aStr = a.act_end_date || ''
      const bStr = b.act_end_date || ''
      return bStr.localeCompare(aStr)
    })

  // ==========================================================================
  // LONGEST PATH — Day 7 review
  //
  // Primary rule unchanged: activities flagged by P6 via driving_path_flag='Y'.
  // P6 only populates this when Schedule > Options > "Calculate longest path"
  // is enabled. If the XER lacks any flagged activities, fall back to
  // criticalDrivers (float ≤ 0, not complete) — the closest analog that
  // works on every schedule. No completion filter on the primary list since
  // P6's longest path can include completed activities at the start.
  // ==========================================================================
  const flaggedLongest = taskArr.filter(t => t.driving_path_flag === 'Y')
  const longestPathActivities = (flaggedLongest.length > 0 ? flaggedLongest : criticalDrivers)
    .slice()
    .sort((a, b) => {
      const aStr = a.early_start_date || a.target_start_date || a.act_start_date || ''
      const bStr = b.early_start_date || b.target_start_date || b.act_start_date || ''
      return aStr.localeCompare(bStr)
    })

  // SUBMITTALS — unchanged
  const SUBMIT_RX = /SUBMIT(?:TAL)?/i
  const APPROVAL_RX = /REVIEW|APPROVE|APPROVAL/i
  const submittalsMap = new Map<string, Task>()
  for (const t of taskArr) {
    if (t.status_code === 'TK_Complete') continue
    const name = t.task_name || ''
    if (!SUBMIT_RX.test(name)) continue
    submittalsMap.set(t.task_id, t)
    const successorIds = succMap[t.task_id] || []
    for (const succId of successorIds) {
      const succ = tasks[succId]
      if (!succ) continue
      if (succ.status_code === 'TK_Complete') continue
      const succName = succ.task_name || ''
      if (APPROVAL_RX.test(succName)) {
        submittalsMap.set(succ.task_id, succ)
      }
    }
  }
  const submittals = Array.from(submittalsMap.values()).sort((a, b) => {
    return parseFloat(a.total_float_hr_cnt || '0') - parseFloat(b.total_float_hr_cnt || '0')
  })

  // ==========================================================================
  // DELAY DAYS — Day 7 documentation
  //
  // Formula: delayDays = scd_end_date − plan_end_date (calendar days).
  //   - plan_end_date: P6's planned project finish (PROJECT.plan_end_date)
  //   - scd_end_date:  P6's currently scheduled finish (PROJECT.scd_end_date)
  //
  // CAVEAT: plan_end_date may not equal your CONTRACT end date. P6 sets it
  // when the project is created or via Project Properties; if a PM updates
  // P6's plan_end_date during the project, this delay number drifts away
  // from the true contract delay. For an authoritative "days behind contract"
  // number, the dashboard uses the manual Original Contract Completion the
  // PM enters on upload, NOT this delayDays field.
  // ==========================================================================
  let delayDays = 0
  if (parsed.contractEnd && parsed.projectedEnd) {
    const ce = new Date(parsed.contractEnd.replace(' ', 'T'))
    const pe = new Date(parsed.projectedEnd.replace(' ', 'T'))
    delayDays = Math.round((pe.getTime() - ce.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Health score
  let healthScore = 100
  if (delayDays > 0) healthScore -= Math.min(50, delayDays / 3)
  healthScore -= Math.min(20, (negativeFloat / taskArr.length) * 30)
  healthScore -= Math.min(15, (outOfSequence.length / 10))
  healthScore -= Math.min(10, noTies.length * 2)
  healthScore = Math.max(0, Math.round(healthScore))
  let condition = 'Stable'
  if (healthScore < 40) condition = 'Recovery Required'
  else if (healthScore < 60) condition = 'Attention Needed'
  else if (healthScore < 80) condition = 'Monitor Closely'

  // Key dates — unchanged
  function findMilestoneByKeywords(keywords: string[]) {
    return taskArr.find(t => {
      const upper = (t.task_name || '').toUpperCase()
      const isMilestone = t.task_type === 'TT_FinMile' || t.task_type === 'TT_Mile' || t.task_type === 'TT_StartMile'
      return isMilestone && keywords.some(k => upper.includes(k))
    })
  }
  const ntpMilestone = findMilestoneByKeywords(['NTP', 'NOTICE TO PROCEED', 'PROJECT START', 'START DATE'])
  const projectStartDate = ntpMilestone?.early_start_date || ntpMilestone?.target_start_date ||
    ntpMilestone?.act_start_date ||
    taskArr.reduce((earliest, t) => {
      const start = t.early_start_date || t.target_start_date || t.act_start_date
      if (!start) return earliest
      if (!earliest) return start
      return start < earliest ? start : earliest
    }, '' as string)
  const projectStartSource = ntpMilestone ? `NTP Milestone (${ntpMilestone.task_code})` : 'Earliest Activity'
  const substMilestone = findMilestoneByKeywords(['SUBSTANTIAL', 'BENEFICIAL', 'BOD', 'BENEFICIAL OCCUPANCY'])
  const substantialDate = substMilestone?.early_end_date || substMilestone?.target_end_date
  const finalMilestone = findMilestoneByKeywords(['FINAL COMPLETION', 'PROJECT COMPLETE', 'TURNOVER', 'CLOSEOUT COMPLETE', 'FINAL ACCEPTANCE'])
  const finalDate = finalMilestone?.early_end_date || finalMilestone?.target_end_date
  const calcCalendarDays = (start: string | undefined, end: string | undefined): number => {
    if (!start || !end) return 0
    const s = new Date(start.replace(' ', 'T'))
    const e = new Date(end.replace(' ', 'T'))
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0
    return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
  }
  const planStart = projectStartDate
  const planEnd = parsed.contractEnd
  const forecastEnd = parsed.projectedEnd || parsed.contractEnd
  const dataDateStr = parsed.dataDate
  const originalDurationDays = calcCalendarDays(planStart, planEnd)
  const actualDurationDays = calcCalendarDays(planStart, dataDateStr)
  const remainingDurationDays = calcCalendarDays(dataDateStr, forecastEnd)
  const durationAtCompletion = calcCalendarDays(planStart, forecastEnd)

  // Work % Complete — unchanged
  const SUBMITTAL_KW = ['SUBMIT', 'SUBMITTAL', 'REVIEW', 'APPROVAL', 'APPROVE']
  const PROCUREMENT_KW = ['PROC', 'PRO-', 'FABRICAT', 'DELIVER', 'PROCURE', 'LONG LEAD', 'LEAD TIME']
  const DESIGN_KW = ['DESIGN', 'ENGINEERING', 'ENG-', 'DWG', 'DRAWING']
  const CLOSEOUT_KW = ['CLOSEOUT', 'CLOSE OUT', 'PUNCH LIST', 'TURNOVER', 'FINAL ACCEPTANCE', 'COMMISSION', 'COMMISSIONING', 'WARRANTY', 'PCD']
  const classifyForWorkPct = (t: Task): 'milestone' | 'submittal' | 'procurement' | 'design' | 'closeout' | null => {
    if (t.task_type === 'TT_Mile' || t.task_type === 'TT_FinMile' || t.task_type === 'TT_StartMile') {
      return 'milestone'
    }
    const upper = (t.task_name || '').toUpperCase() + ' ' + (t.task_code || '').toUpperCase()
    if (SUBMITTAL_KW.some(k => upper.includes(k))) return 'submittal'
    if (PROCUREMENT_KW.some(k => upper.includes(k))) return 'procurement'
    if (DESIGN_KW.some(k => upper.includes(k))) return 'design'
    if (CLOSEOUT_KW.some(k => upper.includes(k))) return 'closeout'
    return null
  }
  let sumEffective = 0
  let completedAtThreshold = 0
  let inProgressSum = 0
  let workInProgressCount = 0
  let workNotStartedCount = 0
  let constructionActivityCount = 0
  let excludedMilestoneCount = 0
  let excludedSubmittalCount = 0
  let excludedProcurementCount = 0
  let excludedDesignCount = 0
  let excludedCloseoutCount = 0
  for (const t of taskArr) {
    const exclusion = classifyForWorkPct(t)
    if (exclusion) {
      if (exclusion === 'milestone') excludedMilestoneCount += 1
      else if (exclusion === 'submittal') excludedSubmittalCount += 1
      else if (exclusion === 'procurement') excludedProcurementCount += 1
      else if (exclusion === 'design') excludedDesignCount += 1
      else if (exclusion === 'closeout') excludedCloseoutCount += 1
      continue
    }
    constructionActivityCount += 1
    const pctRaw = parseFloat(t.phys_complete_pct || '0')
    const pct = isNaN(pctRaw) ? 0 : pctRaw
    const isDone = t.status_code === 'TK_Complete' || pct >= 80
    if (isDone) {
      sumEffective += 100
      completedAtThreshold += 1
    } else if (pct > 0) {
      sumEffective += pct
      inProgressSum += pct
      workInProgressCount += 1
    } else {
      workNotStartedCount += 1
    }
  }
  const workCompletePct = constructionActivityCount > 0
    ? sumEffective / constructionActivityCount
    : 0
  const workInProgressAvgPct = workInProgressCount > 0 ? inProgressSum / workInProgressCount : 0
  const excludedFromWorkPctCount =
    excludedMilestoneCount + excludedSubmittalCount + excludedProcurementCount +
    excludedDesignCount + excludedCloseoutCount

  // Risks Detected — unchanged
  const floatDaysOf = (t: Task): number => {
    const cal = getCalendar(t)
    return hoursToDays(t.total_float_hr_cnt || '0', cal)
  }
  let risksCritical = 0
  let risksHigh = 0
  let risksMedium = 0
  for (const t of taskArr) {
    if (t.status_code === 'TK_Complete') continue
    const floatHr = parseFloat(t.total_float_hr_cnt || '999')
    if (isNaN(floatHr)) continue
    if (floatHr < 0) {
      risksCritical += 1
    } else if (floatHr === 0) {
      risksHigh += 1
    } else {
      const fDays = floatDaysOf(t)
      if (fDays >= 1 && fDays <= 7) {
        risksMedium += 1
      }
    }
  }
  const risksDetected = risksCritical + risksHigh + risksMedium
  const criticalRisks = risksCritical

  // Day 10 — Multiple Float Paths needs all activities with their float
  // values to compute multiple ranked paths client-side. Include all
  // non-complete activities with float ≤ 30 days (covers any threshold up
  // to 30). Lightweight subset of Task fields only.
  const allTasksForPaths: any[] = taskArr
    .filter(t => t.status_code !== 'TK_Complete')
    .filter(t => {
      const f = parseFloat(t.total_float_hr_cnt || '999')
      return f <= 30 * 8  // ≤ 30 days
    })
    .map(t => ({
      task_id: t.task_id,
      task_code: t.task_code,
      task_name: t.task_name,
      status_code: t.status_code,
      task_type: t.task_type,
      phys_complete_pct: t.phys_complete_pct,
      total_float_hr_cnt: t.total_float_hr_cnt,
      remain_drtn_hr_cnt: t.remain_drtn_hr_cnt,
      target_drtn_hr_cnt: t.target_drtn_hr_cnt,
      early_start_date: t.early_start_date,
      early_end_date: t.early_end_date,
      target_start_date: t.target_start_date,
      target_end_date: t.target_end_date,
      act_start_date: t.act_start_date,
      act_end_date: t.act_end_date,
    }))

  return {
    totalActivities: taskArr.length,
    complete, inProgress, notStarted, negativeFloat,
    outOfSequence, noTies,
    longLeadItems, shortLeadItems,
    criticalDrivers, ganttActivities, inProgressActivities,
    milestones,
    twoWeekLookahead,
    notStartedActivities,
    finishedActivities,
    longestPathActivities,
    submittals,
    allTasksForPaths,  // Day 10
    healthScore, condition, delayDays,
    dataDate: parsed.dataDate,
    projectStartDate, projectStartSource,
    substantialCompletionDate: substantialDate,
    substantialCompletionMilestone: substMilestone?.task_code,
    finalCompletionDate: finalDate,
    finalCompletionMilestone: finalMilestone?.task_code,
    originalDurationDays, remainingDurationDays, actualDurationDays, durationAtCompletion,
    workCompletePct,
    completedAtThreshold,
    workInProgressCount,
    workInProgressAvgPct,
    workNotStartedCount,
    constructionActivityCount,
    excludedFromWorkPctCount,
    excludedMilestoneCount,
    excludedSubmittalCount,
    excludedProcurementCount,
    excludedDesignCount,
    excludedCloseoutCount,
    longLeadTotal,
    longLeadAtRisk,
    risksDetected,
    criticalRisks,
    risksCritical,
    risksHigh,
    risksMedium,
  }
}
