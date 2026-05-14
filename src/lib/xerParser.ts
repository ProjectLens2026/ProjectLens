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
  healthScore: number
  condition: string
  delayDays: number
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
  task: Task
  pred: Task
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

  // Out of sequence
  const outOfSequence: OutOfSequence[] = []
  for (const r of relationships) {
    if (r.pred_type !== 'PR_FS') continue
    const t = tasks[r.task_id]
    const p = tasks[r.pred_task_id]
    if (!t || !p) continue
    if (p.act_end_date && t.act_start_date && t.act_start_date < p.act_end_date) {
      let category = 'Other'
      if (t.task_code?.includes('PRO-') || t.task_code?.includes('PROC')) category = 'Procurement'
      else if (t.task_code?.includes('PRE-CON')) category = 'Pre-Construction'
      outOfSequence.push({ task: t, pred: p, category })
    }
  }

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

  // DURATIONS
  let originalDurationDays = 0
  let remainingDurationDays = 0
  let actualDurationDays = 0
  taskArr.forEach(t => {
    const cal = calendars[t.clndr_id]
    const hoursPerDay = cal ? parseFloat(cal.day_hr_cnt || '8') : 8
    const targetHr = parseFloat(t.target_drtn_hr_cnt || '0')
    const remainHr = parseFloat(t.remain_drtn_hr_cnt || '0')
    // Actual = Target - Remaining (standard P6 calculation)
    const actualHr = Math.max(0, targetHr - remainHr)
    originalDurationDays += targetHr / hoursPerDay
    remainingDurationDays += remainHr / hoursPerDay
    actualDurationDays += actualHr / hoursPerDay
  })
  originalDurationDays = Math.round(originalDurationDays)
  remainingDurationDays = Math.round(remainingDurationDays)
  actualDurationDays = Math.round(actualDurationDays)
  const durationAtCompletion = actualDurationDays + remainingDurationDays

  return {
    totalActivities: taskArr.length,
    complete, inProgress, notStarted, negativeFloat,
    outOfSequence, noTies,
    longLeadItems, shortLeadItems,
    criticalDrivers, ganttActivities, inProgressActivities,
    milestones,
    healthScore, condition, delayDays,
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
