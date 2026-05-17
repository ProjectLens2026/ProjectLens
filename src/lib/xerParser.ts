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
// A single relationship-level violation. An out-of-sequence activity may
// have multiple violations (one per predecessor whose logic was broken by
// actual progress). Each violation carries enough evidence for a PM to
// review and dispute or accept independently.
export interface SequenceViolation {
  pred: Task               // the predecessor on the violating relationship
  relType: string          // 'PR_FS' | 'PR_SS' | 'PR_FF' | 'PR_SF'
  relTypeLabel: string     // 'FS' | 'SS' | 'FF' | 'SF' for display
  // The predecessor's actual date that anchors this relationship
  // (act_end for FS/FF, act_start for SS/SF). Plain ISO string from XER.
  predDate: string
  // The successor's actual date that the predecessor's date is compared
  // against (act_start for FS/SS, act_end for FF/SF).
  succDate: string
  // The date the successor's actual progress should have been at OR after,
  // accounting for relationship lag. If actual succDate is earlier than
  // this, the relationship is violated.
  requiredDate: string
  lagHours: number
  // How many calendar days the successor's actual happened before the
  // required date. Always positive — bigger numbers = bigger violation.
  varianceDays: number
  // Plain-language explanation a non-scheduler PM can read directly.
  description: string
}

export interface OutOfSequence {
  // The successor activity that started/finished before its predecessor
  // logic allowed. One OutOfSequence entry per affected successor activity
  // — matches how Primavera P6 reports out-of-sequence in its Schedule Log
  // (by activity, not by relationship).
  task: Task
  // First violating predecessor. Kept for backwards compatibility with any
  // existing UI that reads .pred — older code continues to work unchanged.
  pred: Task
  // All violating predecessors for this successor. A single successor can
  // have multiple OOS predecessors (e.g. a CMU install where rebar, footing
  // inspection, and form-stripping all finished after the install started).
  predecessors: Task[]
  category: string
  // Full per-relationship evidence for each violation involving this
  // activity. Lets the UI show WHY each activity is flagged, with the
  // specific dates and variances. This is what powers the "Construction
  // Sequence Problems" detail view — gives the PM the receipts so they
  // can dispute or accept each violation rather than just trusting a count.
  violations: SequenceViolation[]
  // The relationship type that triggered the FIRST violation (FS / SS / FF / SF).
  // Stored as P6's pred_type string. Useful for debugging.
  relType?: string
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
  // ============================================================================
  // CONSTRUCTION SEQUENCE PROBLEMS — lag-aware, with full per-violation evidence
  // ============================================================================
  //
  // Renamed from "Out of Sequence" to "Construction Sequence Problems" in the
  // UI — sidesteps the false-precision claim of matching P6's exact OOS count
  // (P6 uses proprietary driving-constraint logic). We instead show the PM
  // every relationship-level violation with full evidence, so they can review
  // each one with their scheduler and decide whether it's legitimate
  // fast-tracking, a logic gap, or a true problem.
  //
  // Detection rules per relationship type (lag is in HOURS in TASKPRED.lag_hr_cnt):
  //
  //   PR_FS (Finish-to-Start):
  //     succ.act_start must be >= (pred.act_end + lag)
  //     If lag is negative ("lead"), succ can legitimately start before pred
  //     finishes — that's INTENTIONAL fast-tracking and NOT a violation.
  //
  //   PR_SS (Start-to-Start):
  //     succ.act_start must be >= (pred.act_start + lag)
  //
  //   PR_FF (Finish-to-Finish):
  //     succ.act_end must be >= (pred.act_end + lag)
  //
  //   PR_SF (Start-to-Finish):
  //     succ.act_end must be >= (pred.act_start + lag)
  //
  // For each violation we record:
  //   - The relationship type (FS/SS/FF/SF)
  //   - The predecessor's anchor date (the date used in the comparison)
  //   - The successor's actual date that should have been after the anchor + lag
  //   - The REQUIRED date (anchor + lag) — i.e. the earliest legitimate value
  //   - How many days early the successor's actual occurred (varianceDays)
  //   - A plain-language description for non-scheduler PMs
  //
  // One OutOfSequence entry per affected SUCCESSOR activity. If the activity
  // has multiple violated predecessors, we collect them all into the
  // `predecessors[]` and `violations[]` arrays for that one entry. Matches
  // P6 Schedule Log convention (one warning per affected activity).
  const HOUR_MS = 60 * 60 * 1000
  const DAY_MS = 24 * HOUR_MS

  /** Parse a P6 date string ("2024-04-01 17:00") to ms, or null if invalid. */
  const dateMs = (s: string | undefined): number | null => {
    if (!s) return null
    const d = new Date(s.replace(' ', 'T'))
    const ms = d.getTime()
    return isNaN(ms) ? null : ms
  }

  /** Format ms back to a P6-style "YYYY-MM-DD HH:MM" string. */
  const fmtDate = (ms: number): string => {
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  /** Friendly label for a P6 relationship type code. */
  const relTypeLabel = (predType: string): string => {
    switch (predType) {
      case 'PR_FS': return 'FS'
      case 'PR_SS': return 'SS'
      case 'PR_FF': return 'FF'
      case 'PR_SF': return 'SF'
      default: return predType.replace(/^PR_/, '')
    }
  }

  const oosMap = new Map<string, OutOfSequence>()

  for (const r of relationships) {
    const t = tasks[r.task_id]
    const p = tasks[r.pred_task_id]
    if (!t || !p) continue

    // Lag in milliseconds. Positive = delay required, negative = lead allowed.
    const lagMs = parseFloat(r.lag_hr_cnt || '0') * HOUR_MS
    if (isNaN(lagMs)) continue

    // Compute whether this relationship is violated by actual progress.
    // `predAnchorMs`/`succActualMs` hold the dates we're comparing.
    // `null` for either means we lack the actual data to evaluate.
    let predAnchorMs: number | null = null
    let succActualMs: number | null = null
    let predAnchorDateStr = ''
    let succActualDateStr = ''
    let kindLabel = ''  // human-readable label for the explanation

    switch (r.pred_type) {
      case 'PR_FS':
        predAnchorMs = dateMs(p.act_end_date)
        succActualMs = dateMs(t.act_start_date)
        predAnchorDateStr = p.act_end_date
        succActualDateStr = t.act_start_date
        kindLabel = 'finished'
        break
      case 'PR_SS':
        predAnchorMs = dateMs(p.act_start_date)
        succActualMs = dateMs(t.act_start_date)
        predAnchorDateStr = p.act_start_date
        succActualDateStr = t.act_start_date
        kindLabel = 'started'
        break
      case 'PR_FF':
        predAnchorMs = dateMs(p.act_end_date)
        succActualMs = dateMs(t.act_end_date)
        predAnchorDateStr = p.act_end_date
        succActualDateStr = t.act_end_date
        kindLabel = 'finished'
        break
      case 'PR_SF':
        predAnchorMs = dateMs(p.act_start_date)
        succActualMs = dateMs(t.act_end_date)
        predAnchorDateStr = p.act_start_date
        succActualDateStr = t.act_end_date
        kindLabel = 'started'
        break
      default:
        continue  // unknown rel type
    }
    if (predAnchorMs === null || succActualMs === null) continue

    const requiredMs = predAnchorMs + lagMs
    const violated = succActualMs < requiredMs
    if (!violated) continue

    // Build the violation record
    const varianceDays = Math.max(0, Math.round((requiredMs - succActualMs) / DAY_MS))
    const lagHours = lagMs / HOUR_MS
    const relLabel = relTypeLabel(r.pred_type)

    // Plain-language explanation. Examples:
    //   FS: "Predecessor PRO-750 finished 2024-04-15 17:00, but PRO-770
    //        started 2024-04-10 08:00 — 5 days early (FS, no lag)."
    //   FS with positive lag: "Predecessor PRE-CON-170 finished ... ; PRO-100
    //        should not have started until ... (FS + 3 day lag), but started ..."
    //   FS with lead: "Lead of 5 days allowed, but successor started 8 days
    //        before predecessor finished."
    const succAction = (r.pred_type === 'PR_FS' || r.pred_type === 'PR_SS') ? 'started' : 'finished'
    let lagPhrase = ''
    if (lagHours > 0) {
      const lagDays = Math.round(lagHours / 24)
      lagPhrase = ` (${relLabel} + ${lagDays} day lag)`
    } else if (lagHours < 0) {
      const leadDays = Math.round(Math.abs(lagHours) / 24)
      lagPhrase = ` (${relLabel} − ${leadDays} day lead allowed)`
    } else {
      lagPhrase = ` (${relLabel}, no lag)`
    }
    const description =
      `Predecessor ${p.task_code} ${kindLabel} ${predAnchorDateStr?.slice(0, 16) || '—'}, ` +
      `but ${t.task_code} ${succAction} ${succActualDateStr?.slice(0, 16) || '—'} ` +
      `— ${varianceDays} day${varianceDays === 1 ? '' : 's'} too early${lagPhrase}.`

    const violation: SequenceViolation = {
      pred: p,
      relType: r.pred_type,
      relTypeLabel: relLabel,
      predDate: predAnchorDateStr,
      succDate: succActualDateStr,
      requiredDate: fmtDate(requiredMs),
      lagHours,
      varianceDays,
      description,
    }

    // Categorize the affected activity by code prefix (used by the Risks UI
    // and Lens Logic Check to group violations).
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
        pred: p,                     // first violating predecessor (back-compat)
        predecessors: [p],
        category,
        violations: [violation],
        relType: r.pred_type,
      })
    }
  }
  // Sort by task_code ascending — matches how P6's Schedule Log lists OOS
  // when sorted alphabetically by Activity ID.
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
  // calendar days after the data date.
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
    dataDate: parsed.dataDate,
    projectStartDate, projectStartSource,
    substantialCompletionDate: substantialDate,
    substantialCompletionMilestone: substMilestone?.task_code,
    finalCompletionDate: finalDate,
    finalCompletionMilestone: finalMilestone?.task_code,
    originalDurationDays, remainingDurationDays, actualDurationDays, durationAtCompletion,
  }
}
