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
  type ScheduleReviewSnapshot,
} from '@/lib/scheduleReviewSnapshot'
import { printReport } from '@/lib/printReport'
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

function approvalKind(f: ApprovalFinding): 'FINDING' | 'RECOMMENDATION' {
  return f.kind === 'RECOMMENDATION' ? 'RECOMMENDATION' : 'FINDING'
}

// Saved results can still contain the old category-only titles.
function findingTitle(f: ApprovalFinding): string {
  if (!/related conditions?$/.test(f.title)) return f.title
  return f.whatFound || 'Finding description unavailable — run the check again'
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
  return <ul className="mt-2 space-y-2 text-[11px] text-slate-600">
    {evidence.map((e, i) => <li key={i} className="border-l-2 border-slate-200 pl-2 break-words">
      <div>{e.taskCode || e.source}: {e.taskName || e.matchedText}</div>
      {e.wbsPath?.length ? <div>WBS: {e.wbsPath.join(' / ')}</div> : null}
      <div className="text-slate-500">Evidence rule: {e.ruleId}</div>
    </li>)}
    {!evidence.length && <li>No supporting XER evidence listed.</li>}
  </ul>
}

function DiscoveryItem({ expanded, title, children }: { expanded: boolean; title: React.ReactNode; children: React.ReactNode }) {
  // Reports use ordinary content so printing never depends on disclosure state.
  if (expanded) return <div className="py-2"><div className="text-xs font-semibold">{title}</div>{children}</div>
  return <details className="py-1"><summary className="cursor-pointer text-xs font-semibold">{title}</summary>{children}</details>
}

function ProjectDiscoveryPanel({ discovery, expanded = false }: { discovery: USProjectDiscoveryResult | null; expanded?: boolean }) {
  if (!discovery) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 text-sm">Project discovery unavailable. Re-upload the XER to provide activity and WBS evidence.</div>
  const signals = [discovery.archetype, discovery.ownerOverlay, discovery.projectCondition]
  const sections = [
    { title: 'Buildings, levels and areas', items: discovery.locations },
    { title: 'Systems', items: discovery.systems },
    { title: 'Procurement packages', items: discovery.procurementPackages },
    { title: 'Commissioning states', items: discovery.commissioningStates },
    { title: 'Completion targets', items: discovery.completionTargets },
  ]
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
    <h2 className="font-bold text-slate-800">Project Discovery — U.S. scope</h2>
    <p className="text-xs text-slate-600 mt-1 mb-3">Detected from this version’s XER. {expanded ? 'Available supporting evidence is listed below; evidence lists may be sampled by the discovery engine.' : 'Expand an item to inspect its evidence.'} Detection does not establish compliance or readiness and does not change the score.</p>
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
    <h3 className="text-sm font-bold mt-4">Selected reference scaffolds — verify applicability</h3>
    {discovery.applicableScaffolds.map(s => <DiscoveryItem key={s.id} expanded={expanded} title={s.label}><p className="mt-1 text-xs">{s.basis}</p><ul className="list-disc pl-4 mt-2 text-xs">{s.sections.map(x => <li key={x.id}>{x.label}: {x.purpose}</li>)}</ul><DiscoveryEvidenceList evidence={s.evidence} /></DiscoveryItem>)}
    <p className="text-xs text-slate-500 mt-2">{discovery.jurisdictionNote}</p>
    {discovery.unresolved.length > 0 && <div className="mt-3 text-xs text-amber-800"><b>Unresolved discovery questions</b><ul className="list-disc pl-4">{discovery.unresolved.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
  </section>
}

function ActionGroupCard({ group, mode }: { group: ActionGroup; mode: ApprovalMode }) {
  const color = group.disposition === 'CORRECTION' ? COLORS.red : COLORS.amber
  return <details className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: `${color}55` }}>
    <summary className="cursor-pointer list-none p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="text-[9px] font-extrabold uppercase px-2 py-1 rounded" style={{ background: `${color}18`, color }}>{group.disposition === 'CORRECTION' ? 'Correction required' : 'Clarification needed'}</span>
        <div className="flex-1 min-w-[240px]">
          <div className="text-[14px] font-extrabold" style={{ color: COLORS.ink }}>{group.title}</div>
          <div className="text-[11px] text-slate-500 mt-1">{group.findings.length} observation{group.findings.length === 1 ? '' : 's'} · {group.affectedCount} affected activit{group.affectedCount === 1 ? 'y' : 'ies'}</div>
        </div>
        <span className="text-[10px] text-slate-400">View action and evidence ▸</span>
      </div>
    </summary>
    <div className="border-t border-slate-100 p-4 text-[12px] text-slate-700">
      <MemoSection label="Why this matters">{group.why}</MemoSection>
      <MemoSection label={mode === 'PRE_SUBMISSION' ? 'What to fix before submission' : 'Reviewer request'}>{group.action}</MemoSection>
      <MemoSection label="Acceptance check">{group.acceptance}</MemoSection>
      <p className="text-[10px] text-slate-500 mt-3">Grouped for corrective workflow only. Each observation retains its own evidence and does not imply a shared root cause.</p>
      <div className="mt-3 space-y-2">
        {group.findings.map(f => <div key={f.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className="flex gap-2 items-start">
            <span className="font-mono text-[9px] font-bold">{f.id}</span>
            <div className="flex-1"><b>{findingTitle(f)}</b><div className="text-[10px] text-slate-500 mt-1">{f.primaryDomain} · {f.ruleStrength} · score −{f.scoreDeduction}</div></div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-600">
            {f.affectedActivities.slice(0, 6).map(a => <Link key={a.id} href={`/dashboard/trace?task=${encodeURIComponent(a.id)}`} className="text-blue-600 font-semibold">{a.code} · Trace ›</Link>)}
            {f.affectedActivities.length > 6 && <span>+{f.affectedActivities.length - 6} more in Scope &amp; Evidence</span>}
          </div>
        </div>)}
      </div>
    </div>
  </details>
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
  const [expanded, setExpanded] = useState<string | null>(null)
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
      } catch (error) {
        console.error('[approval] shared review snapshot failed:', error)
        setReviewSnapshot(null)
        setResult((v?.approvalResult as ApprovalReadinessResult) || null)
      }

      // Close any old finding/report state that belonged to the prior version.
      setExpanded(null)
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
    return narrative
  }, [analysis, project, result, reviewData.comments, reviewData.narratives, reviewPurpose, version])

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
            Re-upload this version's XER, then run the check.
          </div>
        </div>
      </Shell>
    )
  }

  // When a report is requested, render the print-optimized document instead
  // of the interactive workspace. Built from the same structured result.
  if (reportKind && result) {
    return <ApprovalReport result={result} mode={mode} kind={reportKind} project={project} discovery={discovery} onBack={() => setReportKind(null)} />
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
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-right">
            <div className="text-[9px] font-extrabold uppercase tracking-wide text-blue-600">Review level</div>
            <div className="text-[11px] font-bold text-blue-900 mt-0.5">Version-specific review</div>
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
        <Link href="/dashboard/lens" role="tab" aria-selected="false"
          className="whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-[12px] font-bold text-slate-500 hover:border-blue-300 hover:text-blue-600">
          Full CPM Analysis ↗
        </Link>
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

      {activeTab === 'comments' && reviewSnapshot && <section className="rounded-2xl border border-blue-200 bg-white p-5 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-blue-600">Unified CPM Review</div>
            <h2 className="text-[15px] font-extrabold text-slate-900 mt-1">Full Analysis and Review Schedule now use the same version evidence</h2>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[700px]">Technical signals remain visible as CPM evidence. Control Lens consolidates related activity-level findings into reviewer concerns so the register does not create one owner comment for every affected activity.</p>
          </div>
          <Link href="/dashboard/lens" className="rounded-lg bg-slate-900 px-4 py-2 text-[11px] font-bold text-white">Open Full CPM Analysis →</Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          {[
            ['CPM signal groups', reviewSnapshot.reconciliation.technicalSignalGroups],
            ['Activity-level occurrences', reviewSnapshot.reconciliation.technicalOccurrences],
            ['Consolidated concerns', snapshotConcernGroups],
            ['Blocking findings', reviewSnapshot.reconciliation.blockingFindings],
          ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-[20px] font-black text-slate-900 mt-1">{value}</div>
          </div>)}
        </div>

        {reviewSnapshot.technicalSignals.length > 0 && <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
          {reviewSnapshot.technicalSignals.map(signal => <div key={signal.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 last:border-b-0 px-3 py-2.5">
            <div>
              <div className="text-[11px] font-bold text-slate-800">{signal.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{signal.summary}</div>
              <div className="text-[9px] text-blue-600 mt-1">Evidence: {signal.evidenceLocation}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[14px] font-black text-slate-900">{signal.count}</div>
              <div className={`text-[8px] font-bold uppercase ${signal.treatment === 'REVIEW_REQUIRED' ? 'text-amber-700' : 'text-slate-400'}`}>{signal.treatment.replaceAll('_', ' ')}</div>
            </div>
          </div>)}
        </div>}

        {!reviewSnapshot.decisionIntegrity.internallyConsistent && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] font-semibold text-red-800">{reviewSnapshot.decisionIntegrity.explanation}</div>}
      </section>}

      {activeTab === 'evidence' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 mb-4">
        <div className="text-xs text-slate-600">The evidence appendix preserves discovery, domains, findings, affected activities and schedule traceability.</div>
        <div className="flex gap-2">
          <Link href="/dashboard/lens" className="text-[11px] font-bold px-3 py-2 rounded-lg border border-slate-200">Schedule Detail</Link>
          <Link href="/dashboard/trace" className="text-[11px] font-bold px-3 py-2 rounded-lg border border-slate-200">Logic Trace</Link>
          <button disabled={!result} onClick={() => setReportKind('complete')} className="text-[11px] font-bold px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40">Full Evidence Appendix</button>
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
          {/* Reviewer-first decision summary. The status leads; the score supports. */}
          {activeTab === 'comments' && <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4 print:break-inside-avoid">
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex-1 min-w-[320px]">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500 mb-1">Control Lens Readiness Status</div>
                <div className="text-[24px] md:text-[28px] font-black leading-tight" style={{ color: workflowBlocking ? COLORS.red : readinessColor(result.readinessStatus) }}>
                  {workflowBlocking ? 'NOT READY — OPEN REVIEW COMMENTS' : contextualReadinessLabel(result, mode)}
                </div>
                <div className="text-[12px] text-slate-600 leading-relaxed mt-2 max-w-[720px]">
                  {workflowBlocking
                    ? `${reviewCommentSummary.blocking} issued approval-blocking comment${reviewCommentSummary.blocking === 1 ? '' : 's'} remain unresolved. Technical score cannot override the review workflow.`
                    : result.readinessReason || 'Control Lens combines schedule logic, sequencing, path credibility and readiness evidence. The authorized reviewer makes the final approval decision.'}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Chip label={`Critical Gates: ${result.criticalGates.passed ? 'PASS' : 'FAIL'}`} color={result.criticalGates.passed ? COLORS.green : COLORS.red} />
                  <Chip label={`Critical: ${result.counts.critical}`} color={result.counts.critical ? COLORS.red : COLORS.slate} />
                  <Chip label={`Major: ${result.counts.major}`} color={result.counts.major ? COLORS.amber : COLORS.slate} />
                  <Chip label={`Minor: ${result.counts.minor}`} color={COLORS.slate} />
                  {workflowBlocking && <Chip label={`Open Review Blockers: ${reviewCommentSummary.blocking}`} color={COLORS.red} />}
                </div>
                {!result.criticalGates.passed && (
                  <div className="mt-2 text-[11px] font-semibold" style={{ color: COLORS.red }}>
                    {result.criticalGates.failed.map(g => `✗ ${g.label}`).join('  ·  ')}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center min-w-[120px]">
                  <div className="text-[9px] uppercase tracking-wide font-extrabold text-slate-500">Technical Score</div>
                  <div className="font-mono text-[30px] font-extrabold leading-none mt-1" style={{ color: gradeColor(result.grade) }}>
                    {result.totalScore}<span className="text-[13px] text-slate-400">/100</span>
                  </div>
                  <div className="text-[13px] font-extrabold mt-1" style={{ color: gradeColor(result.grade) }}>{result.grade}</div>
                  <div className="text-[8.5px] text-slate-400 mt-1">does not override open comments</div>
                </div>
              </div>
            </div>
          </div>}

          {activeTab === 'evidence' && <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 mb-4 text-[11px] text-slate-600 leading-relaxed">
            <b className="text-slate-800">Technical evidence view.</b> Discovery describes the submitted XER and helps organize review; it does not establish compliance or approval. The selected reference scaffolds are evidence-led review aids and do not yet alter the approval checks or score.
          </div>}

          {/* What Control Lens understands about the submitted work */}
          {activeTab === 'evidence' && result.projectUnderstanding && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-600 mb-1">Project Understanding / Nature of Work</div>
              <div className="text-[18px] font-black leading-snug" style={{ color: COLORS.ink }}>{result.projectUnderstanding.projectNature}</div>
              <div className="text-[12px] font-semibold text-slate-600 mt-1">{result.projectUnderstanding.deliveryNature.join(' → ')}</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500">Completion Target</div>
                  <div className="text-[12px] font-bold mt-1" style={{ color: COLORS.ink }}>{result.projectUnderstanding.completionTarget?.code || '—'} · {result.projectUnderstanding.completionTarget?.name || 'Not resolved'}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{shortDate(result.projectUnderstanding.completionTarget?.finish)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500">Detected Areas</div>
                  <div className="text-[11px] font-semibold text-slate-700 mt-1 leading-relaxed">{result.projectUnderstanding.areas.join(' · ') || '—'}</div>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500">Detected Systems</div>
                  <div className="text-[11px] font-semibold text-slate-700 mt-1 leading-relaxed">{result.projectUnderstanding.systems.join(' · ') || '—'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Path credibility is now a first-class approval question. */}
          {activeTab === 'evidence' && result.pathReview && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 mb-1">Control Path Credibility</div>
              <div className="text-[11px] text-slate-500 mb-3">Control Lens evaluates whether the submitted XER represents the work that should actually control completion. This is engineering schedule review — not a silent P6 CPM recalculation.</div>
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

          {/* Contractor-facing disposition groups. Evidence stays attached to each observation. */}
          {activeTab === 'evidence' && (() => {
            const { corrections, clarifications } = buildActionGroups(result)
            const recommendations = result.findings.filter(f => approvalKind(f) === 'RECOMMENDATION')
            return <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">Review Disposition</div>
                    <div className="text-[11px] text-slate-500 mt-1">Work through these grouped actions instead of reviewing every activity one by one. Expand a group only when you need the supporting observations and trace links.</div>
                  </div>
                  <div className="flex gap-2">
                    <Chip label={`${corrections.length} correction group${corrections.length === 1 ? '' : 's'}`} color={corrections.length ? COLORS.red : COLORS.green} />
                    <Chip label={`${clarifications.length} clarification group${clarifications.length === 1 ? '' : 's'}`} color={clarifications.length ? COLORS.amber : COLORS.green} />
                  </div>
                </div>
                {result.counts.major > 0 && <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-[10px] text-amber-900">The current score and readiness wording are provisional pending calibration. Use the dispositions and underlying evidence—not the numeric score alone—for the authorized review decision.</p>}
              </div>

              <section className="rounded-2xl border border-red-200 bg-red-50/20 p-5">
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div><h2 className="text-[13px] font-extrabold text-red-800">Corrections required</h2><p className="text-[11px] text-slate-500">Required or gate-related conditions to resolve before disposition.</p></div>
                  <span className="text-[11px] font-bold text-red-700">{corrections.reduce((n, g) => n + g.findings.length, 0)} observations</span>
                </div>
                {corrections.length ? <div className="space-y-2">{corrections.map(g => <ActionGroupCard key={g.id} group={g} mode={mode} />)}</div> : <p className="text-[12px] text-slate-500 italic">No correction groups detected by the current checks.</p>}
              </section>

              <section className="rounded-2xl border border-amber-200 bg-amber-50/20 p-5">
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div><h2 className="text-[13px] font-extrabold text-amber-800">Clarifications needed</h2><p className="text-[11px] text-slate-500">Verify the evidence, explain legitimate conditions, or correct the schedule where appropriate.</p></div>
                  <span className="text-[11px] font-bold text-amber-700">{clarifications.reduce((n, g) => n + g.findings.length, 0)} observations</span>
                </div>
                {clarifications.length ? <div className="space-y-2">{clarifications.map(g => <ActionGroupCard key={g.id} group={g} mode={mode} />)}</div> : <p className="text-[12px] text-slate-500 italic">No clarification groups detected by the current checks.</p>}
              </section>

              {recommendations.length > 0 && <section className="rounded-2xl border border-blue-200 bg-blue-50/20 p-5">
                <h2 className="text-[13px] font-extrabold text-blue-800">Optional Control Lens recommendations</h2>
                <p className="text-[11px] text-slate-500 mt-1 mb-3">{recommendations.length} non-scoring suggestion{recommendations.length === 1 ? '' : 's'}; not contractual unless governing requirements say otherwise.</p>
                <div className="space-y-2">{recommendations.map(f => <FindingRow key={f.id} f={f} mode={mode} open={expanded === f.id} onToggle={() => setExpanded(expanded === f.id ? null : f.id)} />)}</div>
              </section>}
            </div>
          })()}

          {/* Domain scores */}
          {activeTab === 'evidence' && <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 mb-3">Approval Domains</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
              {result.domains.map(d => {
                const pctFull = d.maxPoints > 0 ? (d.score / d.maxPoints) * 100 : 100
                const c = pctFull >= 90 ? COLORS.green : pctFull >= 70 ? COLORS.amber : COLORS.red
                return (
                  <div key={d.domain} className="py-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-semibold text-slate-600 truncate pr-2">{d.domain} · {d.label}</span>
                      <span className="font-mono text-[11px] font-bold" style={{ color: c }}>{d.score}/{d.maxPoints}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded mt-1 overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${pctFull}%`, background: c }} />
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">
                      {d.findingCount} finding{d.findingCount === 1 ? '' : 's'}
                      {(d.recommendationCount || 0) > 0 ? ` · ${d.recommendationCount} recommendation${d.recommendationCount === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>}

          {/* Findings and non-scoring Control Lens recommendations */}
          {activeTab === 'evidence' && (() => {
            const scoringFindings = result.findings.filter(f => approvalKind(f) === 'FINDING')
            const recommendations = result.findings.filter(f => approvalKind(f) === 'RECOMMENDATION')
            return (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 mb-1">Detailed Review</div>
                  <div className="text-[11px] text-slate-400 mb-3">{scoringFindings.length} consolidated finding{scoringFindings.length === 1 ? '' : 's'} · expand only when evidence is needed</div>
                  {scoringFindings.length === 0 ? (
                    <div className="text-[12px] text-slate-500 italic py-4">No material concern detected by the current checks. Reviewer confirmation still governs.</div>
                  ) : (
                    <div className="space-y-2">
                      {scoringFindings.map(f => (
                        <FindingRow key={f.id} f={f} mode={mode} open={expanded === f.id} onToggle={() => setExpanded(expanded === f.id ? null : f.id)} />
                      ))}
                    </div>
                  )}
                </div>

                {recommendations.length > 0 && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 mb-1">Control Lens Recommendations</div>
                    <div className="text-[11px] text-slate-400 mb-3">{recommendations.length} non-scoring schedule-control recommendation{recommendations.length === 1 ? '' : 's'} · not contractual unless governing requirements say otherwise</div>
                    <div className="space-y-2">
                      {recommendations.map(f => (
                        <FindingRow key={f.id} f={f} mode={mode} open={expanded === f.id} onToggle={() => setExpanded(expanded === f.id ? null : f.id)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
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
              {comment.affectedActivities.length > 0 && <div className="mt-3 text-[10px] text-slate-600"><b>Affected activities:</b> {comment.affectedActivities.slice(0, 8).map(activity => activity.activityCode || activity.activityId).join(' · ')}{comment.affectedActivities.length > 8 ? ` · +${comment.affectedActivities.length - 8} more` : ''}</div>}

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
      <div><h2 className="text-[15px] font-extrabold text-slate-900">Schedule Update Narrative</h2><p className="text-[11px] text-slate-500 mt-1">Objective XER facts are protected. The scheduler provides cause, responsibility and corrective action.</p></div>
      <div className="flex gap-2"><button onClick={() => printReport('schedule-narrative-print-area', { title: `${projectName} — Schedule Narrative`, footerLabel: versionLabel })} className="rounded-lg border border-slate-300 px-3 py-2 text-[11px] font-bold text-slate-700">Print / Save PDF</button><button disabled={disabled} onClick={() => onSave(draft, false)} className="rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50">Save narrative</button></div>
    </div>
    <div className="grid lg:grid-cols-[250px_1fr] gap-4">
      <div className="rounded-lg border border-slate-200 p-2 h-fit">
        {draft.sections.map((item, index) => <button key={item.key} onClick={() => setSelectedKey(item.key)} className={`w-full rounded-md px-3 py-2.5 text-left text-[11px] flex items-start justify-between gap-2 ${item.key === section.key ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}><span>{index + 1}. {item.title}</span><span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${item.state === 'SCHEDULER_UPDATED' || item.state === 'CURRENT' ? 'bg-green-500' : item.state === 'NO_LONGER_SUPPORTED' ? 'bg-red-500' : item.automatedFacts.length ? 'bg-blue-500' : 'bg-amber-500'}`} /></button>)}
      </div>
      <div className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 mb-3"><div><h3 className="text-[14px] font-extrabold text-slate-900">{section.title}</h3><p className="text-[10px] text-slate-500 mt-1">{section.state === 'CARRIED_CONFIRMATION_REQUIRED' ? 'Carried from the previous version — confirmation required.' : section.state.replaceAll('_', ' ').toLowerCase()}</p></div>{section.state === 'CARRIED_CONFIRMATION_REQUIRED' && <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">Update required</span>}</div>
        {section.automatedFacts.length > 0 && <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 mb-3"><div className="text-[9px] font-bold uppercase tracking-wide text-blue-600 mb-2">Updated automatically from the schedule</div><div className="grid md:grid-cols-2 gap-2">{section.automatedFacts.map(fact => <div key={fact.id} className="text-[10px] text-slate-600"><b className="text-slate-800">{fact.label}:</b> {fact.currentValue}{fact.priorValue && fact.priorValue !== '—' ? <span className="text-slate-400"> · prior {fact.priorValue}</span> : null}</div>)}</div></div>}
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Scheduler narrative</label>
        <textarea value={section.schedulerText} onChange={event => updateText(event.target.value)} className="min-h-[260px] w-full rounded-lg border border-slate-300 p-3 text-[12px] leading-relaxed outline-none focus:border-blue-500" placeholder="Explain what changed, why it changed, the responsible party, mitigation and supporting reference. Control Lens does not infer causation from the XER." />
        <div className="text-[10px] text-slate-500 mt-2">The XER supports dates and logic changes. Causation and responsibility remain scheduler-entered statements.</div>
      </div>
    </div>
    <div id="schedule-narrative-print-area" className="fixed -left-[10000px] top-0 w-[760px] bg-white p-6" aria-hidden="true">
      <div className="border-b-2 border-slate-900 pb-3 mb-4"><div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Control Lens Schedule Narrative</div><div className="text-[20px] font-black text-slate-900 mt-1">{projectName}</div><div className="text-[11px] text-slate-500 mt-1">{versionLabel} · {narrative.reviewPurpose.replaceAll('_', ' ')}</div></div>
      {draft.sections.map((item, index) => <section key={item.key} className="mb-5 break-inside-avoid">
        <h2 className="border-b border-slate-300 pb-1 text-[13px] font-extrabold text-slate-900">{index + 1}. {item.title}</h2>
        {item.automatedFacts.length > 0 && <div className="mt-2 space-y-1">{item.automatedFacts.map(fact => <div key={fact.id} className="text-[10px] text-slate-700"><b>{fact.label}:</b> {fact.currentValue}{fact.priorValue && fact.priorValue !== '—' ? ` · Prior: ${fact.priorValue}` : ''}</div>)}</div>}
        <div className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-800">{item.schedulerText || 'No scheduler narrative entered for this section.'}</div>
      </section>)}
      <div className="mt-6 border-t border-slate-300 pt-2 text-[9px] text-slate-500">Schedule facts are generated from the selected XER and project basis. Causation, responsibility and mitigation statements are scheduler-entered.</div>
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

// ---------------------------------------------------------------------------
function FindingRow({ f, mode, open, onToggle }: { f: ApprovalFinding; mode: ApprovalMode; open: boolean; onToggle: () => void }) {
  const isRecommendation = approvalKind(f) === 'RECOMMENDATION'
  const sevColor = isRecommendation ? COLORS.blue : f.criticalGate || f.severity >= 5 ? COLORS.red : f.severity >= 3 ? COLORS.amber : COLORS.slate
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50">
        <span className="font-mono text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: COLORS.ink }}>{f.id}</span>
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${sevColor}22`, color: sevColor }}>{f.primaryDomain}</span>
        <span className="text-[13px] font-extrabold flex-1 leading-snug" style={{ color: COLORS.ink }}>{findingTitle(f)}</span>
        {isRecommendation ? (
          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Recommendation · no score impact</span>
        ) : (
          <>
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{f.ruleStrength}</span>
            <span className="font-mono text-[9px] text-slate-400">score −{f.scoreDeduction}</span>
          </>
        )}
        <span className="text-slate-400 text-[11px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-slate-100 bg-white">
          <MemoSection label="What Control Lens Found">{f.whatFound}</MemoSection>
          <MemoSection label="Why This Matters">{f.whyItMatters}</MemoSection>
          <MemoSection label={mode === 'PRE_SUBMISSION' ? 'Pre-Submission Note' : 'Reviewer Check'}>
            {mode === 'PRE_SUBMISSION' ? f.preSubmissionNote : f.reviewerCheck}
          </MemoSection>
          <MemoSection label="Reference">{f.referenceRequirement}</MemoSection>
          <MemoSection label="Activity classification and source evidence">
            <p className="text-slate-500 mb-2">Inferred labels require review. An unidentified system is not evidence of missing work.</p>
            {(f.evidence || []).map((e, i) => <div key={i} className="border rounded p-2 mb-2">
              <div className="font-semibold">{e.activityCode} — {e.activityName}</div>
              <div>{e.headline}</div>
              <div>Discipline: {discoveryLabel(e.discipline)} · System: {discoveryLabel(e.system)}</div>
              <div>WBS: {(Array.isArray(e.wbsPath) ? e.wbsPath.join(' / ') : e.wbsPath) || 'Not supplied'}</div>
              {e.predecessor && <div>Predecessor: {e.predecessor.code} — {e.predecessor.name} · {e.predecessor.relationship} · lag {e.predecessor.lagHours ?? 'not supplied'} hours</div>}
            </div>)}
          </MemoSection>

          <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500 mb-1 mt-3">Affected activities</div>
          <div className="rounded border border-slate-100">
            {f.affectedActivities.slice(0, 12).map((a, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1 border-b border-slate-50 last:border-0 text-[11px]">
                <span className="font-mono font-bold flex-shrink-0" style={{ color: COLORS.ink }}>{a.code}</span>
                <span className="text-slate-600 truncate flex-1">{a.name}</span>
                {a.note && <span className="text-[9px] text-slate-400">{a.note}</span>}
                <Link href={`/dashboard/trace?task=${encodeURIComponent(a.id)}`} className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ color: COLORS.blue }}>
                  Trace Back ›
                </Link>
              </div>
            ))}
            {f.affectedActivities.length > 12 && (
              <div className="px-2 py-1 text-[10px] text-slate-400 italic">+{f.affectedActivities.length - 12} more</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MemoSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500 mb-0.5">{label}</div>
      <div className="text-[12px] text-slate-700 leading-relaxed">{children}</div>
    </div>
  )
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

function Chip({ label, color }: { label: string; color: string }) {
  return <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: `${color}18`, color }}>{label}</span>
}

// =============================================================================
// ApprovalReport — print-optimized document (Executive or Complete)
// Built from the structured ApprovalReadinessResult, not scraped from the DOM.
// Save-as-PDF uses the browser print dialog; the dashboard layout hides the
// sidebar on print, and the toolbar below is print-hidden.
// =============================================================================
function ApprovalReport({ result, mode, kind, project, discovery, onBack }: {
  result: ApprovalReadinessResult
  mode: ApprovalMode
  kind: 'executive' | 'complete'
  project: any
  discovery: USProjectDiscoveryResult | null
  onBack: () => void
}) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
  const code = (project?.projectId || project?.name || 'PRJ').toString().replace(/\s+/g, '').toUpperCase().slice(0, 14)
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const reportNo = `CL-AR-${code}-${kind === 'executive' ? 'EXEC' : 'FULL'}-${ymd}`
  const voice = mode === 'PRE_SUBMISSION' ? 'Pre-Submission Check (Contractor)' : 'Reviewer Check (Owner / PM)'
  const gc = gradeColor(result.grade)

  const reportTitle = kind === 'executive'
    ? (mode === 'REVIEWER' ? 'Owner Action Report' : 'Contractor Action Report')
    : 'Schedule Review Evidence Appendix'
  const docKind = kind === 'executive' ? 'Required Corrections and Clarifications' : 'Complete Scope, Findings and Technical Evidence'

  const reportFindings = result.findings.filter(f => approvalKind(f) === 'FINDING')
  const reportRecommendations = result.findings.filter(f => approvalKind(f) === 'RECOMMENDATION')
  const actionGroups = buildActionGroups(result)

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
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-[3px] mt-1">
                  <span className="block h-[5px] rounded-[1px]" style={{ width: 22, background: COLORS.blue }} />
                  <span className="block h-[5px] rounded-[1px]" style={{ width: 30, background: COLORS.red }} />
                  <span className="block h-[5px] rounded-[1px]" style={{ width: 18, background: COLORS.green }} />
                  <span className="block h-[5px] rounded-[1px]" style={{ width: 25, background: COLORS.slate }} />
                </div>
                <div>
                  <div className="text-[18px] font-extrabold leading-tight" style={{ color: COLORS.ink }}>
                    CONTROL<span style={{ color: COLORS.blue }}>LENS</span>
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 mt-0.5">
                    Approval Readiness
                  </div>
                </div>
              </div>
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
          {kind === 'complete' && <ProjectDiscoveryPanel discovery={discovery} expanded />}
          <div className="grid grid-cols-3 gap-6 mb-5">
            <Info label="Project" value={project?.name || '—'} />
            <Info label="Project Code" value={project?.projectId || '—'} mono />
            <Info label="Review Mode" value={voice} />
          </div>

          {/* ── Executive summary block (both reports) ───────────────── */}
          <SectionBar>Executive Summary</SectionBar>
          <div className="flex items-start gap-6 mb-4 print:break-inside-avoid">
            <div className="flex-1">
              <div className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-500 mb-1">Control Lens Readiness Status</div>
              <div className="text-[18px] font-black uppercase tracking-wide mb-1" style={{ color: readinessColor(result.readinessStatus) }}>
                {result.readinessLabel || result.recommendation}
              </div>
              <div className="text-[10.5px] text-slate-600 leading-relaxed mb-2">{result.readinessReason || result.recommendation}</div>
              <div className="text-[10.5px] text-slate-600">
                Critical Gates: <b style={{ color: result.criticalGates.passed ? COLORS.green : COLORS.red }}>{result.criticalGates.passed ? 'PASS' : 'FAIL'}</b>
                {'  ·  '}Critical {result.counts.critical} · Major {result.counts.major} · Minor {result.counts.minor}
                {reportRecommendations.length > 0 ? ` · Recommendations ${reportRecommendations.length}` : ''}
              </div>
              {!result.criticalGates.passed && (
                <div className="text-[10px] mt-1 font-semibold" style={{ color: COLORS.red }}>
                  {result.criticalGates.failed.map(g => `✗ ${g.label} — ${g.reason}`).join('  ·  ')}
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
                          <div className="text-[9px] text-slate-600 leading-relaxed mt-1">{p.note}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* domain table */}
          {kind === 'complete' && <>
          <SectionBar>Approval Domains</SectionBar>
          <table className="w-full text-[11px] mb-5 print:break-inside-avoid">
            <thead>
              <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
                <th className="py-1.5 pr-2">Domain</th><th className="py-1.5 pr-2 text-right">Score</th>
                <th className="py-1.5 pr-2 text-right">Max</th><th className="py-1.5 pr-2 text-right">Findings</th><th className="py-1.5 pr-2 text-right">Recommendations</th>
              </tr>
            </thead>
            <tbody>
              {result.domains.map(d => {
                const pf = d.maxPoints > 0 ? (d.score / d.maxPoints) * 100 : 100
                const c = pf >= 90 ? COLORS.green : pf >= 70 ? COLORS.amber : COLORS.red
                return (
                  <tr key={d.domain} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2"><span className="font-mono font-bold" style={{ color: COLORS.ink }}>{d.domain}</span> {d.label}</td>
                    <td className="py-1.5 pr-2 text-right font-mono font-bold" style={{ color: c }}>{d.score}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-slate-500">{d.maxPoints}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-slate-500">{d.findingCount}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-blue-500">{d.recommendationCount || 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </>}

          {kind === 'executive' && <>
            <SectionBar>Required Actions</SectionBar>
            <div className="text-[10px] text-slate-500 mb-3">Observations are grouped only by corrective workflow. Grouping does not imply a shared root cause; the complete appendix preserves each observation’s evidence.</div>
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
                  <div><b>Why:</b> {group.why}</div><div><b>Action:</b> {group.action}</div><div><b>Acceptance:</b> {group.acceptance}</div>
                </div>
                <div className="mt-2 text-[9.5px] text-slate-600">{group.findings.map(f => `${f.id} — ${findingTitle(f)}`).join(' · ')}</div>
              </div>)}
            </div>)}
          </>}

          {/* ── Complete findings and technical evidence ─────────────── */}
          {kind === 'complete' && <>
          <SectionBar>All Findings — Detail &amp; Evidence</SectionBar>
          {reportFindings.length === 0 ? (
            <div className="text-[12px] text-slate-500 italic py-3">No material findings.</div>
          ) : reportFindings.map(f => (
            <div key={f.id} className="mb-4 border border-slate-200 rounded-lg overflow-hidden print:break-inside-avoid">
              <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2" style={{ background: '#f8fafc' }}>
                <span className="font-mono text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: COLORS.ink }}>{f.id}</span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{f.primaryDomain}</span>
                <span className="text-[12px] font-extrabold flex-1" style={{ color: COLORS.ink }}>{findingTitle(f)}</span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{f.ruleStrength} · sev {f.severity} · −{f.scoreDeduction}</span>
              </div>
              <div className="px-4 py-3 text-[11px]">
                <Memo label="What Control Lens Found">{f.whatFound}</Memo>
                <Memo label="Why This Matters">{f.whyItMatters}</Memo>
                <Memo label={mode === 'PRE_SUBMISSION' ? 'Pre-Submission Note' : 'Reviewer Check'}>
                  {mode === 'PRE_SUBMISSION' ? f.preSubmissionNote : f.reviewerCheck}
                </Memo>
                <Memo label="Reference">{f.referenceRequirement}</Memo>
                {f.affectedActivities.length > 0 && (
                  <>
                    <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500 mb-1 mt-2">Affected activities</div>
                    <table className="w-full text-[10.5px]">
                      <tbody>
                        {f.affectedActivities.map((a, i) => (
                          <tr key={i} className="border-b border-slate-50 last:border-0">
                            <td className="py-1 pr-2 font-mono font-bold w-[22%]" style={{ color: COLORS.ink }}>{a.code}</td>
                            <td className="py-1 pr-2 text-slate-600">{a.name}</td>
                            <td className="py-1 text-slate-400 text-[9px] w-[24%]">{a.note || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>
          ))}
          </>}

          {reportRecommendations.length > 0 && (
            <>
              <SectionBar>Control Lens Recommendations</SectionBar>
              <div className="text-[10px] text-slate-500 mb-3">Non-scoring schedule-control suggestions. They are not contractual requirements unless the governing contract or owner profile requires them.</div>
              {reportRecommendations.map(f => (
                <div key={f.id} className="mb-4 border border-blue-200 rounded-lg overflow-hidden print:break-inside-avoid">
                  <div className="px-3 py-2 border-b border-blue-100 flex items-center gap-2 bg-blue-50/50">
                    <span className="font-mono text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: COLORS.blue }}>{f.id}</span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{f.primaryDomain}</span>
                    <span className="text-[12px] font-extrabold flex-1" style={{ color: COLORS.ink }}>{findingTitle(f)}</span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">Recommendation · no score impact</span>
                  </div>
                  <div className="px-4 py-3 text-[11px]">
                    <Memo label="What Control Lens Found">{f.whatFound}</Memo>
                    <Memo label="Why This Helps">{f.whyItMatters}</Memo>
                    <Memo label={mode === 'PRE_SUBMISSION' ? 'Pre-Submission Note' : 'Reviewer Check'}>
                      {mode === 'PRE_SUBMISSION' ? f.preSubmissionNote : f.reviewerCheck}
                    </Memo>
                    {kind === 'complete' && <Memo label="Reference / Suggested Action">{f.referenceRequirement}</Memo>}
                    {kind === 'complete' && f.affectedActivities.length > 0 && (
                      <>
                        <div className="text-[9px] font-extrabold uppercase tracking-wide text-slate-500 mb-1 mt-2">Supporting XER evidence</div>
                        <table className="w-full text-[10.5px]">
                          <tbody>
                            {f.affectedActivities.map((a, i) => (
                              <tr key={i} className="border-b border-slate-50 last:border-0">
                                <td className="py-1 pr-2 font-mono font-bold w-[22%]" style={{ color: COLORS.ink }}>{a.code}</td>
                                <td className="py-1 pr-2 text-slate-600">{a.name}</td>
                                <td className="py-1 text-slate-400 text-[9px] w-[24%]">{a.note || ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* footer */}
          <div className="flex items-center justify-between pt-3 mt-4 border-t-2 text-[10px] text-slate-400" style={{ borderColor: COLORS.ink }}>
            <span>Generated by <b style={{ color: COLORS.ink }}>ControlLens</b> — Approval Readiness. Advisory; the P6 schedule of record and the authorized reviewer govern. Score is provisional pending calibration.</span>
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
        <div className="max-w-[960px] mx-auto">{children}</div>
      </div>
    </div>
  )
}
