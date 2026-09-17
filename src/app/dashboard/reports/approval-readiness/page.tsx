'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion } from '@/lib/projectStore'
import type { ApprovalFinding, ApprovalReadinessResult } from '@/lib/approval-readiness/types'
import { printReport } from '@/lib/printReport'
import { reportNumber } from '@/lib/reports'
import ReviewerReportHeader from '@/components/reports/ReviewerReportHeader'
import NeutralReportFooter from '@/components/reports/NeutralReportFooter'

export default function ApprovalReadinessReportPage() {
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    setVersion(getActiveVersion(p))
    setReady(true)
  }, [])

  if (!ready) return <div className="p-6 text-sm text-slate-500">Loading report…</div>
  if (!project || !version) return <Missing />

  const result = version.approvalResult as ApprovalReadinessResult | undefined
  if (!result) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="text-2xl mb-2">✓</div>
          <div className="text-sm font-bold text-slate-900">Approval Readiness has not been run for this version</div>
          <div className="text-xs text-slate-500 mt-1">Run the working review first, then return here to package the result as a report.</div>
          <Link href="/dashboard/approval" className="inline-flex mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white">Open Approval Readiness</Link>
        </div>
      </div>
    )
  }

  const reportNo = reportNumber(project.projectId || project.name, 'APP')
  const findings = result.findings.filter(f => f.kind !== 'RECOMMENDATION')
  const recommendations = result.findings.filter(f => f.kind === 'RECOMMENDATION')

  return (
    <div className="p-4 md:p-6 max-w-[1180px] mx-auto">
      <div className="print:hidden flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 mb-4">
        <Link href="/dashboard/reports" className="text-[11px] font-semibold text-slate-500 hover:text-slate-900">‹ Reports</Link>
        <span className="text-[12px] font-extrabold text-slate-900">Approval Readiness Report</span>
        <button onClick={() => printReport('approval-readiness-report', { title: 'Approval Readiness Report', footerLabel: reportNo })}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-[11px] font-bold text-white hover:bg-blue-700">🖨 Save as PDF</button>
      </div>

      <div id="approval-readiness-report" className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReviewerReportHeader
          title={result.mode === 'REVIEWER' ? "Owner's Schedule Review" : 'Schedule Readiness Review'}
          reportNo={reportNo}
          versionLabel={version.versionLabel || version.fileName || 'Active version'}
          project={project}
        />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5 print:break-inside-avoid">
          <Metric label="Readiness Score" value={`${result.totalScore}/100`} />
          <Metric label="Grade" value={result.grade} />
          <Metric label="Findings" value={String(findings.length)} />
          <Metric label="Recommendations" value={String(recommendations.length)} />
          <Metric label="Critical Gates" value={result.criticalGates.passed ? 'Pass' : 'Review'} />
        </div>

        <SectionBar tag="DOM" title="Approval Domains" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
          {result.domains.map(d => (
            <div key={d.domain} className="rounded-lg border border-slate-200 p-3 print:break-inside-avoid">
              <div className="flex items-start gap-2">
                <span className="font-mono text-[9px] font-bold text-slate-400">{d.domain}</span>
                <div className="min-w-0 flex-1 text-[10px] font-semibold text-slate-700 leading-snug">{d.label}</div>
                <div className="font-mono text-[11px] font-extrabold text-slate-900">{d.score}/{d.maxPoints}</div>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-slate-800" style={{ width: `${Math.max(0, Math.min(100, d.maxPoints ? (d.score / d.maxPoints) * 100 : 0))}%` }} /></div>
              <div className="mt-1 text-[8.5px] text-slate-400">{d.findingCount} findings · {d.recommendationCount || 0} recommendations</div>
            </div>
          ))}
        </div>

        <SectionBar tag="OBS" title="Schedule Review Comments" right={`${findings.length} findings`} />
        {findings.length ? (
          <div className="space-y-3 mb-6">
            {findings.map((f, i) => <FindingCard key={f.id} finding={f} displayId={`C-${String(i + 1).padStart(3, '0')}`} />)}
          </div>
        ) : <Empty text="No scoring findings were identified in the stored review result." />}

        {recommendations.length ? (
          <>
            <SectionBar tag="REC" title="Schedule Control Recommendations" right={`${recommendations.length} recommendations`} />
            <div className="space-y-3 mb-6">
              {recommendations.map((f, i) => <RecommendationCard key={f.id} finding={f} displayId={`R-${String(i + 1).padStart(3, '0')}`} />)}
            </div>
          </>
        ) : null}

        <NeutralReportFooter reportNo={reportNo} />
      </div>
    </div>
  )
}

function FindingCard({ finding: f, displayId }: { finding: ApprovalFinding; displayId: string }) {
  const activities = f.affectedActivities || []
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden print:break-inside-avoid">
      <div className="flex flex-wrap items-center gap-2 bg-slate-50 border-b border-slate-200 px-4 py-2.5">
        <span className="font-mono text-[9px] font-extrabold text-slate-700">{displayId}</span>
        <span className="font-mono text-[8.5px] font-bold text-slate-400">{f.primaryDomain}</span>
        <span className="text-[11px] font-extrabold text-slate-900 flex-1">{f.title}</span>
        <span className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{f.ruleStrength}</span>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <TextBlock label="Reviewer Observation" text={f.whatFound} />
        <TextBlock label="Schedule / Project Impact" text={f.whyItMatters} />
        <TextBlock label="Contractor Action" text={f.reviewerCheck} />
        <TextBlock label="Reference / Basis" text={f.referenceRequirement} />
      </div>
      {activities.length ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="text-[8px] font-extrabold uppercase tracking-wide text-slate-400 mb-1.5">Schedule Reference</div>
          <div className="space-y-1">{activities.map((a, i) => <div key={`${a.id}-${i}`} className="text-[9.5px] text-slate-600"><span className="font-mono font-bold text-slate-800">{a.code || a.id}</span> · {a.name}{a.note ? ` — ${a.note}` : ''}</div>)}</div>
        </div>
      ) : null}
    </div>
  )
}

function RecommendationCard({ finding: f, displayId }: { finding: ApprovalFinding; displayId: string }) {
  const activities = f.affectedActivities || []
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 print:break-inside-avoid">
      <div className="flex items-center gap-2 mb-2"><span className="font-mono text-[9px] font-extrabold text-blue-700">{displayId}</span><span className="text-[11px] font-extrabold text-slate-900">{f.title}</span><span className="ml-auto text-[8px] font-bold uppercase tracking-wide text-blue-700">No score impact</span></div>
      <TextBlock label="Reviewer Observation" text={f.whatFound} />
      <div className="mt-2"><TextBlock label="Rationale / Suggested Action" text={f.reviewerCheck || f.whyItMatters} /></div>
      {activities.length ? <div className="mt-2 text-[9.5px] text-slate-600"><span className="font-bold">Schedule reference:</span> {activities.map(a => `${a.code || a.id} · ${a.name}`).join('; ')}</div> : null}
    </div>
  )
}

function TextBlock({ label, text }: { label: string; text?: string }) {
  return <div><div className="text-[8px] font-extrabold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-0.5 text-[10.5px] leading-relaxed text-slate-700">{text || '—'}</div></div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 p-3"><div className="text-[8px] font-extrabold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-[16px] font-extrabold text-slate-900">{value}</div></div>
}

function SectionBar({ tag, title, right }: { tag: string; title: string; right?: string }) {
  return <div className="flex items-center gap-3 px-3 py-2 mb-3 rounded text-white bg-slate-900"><span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/15">{tag}</span><span className="text-[12px] font-extrabold uppercase tracking-wide flex-1">{title}</span>{right ? <span className="font-mono text-[9px] opacity-80">{right}</span> : null}</div>
}

function Empty({ text }: { text: string }) { return <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-[10.5px] text-slate-500 mb-5">{text}</div> }
function Missing() { return <div className="p-6"><div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Select a project and schedule version first.</div></div> }
