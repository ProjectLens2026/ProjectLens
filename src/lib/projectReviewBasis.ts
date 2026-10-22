import type { ContractDates, Project, ScheduleRequirementsBasis } from './projectStore'
import { detectFinalCompletionTarget } from './completionBoundary'

const DAY_MS = 24 * 60 * 60 * 1000

function dateMs(value: unknown): number | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return null
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate())
}

export function authorizedContractCompletion(dates?: ContractDates): string | undefined {
  return dates?.currentFinalCompletion || dates?.originalContractCompletion || undefined
}

export function contractualDelayDays(forecast: unknown, dates?: ContractDates): number | null {
  const completion = dateMs(authorizedContractCompletion(dates))
  const projected = dateMs(forecast)
  if (completion === null || projected === null) return null
  return Math.round((projected - completion) / DAY_MS)
}

/**
 * Apply the project-level contractual basis to a version analysis without
 * mutating the stored XER evidence. PROJECT.plan_end_date is retained as an
 * administrative term only and can never create a contractual delay signal.
 */
export function analysisWithProjectBasis(analysis: any, project?: Project | null): any {
  if (!analysis) return analysis
  const contractDates = project?.contractDates
  const scheduleRequirements = project?.controlBasis?.scheduleRequirements
  const authorizedCompletion = authorizedContractCompletion(contractDates)
  const completionTarget = detectFinalCompletionTarget(Object.values(analysis.traceTasks || {}))
  const completionForecast = completionTarget?.date
    || analysis.finalCompletionForecast
    || analysis.finalCompletionDate
    || undefined
  const delay = contractualDelayDays(completionForecast, contractDates)
  const totalActivities = Math.max(1, Number(analysis.totalActivities || Object.keys(analysis.traceTasks || {}).length || 1))
  const negativeFloat = Number(analysis.negativeFloat || 0)
  const outOfSequence = Array.isArray(analysis.outOfSequence) ? analysis.outOfSequence.length : Number(analysis.outOfSequenceCount || 0)
  const noTies = Array.isArray(analysis.noTies) ? analysis.noTies.length : Number(analysis.noTiesCount || 0)
  let healthScore = 100
  if (delay !== null && delay > 0) healthScore -= Math.min(50, delay / 3)
  healthScore -= Math.min(20, (negativeFloat / totalActivities) * 30)
  healthScore -= Math.min(15, outOfSequence / 10)
  healthScore -= Math.min(10, noTies * 2)
  healthScore = Math.max(0, Math.round(healthScore))
  const condition = healthScore < 40
    ? 'Recovery Required'
    : healthScore < 60
      ? 'Attention Needed'
      : healthScore < 80
        ? 'Monitor Closely'
        : 'Stable'
  return {
    ...analysis,
    administrativeTermDate: contractDates?.administrativeTermDate
      || analysis.administrativeTermDate
      || analysis.contractEnd
      || undefined,
    projectScheduledEnd: analysis.projectScheduledEnd || analysis.projectedEnd || undefined,
    projectedEnd: completionForecast,
    finalCompletionDate: completionForecast,
    finalCompletionMilestone: completionTarget?.task?.task_code || analysis.finalCompletionMilestone,
    contractEnd: authorizedCompletion,
    delayDays: delay === null ? 0 : delay,
    contractDelayAvailable: delay !== null,
    healthScore,
    condition,
    reviewBasis: {
      contractDates,
      scheduleRequirements: scheduleRequirements as ScheduleRequirementsBasis | undefined,
    },
  }
}
