// =============================================================================
// Multiple Float Paths analysis (Day 10)
//
// Identifies the top N driving chains of activities in a P6 schedule, ranked
// by float days. The critical path (float = 0) is Path 1; near-critical paths
// (1-5 day float typically) are Paths 2-N. This is the proper method that
// federal/commercial PMs need — Schedule Validator and other tools show only
// the single critical path and miss the near-critical paths that become
// critical after one slip.
//
// Notes on float basis:
// XER files reliably export total_float_hr_cnt but NOT free_float_hr_cnt.
// For path identification, total float is industry standard (it tells you
// how much the activity can slip before the project end date moves). Free
// float (how much an activity can slip without affecting its immediate
// successor) is a different concept and not what you want here.
// =============================================================================

import type { Task, ParsedXER } from './xerParser'

export interface FloatPath {
  pathNumber: number
  floatDays: number
  isCritical: boolean            // floatDays === 0
  isNearCritical: boolean        // 0 < floatDays <= threshold
  pathName: string               // Auto-generated label
  plainExplanation: string       // Human-readable description
  activities: Task[]             // In chronological order
  startDate: string              // Earliest start
  endDate: string                // Latest finish
  drivesToMilestone: string      // Name of milestone this path ends at
}

export interface MultipleFloatPathsResult {
  paths: FloatPath[]
  threshold: number
  totalPathsFound: number        // Could be > 5 if many float buckets exist
  projectStart: string
  projectEnd: string
  finalCompletionMilestone: string
}

// Construction keywords for auto-naming paths. Listed in priority order —
// when an activity contains multiple keywords, the earliest in this list wins.
const CONSTRUCTION_KEYWORDS = [
  'MEP', 'HVAC', 'electrical', 'plumbing', 'mechanical', 'fire alarm',
  'sprinkler', 'roofing', 'masonry', 'brick', 'concrete', 'steel', 'rebar',
  'drywall', 'painting', 'flooring', 'tile', 'glazing', 'doors', 'finishes',
  'insulation', 'siding', 'foundation', 'excavation', 'demolition', 'shoring',
  'procurement', 'submittal', 'fabrication', 'delivery', 'installation',
  'inspection', 'testing', 'commissioning', 'startup', 'closeout',
]

function hoursToDays(hours: string | number): number {
  const h = typeof hours === 'string' ? parseFloat(hours || '0') : hours
  if (isNaN(h)) return 0
  return Math.round(h / 8)
}

// Pick the most common construction keyword in this group of activities.
// Returns the keyword if found, or null. Used to auto-generate path names.
function dominantKeyword(activities: Task[]): string | null {
  const counts: Record<string, number> = {}
  for (const t of activities) {
    const name = (t.task_name || '').toLowerCase()
    for (const kw of CONSTRUCTION_KEYWORDS) {
      if (name.includes(kw.toLowerCase())) {
        counts[kw] = (counts[kw] || 0) + 1
      }
    }
  }
  let best: string | null = null
  let bestCount = 0
  for (const [kw, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = kw
      bestCount = count
    }
  }
  // Only use the keyword if it shows up in at least 2 activities OR
  // covers 1/3 or more of the activities in the path
  if (!best || (bestCount < 2 && bestCount < activities.length / 3)) {
    return null
  }
  return best
}

// Build a human-readable path name. Tries dominant construction keyword first,
// falls back to first activity's WBS or first 3 words of its name.
function buildPathName(activities: Task[]): string {
  if (activities.length === 0) return 'Unnamed path'
  const kw = dominantKeyword(activities)
  if (kw) {
    // Pick most likely supporting word (procurement / installation / etc.)
    const supporting = activities.some(a => /procurement|fabrication|delivery/i.test(a.task_name))
      ? 'procurement'
      : activities.some(a => /installation|install|rough/i.test(a.task_name))
      ? 'installation'
      : 'chain'
    if (kw === supporting) return `${kw.charAt(0).toUpperCase() + kw.slice(1)} chain`
    return `${kw.charAt(0).toUpperCase() + kw.slice(1)} ${supporting}`
  }
  // Fallback — use first activity's name
  const first = activities[0].task_name || activities[0].task_code || 'work'
  const words = first.split(/[\s\-_/]+/).filter(w => w.length > 1).slice(0, 3)
  return words.join(' ') + ' chain'
}

// Build a plain-language explanation of what this path means.
function buildExplanation(path: {
  floatDays: number
  activities: Task[]
  pathName: string
  isCritical: boolean
  threshold: number
}): string {
  const { floatDays, activities, isCritical, threshold } = path
  if (activities.length === 0) return ''

  // Top 2-3 driving activities (those still not complete)
  const drivers = activities
    .filter(a => a.status_code !== 'TK_Complete')
    .slice(0, 3)
    .map(a => a.task_name)
    .filter(Boolean)
  const driverPhrase = drivers.length > 0
    ? drivers.length === 1
      ? drivers[0]
      : drivers.length === 2
        ? `${drivers[0]} and ${drivers[1]}`
        : `${drivers[0]}, ${drivers[1]}, and ${drivers[2]}`
    : 'the activities listed below'

  if (isCritical) {
    return `This path controls when the project finishes. Any slip on these activities pushes the project end date by the same amount, day-for-day. The driving work is ${driverPhrase}.`
  }
  // Near-critical
  const slipReason = floatDays <= 2
    ? 'One bad weather week or one approval delay'
    : floatDays <= 5
      ? 'One small disruption — a delayed RFI response, a missed delivery, or a permit hold'
      : 'A moderate disruption — extended delivery slip or sequencing change'
  return `This path has ${floatDays} day${floatDays === 1 ? '' : 's'} of total float. ${slipReason} turns it into the new critical path. The bottleneck activities are ${driverPhrase}.`
}

// Find the project's final completion milestone. Preference order:
// 1. Activity with task_type = TT_FinMile and the latest early_end_date
// 2. Any milestone (TT_Mile) with the latest early_end_date
// 3. The activity with the latest early_end_date overall
function findFinalCompletion(tasks: Task[]): Task | null {
  if (tasks.length === 0) return null

  const finMilestones = tasks.filter(t => t.task_type === 'TT_FinMile')
  if (finMilestones.length > 0) {
    return finMilestones.sort((a, b) =>
      (b.early_end_date || b.target_end_date || '').localeCompare(
        a.early_end_date || a.target_end_date || '')
    )[0]
  }
  const milestones = tasks.filter(t => t.task_type === 'TT_Mile' || t.task_type === 'TT_FinMile')
  if (milestones.length > 0) {
    return milestones.sort((a, b) =>
      (b.early_end_date || b.target_end_date || '').localeCompare(
        a.early_end_date || a.target_end_date || '')
    )[0]
  }
  return tasks.sort((a, b) =>
    (b.early_end_date || b.target_end_date || '').localeCompare(
      a.early_end_date || a.target_end_date || '')
  )[0] || null
}

/**
 * Main entry point — analyze the activities-with-float subset and return the
 * top N float paths within the given threshold.
 *
 * @param tasksWithFloat - Array of tasks (typically analysis.allTasksForPaths)
 * @param threshold - Float threshold in days (e.g. 5). Default 5.
 * @param maxPaths - Maximum number of paths. Default 5.
 */
export function analyzeMultipleFloatPaths(
  tasksWithFloat: Task[],
  threshold: number = 5,
  maxPaths: number = 5,
): MultipleFloatPathsResult {
  if (!tasksWithFloat || tasksWithFloat.length === 0) {
    return {
      paths: [], threshold, totalPathsFound: 0,
      projectStart: '', projectEnd: '', finalCompletionMilestone: 'Final completion',
    }
  }
  // Skip completed activities — they don't drive future schedule. Keep ones
  // in progress because their remaining float still matters.
  const activeTasks = tasksWithFloat.filter(t => t.status_code !== 'TK_Complete')

  // Find the final completion milestone for the "drives to" label
  const finalMilestone = findFinalCompletion(tasksWithFloat)
  const finalCompletionMilestone = finalMilestone
    ? (finalMilestone.task_name || finalMilestone.task_code || 'Final completion')
    : 'Final completion'

  // Project date range — for Gantt normalization in the UI
  const projectStart = tasksWithFloat
    .map(t => t.act_start_date || t.early_start_date || t.target_start_date || '')
    .filter(Boolean)
    .sort()[0] || ''
  const projectEnd = tasksWithFloat
    .map(t => t.early_end_date || t.target_end_date || t.act_end_date || '')
    .filter(Boolean)
    .sort()
    .reverse()[0] || ''

  // Group active tasks by integer float days. Activities at the same float
  // level form a "path" — they all push the project end together if delayed.
  const buckets: Record<number, Task[]> = {}
  for (const t of activeTasks) {
    const floatDays = hoursToDays(t.total_float_hr_cnt)
    // Only consider non-negative buckets up to threshold (and -ve for critical-and-behind)
    // We include negative float because that IS the critical path on a behind-schedule job.
    if (floatDays > threshold) continue
    if (!buckets[floatDays]) buckets[floatDays] = []
    buckets[floatDays].push(t)
  }

  // Sort float bucket keys ascending. Negative floats come first (most critical).
  // Then 0 (true critical path), then 1, 2, 3...
  const floatKeys = Object.keys(buckets)
    .map(k => parseInt(k, 10))
    .sort((a, b) => a - b)

  // Build the paths
  const paths: FloatPath[] = []
  let pathNumber = 1
  for (const floatDays of floatKeys) {
    if (paths.length >= maxPaths) break
    const tasksAtThisFloat = buckets[floatDays]
    // Skip tiny paths — a path of 1 activity isn't really a "path"
    if (tasksAtThisFloat.length < 2) continue

    // Sort chronologically by early start
    const sorted = tasksAtThisFloat.sort((a, b) =>
      (a.early_start_date || a.target_start_date || '').localeCompare(
        b.early_start_date || b.target_start_date || '')
    )
    const pathName = buildPathName(sorted)
    const isCritical = floatDays <= 0
    const isNearCritical = !isCritical && floatDays <= threshold

    const path: FloatPath = {
      pathNumber,
      floatDays,
      isCritical,
      isNearCritical,
      pathName,
      activities: sorted,
      plainExplanation: '',
      startDate: sorted[0]?.early_start_date || sorted[0]?.target_start_date || '',
      endDate: sorted[sorted.length - 1]?.early_end_date
        || sorted[sorted.length - 1]?.target_end_date || '',
      drivesToMilestone: finalCompletionMilestone,
    }
    path.plainExplanation = buildExplanation({
      floatDays,
      activities: sorted,
      pathName,
      isCritical,
      threshold,
    })
    paths.push(path)
    pathNumber++
  }

  return {
    paths,
    threshold,
    totalPathsFound: floatKeys.length,
    projectStart,
    projectEnd,
    finalCompletionMilestone,
  }
}

/**
 * Helper for the UI Gantt rendering — converts an activity's start/end into
 * normalized percentages on a 0-100 scale within the project timeline.
 */
export function activityToGanttRange(
  task: Task,
  projectStart: string,
  projectEnd: string,
): { leftPct: number; widthPct: number } | null {
  if (!projectStart || !projectEnd) return null
  const start = task.act_start_date || task.early_start_date || task.target_start_date
  const end = task.act_end_date || task.early_end_date || task.target_end_date
  if (!start || !end) return null
  try {
    const projStart = new Date(projectStart.replace(' ', 'T')).getTime()
    const projEnd = new Date(projectEnd.replace(' ', 'T')).getTime()
    const taskStart = new Date(start.replace(' ', 'T')).getTime()
    const taskEnd = new Date(end.replace(' ', 'T')).getTime()
    const total = projEnd - projStart
    if (total <= 0) return null
    const leftPct = Math.max(0, Math.min(100, ((taskStart - projStart) / total) * 100))
    const widthPct = Math.max(0.5, Math.min(100 - leftPct, ((taskEnd - taskStart) / total) * 100))
    return { leftPct, widthPct }
  } catch {
    return null
  }
}
