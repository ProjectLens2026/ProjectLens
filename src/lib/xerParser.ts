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
  driving_path_flag: string
  early_start_date: string
  early_end_date: string
  act_start_date: string
  act_end_date: string
  target_start_date: string
  target_end_date: string
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
  criticalDrivers: Task[]
  inProgressActivities: Task[]
  healthScore: number
  condition: string
  delayDays: number
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
}

const LONG_LEAD_KEYWORDS = ['PROC', 'PRO-', 'FABRICAT', 'DELIVER', 'PROCURE', 'LONG LEAD', 'LEAD TIME']

export function parseXER(content: string): ParsedXER {
  const lines = content.split(/\r?\n/)
  let currentTable: string | null = null
  let currentFields: string[] = []
  const tasks: Record<string, Task> = {}
  const relationships: Relationship[] = []
  let projectName = ''
  let dataDate = ''
  let contractEnd = ''
  let projectedEnd = ''

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('%T')) {
      const parts = line.split('\t')
      currentTable = parts[1] || ''
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

  return { projectName, dataDate, contractEnd, projectedEnd, tasks, relationships, predMap, succMap }
}

export function analyzeXER(parsed: ParsedXER): XERAnalysis {
  const { tasks, relationships, predMap, succMap } = parsed
  const taskArr = Object.values(tasks)

  const complete = taskArr.filter(t => t.status_code === 'TK_Complete').length
  const inProgress = taskArr.filter(t => t.status_code === 'TK_Active').length
  const notStarted = taskArr.filter(t => t.status_code === 'TK_NotStart').length

  const negativeFloat = taskArr.filter(t => {
    const f = parseFloat(t.total_float_hr_cnt || '0')
    return !isNaN(f) && f < 0
  }).length

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

  const noTies: Task[] = []
  for (const t of taskArr) {
    if (t.status_code === 'TK_Complete') continue
    const hasPred = predMap[t.task_id]?.length > 0
    const hasSucc = succMap[t.task_id]?.length > 0
    if (!hasPred || !hasSucc) noTies.push(t)
  }

  const longLeadItems: LongLeadItem[] = []
  for (const t of taskArr) {
    const upper = (t.task_name || '').toUpperCase() + ' ' + (t.task_code || '').toUpperCase()
    if (!LONG_LEAD_KEYWORDS.some(k => upper.includes(k))) continue
    const durationDays = Math.round((parseFloat(t.target_drtn_hr_cnt || '0') || 0) / 8)
    if (durationDays < 20) continue
    const remainingDays = Math.round((parseFloat(t.remain_drtn_hr_cnt || '0') || 0) / 8)
    const floatDays = Math.round((parseFloat(t.total_float_hr_cnt || '0') || 0) / 8)
    longLeadItems.push({ ...t, durationDays, remainingDays, floatDays })
  }
  longLeadItems.sort((a, b) => a.floatDays - b.floatDays)

  const criticalDrivers = taskArr
    .filter(t => t.driving_path_flag === 'Y' && t.status_code !== 'TK_Complete')
    .sort((a, b) => {
      const fa = parseFloat(a.total_float_hr_cnt || '999')
      const fb = parseFloat(b.total_float_hr_cnt || '999')
      return fa - fb
    })
    .slice(0, 15)

  const inProgressActivities = taskArr
    .filter(t => t.status_code === 'TK_Active')
    .sort((a, b) => parseFloat(a.total_float_hr_cnt || '0') - parseFloat(b.total_float_hr_cnt || '0'))

  let delayDays = 0
  if (parsed.contractEnd && parsed.projectedEnd) {
    const ce = new Date(parsed.contractEnd.replace(' ', 'T'))
    const pe = new Date(parsed.projectedEnd.replace(' ', 'T'))
    delayDays = Math.round((pe.getTime() - ce.getTime()) / (1000 * 60 * 60 * 24))
  }

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

  return {
    totalActivities: taskArr.length,
    complete,
    inProgress,
    notStarted,
    negativeFloat,
    outOfSequence,
    noTies,
    longLeadItems,
    criticalDrivers,
    inProgressActivities,
    healthScore,
    condition,
    delayDays,
  }
}
