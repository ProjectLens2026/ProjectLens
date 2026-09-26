'use client'

// =============================================================================
// src/app/dashboard/approval/page.tsx   (Approval Readiness workspace)
// =============================================================================
// "Check Before You Submit. Verify Before You Approve."
//
// Consumes the existing Control Lens analysis via evaluateApprovalReadiness()
// (which itself calls runConstructionReview). No new parsing/classification.
//
// Flow: Select Mode → Run Check → Score / Gates / Domains → What Requires
// Attention (consolidated triggers, ID+name) → View Evidence / Trace Back.
//
// Score is provisional pending the scoring calibration pass. Nothing here
// hardcodes scoring numbers — they come from the evaluator/framework.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { discoverUSProject, type USProjectDiscoveryResult, type DiscoveryEvidence } from '@/lib/construction/projectDiscovery'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getActiveProject, getActiveVersion, subscribeToProjects, updateVersionApprovalResult } from '@/lib/projectStore'
import {
  buildScheduleReviewSnapshot,
  reviewFindingSourceKey,
  type ScheduleTechnicalSignal,
  type ScheduleReviewSnapshot,
} from '@/lib/scheduleReviewSnapshot'
import { printReport } from '@/lib/printReport'
import { reviewOpenEndedLogic } from '@/lib/approval-readiness/qualityRules'
import type { ApprovalReadinessResult, ApprovalMode, ApprovalFinding } from '@/lib/approval-readiness/types'
import {
  addContractorResponseInSupabase,
  createReviewCommentInSupabase,
  loadReviewWorkspaceFromSupabase,
  updateReviewCommentStatusInSupabase,
  upsertScheduleNarrativeInSupabase,
  type ReviewWorkspaceCloudData,
} from '@/lib/supabase/reviews'
import {
  createScheduleNarrative,
  summarizeReviewComments,
  type NewReviewCommentInput,
  type ReviewComment,
  type ReviewItemStatus,
  type ScheduleNarrative,
} from '@/lib/reviewWorkspace'

const COLORS = {
  ink: '#13202e', blue: '#2563eb', red: '#dc2626', amber: '#f59e0b', green: '#16a34a', slate: '#1f2937',
}

type ReviewPurpose =
  | 'BASELINE_APPROVAL'
  | 'PERIODIC_UPDATE'
  | 'PM_HEALTH'
  | 'VERSION_COMPARISON'
  | 'RECOVERY_REVIEW'
  | 'TIME_IMPACT_ANALYSIS'

const REVIEW_PURPOSES: Array<{ value: ReviewPurpose; label: string }> = [
  { value: 'BASELINE_APPROVAL', label: 'Baseline Approval' },
  { value: 'PERIODIC_UPDATE', label: 'Periodic Update Review' },
  { value: 'PM_HEALTH', label: 'PM Schedule Health Review' },
  { value: 'VERSION_COMPARISON', label: 'Version Comparison' },
  { value: 'RECOVERY_REVIEW', label: 'Recovery Schedule Review' },
  { value: 'TIME_IMPACT_ANALYSIS', label: 'Time Impact Analysis' },
]

function defaultReviewPurpose(version: any): ReviewPurpose {
  if (version?.scheduleType === 'baseline' || version?.scheduleType === 'rebaseline') return 'BASELINE_APPROVAL'
  return 'PERIODIC_UPDATE'
}

function contextualReadinessLabel(result: ApprovalReadinessResult, mode: ApprovalMode): string {
  if (mode === 'REVIEWER') return result.readinessLabel || result.recommendation
  if (result.readinessStatus === 'NOT_READY') return 'NOT READY TO SUBMIT'
  if (result.readinessStatus === 'REVIEW_REQUIRED') return 'CORRECTION REQUIRED BEFORE SUBMISSION'
  if (result.readinessStatus === 'READY_WITH_COMMENTS') return 'READY TO SUBMIT WITH COMMENTS'
  if (result.readinessStatus === 'READY') return 'READY TO SUBMIT'
  return result.readinessLabel || result.recommendation
}

function gradeColor(grade: string): string {
  if (grade === 'A' || grade === 'A-') return COLORS.green
  if (grade === 'B+' || grade === 'B') return COLORS.amber
  return COLORS.red
}

function readinessColor(status?: string): string {
  if (status === 'READY') return COLORS.green
  if (status === 'READY_WITH_COMMENTS') return COLORS.amber
  if (status === 'REVIEW_REQUIRED') return COLORS.amber
  if (status === 'NOT_READY') return COLORS.red
  return COLORS.slate
}

function shortDate(value?: string): string {
  if (!value) return '—'
  const d = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return value.slice(0, 10)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

interface TechnicalEvidenceRow {
  id: string
  code: string
  name: string
  detail: string
}

function technicalEvidenceRows(signal: ScheduleTechnicalSignal, analysis: any): TechnicalEvidenceRow[] {
  if (!analysis) return []
  if (signal.id === 'CONTRACT_DELAY') return [{
    id: 'contract-delay',
    code: 'FORECAST',
    name: `Current forecast: ${shortDate(analysis.projectedEnd || analysis.forecastCompletion)}`,
    detail: `Contract completion: ${shortDate(analysis.contractEnd)} · ${signal.count} calendar days beyond the current contract position`,
  }]
  if (signal.id === 'NEGATIVE_FLOAT') {
    return Object.values(analysis.traceTasks || {})
      .filter((task: any) => Number(task.total_float_hr_cnt || 0) < 0)
      .map((task: any) => ({
        id: String(task.task_id || task.task_code),
        code: String(task.task_code || '—'),
        name: String(task.task_name || 'Unnamed activity'),
        detail: `${Math.round(Number(task.total_float_hr_cnt || 0) / 8)} days total float`,
      }))
  }
  if (signal.id === 'OUT_OF_SEQUENCE') {
    return (analysis.outOfSequence || []).map((item: any, index: number) => ({
      id: String(item.task?.task_id || item.task?.task_code || index),
      code: String(item.task?.task_code || '—'),
      name: String(item.task?.task_name || 'Unnamed activity'),
      detail: `${item.violations?.length || 1} relationship conflict${(item.violations?.length || 1) === 1 ? '' : 's'}${item.category ? ` · ${item.category}` : ''}`,
    }))
  }
  if (signal.id === 'OPEN_ENDS') {
    return reviewOpenEndedLogic(analysis).unauthorized.map((task: any, index: number) => ({
      id: String(task.task_id || task.task_code || index),
      code: String(task.task_code || '—'),
      name: String(task.task_name || 'Unnamed activity'),
      detail: 'Missing predecessor, successor, or both — verify legitimate project endpoints',
    }))
  }
  if (signal.id === 'LONG_LEAD_AT_RISK') {
    return (analysis.longLeadItems || [])
      .filter((item: any) => item.status_code !== 'TK_Complete' && Number(item.phys_complete_pct || 0) < 100 && Number(item.floatDays) <= 14)
      .map((item: any, index: number) => ({
        id: String(item.task_id || item.task_code || index),
        code: String(item.task_code || '—'),
        name: String(item.task_name || 'Unnamed activity'),
        detail: `${item.durationDays ?? '—'} days duration · ${item.floatDays ?? '—'} days float · ${item.phys_complete_pct || 0}% complete`,
      }))
  }
  return []
}

function cpmTabForSignal(signal: ScheduleTechnicalSignal): string {
  if (signal.id === 'OUT_OF_SEQUENCE') return 'logic'
  if (signal.id === 'OPEN_ENDS') return 'noties'
  if (signal.id === 'LONG_LEAD_AT_RISK') return 'longlead'
  return 'schedule-filter'
}

function approvalKind(f: ApprovalFinding): 'FINDING' | 'RECOMMENDATION' {
  return f.kind === 'RECOMMENDATION' ? 'RECOMMENDATION' : 'FINDING'
}

// Saved results can still contain the old category-only titles.
function findingTitle(f: ApprovalFinding): string {
  if (!/related conditions?$/.test(f.title)) return f.title
  return f.whatFound || 'Finding description unavailable — run the check again'
}

function neutralReportText(value?: string | null): string {
  return String(value || '').replace(/Control\s*Lens/gi, 'the automated schedule review')
}

type ActionDisposition = 'CORRECTION' | 'CLARIFICATION'

interface ActionGroup {
  id: string
  disposition: ActionDisposition
  title: string
  why: string
  action: string
  acceptance: string
  findings: ApprovalFinding[]
  affectedCount: number
  totalDeduction: number
}

function actionFamily(f: ApprovalFinding): string {
  const text = `${findingTitle(f)} ${f.whatFound}`.toLowerCase()
  if (text.includes('supporting predecessors finish after')) return 'COMPLETION_SUPPORT'
  if (text.includes('recorded progress does not follow')) return 'PROGRESS_LOGIC'
  if (text.includes('may not represent the actual construction driver')) return 'RELATIONSHIP_DRIVER'
  if (text.includes('may not reflect the field phasing')) return 'FIELD_PHASING'
  if (text.includes('construction sequence needs verification')) return 'CONSTRUCTION_SEQUENCE'
  if (text.includes('readiness path is incomplete')) return 'READINESS_PATH'
  if (text.includes('open-ended network logic')) return 'NETWORK_OPEN_ENDS'
  if (text.includes('status, actual dates, and remaining duration')) return 'STATUS_DATE_INTEGRITY'
  if (text.includes('out-of-sequence progress requires')) return 'PROGRESS_LOGIC'
  if (text.includes('prohibited leads') || text.includes('start-to-finish relationships')) return 'PROHIBITED_RELATIONSHIPS'
  if (text.includes('long positive lags')) return 'LONG_LAGS'
  if (text.includes('duration benchmark')) return 'ACTIVITY_DURATIONS'
  if (text.includes('mandatory constraints') || text.includes('constraints require contractual basis')) return 'CONSTRAINTS'
  if (text.includes('p6 longest-path calculation') || text.includes('critical activity definition is not longest path')) return 'LONGEST_PATH_SETTING'
  if (text.includes('duration type differs') || text.includes('percent complete type') || text.includes('project level calendars') || text.includes('assigned calendar') || text.includes('retained logic') || text.includes('8-hour day')) return 'P6_SETTINGS'
  if (text.includes('procurement items require') || text.includes('long-lead procurement requires')) return 'PROCUREMENT_READINESS'
  if (text.includes('zero original duration')) return 'ACTIVITY_DURATIONS'
  if (text.includes('lacks wbs assignment') || text.includes('activity ids exceed') || text.includes('activity-code')) return 'WBS_ASSIGNMENT'
  return `OTHER:${f.primaryDomain}`
}

const ACTION_COPY: Record<string, Pick<ActionGroup, 'title' | 'why' | 'action' | 'acceptance'>> = {
  COMPLETION_SUPPORT: {
    title: 'Resolve completion/readiness activities with late supporting predecessors',
    why: 'The submitted logic allows supporting work to finish after a stated completion or readiness point, which can make the target unreliable.',
    action: 'Confirm each target activity’s intended definition, then correct or explain its dates and governing dependencies.',
    acceptance: 'Each target is supported by credible predecessors, or the schedule narrative documents an accepted exception.',
  },
  PROGRESS_LOGIC: {
    title: 'Reconcile recorded progress with the current XER logic',
    why: 'Actual progress and the submitted relationship network disagree, so the update may not represent how the work occurred.',
    action: 'Validate actual dates against approved records. Correct inappropriate relationships or explain legitimate out-of-sequence execution without changing truthful actual dates.',
    acceptance: 'Actual dates remain truthful and each flagged logic conflict is corrected or supported by a clear explanation.',
  },
  RELATIONSHIP_DRIVER: {
    title: 'Validate relationships that may not represent the actual construction driver',
    why: 'A relationship without a technical, access, inspection or contractual basis can distort the controlling path.',
    action: 'Verify the construction basis for each flagged dependency and revise only the unsupported links.',
    acceptance: 'Every retained relationship has a documented scheduling basis; unsupported links are corrected.',
  },
  FIELD_PHASING: {
    title: 'Confirm field phasing and location logic',
    why: 'The current links may combine workfronts or areas that were executed independently.',
    action: 'Confirm the intended area sequence and model separate workfront logic where the field plan supports it.',
    acceptance: 'The XER reflects the accepted location/phasing plan or the variance is explained.',
  },
  CONSTRUCTION_SEQUENCE: {
    title: 'Verify construction-sequence exceptions',
    why: 'The submitted sequence conflicts with an expected construction prerequisite and requires professional confirmation.',
    action: 'Check plans, permits, inspections and field records; correct the logic or document the accepted sequence.',
    acceptance: 'The schedule reflects the accepted construction sequence and preserves truthful actual dates.',
  },
  READINESS_PATH: {
    title: 'Complete or clarify system-readiness paths',
    why: 'The schedule may not show a credible chain from installation through startup, testing and turnover.',
    action: 'Add or map the missing readiness steps and dependencies, or identify the equivalent activities already in the schedule.',
    acceptance: 'Each applicable system has a traceable readiness path to the governing completion target.',
  },
  NETWORK_OPEN_ENDS: {
    title: 'Close unauthorized network open ends',
    why: 'Activities outside the recognized project-start and project-finish endpoints are not fully tied into the CPM network, so calculated dates and float may be unreliable.',
    action: 'Connect every listed activity to valid predecessor and successor logic or document the approved endpoint exception.',
    acceptance: 'Only the approved project start lacks a predecessor and only the approved project finish lacks a successor.',
  },
  STATUS_DATE_INTEGRITY: {
    title: 'Reconcile activity status, actual dates, and remaining work',
    why: 'Contradictory status records corrupt progress, remaining duration, logic calculations, and the credibility of the update data date.',
    action: 'Validate each item against daily reports and approved update records; preserve truthful actual dates and correct the status or remaining duration.',
    acceptance: 'No future actuals, impossible date sequences, status/date contradictions, or remaining duration on completed work remain.',
  },
  PROHIBITED_RELATIONSHIPS: {
    title: 'Remove prohibited leads and Start-to-Finish relationships',
    why: 'These relationship methods obscure the executable sequence and can distort float.',
    action: 'Replace negative lags and Start-to-Finish relationships with explicit activities and conventional CPM logic.',
    acceptance: 'No negative lags or Start-to-Finish relationships remain unless the governing requirement expressly permits an approved exception.',
  },
  LONG_LAGS: {
    title: 'Replace or justify long positive lags',
    why: 'Long lags can hide curing, delivery, review, access, or waiting work that should be visible and statusable.',
    action: 'Convert hidden work into named activities and explain any retained lag in the schedule narrative.',
    acceptance: 'Every retained lag has a documented basis and does not replace measurable work or proper logic.',
  },
  ACTIVITY_DURATIONS: {
    title: 'Subdivide excessive non-procurement durations',
    why: 'Activities longer than the reviewable update period conceal progress, handoffs, and delay causes.',
    action: 'Break the listed work into measurable, logic-connected activities or provide the project-specific basis for the longer duration.',
    acceptance: 'Non-procurement activities meet the governing duration limit or carry an accepted exception.',
  },
  CONSTRAINTS: {
    title: 'Remove or substantiate schedule constraints',
    why: 'Constraints can override calculated logic, manufacture float, or force dates that the network does not support.',
    action: 'Remove mandatory constraints and verify every other constraint against an authorized contractual milestone or approved exception.',
    acceptance: 'Only authorized milestone constraints remain and the longest path is driven by executable network logic.',
  },
  P6_SETTINGS: {
    title: 'Correct mandatory P6 calculation settings',
    why: 'Duration type, percent-complete type, and calendar scope directly affect how P6 calculates progress, dates, remaining duration, and float.',
    action: 'Apply the governing P6 settings consistently and rerun the schedule before resubmission.',
    acceptance: 'Retained Logic is used, activities use the required duration and percent-complete methods, and submitted calendars are assigned and controlled at project level.',
  },
  LONGEST_PATH_SETTING: {
    title: 'Calculate and validate the P6 longest path',
    why: 'The submitted XER does not evidence a calculated driving path to the completion target.',
    action: 'Enable Define Critical Activities as Longest Path, reschedule, and trace the resulting chain to the governing contract completion milestone.',
    acceptance: 'The exported XER carries a continuous P6 driving path that reaches the selected completion target.',
  },
  PROCUREMENT_READINESS: {
    title: 'Resolve long-lead procurement exposure',
    why: 'Low-float procurement can control installation and commissioning before the risk becomes visible in the field.',
    action: 'Confirm approval, release, fabrication, delivery, required-on-site, installation successor, supplier commitment, and mitigation dates.',
    acceptance: 'Each listed item has a current, logic-connected procurement path and an executable recovery or confirmation plan.',
  },
  WBS_ASSIGNMENT: {
    title: 'Correct WBS, activity IDs, and project coding',
    why: 'Incomplete schedule structure prevents reliable filtering, reconciliation, reporting, and transfer into the required federal control systems.',
    action: 'Complete WBS assignment, correct overlength IDs, and establish the required project-level activity-code dictionary and assignments.',
    acceptance: 'Activities follow the approved ID convention, WBS, and applicable project-level SDEF coding structure.',
  },
}

function buildActionGroups(result: ApprovalReadinessResult): { corrections: ActionGroup[]; clarifications: ActionGroup[] } {
  const map = new Map<string, ApprovalFinding[]>()
  for (const f of result.findings.filter(x => approvalKind(x) === 'FINDING')) {
    const disposition: ActionDisposition = f.criticalGate || f.ruleStrength === 'REQUIRED' ? 'CORRECTION' : 'CLARIFICATION'
    const family = actionFamily(f)
    const key = `${disposition}:${family}`
    map.set(key, [...(map.get(key) || []), f])
  }

  const groups = Array.from(map.entries()).map(([key, findings], index): ActionGroup => {
    const [disposition, family] = key.split(':', 2) as [ActionDisposition, string]
    const fallback = {
      title: `Resolve remaining ${findings[0].primaryDomain} schedule-control observations`,
      why: findings[0].whyItMatters,
      action: disposition === 'CORRECTION'
        ? 'Correct the identified schedule condition and rerun the review.'
        : 'Verify the evidence and provide clarification or correct the schedule where appropriate.',
      acceptance: 'Each underlying observation is corrected or supported by a documented explanation.',
    }
    const copy = ACTION_COPY[family] || fallback
    const affected = new Set(findings.flatMap(f => f.affectedActivities.map(a => a.id)))
    return {
      id: `ACT-${String(index + 1).padStart(2, '0')}`,
      disposition,
      ...copy,
      findings,
      affectedCount: affected.size,
      totalDeduction: findings.reduce((sum, f) => sum + f.scoreDeduction, 0),
    }
  }).sort((a, b) => b.totalDeduction - a.totalDeduction || b.findings.length - a.findings.length)

  return {
    corrections: groups.filter(g => g.disposition === 'CORRECTION'),
    clarifications: groups.filter(g => g.disposition === 'CLARIFICATION'),
  }
}

function legacyFindingSignature(findings: ApprovalFinding[]): string {
  return findings.map(finding => finding.id).sort().join('|')
}

function canonicalFindingSignature(findings: ApprovalFinding[]): string {
  return findings.map(reviewFindingSourceKey).sort().join('|')
}

function existingFindingSignatures(comments: ReviewComment[]): Set<string> {
  return new Set(
    comments
      .map(comment => [...(comment.sourceFindingIds || [])].sort().join('|'))
      .filter(Boolean),
  )
}

function discoveryLabel(value?: string): string {
  if (!value || /^(general|unknown|unclassified)$/i.test(value)) return 'Not identified'
  return value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
}

function DiscoveryEvidenceList({ evidence }: { evidence: DiscoveryEvidence[] }) {
  const activityEvidence = evidence.filter(item => item.source === 'ACTIVITY' && item.taskCode && item.taskName)
  return <ul className="mt-2 space-y-2 text-[11px] text-slate-600">
    {activityEvidence.map((e, i) => <li key={`${e.taskId || e.taskCode}-${i}`} className="border-l-2 border-slate-200 pl-2 break-words">
      <div><span className="font-mono font-semibold">{e.taskCode}</span> — {e.taskName}</div>
    </li>)}
    {!activityEvidence.length && <li>No activity-level evidence listed.</li>}
  </ul>
}

function DiscoveryItem({ expanded, title, children }: { expanded: boolean; title: React.ReactNode; children: React.ReactNode }) {
  // Reports use ordinary content so printing never depends on disclosure state.
  if (expanded) return <div className="py-2"><div className="text-xs font-semibold">{title}</div>{children}</div>
  return <details className="py-1"><summary className="cursor-pointer text-xs font-semibold">{title}</summary>{children}</details>
}

function ProjectDiscoveryPanel({ discovery, expanded = false }: { discovery: USProjectDiscoveryResult | null; expanded?: boolean }) {
  if (!discovery) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 text-sm">Project discovery unavailable. Re-upload the schedule to provide activity and WBS evidence.</div>
  const signals = [discovery.archetype, discovery.ownerOverlay, discovery.projectCondition]
  const sections = [
    { title: 'Buildings, levels and areas', items: discovery.locations },
    { title: 'Systems', items: discovery.systems },
    { title: 'Procurement packages', items: discovery.procurementPackages },
    { title: 'Commissioning states', items: discovery.commissioningStates },
    { title: 'Completion targets', items: discovery.completionTargets },
  ]
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
    <h2 className="font-bold text-slate-800">Project Discovery</h2>
    <p className="text-xs text-slate-600 mt-1 mb-3">Detected from this schedule version. {expanded ? 'Available supporting evidence is listed below; evidence lists may be sampled by the discovery engine.' : 'Expand an item to inspect its evidence.'} Discovery describes the submitted work; it does not prescribe a jurisdiction, establish compliance, or change the score.</p>
    <div className={expanded ? 'space-y-3' : 'grid md:grid-cols-3 gap-3'}>
      {signals.map((s, i) => <DiscoveryItem key={i} expanded={expanded} title={<>{['Project type', 'Owner overlay', 'Construction condition'][i]}: {s.label}</>}>
        <div className="text-xs mt-1">{s.status} · {s.confidence} confidence</div>
        <DiscoveryEvidenceList evidence={s.evidence} />
      </DiscoveryItem>)}
    </div>
    <p className="text-xs text-slate-500 my-3">{discovery.summary.taskCount} activities · {discovery.summary.wbsNodeCount} WBS nodes · {discovery.summary.classifiedActivityCount} activities classified</p>
    <div className={expanded ? 'space-y-3' : 'grid md:grid-cols-2 gap-3 items-start'}>
      {sections.map(section => <div key={section.title} className="border rounded-lg p-3">
        <h3 className="text-sm font-bold mb-2">{section.title}</h3>
        {!section.items.length && <p className="text-xs text-amber-700">Not identified in the available evidence; this does not prove absence.</p>}
        {section.items.map(s => <DiscoveryItem key={s.key} expanded={expanded} title={<>{discoveryLabel(s.label)} — {s.confidence} confidence</>}>
          <DiscoveryEvidenceList evidence={s.evidence} />
        </DiscoveryItem>)}
      </div>)}
      <div className="border rounded-lg p-3"><h3 className="text-sm font-bold mb-2">Project phases</h3>
        {discovery.phases.map(p => <DiscoveryItem key={p.phase} expanded={expanded} title={<>{p.label}: {p.activityCount} activities</>}><DiscoveryEvidenceList evidence={p.evidence} /></DiscoveryItem>)}
      </div>
    </div>
    <p className="text-xs text-slate-500 mt-2">{discovery.jurisdictionNote}</p>
    {discovery.unresolved.length > 0 && <div className="mt-3 text-xs text-amber-800"><b>Unresolved discovery questions</b><ul className="list-disc pl-4">{discovery.unresolved.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
  </section>
}

export default function ApprovalReadinessPage() {
  const router = useRouter()
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<ApprovalMode>('PRE_SUBMISSION')
  const [reviewPurpose, setReviewPurpose] = useState<ReviewPurpose>('PERIODIC_UPDATE')
  const [result, setResult] = useState<ApprovalReadinessResult | null>(null)
  const [reviewSnapshot, setReviewSnapshot] = useState<ScheduleReviewSnapshot | null>(null)
  const [running, setRunning] = useState(false)
  const [expandedSignalIds, setExpandedSignalIds] = useState<string[]>([])
  const [reportSignalIds, setReportSignalIds] = useState<string[]>([])
  const [reportKind, setReportKind] = useState<null | 'executive' | 'complete'>(null)
  const [activeTab, setActiveTab] = useState<'comments' | 'narrative' | 'changes' | 'evidence'>('comments')
  const [reviewData, setReviewData] = useState<ReviewWorkspaceCloudData>({ comments: [], narratives: {} })
  const [reviewDataLoading, setReviewDataLoading] = useState(false)
  const [reviewDataError, setReviewDataError] = useState<string | null>(null)
  const [reviewMutation, setReviewMutation] = useState(false)
  const [showAddComment, setShowAddComment] = useState(false)
  // Recompute for older saved versions too; no re-upload or score mutation.
  const discovery = useMemo(() => {
    if (!analysis?.traceTasks) return null
    try { return discoverUSProject(analysis) } catch (error) {
      console.error('[approval] discovery failed:', error)
      return null
    }
  }, [analysis])

  // Keep Approval Readiness bound to the CURRENT project + CURRENT version.
  // The sidebar can change either selection without unmounting this page, so a
  // one-time useEffect leaves the previous version's result on screen.
  // Rehydrate every time projectStore announces a selection/data change.
  useEffect(() => {
    function syncActiveSelection() {
      const p = getActiveProject()
      const v = getActiveVersion(p)

      setProject(p)
      setVersion(v)
      setAnalysis(v?.analysis || null)
      setReviewPurpose(defaultReviewPurpose(v))

      // Full CPM Analysis and Review Schedule must consume the same current
      // version evidence. Build the shared snapshot immediately so detected
      // concerns are visible without requiring a second, disconnected run.
      const selectedMode = (v?.approvalResult?.mode as ApprovalMode) || 'PRE_SUBMISSION'
      setMode(selectedMode)
      try {
        const snapshot = buildScheduleReviewSnapshot(v?.analysis || null, {
          versionId: v?.id,
          mode: selectedMode,
          projectType: 'ALL',
        })
        setReviewSnapshot(snapshot)
        setResult(snapshot?.approval || (v?.approvalResult as ApprovalReadinessResult) || null)
        setReportSignalIds(snapshot?.technicalSignals.map(signal => signal.id) || [])
      } catch (error) {
        console.error('[approval] shared review snapshot failed:', error)
        setReviewSnapshot(null)
        setResult((v?.approvalResult as ApprovalReadinessResult) || null)
      }

      // Close any old finding/report state that belonged to the prior version.
      setExpandedSignalIds([])
      setReportKind(null)
      setActiveTab('comments')
      setRunning(false)
      setReady(true)
    }

    syncActiveSelection()
    return subscribeToProjects(syncActiveSelection)
  }, [])

  const reloadReviewWorkspace = useCallback(async () => {
    if (!project?.id) {
      setReviewData({ comments: [], narratives: {} })
      return
    }
    setReviewDataLoading(true)
    setReviewDataError(null)
    const loaded = await loadReviewWorkspaceFromSupabase(project.id)
    if (loaded.ok && loaded.data) setReviewData(loaded.data)
    else setReviewDataError(loaded.error || 'Could not load the review workspace.')
    setReviewDataLoading(false)
  }, [project?.id])

  useEffect(() => {
    reloadReviewWorkspace()
  }, [reloadReviewWorkspace])

  function runCheck() {
    if (!analysis) return
    if (reviewPurpose === 'VERSION_COMPARISON') {
      router.push('/dashboard/changes')
      return
    }
    if (reviewPurpose === 'TIME_IMPACT_ANALYSIS') {
      router.push('/dashboard/tia')
      return
    }
    setRunning(true)
    try {
      const snapshot = buildScheduleReviewSnapshot(analysis, {
        versionId: version?.id,
        mode,
        projectType: 'ALL',
      })
      const res = snapshot?.approval || null
      setReviewSnapshot(snapshot)
      setResult(res)
      setReportSignalIds(snapshot?.technicalSignals.map(signal => signal.id) || [])
      // persist so it survives leaving the page
      if (res && project?.id && version?.id) {
        try { updateVersionApprovalResult(project.id, version.id, res) } catch {}
      }
    } catch (e) {
      console.error('[approval] evaluation failed:', e)
      setResult(null)
    } finally {
      setRunning(false)
    }
  }

  async function addManualReviewComment(input: NewReviewCommentInput) {
    if (!project?.id) return
    setReviewMutation(true)
    setReviewDataError(null)
    const saved = await createReviewCommentInSupabase(project.id, input)
    if (!saved.ok) setReviewDataError(saved.error || 'Could not add the review item.')
    else {
      setShowAddComment(false)
      await reloadReviewWorkspace()
    }
    setReviewMutation(false)
  }

  async function importControlLensFindings() {
    if (!project?.id || !version?.id || !result) return
    const groups = buildActionGroups(result)
    const candidates = [...groups.corrections, ...groups.clarifications]
    const existingSignatures = existingFindingSignatures(reviewData.comments)
    const pending = candidates.filter(group => {
      const canonical = canonicalFindingSignature(group.findings)
      const legacy = legacyFindingSignature(group.findings)
      return canonical && !existingSignatures.has(canonical) && !existingSignatures.has(legacy)
    })
    if (!pending.length) return

    setReviewMutation(true)
    setReviewDataError(null)
    for (const group of pending) {
      const activities = new Map<string, { activityId: string; activityCode?: string; activityName?: string }>()
      for (const finding of group.findings) {
        for (const activity of finding.affectedActivities || []) {
          activities.set(activity.id, {
            activityId: activity.id,
            activityCode: activity.code,
            activityName: activity.name,
          })
        }
      }
      const saved = await createReviewCommentInSupabase(project.id, {
        source: 'CONVERTED_FROM_CL_FINDING',
        sourceFindingIds: group.findings.map(reviewFindingSourceKey),
        title: group.title,
        concern: group.why,
        requiredCorrection: `${group.action} Acceptance: ${group.acceptance}`,
        classification: group.disposition === 'CORRECTION' ? 'REQUIRED' : 'ADVISORY',
        approvalImpact: group.disposition === 'CORRECTION' ? 'BLOCKS_APPROVAL' : 'NON_BLOCKING',
        responsibleParty: 'Contractor / Scheduler',
        firstVersionId: version.id,
        affectedActivities: Array.from(activities.values()),
        issueImmediately: true,
      })
      if (!saved.ok) {
        setReviewDataError(saved.error || `Could not create the review comment for ${group.title}.`)
        break
      }
    }
    await reloadReviewWorkspace()
    setReviewMutation(false)
  }

  async function changeCommentStatus(commentId: string, status: ReviewItemStatus) {
    setReviewMutation(true)
    setReviewDataError(null)
    const saved = await updateReviewCommentStatusInSupabase(commentId, status)
    if (!saved.ok) setReviewDataError(saved.error || 'Could not update the review item.')
    await reloadReviewWorkspace()
    setReviewMutation(false)
  }

  async function submitContractorResponse(commentId: string, response: string, correctionMade: string) {
    if (!version?.id) return
    setReviewMutation(true)
    setReviewDataError(null)
    const saved = await addContractorResponseInSupabase({
      commentId,
      versionId: version.id,
      response,
      correctionMade,
    })
    if (!saved.ok) setReviewDataError(saved.error || 'Could not save the contractor response.')
    await reloadReviewWorkspace()
    setReviewMutation(false)
  }

  const narrativeForCurrentVersion = useMemo(() => {
    if (!version?.id) return null
    const saved = reviewData.narratives[version.id]

    const versions = [...(project?.versions || [])]
      .filter((item: any) => !item.deletedAt)
      .sort((a: any, b: any) => new Date(a.dataDate || a.uploadedAt).getTime() - new Date(b.dataDate || b.uploadedAt).getTime())
    const currentIndex = versions.findIndex((item: any) => item.id === version.id)
    const priorVersion = currentIndex > 0 ? versions[currentIndex - 1] : null
    const priorNarrative = priorVersion ? reviewData.narratives[priorVersion.id] : undefined
    const narrative = saved
      ? { ...saved, reviewPurpose, sections: saved.sections.map(section => ({ ...section, automatedFacts: [...section.automatedFacts] })) }
      : createScheduleNarrative(version.id, reviewPurpose, priorNarrative)
    const currentForecast = analysis?.projectedEnd || analysis?.forecastCompletion || analysis?.contractEnd
    const priorForecast = priorVersion?.analysis?.projectedEnd || priorVersion?.analysis?.forecastCompletion || priorVersion?.analysis?.contractEnd
    const summary = summarizeReviewComments(reviewData.comments)
    const detectedGroups = result ? (() => {
      const grouped = buildActionGroups(result)
      const existingSignatures = existingFindingSignatures(reviewData.comments)
      return [...grouped.corrections, ...grouped.clarifications].filter(group => {
        const canonical = canonicalFindingSignature(group.findings)
        const legacy = legacyFindingSignature(group.findings)
        return canonical && !existingSignatures.has(canonical) && !existingSignatures.has(legacy)
      })
    })() : []
    const openComments = reviewData.comments.filter(comment => !CLOSED_REVIEW_STATUSES.includes(comment.status) && comment.status !== 'DRAFT')

    narrative.sections = narrative.sections.map(section => {
      if (section.key === 'EXECUTIVE_SUMMARY') return {
        ...section,
        automatedFacts: [
          { id: 'data-date', label: 'Data date', currentValue: shortDate(version.dataDate || analysis?.dataDate), source: 'XER' as const },
          { id: 'forecast', label: 'Current forecast', currentValue: shortDate(currentForecast), priorValue: shortDate(priorForecast), source: 'XER' as const },
          { id: 'open-comments', label: 'Open review comments', currentValue: String(summary.open), source: 'COMMENT_REGISTER' as const },
          { id: 'detected-comments', label: 'Detected proposed comments', currentValue: String(detectedGroups.length), source: 'COMMENT_REGISTER' as const },
        ],
      }
      if (section.key === 'CONTRACT_MILESTONES') return {
        ...section,
        automatedFacts: [
          { id: 'contract-end', label: 'Authorized completion', currentValue: shortDate(project?.contractDates?.originalContractCompletion), source: 'PROJECT_BASIS' as const },
          { id: 'forecast-end', label: 'Current XER forecast', currentValue: shortDate(currentForecast), priorValue: shortDate(priorForecast), source: 'XER' as const },
        ],
      }
      if (section.key === 'CHANGES_FROM_PRIOR_VERSION') return {
        ...section,
        automatedFacts: [
          { id: 'activity-count', label: 'Activities', currentValue: String(analysis?.totalActivities ?? analysis?.traceTasks?.length ?? '—'), priorValue: priorVersion ? String(priorVersion.analysis?.totalActivities ?? priorVersion.analysis?.traceTasks?.length ?? '—') : undefined, source: 'XER' as const },
          { id: 'data-date-change', label: 'Data date', currentValue: shortDate(version.dataDate || analysis?.dataDate), priorValue: shortDate(priorVersion?.dataDate || priorVersion?.analysis?.dataDate), source: 'XER' as const },
        ],
      }
      if (section.key === 'OWNER_COMMENT_RESPONSES') return {
        ...section,
        automatedFacts: [
          { id: 'issued-comments', label: 'Comments issued', currentValue: String(summary.issued), source: 'COMMENT_REGISTER' as const },
          { id: 'blocking-comments', label: 'Approval-blocking comments open', currentValue: String(summary.blocking), source: 'COMMENT_REGISTER' as const },
          { id: 'closed-comments', label: 'Comments closed', currentValue: String(summary.closed), source: 'COMMENT_REGISTER' as const },
          ...openComments.map(comment => ({
            id: `comment-${comment.id}`,
            label: `${comment.commentNumber} — ${comment.title}`,
            currentValue: `${reviewStatusLabel(comment.status)}. ${comment.requiredCorrection || comment.concern}`,
            source: 'COMMENT_REGISTER' as const,
          })),
          ...detectedGroups.map((group, index) => ({
            id: `detected-${group.id}`,
            label: `Proposed ${String(index + 1).padStart(2, '0')} — ${group.title}`,
            currentValue: `${group.disposition === 'CORRECTION' ? 'Required correction' : 'Clarification'}: ${group.action}`,
            source: 'COMMENT_REGISTER' as const,
          })),
        ],
      }
      return section
    })

    const technicalSignal = (id: string) => reviewSnapshot?.technicalSignals.find(signal => signal.id === id)?.count || 0
    const taskValues = Object.values(analysis?.traceTasks || {}) as any[]
    const submittalCount = taskValues.filter(task => /submittal|shop drawing|rfi|review|approval/i.test(String(task?.task_name || ''))).length
    const commissioningCount = taskValues.filter(task => /startup|start-up|test|commission|turnover|training|acceptance|tab\b/i.test(String(task?.task_name || ''))).length
    const complete = Number(analysis?.complete || 0)
    const inProgress = Number(analysis?.inProgress || 0)
    const notStarted = Number(analysis?.notStarted || 0)
    const correctionCount = result ? buildActionGroups(result).corrections.length : 0
    const clarificationCount = result ? buildActionGroups(result).clarifications.length : 0

    const generatedDrafts: Record<string, string> = {
      EXECUTIVE_SUMMARY: `The selected schedule dated ${shortDate(version.dataDate || analysis?.dataDate)} was reviewed. The current automated disposition is ${result?.readinessLabel || result?.recommendation || 'review pending'} with ${summary.open} open formal review comment${summary.open === 1 ? '' : 's'}. The current forecast is ${shortDate(currentForecast)}. This draft is generated from the submitted schedule, project basis and comment register and should be confirmed by the scheduler or authorized reviewer before issue.`,
      CONTRACT_MILESTONES: `The authorized completion currently recorded in the Project Control Basis is ${shortDate(project?.contractDates?.originalContractCompletion)}. The selected schedule forecasts completion on ${shortDate(currentForecast)}${priorVersion ? `, compared with ${shortDate(priorForecast)} in the prior version` : ''}. These dates are reported without determining entitlement; approved time modifications remain the contractual source of truth.`,
      PROGRESS_THIS_PERIOD: `The selected schedule reports ${complete} completed, ${inProgress} in-progress and ${notStarted} not-started activities as of ${shortDate(version.dataDate || analysis?.dataDate)}. The scheduler should confirm the physical-progress basis and add any material accomplishments that are not represented by these schedule statuses.`,
      NEXT_PERIOD_WORK: `The current schedule status and available near-term activity evidence were identified from the selected schedule. The scheduler should confirm the work planned for the next reporting period, responsible trades, access needs and prerequisite approvals before this narrative is issued.`,
      CHANGES_FROM_PRIOR_VERSION: priorVersion
        ? `This version contains ${analysis?.totalActivities ?? taskValues.length} activities and advances the data date to ${shortDate(version.dataDate || analysis?.dataDate)}. The prior version contained ${priorVersion.analysis?.totalActivities ?? Object.keys(priorVersion.analysis?.traceTasks || {}).length} activities with a data date of ${shortDate(priorVersion.dataDate || priorVersion.analysis?.dataDate)}. Forecast completion changed from ${shortDate(priorForecast)} to ${shortDate(currentForecast)}. Review the Changes Since Prior Version tab for the detailed comparison.`
        : `This is the first available schedule version for comparison. Changes cannot be stated until an earlier version is available.`,
      LONGEST_AND_CRITICAL_PATHS: `The submitted critical and longest-path evidence was reviewed. ${neutralReportText(result?.pathReview?.criticalPath?.note) || 'Critical-path credibility requires reviewer confirmation.'} ${neutralReportText(result?.pathReview?.longestPath?.note) || 'Longest-path credibility requires reviewer confirmation.'} Detailed activity traces remain in Full CPM Analysis.`,
      DELAYS_AND_CONSTRAINTS: `The selected schedule shows ${Number(analysis?.delayDays || 0)} calendar days of forecast variance, ${technicalSignal('NEGATIVE_FLOAT')} activities with negative float, ${technicalSignal('OUT_OF_SEQUENCE')} out-of-sequence conditions and ${technicalSignal('OPEN_ENDS')} unauthorized open ends. These are schedule signals; causation, responsibility and entitlement require scheduler/reviewer confirmation.`,
      PROCUREMENT_AND_LONG_LEAD: `The review identified ${technicalSignal('LONG_LEAD_AT_RISK')} incomplete long-lead item${technicalSignal('LONG_LEAD_AT_RISK') === 1 ? '' : 's'} at risk under the current float threshold. Confirm required-on-site dates, submittal/approval status, fabrication, delivery and downstream installation interfaces before issue.`,
      SUBMITTALS_RFIS_APPROVALS: `The submitted schedule contains ${submittalCount} activities whose names indicate submittal, shop-drawing, RFI, review or approval work. The schedule evidence is reported without inferring document status. The scheduler should confirm current status, responsible party and any effect on field work.`,
      TESTING_COMMISSIONING_TURNOVER: `The submitted schedule contains ${commissioningCount} activities whose names indicate startup, testing, commissioning, training, acceptance or turnover work. Confirm that the submitted logic connects system readiness through final completion and that the stated sequence matches the project requirements.`,
      CORRECTIVE_ACTIONS: `The automated review currently groups the findings into ${correctionCount} correction group${correctionCount === 1 ? '' : 's'} and ${clarificationCount} clarification group${clarificationCount === 1 ? '' : 's'}. The contractor/scheduler should describe the corrective action, responsible party and planned completion date for each issued item.`,
      OWNER_COMMENT_RESPONSES: `${summary.issued} formal comment${summary.issued === 1 ? ' has' : 's have'} been issued; ${summary.closed} ${summary.closed === 1 ? 'is' : 'are'} closed and ${summary.open} remain open. Responses and claimed corrections should be recorded in the Comment Register so the next schedule version can verify whether each item was corrected, remains open or was reopened.`,
      ASSUMPTIONS_AND_SUPPORT: `This automated draft is based on the selected schedule, the current Project Control Basis and the formal Comment Register. It does not infer contractual entitlement, causation or responsibility. The scheduler or authorized reviewer should confirm the statements and identify any supporting documents before approving or issuing the narrative.`,
    }

    narrative.sections = narrative.sections.map(section => {
      if (narrative.issuedAt) return section
      if (section.schedulerText.trim() && section.state !== 'AUTO_UPDATED') return section
      return {
        ...section,
        schedulerText: generatedDrafts[section.key] || section.schedulerText,
        state: 'AUTO_UPDATED',
        updatedAt: new Date().toISOString(),
      }
    })
    return narrative
  }, [analysis, project, result, reviewData.comments, reviewData.narratives, reviewPurpose, reviewSnapshot, version])

  async function saveNarrative(narrative: ScheduleNarrative, issue: boolean) {
    if (!project?.id) return
    setReviewMutation(true)
    setReviewDataError(null)
    const saved = await upsertScheduleNarrativeInSupabase(project.id, narrative, issue)
    if (!saved.ok) setReviewDataError(saved.error || 'Could not save the schedule narrative.')
    await reloadReviewWorkspace()
    setReviewMutation(false)
  }

  if (!ready) return <Shell><div className="p-6 text-sm text-slate-500">Loading…</div></Shell>

  if (!project || !analysis) {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center max-w-md mx-auto mt-10">
          <div className="text-3xl mb-3">✅</div>
          <div className="text-lg font-bold text-slate-700 mb-2">No active project</div>
          <div className="text-sm text-slate-500 mb-4">Upload a P6 schedule to run an Approval Readiness check.</div>
          <Link href="/dashboard/upload" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">Upload Schedule</Link>
        </div>
      </Shell>
    )
  }

  // needs the relationship data (re-upload gate, same as Trace Logic / engine)
  const hasData = analysis.traceRelationships && analysis.traceTasks
  if (!hasData) {
    return (
      <Shell project={project}>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center max-w-lg mx-auto mt-8">
          <div className="text-3xl mb-2">✅</div>
          <div className="text-[14px] font-bold" style={{ color: COLORS.ink }}>Re-upload needed to run Approval Readiness</div>
          <div className="text-[12px] text-slate-500 mt-1 leading-relaxed">
            This check reads the schedule's relationship network, which is saved on upload.
            Re-upload this schedule version, then run the check.
          </div>
        </div>
      </Shell>
    )
  }

  // When a report is requested, render the print-optimized document instead
  // of the interactive workspace. Built from the same structured result.
  if (reportKind && result) {
    return <ApprovalReport
      result={result}
      mode={mode}
      kind={reportKind}
      project={project}
      reviewSnapshot={reviewSnapshot}
      analysis={analysis}
      reportSignalIds={reportSignalIds}
      reviewComments={reviewData.comments}
      onBack={() => setReportKind(null)}
    />
  }

  const reviewCommentSummary = summarizeReviewComments(reviewData.comments)
  const workflowBlocking = reviewCommentSummary.blocking > 0
  const snapshotActionGroups = reviewSnapshot
    ? buildActionGroups(reviewSnapshot.approval)
    : { corrections: [], clarifications: [] }
  const snapshotConcernGroups = snapshotActionGroups.corrections.length + snapshotActionGroups.clarifications.length

  return (
    <Shell project={project}>
      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Selected schedule version</div>
            <div className="text-[14px] font-extrabold text-slate-900 mt-1">{version?.versionLabel || version?.fileName || 'Current version'}</div>
            <div className="text-[11px] text-slate-500 mt-1">Data date: {shortDate(version?.dataDate || analysis?.dataDate)} · File: {version?.fileName || '—'}</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-right">
              <div className="text-[9px] font-extrabold uppercase tracking-wide text-blue-600">Review level</div>
              <div className="text-[11px] font-bold text-blue-900 mt-0.5">Version-specific review</div>
            </div>
            <button disabled={!result} onClick={() => setReportKind('executive')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-40">
              Executive Report
            </button>
            <button disabled={!result} onClick={() => setReportKind('complete')} className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">
              Complete Review / Print
            </button>
          </div>
        </div>
      </div>

      {/* Review purpose + perspective + run */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4">
        <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr_auto] gap-4 items-end">
          <label>
            <span className="block text-[10px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">Review purpose</span>
            <select value={reviewPurpose} onChange={e => setReviewPurpose(e.target.value as ReviewPurpose)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[12px] font-bold text-slate-800 outline-none focus:border-blue-500">
              {REVIEW_PURPOSES.map(purpose => <option key={purpose.value} value={purpose.value}>{purpose.label}</option>)}
            </select>
          </label>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500 mb-1.5">Review perspective</div>
            <div className="flex flex-wrap gap-2">
              <ModeButton active={mode === 'PRE_SUBMISSION'} onClick={() => { setMode('PRE_SUBMISSION') }}
                title="Contractor" sub="Is it ready to submit?" />
              <ModeButton active={mode === 'REVIEWER'} onClick={() => { setMode('REVIEWER') }}
                title="Owner / Reviewer" sub="Is it ready to approve?" />
            </div>
          </div>
          <button onClick={runCheck} disabled={running}
            className="text-white text-[13px] font-bold px-5 py-2.5 rounded-lg disabled:opacity-60" style={{ background: COLORS.blue }}>
            {running
              ? 'Running…'
              : reviewPurpose === 'VERSION_COMPARISON'
                ? 'Open Comparison'
                : reviewPurpose === 'TIME_IMPACT_ANALYSIS'
                  ? 'Open TIA Workspace'
                  : result
                    ? 'Re-run Review'
                    : 'Run Schedule Review'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto" role="tablist" aria-label="Review workspace">
        {([
          ['comments', 'Comment Register'],
          ['narrative', 'Schedule Narrative'],
          ['changes', 'Changes Since Prior Version'],
          ['evidence', 'Supporting Evidence'],
        ] as const).map(([tab, label]) => (
          <button key={tab} role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-[12px] font-bold ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>

      {reviewDataError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 mb-4 text-[11px] text-red-800">{reviewDataError}</div>}

      {activeTab === 'comments' && result && <ReviewDecisionHero
        result={result}
        mode={mode}
        workflowBlocking={workflowBlocking}
        blockingComments={reviewCommentSummary.blocking}
        openComments={reviewCommentSummary.open}
        correctionGroups={snapshotActionGroups.corrections.length}
        clarificationGroups={snapshotActionGroups.clarifications.length}
      />}

      {activeTab === 'comments' && (
        <CommentRegisterPanel
          comments={reviewData.comments}
          loading={reviewDataLoading}
          disabled={reviewMutation}
          result={result}
          mode={mode}
          onAdd={() => setShowAddComment(true)}
          onImport={importControlLensFindings}
          onStatusChange={changeCommentStatus}
          onResponse={submitContractorResponse}
        />
      )}

      {activeTab === 'comments' && reviewSnapshot && <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="p-5">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-600">Unified CPM Review</div>
            <h2 className="text-[17px] font-extrabold text-slate-900 mt-1">Technical evidence behind the decision</h2>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[700px]">Select a number to inspect the affected activities. Choose which evidence groups belong in the formal report; the underlying CPM analysis remains unchanged.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 border-y border-slate-200 bg-slate-50">
          <button onClick={() => setExpandedSignalIds(expandedSignalIds.length === reviewSnapshot.technicalSignals.length ? [] : reviewSnapshot.technicalSignals.map(signal => signal.id))} className="p-4 text-left border-r border-slate-200 hover:bg-blue-50 transition-colors">
            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Detected occurrences</div>
            <div className="text-[24px] font-black text-blue-700 mt-1">{reviewSnapshot.reconciliation.technicalOccurrences}</div>
            <div className="text-[9px] font-bold text-blue-600 mt-1">Click to {expandedSignalIds.length ? 'collapse' : 'inspect'} evidence →</div>
          </button>
          {[
            ['Signal groups', reviewSnapshot.reconciliation.technicalSignalGroups],
            ['Action groups', snapshotConcernGroups],
            ['Blocking findings', reviewSnapshot.reconciliation.blockingFindings],
          ].map(([label, value]) => <div key={String(label)} className="p-4 border-r border-slate-200 last:border-r-0">
            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-[24px] font-black text-slate-900 mt-1">{value}</div>
          </div>)}
        </div>

        {reviewSnapshot.technicalSignals.length > 0 && <div className="divide-y divide-slate-200">
          {reviewSnapshot.technicalSignals.map(signal => {
            const isOpen = expandedSignalIds.includes(signal.id)
            const rows = technicalEvidenceRows(signal, analysis)
            const included = reportSignalIds.includes(signal.id)
            return <div key={signal.id}>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 px-4 py-3 items-start hover:bg-slate-50">
                <button onClick={() => setExpandedSignalIds(current => current.includes(signal.id) ? current.filter(id => id !== signal.id) : [...current, signal.id])} className="h-10 min-w-[58px] rounded-lg bg-blue-50 border border-blue-200 font-mono text-[18px] font-black text-blue-700 hover:bg-blue-100" aria-expanded={isOpen}>
                  {signal.count}
                </button>
                <button onClick={() => setExpandedSignalIds(current => current.includes(signal.id) ? current.filter(id => id !== signal.id) : [...current, signal.id])} className="text-left">
                  <div className="text-[12px] font-extrabold text-slate-900">{signal.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{signal.summary}</div>
                  <div className="text-[9px] font-bold text-blue-600 mt-1">{isOpen ? 'Hide affected activities' : 'View affected activities'} {isOpen ? '▴' : '▾'}</div>
                </button>
                <label className="flex items-center gap-2 text-[9px] font-bold text-slate-600 whitespace-nowrap cursor-pointer">
                  <input type="checkbox" checked={included} onChange={() => setReportSignalIds(current => current.includes(signal.id) ? current.filter(id => id !== signal.id) : [...current, signal.id])} />
                  Include in report
                </label>
              </div>
              {isOpen && <div className="bg-slate-50 border-t border-slate-100 px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500">Affected schedule evidence</div>
                  <Link href={`/dashboard/lens?tab=${cpmTabForSignal(signal)}`} className="text-[10px] font-bold text-blue-600">Open this area in Full CPM →</Link>
                </div>
                {rows.length ? <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                  {rows.map(row => <div key={row.id} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3 py-2 text-[10px]">
                    <span className="font-mono font-bold text-slate-900">{row.code}</span>
                    <span className="font-semibold text-slate-700">{row.name}</span>
                  </div>)}
                </div> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-[10px] text-slate-500">The saved analysis contains the aggregate count, but not activity-level records for this signal. Open Full CPM Analysis for the source view.</div>}
              </div>}
            </div>
          })}
        </div>}

        {!reviewSnapshot.decisionIntegrity.internallyConsistent && <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] font-semibold text-red-800">{reviewSnapshot.decisionIntegrity.explanation}</div>}
      </section>}

      {activeTab === 'evidence' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 mb-4">
        <div className="text-xs text-slate-600">A concise index to project discovery and detailed CPM trace evidence. Actions and decisions remain in the Comment Register.</div>
        <div className="flex gap-2">
          <Link href="/dashboard/trace" className="text-[11px] font-bold px-3 py-2 rounded-lg border border-slate-200">Logic Trace</Link>
          <button disabled={!result} onClick={() => setReportKind('complete')} className="text-[11px] font-bold px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40">Evidence Summary PDF</button>
        </div>
      </div>}
      {activeTab === 'evidence' && <ProjectDiscoveryPanel discovery={discovery} />}

      {activeTab === 'comments' && !result && !running && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 mb-4 text-center">
          <div className="text-[13px] font-bold" style={{ color: COLORS.ink }}>Run the schedule review to generate Control Lens findings</div>
          <div className="text-[11px] text-slate-500 mt-1">Reviewer-added comments can still be entered below before the automated review is run.</div>
        </div>
      )}

      {activeTab === 'comments' && running && !result && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-500">
          Running check…
        </div>
      )}

      {activeTab === 'narrative' && narrativeForCurrentVersion && (
        <ScheduleNarrativePanel
          key={`${narrativeForCurrentVersion.versionId}-${narrativeForCurrentVersion.updatedAt}`}
          narrative={narrativeForCurrentVersion}
          projectName={project?.name || 'Project'}
          versionLabel={version?.versionLabel || version?.fileName || 'Schedule version'}
          disabled={reviewMutation}
          onSave={saveNarrative}
        />
      )}

      {activeTab === 'changes' && (
        <VersionChangesPanel project={project} version={version} />
      )}

      {showAddComment && version?.id && (
        <AddReviewItemModal
          versionId={version.id}
          disabled={reviewMutation}
          onCancel={() => setShowAddComment(false)}
          onSave={addManualReviewComment}
        />
      )}

      {result && (
        <>
          {activeTab === 'evidence' && <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 mb-4 text-[11px] text-slate-600 leading-relaxed">
            <b className="text-slate-800">Technical evidence index.</b> Discovery describes the submitted schedule and helps organize review; it does not establish a jurisdiction, compliance or approval. Formal actions remain in the Comment Register and detailed schedule evidence remains in Full CPM Analysis.
          </div>}

          {/* Path credibility is now a first-class approval question. */}
          {activeTab === 'evidence' && result.pathReview && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 mb-1">Control Path Credibility</div>
              <div className="text-[11px] text-slate-500 mb-3">Control Lens evaluates whether the submitted schedule represents the work that should actually control completion. This is engineering schedule review—not a silent CPM recalculation.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[result.pathReview.criticalPath, result.pathReview.longestPath].filter(Boolean).map((p: any) => {
                  const c = p.status === 'CREDIBLE' ? COLORS.green : p.status === 'REVIEW_REQUIRED' ? COLORS.red : COLORS.amber
                  return (
                    <div key={p.label} className="rounded-xl border p-4" style={{ borderColor: `${c}55`, background: `${c}08` }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[14px] font-extrabold" style={{ color: COLORS.ink }}>{p.label}</div>
                        <span className="text-[9px] font-extrabold uppercase tracking-wide px-2 py-1 rounded" style={{ background: `${c}18`, color: c }}>{p.status.replace('_', ' ')}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 leading-relaxed mt-2">{p.note}</div>
                      <div className="text-[9px] text-slate-400 mt-2">{p.activityCount} submitted activities in the CL review chain</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'evidence' && <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">Evidence locations</div>
            <p className="text-[11px] text-slate-500 mt-1 mb-3">Supporting Evidence is an index only. Formal actions remain in the Comment Register; detailed CPM activity and relationship evidence remains in Full CPM Analysis.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Link href="/dashboard/lens" className="rounded-xl border border-blue-200 bg-blue-50 p-3 hover:border-blue-400"><div className="text-[12px] font-extrabold text-blue-800">Full CPM Analysis</div><div className="text-[10px] text-slate-600 mt-1">Critical paths, logic, float, constraints and activity evidence.</div></Link>
              <Link href="/dashboard/trace" className="rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-blue-400"><div className="text-[12px] font-extrabold text-slate-800">Logic Trace</div><div className="text-[10px] text-slate-600 mt-1">Trace predecessors and successors for a selected activity.</div></Link>
              <button type="button" onClick={() => setActiveTab('changes')} className="text-left rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-blue-400"><div className="text-[12px] font-extrabold text-slate-800">Version Changes</div><div className="text-[10px] text-slate-600 mt-1">Compare the selected schedule with its prior project version.</div></button>
            </div>
          </div>}

          <div className="text-[10px] text-slate-400 mt-3 leading-relaxed">
            Score is provisional pending calibration. Control Lens detects, traces, explains, scores and triggers professional review —
            the scheduler makes corrections; the authorized reviewer makes the final approval decision.
          </div>
        </>
      )}
    </Shell>
  )
}

// ---------------------------------------------------------------------------
const CLOSED_REVIEW_STATUSES: ReviewItemStatus[] = ['CLOSED', 'WITHDRAWN', 'VOID']

function reviewStatusLabel(status: ReviewItemStatus): string {
  return {
    DRAFT: 'Draft',
    OPEN: 'Open',
    CORRECTED_PENDING_VERIFICATION: 'Correction detected',
    PARTIALLY_CORRECTED: 'Partially corrected',
    NOT_CORRECTED: 'Not corrected',
    NEEDS_REVIEWER_DECISION: 'Reviewer decision',
    CLOSED: 'Closed',
    REOPENED: 'Reopened',
    WITHDRAWN: 'Withdrawn',
    VOID: 'Void',
  }[status]
}

function reviewStatusClasses(status: ReviewItemStatus): string {
  if (status === 'CLOSED') return 'bg-green-50 text-green-700 border-green-200'
  if (status === 'CORRECTED_PENDING_VERIFICATION') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'PARTIALLY_CORRECTED' || status === 'NEEDS_REVIEWER_DECISION') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'OPEN' || status === 'NOT_CORRECTED' || status === 'REOPENED') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

function CommentRegisterPanel({
  comments,
  loading,
  disabled,
  result,
  mode,
  onAdd,
  onImport,
  onStatusChange,
  onResponse,
}: {
  comments: ReviewComment[]
  loading: boolean
  disabled: boolean
  result: ApprovalReadinessResult | null
  mode: ApprovalMode
  onAdd: () => void
  onImport: () => Promise<void>
  onStatusChange: (commentId: string, status: ReviewItemStatus) => Promise<void>
  onResponse: (commentId: string, response: string, correctionMade: string) => Promise<void>
}) {
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [openId, setOpenId] = useState<string | null>(null)
  const [responses, setResponses] = useState<Record<string, { response: string; correction: string }>>({})
  const summary = summarizeReviewComments(comments)
  const displayed = comments.filter(comment => filter === 'all' || !CLOSED_REVIEW_STATUSES.includes(comment.status))
  const actionGroups = result ? buildActionGroups(result) : { corrections: [], clarifications: [] }
  const existingSignatures = existingFindingSignatures(comments)
  const proposedGroups = [...actionGroups.corrections, ...actionGroups.clarifications].filter(group => {
    const canonical = canonicalFindingSignature(group.findings)
    const legacy = legacyFindingSignature(group.findings)
    return canonical && !existingSignatures.has(canonical) && !existingSignatures.has(legacy)
  })
  const unissuedCount = proposedGroups.length

  async function sendResponse(comment: ReviewComment) {
    const draft = responses[comment.id]
    if (!draft?.response.trim()) return
    await onResponse(comment.id, draft.response, draft.correction)
    setResponses(current => ({ ...current, [comment.id]: { response: '', correction: '' } }))
  }

  return (
    <section id="review-comment-register" className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[15px] font-extrabold text-slate-900">Review Comment Register</h2>
          <p className="text-[11px] text-slate-500 mt-1">Permanent numbers carry across every submission. Only the authorized reviewer closes an issued comment.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === 'REVIEWER' && <button disabled={disabled} onClick={onAdd} className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">+ Add Review Item</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        {[
          ['Detected drafts', unissuedCount, 'text-blue-700'],
          ['Issued', summary.issued, 'text-slate-900'],
          ['Closed', summary.closed, 'text-green-700'],
          ['Pending verification', summary.pendingVerification, 'text-emerald-700'],
          ['Not corrected', summary.notCorrected, 'text-red-700'],
          ['Blocking approval', summary.blocking, 'text-red-700'],
        ].map(([label, value, color]) => <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
          <div className={`text-[20px] font-black mt-1 ${color}`}>{value}</div>
        </div>)}
      </div>

      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[12px] font-bold text-slate-800">{filter === 'open' ? `${summary.open + summary.drafts} active items` : `${comments.length} total items`}</div>
        <div className="flex gap-1">
          <button onClick={() => setFilter('open')} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${filter === 'open' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'}`}>Open items</button>
          <button onClick={() => setFilter('all')} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${filter === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600'}`}>All</button>
        </div>
      </div>

      {proposedGroups.length > 0 && <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 mb-3">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div><div className="text-[11px] font-extrabold text-blue-900">{mode === 'REVIEWER' ? 'Proposed owner comments detected by Control Lens' : 'Detected corrections for this submission'}</div><div className="text-[10px] text-blue-700 mt-0.5">Visible automatically. They are not official owner comments until issued into the register.</div></div>
          {mode === 'REVIEWER' && <button disabled={disabled} onClick={onImport} className="rounded-md bg-blue-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">Issue all {proposedGroups.length} comments</button>}
        </div>
        <div className="space-y-1.5">
          {proposedGroups.map((group, index) => <details key={group.id} className="rounded-md border border-blue-100 bg-white px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-bold text-slate-800"><span className="font-mono text-blue-600 mr-2">PROPOSED-{String(index + 1).padStart(2, '0')}</span>{group.title}</summary>
            <div className="grid md:grid-cols-2 gap-3 mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-600"><div><b className="text-slate-800">Why:</b> {group.why}</div><div><b className="text-slate-800">Required response:</b> {group.action}</div></div>
          </details>)}
        </div>
      </div>}

      {loading ? <div className="border border-slate-200 rounded-lg p-8 text-center text-[12px] text-slate-500">Loading review comments…</div> : displayed.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-lg p-8 text-center">
          <div className="text-[13px] font-bold text-slate-800">No {filter === 'open' ? 'issued open ' : ''}review items</div>
          <div className="text-[11px] text-slate-500 mt-1">Detected drafts are shown above; reviewer-added and issued comments appear here.</div>
        </div>
      ) : <div className="border border-slate-200 rounded-lg overflow-hidden">
        {displayed.map(comment => {
          const isOpen = openId === comment.id
          const latestResponse = comment.responses[comment.responses.length - 1]
          const draft = responses[comment.id] || { response: '', correction: '' }
          return <div key={comment.id} className="border-b border-slate-200 last:border-b-0">
            <button onClick={() => setOpenId(isOpen ? null : comment.id)} className="w-full px-3 py-3 text-left hover:bg-slate-50">
              <div className="grid grid-cols-[64px_1fr_auto_18px] gap-3 items-center">
                <span className="font-mono text-[11px] font-extrabold text-blue-600">{comment.commentNumber}</span>
                <div className="min-w-0">
                  <div className="text-[12px] font-extrabold text-slate-900 truncate">{comment.title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{comment.source === 'REVIEWER_ADDED' ? 'Reviewer added' : comment.source === 'CL_DETECTED' ? 'Control Lens detected' : 'Converted from CL finding'} · {comment.classification.replace('_', ' ')}</div>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[9px] font-bold whitespace-nowrap ${reviewStatusClasses(comment.status)}`}>{reviewStatusLabel(comment.status)}</span>
                <span className="text-slate-400">{isOpen ? '⌃' : '⌄'}</span>
              </div>
            </button>
            {isOpen && <div className="border-t border-slate-100 bg-slate-50/60 p-4">
              <div className="grid md:grid-cols-2 gap-4 text-[11px]">
                <div><div className="font-bold text-slate-500 uppercase tracking-wide text-[9px] mb-1">Owner concern</div><p className="text-slate-700 leading-relaxed">{comment.concern}</p></div>
                <div><div className="font-bold text-slate-500 uppercase tracking-wide text-[9px] mb-1">Required correction</div><p className="text-slate-700 leading-relaxed">{comment.requiredCorrection || 'Reviewer clarification required.'}</p></div>
              </div>
              {comment.requirementReference && <div className="mt-3 text-[10px] text-slate-600"><b>Reference:</b> {comment.requirementReference}</div>}
              {comment.affectedActivities.length > 0 && <div className="mt-3 text-[10px] text-slate-600"><b>Affected activities:</b> {comment.affectedActivities.slice(0, 8).map(activity => `${activity.activityCode || activity.activityId} — ${activity.activityName || 'Unnamed activity'}`).join(' · ')}{comment.affectedActivities.length > 8 ? ` · +${comment.affectedActivities.length - 8} more` : ''}</div>}

              {latestResponse && <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 mt-3">
                <div className="text-[9px] font-bold uppercase tracking-wide text-blue-600">Latest contractor response</div>
                <div className="text-[11px] text-slate-700 mt-1">{latestResponse.response}</div>
                {latestResponse.correctionMade && <div className="text-[10px] text-slate-600 mt-1"><b>Correction:</b> {latestResponse.correctionMade}</div>}
              </div>}

              {mode === 'PRE_SUBMISSION' && !CLOSED_REVIEW_STATUSES.includes(comment.status) && comment.status !== 'DRAFT' && <div className="grid md:grid-cols-2 gap-2 mt-3">
                <textarea value={draft.response} onChange={event => setResponses(current => ({ ...current, [comment.id]: { ...draft, response: event.target.value } }))} placeholder="Contractor response" className="min-h-[76px] rounded-lg border border-slate-300 bg-white p-2.5 text-[11px] outline-none focus:border-blue-500" />
                <textarea value={draft.correction} onChange={event => setResponses(current => ({ ...current, [comment.id]: { ...draft, correction: event.target.value } }))} placeholder="Correction made and affected activity IDs" className="min-h-[76px] rounded-lg border border-slate-300 bg-white p-2.5 text-[11px] outline-none focus:border-blue-500" />
              </div>}

              <div className="flex flex-wrap justify-end gap-2 mt-3">
                {mode === 'REVIEWER' && comment.status === 'DRAFT' && <button disabled={disabled} onClick={() => onStatusChange(comment.id, 'OPEN')} className="rounded-md bg-blue-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">Issue comment</button>}
                {mode === 'PRE_SUBMISSION' && !CLOSED_REVIEW_STATUSES.includes(comment.status) && comment.status !== 'DRAFT' && <button disabled={disabled || !draft.response.trim()} onClick={() => sendResponse(comment)} className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-700 disabled:opacity-40">Submit contractor response</button>}
                {mode === 'REVIEWER' && !CLOSED_REVIEW_STATUSES.includes(comment.status) && comment.status !== 'DRAFT' && <button disabled={disabled} onClick={() => onStatusChange(comment.id, 'CLOSED')} className="rounded-md bg-green-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">Reviewer close</button>}
                {mode === 'REVIEWER' && comment.status === 'CLOSED' && <button disabled={disabled} onClick={() => onStatusChange(comment.id, 'REOPENED')} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-bold text-red-700 disabled:opacity-50">Reopen</button>}
              </div>
            </div>}
          </div>
        })}
      </div>}

      {summary.blocking > 0 && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] font-semibold text-red-800">Not ready for approval — {summary.blocking} required comment{summary.blocking === 1 ? '' : 's'} remain unresolved.</div>}
    </section>
  )
}

function AddReviewItemModal({ versionId, disabled, onCancel, onSave }: {
  versionId: string
  disabled: boolean
  onCancel: () => void
  onSave: (input: NewReviewCommentInput) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [concern, setConcern] = useState('')
  const [reference, setReference] = useState('')
  const [correction, setCorrection] = useState('')
  const [classification, setClassification] = useState<'REQUIRED' | 'ADVISORY' | 'OBSERVATION'>('REQUIRED')
  const [blocksApproval, setBlocksApproval] = useState(true)

  async function save(issueImmediately: boolean) {
    if (!title.trim() || !concern.trim()) return
    await onSave({
      source: 'REVIEWER_ADDED',
      title,
      concern,
      requirementReference: reference,
      requiredCorrection: correction,
      classification,
      approvalImpact: blocksApproval ? 'BLOCKS_APPROVAL' : 'NON_BLOCKING',
      responsibleParty: 'Contractor / Scheduler',
      firstVersionId: versionId,
      issueImmediately,
    })
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Add review item">
    <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-start justify-between border-b border-slate-200 p-5">
        <div><h2 className="text-[16px] font-extrabold text-slate-900">Add Review Item</h2><p className="text-[11px] text-slate-500 mt-1">Control Lens will assign the next permanent comment number.</p></div>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
      </div>
      <div className="p-5 space-y-3">
        <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Comment title *</span><input value={title} onChange={event => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] outline-none focus:border-blue-500" placeholder="Example: Contract completion milestone is not identified" /></label>
        <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Owner concern *</span><textarea value={concern} onChange={event => setConcern(event.target.value)} className="mt-1 min-h-[80px] w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] outline-none focus:border-blue-500" /></label>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Contract / specification reference</span><input value={reference} onChange={event => setReference(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] outline-none focus:border-blue-500" /></label>
          <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Classification</span><select value={classification} onChange={event => setClassification(event.target.value as any)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px]"><option value="REQUIRED">Required</option><option value="ADVISORY">Advisory</option><option value="OBSERVATION">Observation</option></select></label>
        </div>
        <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Required correction</span><textarea value={correction} onChange={event => setCorrection(event.target.value)} className="mt-1 min-h-[70px] w-full rounded-lg border border-slate-300 px-3 py-2 text-[12px] outline-none focus:border-blue-500" /></label>
        <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700"><input type="checkbox" checked={blocksApproval} onChange={event => setBlocksApproval(event.target.checked)} />This item blocks approval until resolved</label>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
        <button onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-[11px] font-bold text-slate-600">Cancel</button>
        <button disabled={disabled || !title.trim() || !concern.trim()} onClick={() => save(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-40">Save draft</button>
        <button disabled={disabled || !title.trim() || !concern.trim()} onClick={() => save(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-[11px] font-bold text-white disabled:opacity-40">Add as open comment</button>
      </div>
    </div>
  </div>
}

function ScheduleNarrativePanel({ narrative, projectName, versionLabel, disabled, onSave }: {
  narrative: ScheduleNarrative
  projectName: string
  versionLabel: string
  disabled: boolean
  onSave: (narrative: ScheduleNarrative, issue: boolean) => Promise<void>
}) {
  const [draft, setDraft] = useState<ScheduleNarrative>(narrative)
  const [selectedKey, setSelectedKey] = useState(narrative.sections[0]?.key)
  const section = draft.sections.find(item => item.key === selectedKey) || draft.sections[0]
  if (!section) return null

  function updateText(text: string) {
    setDraft(current => ({
      ...current,
      sections: current.sections.map(item => item.key === section.key ? {
        ...item,
        schedulerText: text,
        state: 'SCHEDULER_UPDATED',
        updatedAt: new Date().toISOString(),
      } : item),
      updatedAt: new Date().toISOString(),
    }))
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div><div className="flex items-center gap-2"><h2 className="text-[15px] font-extrabold text-slate-900">Schedule Update Narrative</h2>{narrative.issuedAt && <span className="rounded-full bg-green-50 px-2 py-1 text-[9px] font-bold text-green-700">Approved / Issued</span>}</div><p className="text-[11px] text-slate-500 mt-1">An automated draft is prepared from the submitted schedule, project basis and comment register. The scheduler or reviewer confirms, edits and approves each section.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => printReport('schedule-narrative-print-area', { title: `${projectName} — Schedule Narrative`, footerLabel: versionLabel })} className="rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-bold text-slate-700">Print / Save PDF</button><button disabled={disabled} onClick={() => onSave(draft, false)} className="rounded-lg border border-blue-300 px-3 py-2 text-[11px] font-bold text-blue-700 disabled:opacity-50">Save draft</button><button disabled={disabled} onClick={() => onSave(draft, true)} className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">Approve / Issue</button></div>
    </div>
    <div className="grid lg:grid-cols-[250px_1fr] gap-4">
      <div className="rounded-lg border border-slate-200 p-2 h-fit">
        {draft.sections.map((item, index) => <button key={item.key} onClick={() => setSelectedKey(item.key)} className={`w-full rounded-md px-3 py-2.5 text-left text-[11px] flex items-start justify-between gap-2 ${item.key === section.key ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}><span>{index + 1}. {item.title}</span><span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${item.state === 'SCHEDULER_UPDATED' || item.state === 'CURRENT' ? 'bg-green-500' : item.state === 'NO_LONGER_SUPPORTED' ? 'bg-red-500' : item.automatedFacts.length ? 'bg-blue-500' : 'bg-amber-500'}`} /></button>)}
      </div>
      <div className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 mb-3"><div><h3 className="text-[14px] font-extrabold text-slate-900">{section.title}</h3><p className="text-[10px] text-slate-500 mt-1">{section.state === 'AUTO_UPDATED' ? 'Automated draft — confirmation required.' : section.state === 'CARRIED_CONFIRMATION_REQUIRED' ? 'Carried from the previous version — confirmation required.' : section.state.replaceAll('_', ' ').toLowerCase()}</p></div>{(section.state === 'AUTO_UPDATED' || section.state === 'CARRIED_CONFIRMATION_REQUIRED') && <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">Confirm before issue</span>}</div>
        {section.automatedFacts.length > 0 && <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 mb-3"><div className="text-[9px] font-bold uppercase tracking-wide text-blue-600 mb-2">Updated automatically from the schedule</div><div className="grid md:grid-cols-2 gap-2">{section.automatedFacts.map(fact => <div key={fact.id} className="text-[10px] text-slate-600"><b className="text-slate-800">{fact.label}:</b> {fact.currentValue}{fact.priorValue && fact.priorValue !== '—' ? <span className="text-slate-400"> · prior {fact.priorValue}</span> : null}</div>)}</div></div>}
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Draft / approved narrative</label>
        <textarea value={section.schedulerText} onChange={event => updateText(event.target.value)} className="min-h-[260px] w-full rounded-lg border border-slate-300 p-3 text-[12px] leading-relaxed outline-none focus:border-blue-500" placeholder="A generic draft is prepared from detected schedule facts. Add project-specific cause, responsibility, mitigation and references where required." />
        <div className="text-[10px] text-slate-500 mt-2">Detected facts are drafted automatically. Causation, responsibility, entitlement and project-specific commitments require human confirmation.</div>
      </div>
    </div>
    <div id="schedule-narrative-print-area" className="fixed -left-[10000px] top-0 w-[760px] bg-white p-6" aria-hidden="true">
      <div className="border-b-2 border-slate-900 pb-3 mb-4"><div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Schedule Update Narrative</div><div className="text-[20px] font-black text-slate-900 mt-1">{projectName}</div><div className="text-[11px] text-slate-500 mt-1">{versionLabel} · {narrative.reviewPurpose.replaceAll('_', ' ')}</div></div>
      {draft.sections.map((item, index) => <section key={item.key} className="mb-5 break-inside-avoid">
        <h2 className="border-b border-slate-300 pb-1 text-[13px] font-extrabold text-slate-900">{index + 1}. {item.title}</h2>
        {item.automatedFacts.length > 0 && <div className="mt-2 space-y-1">{item.automatedFacts.map(fact => <div key={fact.id} className="text-[10px] text-slate-700"><b>{fact.label}:</b> {fact.currentValue}{fact.priorValue && fact.priorValue !== '—' ? ` · Prior: ${fact.priorValue}` : ''}</div>)}</div>}
        <div className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-800">{item.schedulerText || 'No scheduler narrative entered for this section.'}</div>
      </section>)}
      <div className="mt-6 border-t border-slate-300 pt-2 text-[9px] text-slate-500">Prepared from the selected schedule, Project Control Basis and Comment Register. Confirmed edits and issue approval remain the responsibility of the scheduler or authorized reviewer.</div>
    </div>
  </section>
}

function VersionChangesPanel({ project, version }: { project: any; version: any }) {
  const versions = [...(project?.versions || [])]
    .filter((item: any) => !item.deletedAt)
    .sort((a: any, b: any) => new Date(a.dataDate || a.uploadedAt).getTime() - new Date(b.dataDate || b.uploadedAt).getTime())
  const index = versions.findIndex((item: any) => item.id === version?.id)
  const prior = index > 0 ? versions[index - 1] : null
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
    <h2 className="text-[15px] font-extrabold text-slate-900">Changes Since Prior Version</h2>
    <p className="text-[11px] text-slate-500 mt-1">Use the deterministic version comparison for added/deleted activities, relationship changes, duration changes and forecast movement.</p>
    {prior ? <div className="grid md:grid-cols-[1fr_auto_1fr] gap-3 items-center mt-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="text-[9px] font-bold uppercase text-slate-500">Prior submission</div><div className="text-[12px] font-extrabold text-slate-900 mt-1">{prior.versionLabel || prior.fileName}</div><div className="text-[10px] text-slate-500 mt-1">Data date: {shortDate(prior.dataDate || prior.analysis?.dataDate)}</div></div>
      <span className="text-slate-400 text-center">→</span>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4"><div className="text-[9px] font-bold uppercase text-blue-600">Current submission</div><div className="text-[12px] font-extrabold text-slate-900 mt-1">{version?.versionLabel || version?.fileName}</div><div className="text-[10px] text-slate-500 mt-1">Data date: {shortDate(version?.dataDate || version?.analysis?.dataDate)}</div></div>
    </div> : <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-[11px] text-slate-500 mt-4">This is the first schedule version. Upload a later submission before running a version comparison.</div>}
    {prior && <div className="flex justify-end mt-4"><Link href="/dashboard/changes" className="rounded-lg bg-blue-600 px-4 py-2 text-[11px] font-bold text-white">Open Version Comparison →</Link></div>}
  </section>
}

function ModeButton({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button onClick={onClick}
      className={`text-left px-4 py-2 rounded-lg border transition-colors ${active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
      <div className="text-[12px] font-bold" style={{ color: active ? COLORS.blue : COLORS.ink }}>{title}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </button>
  )
}

function ReviewDecisionHero({ result, mode, workflowBlocking, blockingComments, openComments, correctionGroups, clarificationGroups }: {
  result: ApprovalReadinessResult
  mode: ApprovalMode
  workflowBlocking: boolean
  blockingComments: number
  openComments: number
  correctionGroups: number
  clarificationGroups: number
}) {
  const statusColor = workflowBlocking ? COLORS.red : readinessColor(result.readinessStatus)
  const statusLabel = workflowBlocking ? 'NOT READY — OPEN REVIEW COMMENTS' : contextualReadinessLabel(result, mode)
  return <section className="relative overflow-hidden rounded-2xl border mb-4 shadow-sm" style={{ borderColor: `${statusColor}55`, background: `linear-gradient(115deg, ${statusColor}14 0%, #ffffff 58%)` }}>
    <div className="absolute left-0 top-0 h-full w-1.5" style={{ background: statusColor }} />
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="p-6 pl-7">
        <div className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: statusColor }}>{mode === 'REVIEWER' ? 'Approval decision' : 'Submission decision'}</div>
        <div className="text-[26px] md:text-[31px] font-black leading-tight mt-1" style={{ color: statusColor }}>{statusLabel}</div>
        <p className="text-[12px] text-slate-600 leading-relaxed mt-2 max-w-[690px]">
          {workflowBlocking
            ? `${blockingComments} issued approval-blocking comment${blockingComments === 1 ? '' : 's'} remain unresolved. The technical score cannot override an open formal comment.`
            : result.readinessReason || 'Control Lens combines schedule logic, sequencing, path credibility and readiness evidence. The authorized reviewer makes the final decision.'}
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <Chip label="Benchmark: Project criteria" color={COLORS.blue} />
          <Chip label={`Critical Gates: ${result.criticalGates.passed ? 'PASS' : 'FAIL'}`} color={result.criticalGates.passed ? COLORS.green : COLORS.red} />
          <Chip label={`${openComments} open comments`} color={openComments ? COLORS.red : COLORS.green} />
          <Chip label={`${correctionGroups} corrections`} color={correctionGroups ? COLORS.red : COLORS.green} />
          <Chip label={`${clarificationGroups} clarifications`} color={clarificationGroups ? COLORS.amber : COLORS.green} />
        </div>
      </div>
      <div className="grid grid-cols-2 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white/80">
        <div className="p-5 flex flex-col justify-center border-r border-slate-200">
          <div className="text-[9px] uppercase tracking-wide font-extrabold text-slate-500">Technical score</div>
          <div className="font-mono text-[34px] font-extrabold leading-none mt-2" style={{ color: gradeColor(result.grade) }}>{result.totalScore}<span className="text-[12px] text-slate-400">/100</span></div>
          <div className="text-[12px] font-extrabold mt-1" style={{ color: gradeColor(result.grade) }}>{result.grade}</div>
          <div className="text-[8.5px] text-slate-400 mt-2">Supporting indicator only</div>
        </div>
        <div className="p-5 flex flex-col justify-center gap-2">
          <div><div className="text-[9px] font-bold uppercase text-slate-500">Critical / Major</div><div className="text-[19px] font-black text-slate-900 mt-1">{result.counts.critical} / {result.counts.major}</div></div>
          <div><div className="text-[9px] font-bold uppercase text-slate-500">Formal blockers</div><div className="text-[19px] font-black mt-1" style={{ color: blockingComments ? COLORS.red : COLORS.green }}>{blockingComments}</div></div>
        </div>
      </div>
    </div>
  </section>
}

function Chip({ label, color }: { label: string; color: string }) {
  return <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: `${color}18`, color }}>{label}</span>
}

// =============================================================================
// ApprovalReport — print-optimized document (Executive or Complete)
// Built from the structured ApprovalReadinessResult, not scraped from the DOM.
// Save-as-PDF uses the browser print dialog; the dashboard layout hides the
// sidebar on print, and the toolbar below is print-hidden.
// =============================================================================
function ApprovalReport({ result, mode, kind, project, reviewSnapshot, analysis, reportSignalIds, reviewComments, onBack }: {
  result: ApprovalReadinessResult
  mode: ApprovalMode
  kind: 'executive' | 'complete'
  project: any
  reviewSnapshot: ScheduleReviewSnapshot | null
  analysis: any
  reportSignalIds: string[]
  reviewComments: ReviewComment[]
  onBack: () => void
}) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
  const code = (project?.projectId || project?.name || 'PRJ').toString().replace(/\s+/g, '').toUpperCase().slice(0, 14)
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const reportNo = `SR-AR-${code}-${kind === 'executive' ? 'EXEC' : 'FULL'}-${ymd}`
  const voice = mode === 'PRE_SUBMISSION' ? 'Pre-Submission Check (Contractor)' : 'Reviewer Check (Owner / PM)'
  const gc = gradeColor(result.grade)

  const reportTitle = kind === 'executive'
    ? (mode === 'REVIEWER' ? 'Owner Action Report' : 'Contractor Action Report')
    : 'Schedule Review Evidence Summary'
  const docKind = kind === 'executive' ? 'Required Corrections and Clarifications' : 'Consolidated Findings and Selected CPM Evidence'

  const reportFindings = result.findings.filter(f => approvalKind(f) === 'FINDING')
  const reportRecommendations = result.findings.filter(f => approvalKind(f) === 'RECOMMENDATION')
  const actionGroups = buildActionGroups(result)
  const reportSignals = (reviewSnapshot?.technicalSignals || []).filter(signal => reportSignalIds.includes(signal.id))

  return (
    <div className="ar-print-root flex flex-col h-full">
      <style>{`
        @media print {
          /* neutralize the app's fixed-height / scroll layout so the document
             flows naturally instead of rendering a blank full-height page 1 */
          html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
          .ar-print-root { height: auto !important; overflow: visible !important; display: block !important; }
          .ar-print-scroll { height: auto !important; overflow: visible !important; flex: none !important; padding: 0 !important; background: #fff !important; }
          .ar-print-doc { max-width: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; }
          @page { margin: 0.5in; }
        }
      `}</style>
      {/* toolbar — hidden on print */}
      <div className="print:hidden bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack} className="text-[12px] text-slate-500 hover:text-slate-800">‹ Back to workspace</button>
        <span className="text-[13px] font-bold ml-2" style={{ color: COLORS.ink }}>{reportTitle}</span>
        <button onClick={() => printReport('ar-print-area', { title: reportTitle, footerLabel: reportNo })} className="ml-auto text-white text-[12px] font-bold px-4 py-2 rounded-lg" style={{ background: COLORS.blue }}>
          🖨 Save as PDF
        </button>
      </div>

      <div className="ar-print-scroll flex-1 overflow-y-auto bg-slate-100 p-6 print:p-0 print:bg-white">
        <div id="ar-print-area" className="ar-print-doc max-w-[820px] mx-auto bg-white border border-slate-200 print:border-0 p-8 print:p-0">

          {/* ── Cover header ─────────────────────────────────────────── */}
          <div className="border-b-2 pb-4 mb-5" style={{ borderColor: COLORS.ink }}>
            <div className="flex items-start justify-between">
              <div><div className="text-[18px] font-extrabold leading-tight" style={{ color: COLORS.ink }}>PROJECT CONTROLS</div><div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 mt-0.5">Schedule Review &amp; Analysis</div></div>
              <div className="text-right">
                <div className="font-mono text-[10px] text-slate-500">{reportNo}</div>
                <div className="font-mono text-[10px] text-slate-500">{today}</div>
              </div>
            </div>
            {/* Bold, centered, mode-based title */}
            <div className="text-center mt-4">
              <div className="text-[22px] font-extrabold uppercase tracking-wide" style={{ color: COLORS.ink }}>
                {reportTitle}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mt-1">
                {docKind}
              </div>
            </div>
          </div>

          {/* project strip */}
          <div className="grid grid-cols-3 gap-6 mb-5">
            <Info label="Project" value={project?.name || '—'} />
            <Info label="Project Code" value={project?.projectId || '—'} mono />
            <Info label="Review Mode" value={voice} />
          </div>

          {/* ── Executive summary block (both reports) ───────────────── */}
          <SectionBar>Executive Summary</SectionBar>
          <div className="flex items-start gap-6 mb-4 print:break-inside-avoid">
            <div className="flex-1">
              <div className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-500 mb-1">Schedule Readiness Status</div>
              <div className="text-[18px] font-black uppercase tracking-wide mb-1" style={{ color: readinessColor(result.readinessStatus) }}>
                {neutralReportText(result.readinessLabel || result.recommendation)}
              </div>
              <div className="text-[10.5px] text-slate-600 leading-relaxed mb-2">{neutralReportText(result.readinessReason || result.recommendation)}</div>
              <div className="text-[10.5px] text-slate-600">
                Critical Gates: <b style={{ color: result.criticalGates.passed ? COLORS.green : COLORS.red }}>{result.criticalGates.passed ? 'PASS' : 'FAIL'}</b>
                {'  ·  '}Critical {result.counts.critical} · Major {result.counts.major} · Minor {result.counts.minor}
                {reportRecommendations.length > 0 ? ` · Recommendations ${reportRecommendations.length}` : ''}
              </div>
              {!result.criticalGates.passed && (
                <div className="text-[10px] mt-1 font-semibold" style={{ color: COLORS.red }}>
                  {result.criticalGates.failed.map(g => `✗ ${neutralReportText(g.label)} — ${neutralReportText(g.reason)}`).join('  ·  ')}
                </div>
              )}
            </div>
            <div className="text-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 min-w-[110px]">
              <div className="text-[8px] font-extrabold uppercase tracking-wide text-slate-500">Readiness Score</div>
              <div className="font-mono text-[28px] font-extrabold leading-none mt-1" style={{ color: gc }}>
                {result.totalScore}<span className="text-[12px] text-slate-400">/100</span>
              </div>
              <div className="text-[12px] font-extrabold mt-1" style={{ color: gc }}>{result.grade}</div>
              <div className="text-[7.5px] text-slate-400 mt-1">supporting indicator</div>
            </div>
          </div>

          {kind === 'executive' && reviewComments.length > 0 && <>
            <SectionBar>Formal Review Comment Register</SectionBar>
            <div className="mb-5 space-y-2">
              {[...reviewComments].sort((a, b) => a.sequence - b.sequence).map(comment => <div key={comment.id} className="rounded-lg border border-slate-200 p-3 print:break-inside-avoid">
                <div className="flex items-start gap-2">
                  <span className="rounded bg-slate-900 px-2 py-1 font-mono text-[9px] font-bold text-white">{comment.commentNumber}</span>
                  <div className="flex-1"><div className="text-[11px] font-extrabold" style={{ color: COLORS.ink }}>{comment.title}</div><div className="mt-0.5 text-[9px] text-slate-500">{comment.classification} · {comment.approvalImpact.replaceAll('_', ' ')} · {reviewStatusLabel(comment.status)}</div></div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-[9.5px]"><div><b>Concern:</b> {comment.concern}</div><div><b>Required correction:</b> {comment.requiredCorrection || 'Reviewer clarification requested.'}</div></div>
                {(comment.responses || []).length > 0 && <div className="mt-2 rounded bg-slate-50 p-2 text-[9.5px]"><b>Latest contractor response:</b> {comment.responses[comment.responses.length - 1].response}</div>}
              </div>)}
            </div>
          </>}

          {reportSignals.length > 0 && <>
            <SectionBar>Selected CPM Technical Evidence</SectionBar>
            <div className="mb-5 space-y-2">
              {reportSignals.map(signal => {
                const rows = technicalEvidenceRows(signal, analysis)
                return <div key={signal.id} className="rounded-lg border border-slate-200 p-3 print:break-inside-avoid">
                  <div className="flex items-start gap-3">
                    <div className="min-w-[48px] text-center rounded bg-blue-50 border border-blue-100 px-2 py-1 font-mono text-[16px] font-black text-blue-700">{signal.count}</div>
                    <div className="flex-1"><div className="text-[11px] font-extrabold" style={{ color: COLORS.ink }}>{neutralReportText(signal.label)}</div><div className="text-[9.5px] text-slate-600 mt-0.5">{neutralReportText(signal.summary)}</div></div>
                    <div className="text-[8px] font-bold uppercase text-slate-400">{signal.treatment.replaceAll('_', ' ')}</div>
                  </div>
                  {kind === 'complete' && rows.length > 0 && <table className="w-full text-[9.5px] mt-2">
                    <tbody>{rows.map(row => <tr key={row.id} className="border-t border-slate-100"><td className="py-1 pr-2 w-[24%] font-mono font-bold">{row.code}</td><td className="py-1 text-slate-700">{row.name}</td></tr>)}</tbody>
                  </table>}
                </div>
              })}
            </div>
          </>}

          {kind === 'complete' && (result.projectUnderstanding || result.pathReview) && (
            <>
              <SectionBar>Engineering Readiness Snapshot</SectionBar>
              <div className="border border-slate-200 rounded-lg p-3 mb-5 print:break-inside-avoid">
                {result.projectUnderstanding && (
                  <div className="mb-3">
                    <div className="text-[12px] font-extrabold" style={{ color: COLORS.ink }}>{result.projectUnderstanding.projectNature}</div>
                    <div className="text-[10px] text-slate-600 mt-0.5">{result.projectUnderstanding.deliveryNature.join(' → ')}</div>
                    <div className="grid grid-cols-3 gap-3 mt-2 text-[9.5px]">
                      <div><b>Target:</b> {result.projectUnderstanding.completionTarget?.code || '—'} · {result.projectUnderstanding.completionTarget?.name || 'Not resolved'} {result.projectUnderstanding.completionTarget?.finish ? `(${shortDate(result.projectUnderstanding.completionTarget.finish)})` : ''}</div>
                      <div><b>Areas:</b> {result.projectUnderstanding.areas.join(' · ') || '—'}</div>
                      <div><b>Systems:</b> {result.projectUnderstanding.systems.join(' · ') || '—'}</div>
                    </div>
                  </div>
                )}
                {result.pathReview && (
                  <div className="grid grid-cols-2 gap-3">
                    {[result.pathReview.criticalPath, result.pathReview.longestPath].filter(Boolean).map((p: any) => {
                      const c = p.status === 'CREDIBLE' ? COLORS.green : p.status === 'REVIEW_REQUIRED' ? COLORS.red : COLORS.amber
                      return (
                        <div key={p.label} className="rounded border p-2" style={{ borderColor: `${c}55` }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-extrabold" style={{ color: COLORS.ink }}>{p.label}</span>
                            <span className="text-[8px] font-extrabold uppercase" style={{ color: c }}>{p.status.replace('_', ' ')}</span>
                          </div>
                          <div className="text-[9px] text-slate-600 leading-relaxed mt-1">{neutralReportText(p.note)}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {kind === 'executive' && <>
            <SectionBar>Required Actions</SectionBar>
            <div className="text-[10px] text-slate-500 mb-3">Observations are grouped only by corrective workflow. Grouping does not imply a shared root cause; Full CPM Analysis preserves the detailed activity and relationship trace.</div>
            {([
              { label: 'Corrections required', groups: actionGroups.corrections, color: COLORS.red },
              { label: 'Clarifications needed', groups: actionGroups.clarifications, color: COLORS.amber },
            ] as const).map(section => <div key={section.label} className="mb-5">
              <div className="text-[12px] font-extrabold mb-2" style={{ color: section.color }}>{section.label}</div>
              {section.groups.length === 0 ? <div className="text-[11px] text-slate-500 italic">None detected by the current checks.</div> : section.groups.map(group => <div key={group.id} className="mb-3 rounded-lg border border-slate-200 p-3 print:break-inside-avoid">
                <div className="flex items-start gap-2">
                  <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${section.color}18`, color: section.color }}>{group.id}</span>
                  <div className="flex-1"><div className="text-[12px] font-extrabold" style={{ color: COLORS.ink }}>{group.title}</div><div className="text-[9.5px] text-slate-500 mt-0.5">{group.findings.length} observations · {group.affectedCount} affected activities</div></div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2 text-[10px]">
                  <div><b>Why:</b> {neutralReportText(group.why)}</div><div><b>Action:</b> {neutralReportText(group.action)}</div><div><b>Acceptance:</b> {neutralReportText(group.acceptance)}</div>
                </div>
                <div className="mt-2 text-[9.5px] text-slate-600">{group.findings.map(f => `${f.id} — ${findingTitle(f)}`).join(' · ')}</div>
              </div>)}
            </div>)}
          </>}

          {/* The appendix is an index to the live CPM evidence, not a dump of
              every internal classifier record. Formal actions remain in the
              Action Report and detailed trace remains in Full CPM Analysis. */}
          {kind === 'complete' && <>
          <SectionBar>Consolidated Review Findings</SectionBar>
          <div className="text-[10px] text-slate-500 mb-3">One row represents one consolidated review condition. Open Full CPM Analysis for relationship-level trace evidence.</div>
          {reportFindings.length === 0 ? (
            <div className="text-[12px] text-slate-500 italic py-3">No material findings.</div>
          ) : <table className="w-full text-[10px] mb-5">
            <thead><tr className="border-b-2 border-slate-200 text-left text-[8.5px] uppercase tracking-wide text-slate-500"><th className="py-1.5 pr-2">ID</th><th className="py-1.5 pr-2">Domain</th><th className="py-1.5 pr-2">Consolidated condition</th><th className="py-1.5 pr-2">Requirement</th><th className="py-1.5 text-right">Activities</th></tr></thead>
            <tbody>{reportFindings.map(f => <tr key={f.id} className="border-b border-slate-100 align-top"><td className="py-1.5 pr-2 font-mono font-bold">{f.id}</td><td className="py-1.5 pr-2 font-mono">{f.primaryDomain}</td><td className="py-1.5 pr-2 font-semibold text-slate-800">{findingTitle(f)}</td><td className="py-1.5 pr-2 text-slate-500">{f.ruleStrength}{f.criticalGate ? ' · GATE' : ''}</td><td className="py-1.5 text-right font-mono">{f.affectedActivities.length}</td></tr>)}</tbody>
          </table>}
          </>}

          {/* footer */}
          <div className="flex items-center justify-between pt-3 mt-4 border-t-2 text-[10px] text-slate-400" style={{ borderColor: COLORS.ink }}>
            <span>Prepared from the selected P6 schedule and recorded project basis. Advisory; the schedule of record and the authorized reviewer govern. Score is provisional pending calibration.</span>
            <span className="font-mono">{reportNo}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-1">{label}</div>
      <div className={`text-[12px] font-semibold ${mono ? 'font-mono' : ''}`} style={{ color: COLORS.ink }}>{value}</div>
    </div>
  )
}
function SectionBar({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-extrabold uppercase tracking-wide text-white px-3 py-1.5 rounded mb-3 mt-4" style={{ background: COLORS.ink }}>{children}</div>
}
function Memo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1.5">
      <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-[11px] text-slate-700 leading-relaxed">{children}</div>
    </div>
  )
}

function Shell({ children, project }: { children: React.ReactNode; project?: any }) {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0 no-print">
        <Link href="/dashboard" className="text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap">
          ← Back to Overview
        </Link>
        <div className="h-6 border-l border-slate-200" />
        <div>
          <span className="font-bold text-slate-900 text-base">Review Schedule</span>
          <span className="text-slate-400 text-sm ml-2">{project ? `· ${project.name}` : ''}</span>
        </div>
        <span className="ml-auto text-[11px] text-slate-400 italic">Check before you submit · Verify before you approve</span>
      </div>
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="max-w-[1180px] mx-auto">{children}</div>
      </div>
    </div>
  )
}
