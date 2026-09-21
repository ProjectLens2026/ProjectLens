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

import { useEffect, useMemo, useState } from 'react'
import { discoverUSProject, type USProjectDiscoveryResult, type DiscoveryEvidence } from '@/lib/construction/projectDiscovery'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getActiveProject, getActiveVersion, subscribeToProjects, updateVersionApprovalResult } from '@/lib/projectStore'
import { evaluateApprovalReadiness } from '@/lib/approval-readiness/evaluator'
import { printReport } from '@/lib/printReport'
import type { ApprovalReadinessResult, ApprovalMode, ApprovalFinding } from '@/lib/approval-readiness/types'

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
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reportKind, setReportKind] = useState<null | 'executive' | 'complete'>(null)
  const [activeTab, setActiveTab] = useState<'actions' | 'evidence'>('actions')
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

      // IMPORTANT: clear old-version UI when the newly selected version has no
      // saved Approval Readiness result. Never let one project's result bleed
      // into another project/version.
      if (v?.approvalResult) {
        setResult(v.approvalResult as ApprovalReadinessResult)
        setMode((v.approvalResult.mode as ApprovalMode) || 'PRE_SUBMISSION')
      } else {
        setResult(null)
        setMode('PRE_SUBMISSION')
      }

      // Close any old finding/report state that belonged to the prior version.
      setExpanded(null)
      setReportKind(null)
      setActiveTab('actions')
      setRunning(false)
      setReady(true)
    }

    syncActiveSelection()
    return subscribeToProjects(syncActiveSelection)
  }, [])

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
      const res = evaluateApprovalReadiness(analysis, { mode, projectType: 'ALL' })
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

      <div className="flex gap-2 mb-4" role="tablist" aria-label="Schedule review views">
        <button role="tab" aria-selected={activeTab === 'actions'} onClick={() => setActiveTab('actions')} className={`rounded-lg border px-5 py-3 text-[13px] font-bold ${activeTab === 'actions' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>Required Actions</button>
        <button role="tab" aria-selected={activeTab === 'evidence'} onClick={() => setActiveTab('evidence')} className={`rounded-lg border px-5 py-3 text-[13px] font-bold ${activeTab === 'evidence' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>Scope &amp; Evidence</button>
        <Link href="/dashboard/lens" className="rounded-lg border border-slate-200 bg-white px-5 py-3 text-[13px] font-bold text-slate-600 hover:bg-slate-50">Schedule Detail</Link>
        <Link href="/dashboard/trace" className="rounded-lg border border-slate-200 bg-white px-5 py-3 text-[13px] font-bold text-slate-600 hover:bg-slate-50">Logic Trace</Link>
      </div>

      {activeTab === 'actions' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 mb-4">
        <div className="text-xs text-slate-600">The action report summarizes what must be corrected or clarified. The full evidence appendix preserves technical detail.</div>
        <div className="flex gap-2">
          <button disabled={!result} onClick={() => setReportKind('executive')} className="text-[11px] font-bold px-3 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: COLORS.ink }}>Action Report</button>
          <button disabled={!result} onClick={() => setReportKind('complete')} className="text-[11px] font-bold px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40">Full Evidence Appendix</button>
        </div>
        {!result && <p className="text-xs text-slate-500">Run the check below to enable reports.</p>}
      </div>}
      {activeTab === 'evidence' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 mb-4">
        <div className="text-xs text-slate-600">The evidence appendix includes discovery, domain results, every finding, affected activities, and available supporting evidence.</div>
        <button disabled={!result} onClick={() => setReportKind('complete')} className="text-[11px] font-bold px-3 py-2 rounded-lg border border-slate-200 disabled:opacity-40">Full Evidence Appendix</button>
      </div>}
      {activeTab === 'evidence' && <ProjectDiscoveryPanel discovery={discovery} />}
      {/* Review purpose + perspective + run */}
      {activeTab === 'actions' && <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4">
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
      </div>}

      {activeTab === 'actions' && !result && !running && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-2xl mb-2">☝️</div>
          <div className="text-[13px] font-bold" style={{ color: COLORS.ink }}>Choose the review purpose and perspective</div>
          <div className="text-[11px] text-slate-500 mt-1">Control Lens will review this selected version and surface what requires attention. The result stays with this version when you leave and return.</div>
        </div>
      )}

      {activeTab === 'actions' && running && !result && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-500">
          Running check…
        </div>
      )}

      {result && (
        <>
          {/* Reviewer-first decision summary. The status leads; the score supports. */}
          {activeTab === 'actions' && <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4 print:break-inside-avoid">
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex-1 min-w-[320px]">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500 mb-1">Control Lens Readiness Status</div>
                <div className="text-[24px] md:text-[28px] font-black leading-tight" style={{ color: readinessColor(result.readinessStatus) }}>
                  {contextualReadinessLabel(result, mode)}
                </div>
                <div className="text-[12px] text-slate-600 leading-relaxed mt-2 max-w-[720px]">
                  {result.readinessReason || 'Control Lens combines schedule logic, sequencing, path credibility and readiness evidence. The authorized reviewer makes the final approval decision.'}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Chip label={`Critical Gates: ${result.criticalGates.passed ? 'PASS' : 'FAIL'}`} color={result.criticalGates.passed ? COLORS.green : COLORS.red} />
                  <Chip label={`Critical: ${result.counts.critical}`} color={result.counts.critical ? COLORS.red : COLORS.slate} />
                  <Chip label={`Major: ${result.counts.major}`} color={result.counts.major ? COLORS.amber : COLORS.slate} />
                  <Chip label={`Minor: ${result.counts.minor}`} color={COLORS.slate} />
                </div>
                {!result.criticalGates.passed && (
                  <div className="mt-2 text-[11px] font-semibold" style={{ color: COLORS.red }}>
                    {result.criticalGates.failed.map(g => `✗ ${g.label}`).join('  ·  ')}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center min-w-[120px]">
                  <div className="text-[9px] uppercase tracking-wide font-extrabold text-slate-500">Readiness Score</div>
                  <div className="font-mono text-[30px] font-extrabold leading-none mt-1" style={{ color: gradeColor(result.grade) }}>
                    {result.totalScore}<span className="text-[13px] text-slate-400">/100</span>
                  </div>
                  <div className="text-[13px] font-extrabold mt-1" style={{ color: gradeColor(result.grade) }}>{result.grade}</div>
                  <div className="text-[8.5px] text-slate-400 mt-1">supporting indicator</div>
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
          {activeTab === 'actions' && (() => {
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
