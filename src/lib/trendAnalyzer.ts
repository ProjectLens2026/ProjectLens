// Trend Analysis Engine — analyzes multiple schedule versions to detect patterns

import { Project, ScheduleVersion } from './projectStore'

export interface VersionDataPoint {
  versionLabel: string
  uploadedAt: string
  fileName: string
  totalActivities: number
  complete: number
  inProgress: number
  notStarted: number
  completePct: number
  negativeFloat: number
  outOfSequence: number
  noTies: number
  delayDays: number
  healthScore: number
  condition: string
  contractEnd?: string
  projectedEnd?: string
  longLeadCount: number
  longLeadAtRisk: number
}

export interface VersionChange {
  fromVersion: string
  toVersion: string
  daysBetween: number
  activitiesAdded: number
  activitiesRemoved: number
  delayDaysChange: number
  negativeFloatChange: number
  healthScoreChange: number
  completionPctChange: number
  majorChanges: string[]
}

export interface TrendRecommendation {
  type: 'HEALTHY' | 'SCHEDULE_UPDATE_REQUIRED' | 'REBASELINE_RECOMMENDED' | 'TIA_AND_CONTRACT_AMENDMENT'
  title: string
  summary: string
  actions: string[]
  reasoning: string[]
}

export interface TrendAnalysisResult {
  projectName: string
  projectId?: string
  versionsAnalyzed: number
  firstUpload: string
  latestUpload: string
  timeSpanDays: number
  dataPoints: VersionDataPoint[]
  changes: VersionChange[]
  recommendation: TrendRecommendation
  summary: {
    trendDirection: 'IMPROVING' | 'STABLE' | 'DETERIORATING' | 'SEVERELY_DETERIORATING'
    overallNegFloatChange: number
    overallDelayChange: number
    overallHealthChange: number
    overallCompletionChange: number
    averageMonthlyDelayGrowth: number
  }
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24))
}

function pct(value: number, total: number): number {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

// Convert a version into a data point
function toDataPoint(v: ScheduleVersion, index: number, total: number): VersionDataPoint {
  const a = v.analysis || {}
  const versionLabel = `v${total - index}` // v1 is oldest, vN is newest
  return {
    versionLabel,
    uploadedAt: v.uploadedAt,
    fileName: v.fileName,
    totalActivities: a.totalActivities || 0,
    complete: a.complete || 0,
    inProgress: a.inProgress || 0,
    notStarted: a.notStarted || 0,
    completePct: pct(a.complete || 0, a.totalActivities || 0),
    negativeFloat: a.negativeFloat || 0,
    outOfSequence: a.outOfSequence?.length || 0,
    noTies: a.noTies?.length || 0,
    delayDays: a.delayDays || 0,
    healthScore: a.healthScore || 0,
    condition: a.condition || 'Unknown',
    contractEnd: a.contractEnd,
    projectedEnd: a.projectedEnd,
    longLeadCount: a.longLeadItems?.length || 0,
    longLeadAtRisk: (a.longLeadItems || []).filter((l: any) => l.floatDays < 0).length,
  }
}

// Compute changes between two consecutive versions
function computeChange(older: VersionDataPoint, newer: VersionDataPoint): VersionChange {
  const days = daysBetween(older.uploadedAt, newer.uploadedAt)
  const activitiesAdded = Math.max(0, newer.totalActivities - older.totalActivities)
  const activitiesRemoved = Math.max(0, older.totalActivities - newer.totalActivities)
  const delayDaysChange = newer.delayDays - older.delayDays
  const negativeFloatChange = newer.negativeFloat - older.negativeFloat
  const healthScoreChange = newer.healthScore - older.healthScore
  const completionPctChange = newer.completePct - older.completePct

  const majorChanges: string[] = []

  if (activitiesAdded > 5) majorChanges.push(`${activitiesAdded} new activities added`)
  if (activitiesRemoved > 5) majorChanges.push(`${activitiesRemoved} activities removed`)
  if (Math.abs(delayDaysChange) > 10) {
    majorChanges.push(`Delay ${delayDaysChange > 0 ? 'grew' : 'reduced'} by ${Math.abs(delayDaysChange)} days`)
  }
  if (Math.abs(negativeFloatChange) > 30) {
    majorChanges.push(`Negative float ${negativeFloatChange > 0 ? 'grew' : 'reduced'} by ${Math.abs(negativeFloatChange)} activities`)
  }
  if (older.projectedEnd && newer.projectedEnd && older.projectedEnd !== newer.projectedEnd) {
    const slip = daysBetween(older.projectedEnd, newer.projectedEnd)
    if (Math.abs(slip) > 7) {
      majorChanges.push(`Projected completion ${slip > 0 ? 'slipped' : 'pulled in'} by ${Math.abs(slip)} days`)
    }
  }
  if (Math.abs(completionPctChange) < 2 && days > 14) {
    majorChanges.push(`Completion essentially unchanged in ${days} days (flatlined progress)`)
  }
  if (healthScoreChange < -10) {
    majorChanges.push(`Health score dropped ${Math.abs(healthScoreChange)} points`)
  }

  return {
    fromVersion: older.versionLabel,
    toVersion: newer.versionLabel,
    daysBetween: days,
    activitiesAdded,
    activitiesRemoved,
    delayDaysChange,
    negativeFloatChange,
    healthScoreChange,
    completionPctChange,
    majorChanges,
  }
}

// Determine NobelPM recommendation based on trend
function generateRecommendation(dataPoints: VersionDataPoint[], changes: VersionChange[]): TrendRecommendation {
  const latest = dataPoints[dataPoints.length - 1]
  const earliest = dataPoints[0]

  const overallDelayChange = latest.delayDays - earliest.delayDays
  const overallNegFloatChange = latest.negativeFloat - earliest.negativeFloat
  const totalActivitiesAdded = changes.reduce((s, c) => s + c.activitiesAdded, 0)
  const flatlinedUpdates = changes.filter(c => c.majorChanges.some(m => m.includes('flatlined'))).length

  // Is the trend actually improving?
  const isImproving = overallDelayChange < -5 || (overallDelayChange <= 0 && overallNegFloatChange < 0)
  const isStable = Math.abs(overallDelayChange) <= 5 && Math.abs(overallNegFloatChange) <= 10
  const isDeteriorating = overallDelayChange > 15 || overallNegFloatChange > 30
  const isSeverelyDeteriorating = overallDelayChange > 60

  const reasoning: string[] = []

  // TIA AND CONTRACT AMENDMENT — most severe
  // Trigger: serious delay AND deteriorating trend
  if (latest.delayDays > 30 && isSeverelyDeteriorating && changes.length >= 2) {
    reasoning.push(`Project is ${latest.delayDays} days behind contract completion`)
    reasoning.push(`Delay has grown by ${overallDelayChange} days over ${changes.length} updates`)
    if (flatlinedUpdates > 0) reasoning.push(`Progress flatlined in ${flatlinedUpdates} update(s) — recovery is not happening`)
    if (latest.healthScore < 40) reasoning.push(`Health score at ${latest.healthScore}/100 indicates recovery condition`)

    return {
      type: 'TIA_AND_CONTRACT_AMENDMENT',
      title: 'TIA and Contract Amendment Required',
      summary: 'This project has lost its time and recovery is not achievable within the current contract. A formal Time Impact Analysis is needed to document the delay events, followed by a contract amendment for time extension.',
      actions: [
        'Prepare formal Time Impact Analysis (TIA) documenting all delay events',
        'Compile supporting evidence: RFIs, change orders, owner-caused delays',
        'Calculate compensable vs non-compensable time',
        'Submit time extension request with TIA as supporting documentation',
        'Negotiate contract amendment for revised completion date',
        'Update schedule baseline once amendment is executed',
      ],
      reasoning,
    }
  }

  // REBASELINE RECOMMENDED
  // Trigger: serious delay AND deteriorating AND no scope additions
  if (latest.delayDays > 30 && isDeteriorating && totalActivitiesAdded < 20) {
    reasoning.push(`Schedule is ${latest.delayDays} days behind plan`)
    reasoning.push(`${latest.negativeFloat} activities currently on negative float`)
    reasoning.push(`Delay has grown by ${overallDelayChange} days across ${changes.length} updates without recovery`)
    if (totalActivitiesAdded < 5) reasoning.push(`No major scope additions detected (${totalActivitiesAdded} activities added)`)
    reasoning.push('Schedule no longer represents a realistic approach to completion')

    return {
      type: 'REBASELINE_RECOMMENDED',
      title: 'Re-baseline Recommended',
      summary: 'The schedule has accumulated significant negative float that recovery cannot resolve. The current baseline no longer represents the actual approach to completing the work. A re-baseline will establish a realistic plan.',
      actions: [
        'Schedule a workshop with scheduler, super, and key trades',
        'Reset activity durations to reflect actual current production',
        'Re-sequence remaining work with current resources and constraints',
        'Establish new baseline with realistic completion date',
        'Document re-baseline rationale for record',
        'Communicate new schedule to owner and all stakeholders',
      ],
      reasoning,
    }
  }

  // SCHEDULE UPDATE REQUIRED
  // Trigger: New activities added (scope creep or change orders)
  if (totalActivitiesAdded > 10) {
    reasoning.push(`${totalActivitiesAdded} new activities added across ${changes.length} update(s)`)
    reasoning.push('Scope appears to be growing — possible change orders or additional work')
    reasoning.push(`Current delay: ${latest.delayDays} days behind`)

    return {
      type: 'SCHEDULE_UPDATE_REQUIRED',
      title: 'Schedule Update Required',
      summary: 'New activities and/or change orders have been added to the schedule. Update schedule logic to ensure proper fragnet integration, verify CPM calculations, and re-evaluate completion date impact.',
      actions: [
        'Review all activities added since the last baseline',
        'Verify new activities have proper predecessor/successor logic',
        'Add fragnets for any change orders not yet integrated',
        'Run schedule analysis (F9 in P6) to recalculate float',
        'Update narrative to explain the changes',
        'Re-evaluate critical path with the new logic',
      ],
      reasoning,
    }
  }

  // HEALTHY (default)
  reasoning.push(`Schedule remains stable across ${changes.length + 1} versions`)
  if (isImproving) {
    reasoning.push(`Trend is improving — delay reduced by ${Math.abs(overallDelayChange)} days`)
  } else if (isStable) {
    reasoning.push('Schedule indicators are stable across versions')
  }
  if (overallNegFloatChange < 0) {
    reasoning.push(`Negative float reduced by ${Math.abs(overallNegFloatChange)} activities`)
  }
  reasoning.push(`Current health score: ${latest.healthScore}/100`)

  return {
    type: 'HEALTHY',
    title: 'Schedule Performing Within Tolerance',
    summary: 'The schedule is showing stable or improving trends. Continue current management approach with normal monthly monitoring.',
    actions: [
      'Continue weekly schedule reviews with field team',
      'Verify monthly updates reflect actual progress',
      'Monitor long lead items for any procurement risk',
      'Maintain documentation of any delay events for record',
    ],
    reasoning,
  }
}

// Main entry point
export function analyzeProjectTrend(project: Project): TrendAnalysisResult | null {
  if (!project || !project.versions || project.versions.length < 2) return null

  // Sort versions oldest to newest
  const sortedVersions = [...project.versions].sort((a, b) =>
    new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
  )

  const total = sortedVersions.length
  const dataPoints = sortedVersions.map((v, i) => toDataPoint(v, total - 1 - i, total))

  // Compute changes between consecutive versions
  const changes: VersionChange[] = []
  for (let i = 1; i < dataPoints.length; i++) {
    changes.push(computeChange(dataPoints[i - 1], dataPoints[i]))
  }

  const earliest = dataPoints[0]
  const latest = dataPoints[dataPoints.length - 1]
  const timeSpan = daysBetween(earliest.uploadedAt, latest.uploadedAt)

  // Determine trend direction
  const delayChange = latest.delayDays - earliest.delayDays
  let trendDirection: 'IMPROVING' | 'STABLE' | 'DETERIORATING' | 'SEVERELY_DETERIORATING' = 'STABLE'
  if (delayChange > 60) trendDirection = 'SEVERELY_DETERIORATING'
  else if (delayChange > 15) trendDirection = 'DETERIORATING'
  else if (delayChange < -10) trendDirection = 'IMPROVING'

  const monthlyDelayGrowth = timeSpan > 0 ? Math.round((delayChange / timeSpan) * 30) : 0

  const recommendation = generateRecommendation(dataPoints, changes)

  return {
    projectName: project.name,
    projectId: project.projectId,
    versionsAnalyzed: total,
    firstUpload: earliest.uploadedAt,
    latestUpload: latest.uploadedAt,
    timeSpanDays: timeSpan,
    dataPoints,
    changes,
    recommendation,
    summary: {
      trendDirection,
      overallNegFloatChange: latest.negativeFloat - earliest.negativeFloat,
      overallDelayChange: delayChange,
      overallHealthChange: latest.healthScore - earliest.healthScore,
      overallCompletionChange: latest.completePct - earliest.completePct,
      averageMonthlyDelayGrowth: monthlyDelayGrowth,
    },
  }
}
