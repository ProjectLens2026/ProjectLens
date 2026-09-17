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
import { printReport } from '@/lib/printReport'
import type { ApprovalReadinessResult, ApprovalMode, ApprovalFinding } from '@/lib/approval-readiness/types'

const COLORS = {
  ink: '#13202e', blue: '#2563eb', red: '#dc2626', amber: '#f59e0b', green: '#16a34a', slate: '#1f2937',
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

export default function ApprovalReadinessPage() {
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<ApprovalMode>('PRE_SUBMISSION')
  const [result, setResult] = useState<ApprovalReadinessResult | null>(null)
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reportKind, setReportKind] = useState<null | 'executive' | 'complete'>(null)

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

  // When a report is requested, render the print-optimized document instead
  // of the interactive workspace. Built from the same structured result.
  if (reportKind && result) {
    return <ApprovalReport result={result} mode={mode} kind={reportKind} project={project} onBack={() => setReportKind(null)} />
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
          {/* Reviewer-first decision summary. The status leads; the score supports. */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-4 print:break-inside-avoid">
            <div className="flex flex-wrap items-start gap-5">
              <div className="flex-1 min-w-[320px]">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-500 mb-1">Control Lens Readiness Status</div>
                <div className="text-[24px] md:text-[28px] font-black leading-tight" style={{ color: readinessColor(result.readinessStatus) }}>
                  {result.readinessLabel || result.recommendation}
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
                <div className="flex flex-col gap-2">
                  <button onClick={() => setReportKind('executive')}
                    className="text-[11px] font-bold px-3 py-2 rounded-lg text-white" style={{ background: COLORS.ink }}>
                    📄 Executive Report
                  </button>
                  <button onClick={() => setReportKind('complete')}
                    className="text-[11px] font-bold px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                    📑 Complete Review
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* What Control Lens understands about the submitted work */}
          {result.projectUnderstanding && (
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
          {result.pathReview && (
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

          {/* Priority findings — what the reviewer should read first. */}
          {(() => {
            const priority = result.findings.filter(f => approvalKind(f) === 'FINDING' && (f.criticalGate || f.severity >= 4)).slice(0, 5)
            if (!priority.length) return null
            return (
              <div className="rounded-2xl border border-red-200 bg-red-50/30 p-5 mb-4">
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-red-700">Priority Review</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Read these first. Detailed evidence remains below.</div>
                  </div>
                  <div className="text-[11px] font-bold text-red-700">{priority.length} material item{priority.length === 1 ? '' : 's'}</div>
                </div>
                <div className="space-y-2">
                  {priority.map(f => (
                    <button key={f.id} onClick={() => setExpanded(expanded === f.id ? null : f.id)} className="w-full text-left rounded-lg border border-red-100 bg-white px-3 py-3 hover:border-red-200">
                      <div className="flex items-start gap-2">
                        <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700 flex-shrink-0">{f.primaryDomain}</span>
                        <div className="flex-1">
                          <div className="text-[13px] font-extrabold leading-snug" style={{ color: COLORS.ink }}>{f.title}</div>
                          <div className="text-[11px] text-slate-600 leading-relaxed mt-1">{f.whatFound}</div>
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">View detail ›</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

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
                    <div className="text-[9px] text-slate-400 mt-0.5">
                      {d.findingCount} finding{d.findingCount === 1 ? '' : 's'}
                      {(d.recommendationCount || 0) > 0 ? ` · ${d.recommendationCount} recommendation${d.recommendationCount === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Findings and non-scoring Control Lens recommendations */}
          {(() => {
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
        <span className="text-[13px] font-extrabold flex-1 leading-snug" style={{ color: COLORS.ink }}>{f.title}</span>
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
function ApprovalReport({ result, mode, kind, project, onBack }: {
  result: ApprovalReadinessResult
  mode: ApprovalMode
  kind: 'executive' | 'complete'
  project: any
  onBack: () => void
}) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
  const code = (project?.projectId || project?.name || 'PRJ').toString().replace(/\s+/g, '').toUpperCase().slice(0, 14)
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const reportNo = `CL-AR-${code}-${kind === 'executive' ? 'EXEC' : 'FULL'}-${ymd}`
  const voice = mode === 'PRE_SUBMISSION' ? 'Pre-Submission Check (Contractor)' : 'Reviewer Check (Owner / PM)'
  const gc = gradeColor(result.grade)

  // Report title is hardcoded by WHO is running it:
  //   Reviewer (owner)      → "Owner's Review Report"
  //   Pre-Submission (GC)   → "Readiness Report — Before Submission"
  const reportTitle = mode === 'REVIEWER'
    ? "Owner's Review Report"
    : 'Readiness Report — Before Submission'
  const docKind = kind === 'executive' ? 'Executive Summary' : 'Complete Schedule Control Review'

  // executive = critical + major only; complete = everything
  const reportFindings = result.findings.filter(f => approvalKind(f) === 'FINDING')
  const reportRecommendations = result.findings.filter(f => approvalKind(f) === 'RECOMMENDATION')
  const shown = kind === 'executive'
    ? reportFindings.filter(f => f.criticalGate || f.severity >= 3)
    : reportFindings

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

          {(result.projectUnderstanding || result.pathReview) && (
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

          {/* ── Findings ─────────────────────────────────────────────── */}
          <SectionBar>{kind === 'executive' ? 'Material Findings' : 'All Findings — Detail & Evidence'}</SectionBar>
          {shown.length === 0 ? (
            <div className="text-[12px] text-slate-500 italic py-3">No material findings.</div>
          ) : shown.map(f => (
            <div key={f.id} className="mb-4 border border-slate-200 rounded-lg overflow-hidden print:break-inside-avoid">
              <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2" style={{ background: '#f8fafc' }}>
                <span className="font-mono text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: COLORS.ink }}>{f.id}</span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{f.primaryDomain}</span>
                <span className="text-[12px] font-extrabold flex-1" style={{ color: COLORS.ink }}>{f.title}</span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{f.ruleStrength} · sev {f.severity} · −{f.scoreDeduction}</span>
              </div>
              <div className="px-4 py-3 text-[11px]">
                <Memo label="What Control Lens Found">{f.whatFound}</Memo>
                <Memo label="Why This Matters">{f.whyItMatters}</Memo>
                <Memo label={mode === 'PRE_SUBMISSION' ? 'Pre-Submission Note' : 'Reviewer Check'}>
                  {mode === 'PRE_SUBMISSION' ? f.preSubmissionNote : f.reviewerCheck}
                </Memo>
                {kind === 'complete' && <Memo label="Reference">{f.referenceRequirement}</Memo>}
                {kind === 'complete' && f.affectedActivities.length > 0 && (
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
                {kind === 'executive' && f.affectedActivities.length > 0 && (
                  <div className="text-[10px] text-slate-500 mt-1">
                    {f.affectedActivities.length} affected activit{f.affectedActivities.length === 1 ? 'y' : 'ies'} — see Complete Review for full evidence.
                  </div>
                )}
              </div>
            </div>
          ))}

          {reportRecommendations.length > 0 && (
            <>
              <SectionBar>Control Lens Recommendations</SectionBar>
              <div className="text-[10px] text-slate-500 mb-3">Non-scoring schedule-control suggestions. They are not contractual requirements unless the governing contract or owner profile requires them.</div>
              {reportRecommendations.map(f => (
                <div key={f.id} className="mb-4 border border-blue-200 rounded-lg overflow-hidden print:break-inside-avoid">
                  <div className="px-3 py-2 border-b border-blue-100 flex items-center gap-2 bg-blue-50/50">
                    <span className="font-mono text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: COLORS.blue }}>{f.id}</span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{f.primaryDomain}</span>
                    <span className="text-[12px] font-extrabold flex-1" style={{ color: COLORS.ink }}>{f.title}</span>
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
