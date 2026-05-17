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
  // Two-week lookahead — activities scheduled to start OR finish within 14
  // calendar days after the schedule's data date. Used by the Schedule Filter
  // tab on the Full Analysis page. Excludes already-completed activities.
  twoWeekLookahead?: Task[]
  // Submittals — Submit activities + their Review/Approval successor pairs.
  // Detected by activity NAME (not ID), case-insensitive:
  //   - Name contains SUBMIT or SUBMITTAL → counts as a submit activity
  //   - Successor of a submit activity whose name contains REVIEW or APPROVAL
  //     → counts as the paired approval activity
  // Only the verified pairs are returned. Standalone review/approval
  // activities (no submit predecessor) are excluded. Used by the Submittals
  // page in the sidebar — page classifies into Critical/Near-Critical/Healthy
  // tiers based on each activity's total float.
  submittals?: Task[]
  healthScore: number
  condition: string
  delayDays: number
  // Data date — the actual schedule "as-of" date pulled from the XER's
  // PROJECT.last_recalc_date field. Used by the trend analyzer to order
  // versions chronologically by their real schedule date, not by upload time.
  dataDate?: string
  // Key dates
  projectStartDate?: string
  projectStartSource?: string
  substantialCompletionDate?: string
  substantialCompletionMilestone?: string
  finalCompletionDate?: string
  finalCompletionMilestone?: string
  // Durations
  originalDurationDays?: number
  remainingDurationDays?: number
  actualDurationDays?: number
  durationAtCompletion?: number
}

export interface OutOfSequence {
  // The successor activity that started before its predecessor finished.
  // One OutOfSequence entry per affected successor activity — matches how
  // Primavera P6 reports out-of-sequence in its Schedule Log (by activity,
  // not by relationship).
  task: Task
  // First violating predecessor. Kept for backwards compatibility with any
  // existing UI that reads .pred — older code continues to work unchanged.
  pred: Task
  // All violating predecessors for this successor. A single successor can
  // have multiple OOS predecessors (e.g. a CMU install where rebar, footing
  // inspection, and form-stripping all finished after the install started).
  predecessors: Task[]
  category: string
}

export interface LongLeadItem extends Task {
  durationDays: number
  remainingDays: number
  floatDays: number
  calendarName: string
}

const LONG_LEAD_KEYWORDS = ['PROC', 'PRO-', 'FABRICAT', 'DELIVER', 'PROCURE', 'LONG LEAD', 'LEAD TIME']

// Convert P6 hours to calendar days using the activity's assigned calendar
export function hoursToDays(hours: string | number, calendar?: Calendar): number {
  const h = typeof hours === 'string' ? parseFloat(hours || '0') : hours
  if (isNaN(h) || h === 0) return 0
  
  if (!calendar) return Math.round(h / 8) // default working days
  
  const dayHr = parseFloat(calendar.day_hr_cnt || '8')
  const weekHr = parseFloat(calendar.week_hr_cnt || '40')
  
  // 7-day calendar: week_hr >= 56 (7 days × 8 hrs)
  if (weekHr >= 56) return Math.round(h / (weekHr / 7))
  
  // 6-day calendar: week_hr between 44-55
  if (weekHr >= 44) return Math.round(h / (weekHr / 6))
  
  // 5-day calendar (standard working days)
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

  const complete = taskArr.filter(t => t.status_code === 'TK_Complete').length
  const inProgress = taskArr.filter(t => t.status_code === 'TK_Active').length
  const notStarted = taskArr.filter(t => t.status_code === 'TK_NotStart').length

  const negativeFloat = taskArr.filter(t => {
    const f = parseFloat(t.total_float_hr_cnt || '0')
    return !isNaN(f) && f < 0
  }).length

  // Out of sequence — one entry per affected SUCCESSOR activity, not per
  // relationship. This matches how Primavera P6 reports out-of-sequence in
  // its Schedule Log. A single successor with multiple violating predecessors
  // appears once with all its violating preds attached.
  //
  // Detection rule (matches P6 for FS relationships):
  //   - Predecessor has an actual finish date (it's completed)
  //   - Successor has an actual start date (it has started)
  //   - Successor's actual start is BEFORE predecessor's actual finish
  //
  // Only Finish-to-Start (FS) relationships are checked here. P6 also
  // reports OOS for SS/FF/SF — see open follow-up to extend coverage.
  const oosMap = new Map<string, OutOfSequence>()
  for (const r of relationships) {
    if (r.pred_type !== 'PR_FS') continue
    const t = tasks[r.task_id]
    const p = tasks[r.pred_task_id]
    if (!t || !p) continue
    if (p.act_end_date && t.act_start_date && t.act_start_date < p.act_end_date) {
      let category = 'Other'
      if (t.task_code?.includes('PRO-') || t.task_code?.includes('PROC')) category = 'Procurement'
      else if (t.task_code?.includes('PRE-CON')) category = 'Pre-Construction'

      const existing = oosMap.get(t.task_id)
      if (existing) {
        existing.predecessors.push(p)
        // Upgrade category if a later relationship gives us a more specific
        // bucket than 'Other' (e.g. a procurement predecessor on a generic task)
        if (existing.category === 'Other' && category !== 'Other') {
          existing.category = category
        }
      } else {
        oosMap.set(t.task_id, {
          task: t,
          pred: p,                // first violating predecessor — kept for backwards compat
          predecessors: [p],
          category,
        })
      }
    }
  }
  // Sort by task_code ascending so the order matches what a scheduler sees
  // when they sort P6's out-of-sequence report alphabetically by Activity ID.
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

  // Long lead & short lead using calendar-aware durations
  // Long lead: >= 35 calendar days, Short lead: 20-34 calendar days
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

    if (durationDays >= 35) {
      longLeadItems.push(item)
    } else {
      shortLeadItems.push(item)
    }
  }

  longLeadItems.sort((a, b) => a.floatDays - b.floatDays)
  shortLeadItems.sort((a, b) => a.floatDays - b.floatDays)

  // Milestones — extract from XER for dashboard display
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

  // Critical drivers — sorted by early finish date ascending
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

  // Gantt activities — all with 0 or negative float, sorted by early finish
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

  // Two-week lookahead — activities scheduled to start or finish within 14
  // calendar days after the data date. Anchored to the schedule's data date
  // (PROJECT.last_recalc_date), NOT today's clock. Completed activities are
  // excluded because they're past, not upcoming. Falls back to target_*
  // dates when early_* are missing (some XERs only populate one or the other).
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

  // SUBMITTALS — paired Submit + Review/Approval activities
  //
  // We look at activity NAMES (not IDs — IDs vary too widely across XERs).
  // Detection logic:
  //   1. Find activities whose name contains SUBMIT or SUBMITTAL (case-insensitive)
  //      → these are "submit" activities, always counted
  //   2. For each submit activity, walk its successors via succMap
  //   3. Any successor whose name contains REVIEW or APPROVAL → counts as
  //      the paired approval activity
  //   4. Standalone reviews/approvals with no submit predecessor are NOT
  //      included (prevents design reviews, safety reviews, etc. from
  //      polluting the list)
  //
  // Completed activities (status_code = TK_Complete) are excluded — they're
  // already approved/done, so they don't need PM attention. The Submittals
  // page sorts these into Critical / Near-Critical / Healthy tiers based on
  // total float; we sort by float ascending here so the most urgent items
  // come first.
  const SUBMIT_RX = /SUBMIT(?:TAL)?/i
  const APPROVAL_RX = /REVIEW|APPROVE|APPROVAL/i
  const submittalsMap = new Map<string, Task>()  // dedupe by task_id

  for (const t of taskArr) {
    if (t.status_code === 'TK_Complete') continue
    const name = t.task_name || ''
    if (!SUBMIT_RX.test(name)) continue

    // This is a submit activity — add it.
    submittalsMap.set(t.task_id, t)

    // Walk its successors and add any review/approval pairs.
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

  // Delay days
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

  // KEY DATES — detect NTP, Substantial Completion, Final Completion
  function findMilestoneByKeywords(keywords: string[]) {
    return taskArr.find(t => {
      const upper = (t.task_name || '').toUpperCase()
      const isMilestone = t.task_type === 'TT_FinMile' || t.task_type === 'TT_Mile' || t.task_type === 'TT_StartMile'
      return isMilestone && keywords.some(k => upper.includes(k))
    })
  }

  // NTP / Project Start
  const ntpMilestone = findMilestoneByKeywords(['NTP', 'NOTICE TO PROCEED', 'PROJECT START', 'START DATE'])
  const projectStartDate = ntpMilestone?.early_start_date || ntpMilestone?.target_start_date ||
    ntpMilestone?.act_start_date ||
    // Fallback: earliest activity start
    taskArr.reduce((earliest, t) => {
      const start = t.early_start_date || t.target_start_date || t.act_start_date
      if (!start) return earliest
      if (!earliest) return start
      return start < earliest ? start : earliest
    }, '' as string)
  const projectStartSource = ntpMilestone ? `NTP Milestone (${ntpMilestone.task_code})` : 'Earliest Activity'

  // Substantial Completion
  const substMilestone = findMilestoneByKeywords(['SUBSTANTIAL', 'BENEFICIAL', 'BOD', 'BENEFICIAL OCCUPANCY'])
  const substantialDate = substMilestone?.early_end_date || substMilestone?.target_end_date

  // Final Completion
  const finalMilestone = findMilestoneByKeywords(['FINAL COMPLETION', 'PROJECT COMPLETE', 'TURNOVER', 'CLOSEOUT COMPLETE', 'FINAL ACCEPTANCE'])
  const finalDate = finalMilestone?.early_end_date || finalMilestone?.target_end_date

  // DURATIONS — project-level, calculated from plan / forecast dates
  //
  // Previously summed each activity's individual duration in hours then
  // divided by hours-per-day. That gives total person/crew-days of workload
  // across all activities (e.g. 6,580 days for ~550 activities), which is a
  // different concept from how long the project is. Users see "Original
  // Duration" on the dashboard and expect contract length — the time from
  // project start to project end — not aggregate activity workload.
  //
  // We now use project-level dates:
  //   Original Duration   = plan start  → plan end       (contract length)
  //   Actual Duration     = plan start  → data date      (time elapsed)
  //   Remaining Duration  = data date   → forecast end   (time left)
  //   Duration at Compl.  = plan start  → forecast end   (total when done)
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

  return {
    totalActivities: taskArr.length,
    complete, inProgress, notStarted, negativeFloat,
    outOfSequence, noTies,
    longLeadItems, shortLeadItems,
    criticalDrivers, ganttActivities, inProgressActivities,
    milestones,
    twoWeekLookahead,
    submittals,
    healthScore, condition, delayDays,
    // Data date — pulled directly from the XER's PROJECT.last_recalc_date.
    // This is the schedule's "as-of" date, set by the scheduler in P6.
    // Different from when the file was uploaded to NobelPM.
    dataDate: parsed.dataDate,
    // Key dates
    projectStartDate, projectStartSource,
    substantialCompletionDate: substantialDate,
    substantialCompletionMilestone: substMilestone?.task_code,
    finalCompletionDate: finalDate,
    finalCompletionMilestone: finalMilestone?.task_code,
    // Durations
    originalDurationDays, remainingDurationDays, actualDurationDays, durationAtCompletion,
  }
}
