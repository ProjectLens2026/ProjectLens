// =============================================================================
// Microsoft Project XML (MSPDI) → Control Lens normalized schedule model.
//
// This importer deliberately produces the same ParsedXER task/relationship
// shape consumed by analyzeXER(). The source application changes; the CPM,
// construction, readiness, review-register and reporting engines do not.
// =============================================================================

import type {
  Calendar,
  ParsedXER,
  Relationship,
  Task,
  WbsNode,
} from './xerParser'

const childElements = (parent: Element, name: string): Element[] =>
  Array.from(parent.children).filter(child => child.localName === name)

const child = (parent: Element, name: string): Element | undefined =>
  childElements(parent, name)[0]

const value = (parent: Element, name: string): string =>
  child(parent, name)?.textContent?.trim() || ''

const bool = (raw: string): boolean => ['1', 'true', 'yes'].includes(raw.trim().toLowerCase())

function scheduleDate(raw: string): string {
  if (!raw) return ''
  // Preserve the wall-clock value exported by Microsoft Project. Converting
  // through Date/toISOString would silently move dates across time zones.
  return raw.replace('T', ' ').replace(/Z$/, '').slice(0, 19)
}

function durationHours(raw: string, hoursPerDay: number): number {
  if (!raw) return 0
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) return numeric
  const match = raw.match(/^(-)?P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i)
  if (!match) return 0
  const sign = match[1] ? -1 : 1
  const days = Number(match[2] || 0)
  const hours = Number(match[3] || 0)
  const minutes = Number(match[4] || 0)
  const seconds = Number(match[5] || 0)
  return sign * (days * hoursPerDay + hours + minutes / 60 + seconds / 3600)
}

// MSPDI stores TotalSlack and LinkLag in tenths of a minute.
const tenthMinutesToHours = (raw: string): number => {
  const amount = Number(raw || 0)
  return Number.isFinite(amount) ? amount / 600 : 0
}

function relationshipType(raw: string): string {
  if (raw === '0') return 'PR_FF'
  if (raw === '2') return 'PR_SF'
  if (raw === '3') return 'PR_SS'
  return 'PR_FS'
}

function constraintType(raw: string): string {
  const types: Record<string, string> = {
    '1': 'CS_ALAP',
    '2': 'CS_MANDSTART',
    '3': 'CS_MANDFIN',
    '4': 'CS_STARTON',
    '5': 'CS_STARTOBY',
    '6': 'CS_FINISHON',
    '7': 'CS_FINISHOBY',
  }
  return types[raw] || ''
}

function taskDurationType(raw: string): string {
  if (raw === '1') return 'MSP_FIXED_DURATION'
  if (raw === '2') return 'MSP_FIXED_WORK'
  return 'MSP_FIXED_UNITS'
}

function baselineDates(taskElement: Element): { start: string; finish: string } {
  const baselines = childElements(taskElement, 'Baseline')
  const baseline = baselines.find(item => value(item, 'Number') === '0') || baselines[0]
  return baseline
    ? { start: scheduleDate(value(baseline, 'Start')), finish: scheduleDate(value(baseline, 'Finish')) }
    : { start: '', finish: '' }
}

export function parseMSProjectXML(content: string): ParsedXER {
  if (typeof DOMParser === 'undefined') throw new Error('Microsoft Project XML parsing requires a browser session.')
  const document = new DOMParser().parseFromString(content, 'application/xml')
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The XML file is not well formed. Re-export it from Microsoft Project as XML and try again.')
  }
  const root = document.documentElement
  if (!root || root.localName !== 'Project') {
    throw new Error('This is not a Microsoft Project XML file. In Microsoft Project, use File → Save As → XML Format.')
  }

  const minutesPerDay = Math.max(1, Number(value(root, 'MinutesPerDay') || 480))
  const minutesPerWeek = Math.max(minutesPerDay, Number(value(root, 'MinutesPerWeek') || 2400))
  const hoursPerDay = minutesPerDay / 60
  const hoursPerWeek = minutesPerWeek / 60
  const projectName = value(root, 'Name') || value(root, 'Title') || 'Microsoft Project Schedule'
  const dataDate = scheduleDate(value(root, 'StatusDate') || value(root, 'CurrentDate'))
  const projectFinish = scheduleDate(value(root, 'FinishDate'))

  const calendars: Record<string, Calendar> = {}
  const calendarsElement = child(root, 'Calendars')
  for (const calendarElement of calendarsElement ? childElements(calendarsElement, 'Calendar') : []) {
    const id = value(calendarElement, 'UID')
    if (!id) continue
    calendars[id] = {
      clndr_id: id,
      clndr_name: value(calendarElement, 'Name') || `Calendar ${id}`,
      clndr_type: 'CA_PROJECT',
      day_hr_cnt: String(hoursPerDay),
      week_hr_cnt: String(hoursPerWeek),
    }
  }
  const defaultCalendarId = value(root, 'CalendarUID') || Object.keys(calendars)[0] || 'MSP_DEFAULT'
  if (!calendars[defaultCalendarId]) {
    calendars[defaultCalendarId] = {
      clndr_id: defaultCalendarId,
      clndr_name: 'Microsoft Project Default Calendar',
      clndr_type: 'CA_PROJECT',
      day_hr_cnt: String(hoursPerDay),
      week_hr_cnt: String(hoursPerWeek),
    }
  }

  const tasksElement = child(root, 'Tasks')
  const taskElements = tasksElement ? childElements(tasksElement, 'Task') : []
  if (!taskElements.length) throw new Error('The Microsoft Project XML contains no tasks.')

  const summaryUids = new Set(taskElements.filter(item => bool(value(item, 'Summary'))).map(item => value(item, 'UID')))
  const inactiveUids = new Set(taskElements.filter(item => value(item, 'Active') && !bool(value(item, 'Active'))).map(item => value(item, 'UID')))
  const tasks: Record<string, Task> = {}
  const relationships: Relationship[] = []
  const wbsNodes: Record<string, WbsNode> = {}
  const summaryStack: Array<{ uid: string; level: number; wbsId: string }> = []

  for (const taskElement of taskElements) {
    const uid = value(taskElement, 'UID')
    if (!uid || uid === '0' || inactiveUids.has(uid)) continue
    const outlineLevel = Math.max(0, Number(value(taskElement, 'OutlineLevel') || 0))
    while (summaryStack.length && summaryStack[summaryStack.length - 1].level >= outlineLevel) summaryStack.pop()

    if (summaryUids.has(uid)) {
      const wbsId = `MSP-WBS-${uid}`
      const parent = summaryStack[summaryStack.length - 1]
      const parentPath = parent ? wbsNodes[parent.wbsId]?.full_path || [] : []
      wbsNodes[wbsId] = {
        wbs_id: wbsId,
        wbs_name: value(taskElement, 'Name') || value(taskElement, 'WBS') || `Summary ${uid}`,
        parent_wbs_id: parent?.wbsId,
        full_path: [...parentPath, value(taskElement, 'Name') || value(taskElement, 'WBS') || `Summary ${uid}`],
      }
      summaryStack.push({ uid, level: outlineLevel, wbsId })
      continue
    }

    const id = `MSP-TASK-${uid}`
    const percent = Number(value(taskElement, 'PercentComplete') || 0)
    const physicalPercentRaw = value(taskElement, 'PhysicalPercentComplete')
    const physicalPercent = physicalPercentRaw || String(Number.isFinite(percent) ? percent : 0)
    const actualStart = scheduleDate(value(taskElement, 'ActualStart'))
    const actualFinish = scheduleDate(value(taskElement, 'ActualFinish'))
    const status = actualFinish || percent >= 100 ? 'TK_Complete' : actualStart || percent > 0 ? 'TK_Active' : 'TK_NotStart'
    const duration = durationHours(value(taskElement, 'Duration'), hoursPerDay)
    const remaining = durationHours(value(taskElement, 'RemainingDuration'), hoursPerDay)
    const actualDuration = durationHours(value(taskElement, 'ActualDuration'), hoursPerDay)
    const totalSlackRaw = value(taskElement, 'TotalSlack')
    const totalFloat = totalSlackRaw
      ? tenthMinutesToHours(totalSlackRaw)
      : bool(value(taskElement, 'Critical')) ? 0 : hoursPerDay * 999
    const start = scheduleDate(value(taskElement, 'EarlyStart') || value(taskElement, 'Start'))
    const finish = scheduleDate(value(taskElement, 'EarlyFinish') || value(taskElement, 'Finish'))
    const baseline = baselineDates(taskElement)
    const milestone = bool(value(taskElement, 'Milestone')) || duration === 0
    const taskName = value(taskElement, 'Name') || `Task ${uid}`
    const finishMilestone = milestone && /COMPLETE|COMPLETION|FINISH|TURNOVER|ACCEPTANCE|OCCUPANCY/i.test(taskName)
    const assignedWbs = summaryStack[summaryStack.length - 1]?.wbsId

    tasks[id] = {
      task_id: id,
      task_code: value(taskElement, 'WBS') || value(taskElement, 'OutlineNumber') || `MSP-${uid}`,
      task_name: taskName,
      status_code: status,
      task_type: milestone ? (finishMilestone ? 'TT_FinMile' : 'TT_Mile') : 'TT_Task',
      phys_complete_pct: physicalPercent,
      total_float_hr_cnt: String(totalFloat),
      remain_drtn_hr_cnt: String(remaining),
      target_drtn_hr_cnt: String(duration),
      act_drtn_hr_cnt: String(actualDuration),
      driving_path_flag: '',
      early_start_date: start,
      early_end_date: finish,
      act_start_date: actualStart,
      act_end_date: actualFinish,
      target_start_date: baseline.start || scheduleDate(value(taskElement, 'Start')),
      target_end_date: baseline.finish || scheduleDate(value(taskElement, 'Finish')),
      clndr_id: value(taskElement, 'CalendarUID') || defaultCalendarId,
      wbs_id: assignedWbs,
      cstr_type: constraintType(value(taskElement, 'ConstraintType')),
      cstr_date: scheduleDate(value(taskElement, 'ConstraintDate')),
      duration_type: taskDurationType(value(taskElement, 'Type')),
      complete_pct_type: physicalPercentRaw ? 'Physical' : 'Duration',
    }
  }

  for (const taskElement of taskElements) {
    const successorUid = value(taskElement, 'UID')
    const successorId = `MSP-TASK-${successorUid}`
    if (!tasks[successorId]) continue
    for (const link of childElements(taskElement, 'PredecessorLink')) {
      if (bool(value(link, 'CrossProject'))) continue
      const predecessorId = `MSP-TASK-${value(link, 'PredecessorUID')}`
      if (!tasks[predecessorId]) continue
      relationships.push({
        task_id: successorId,
        pred_task_id: predecessorId,
        pred_type: relationshipType(value(link, 'Type')),
        lag_hr_cnt: String(tenthMinutesToHours(value(link, 'LinkLag'))),
      })
    }
  }

  const predMap: Record<string, string[]> = {}
  const succMap: Record<string, string[]> = {}
  for (const relationship of relationships) {
    if (!predMap[relationship.task_id]) predMap[relationship.task_id] = []
    predMap[relationship.task_id].push(relationship.pred_task_id)
    if (!succMap[relationship.pred_task_id]) succMap[relationship.pred_task_id] = []
    succMap[relationship.pred_task_id].push(relationship.task_id)
  }

  const baselineFinishes = taskElements.map(item => baselineDates(item).finish).filter(Boolean).sort()
  const currentFinishes = Object.values(tasks).map(task => task.early_end_date || task.target_end_date).filter(Boolean).sort()
  const projectedEnd = projectFinish || currentFinishes[currentFinishes.length - 1] || ''
  return {
    sourceFormat: 'MS_PROJECT_XML',
    sourceLabel: 'Microsoft Project XML',
    projectName,
    dataDate,
    contractEnd: baselineFinishes[baselineFinishes.length - 1] || projectedEnd,
    projectedEnd,
    tasks,
    relationships,
    predMap,
    succMap,
    calendars,
    wbsNodes,
    projectSettings: {
      source_format: 'MS_PROJECT_XML',
      minutes_per_day: String(minutesPerDay),
      minutes_per_week: String(minutesPerWeek),
    },
    scheduleOptions: {},
    activityCodeTypes: {},
    taskActivityCodes: [],
  }
}
