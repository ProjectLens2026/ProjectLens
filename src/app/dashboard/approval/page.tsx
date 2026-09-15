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

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion, updateVersionApprovalResult } from '@/lib/projectStore'
import { evaluateApprovalReadiness } from '@/lib/approval-readiness/evaluator'
import type { ApprovalReadinessResult, ApprovalMode, ApprovalFinding } from '@/lib/approval-readiness/types'

const COLORS = {
  ink: '#13202e', blue: '#2563eb', red: '#dc2626', amber: '#f59e0b', green: '#16a34a', slate: '#1f2937',
}

function gradeColor(grade: string): string {
  if (grade === 'A' || grade === 'A-') return COLORS.green
  if (grade === 'B+' || grade === 'B') return COLORS.amber
  return COLORS.red
}

export default function ApprovalReadinessPage() {
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<ApprovalMode>('PRE_SUBMISSION')
  const [result, setResult] = useState<ApprovalReadinessResult | null>(null)
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Load project/version, and REHYDRATE a previously-run result so it persists
  // across navigation (stored on the version via projectStore).
  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    const v = getActiveVersion(p)
    setVersion(v)
    setAnalysis(v?.analysis || null)
    if (v?.approvalResult) {
      setResult(v.approvalResult as ApprovalReadinessResult)
      if (v.approvalResult.mode) setMode(v.approvalResult.mode)
    }
    setReady(true)
  }, [])

  function runCheck() {
    if (!analysis) return
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

  return (
    <Shell project={project}>
      {/* Mode select + run */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4">
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 mb-2">Select mode</div>
        <div className="flex flex-wrap items-center gap-3">
          <ModeButton active={mode === 'PRE_SUBMISSION'} onClick={() => { setMode('PRE_SUBMISSION') }}
            title="Pre-Submission Check" sub="Contractor — check before you submit" />
          <ModeButton active={mode === 'REVIEWER'} onClick={() => { setMode('REVIEWER') }}
            title="Reviewer Check" sub="Owner / PM — verify before you approve" />
          <button onClick={runCheck} disabled={running}
            className="ml-auto text-white text-[13px] font-bold px-5 py-2.5 rounded-lg disabled:opacity-60" style={{ background: COLORS.blue }}>
            {running ? 'Running…' : result ? 'Re-run Check' : 'Run Approval Readiness Check'}
          </button>
        </div>
      </div>

      {!result && !running && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="text-2xl mb-2">☝️</div>
          <div className="text-[13px] font-bold" style={{ color: COLORS.ink }}>Choose a mode and run the check</div>
          <div className="text-[11px] text-slate-500 mt-1">Control Lens will score the schedule and surface what requires attention. The result stays here when you leave and return.</div>
        </div>
      )}

      {running && !result && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-500">
          Running check…
        </div>
      )}

      {result && (
        <>
          {/* Score header — 30-second understanding */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4 print:break-inside-avoid">
            <div className="flex flex-wrap items-center gap-6">
              <div className="text-center">
                <div className="font-mono text-[44px] font-extrabold leading-none" style={{ color: gradeColor(result.grade) }}>
                  {result.totalScore}<span className="text-[20px] text-slate-400">/100</span>
                </div>
                <div className="text-[22px] font-extrabold mt-1" style={{ color: gradeColor(result.grade) }}>{result.grade}</div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="text-[15px] font-extrabold uppercase tracking-wide" style={{ color: COLORS.ink }}>
                  {result.recommendation}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Chip label={`Critical Gates: ${result.criticalGates.passed ? 'PASS' : 'FAIL'}`} color={result.criticalGates.passed ? COLORS.green : COLORS.red} />
                  <Chip label={`Critical: ${result.counts.critical}`} color={result.counts.critical ? COLORS.red : COLORS.slate} />
                  <Chip label={`Major: ${result.counts.major}`} color={result.counts.major ? COLORS.amber : COLORS.slate} />
                  <Chip label={`Minor: ${result.counts.minor}`} color={COLORS.slate} />
                </div>
                {!result.criticalGates.passed && (
                  <div className="mt-2 text-[11px]" style={{ color: COLORS.red }}>
                    {result.criticalGates.failed.map(g => `✗ ${g.label}`).join('  ·  ')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Domain scores */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4">
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
                  </div>
                )
              })}
            </div>
          </div>

          {/* What requires attention */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 mb-1">What requires your attention</div>
            <div className="text-[11px] text-slate-400 mb-3">{result.findings.length} consolidated finding{result.findings.length === 1 ? '' : 's'} · voice: {mode === 'PRE_SUBMISSION' ? 'Pre-Submission' : 'Reviewer'}</div>
            {result.findings.length === 0 ? (
              <div className="text-[12px] text-slate-500 italic py-4">No material triggers. Schedule reads as approval-ready.</div>
            ) : (
              <div className="space-y-2">
                {result.findings.map(f => (
                  <FindingRow key={f.id} f={f} mode={mode} open={expanded === f.id} onToggle={() => setExpanded(expanded === f.id ? null : f.id)} />
                ))}
              </div>
            )}
          </div>

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
  const sevColor = f.criticalGate || f.severity >= 5 ? COLORS.red : f.severity >= 3 ? COLORS.amber : COLORS.slate
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50">
        <span className="font-mono text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: COLORS.ink }}>{f.id}</span>
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${sevColor}22`, color: sevColor }}>{f.primaryDomain}</span>
        <span className="text-[12px] font-semibold flex-1 truncate" style={{ color: COLORS.ink }}>{f.title}</span>
        <span className="font-mono text-[10px] text-slate-400">−{f.scoreDeduction}</span>
        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{f.ruleStrength}</span>
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

function Shell({ children, project }: { children: React.ReactNode; project?: any }) {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0 no-print">
        <div>
          <span className="font-bold text-slate-900 text-base">Approval Readiness</span>
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
