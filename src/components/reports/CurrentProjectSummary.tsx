'use client'

import { useEffect, useState } from 'react'
import PhaseProgressStrip from '@/components/PhaseProgressStrip'
import { addCalendarDays } from '@/lib/projectStore'
import { phaseDate } from '@/lib/phaseProgress'
import { loadReviewWorkspaceFromSupabase } from '@/lib/supabase/reviews'
import { summarizeReviewComments } from '@/lib/reviewWorkspace'

export default function CurrentProjectSummary({ project, version }: { project: any; version: any }) {
  const a = version?.analysis || {}
  const [register, setRegister] = useState<{ projectId: string; blocking: number; open: number } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setRegister(null); setFailed(false)
    if (project?.id) loadReviewWorkspaceFromSupabase(project.id).then(result => {
      if (!active) return
      if (result.ok && result.data) setRegister({ projectId: project.id, ...summarizeReviewComments(result.data.comments) })
      else setFailed(true)
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [project?.id, version?.id])
  const basis = project?.contractDates || {}
  const original = basis.originalContractCompletion
  const authorized = phaseDate(basis.currentFinalCompletion || version?.versionDates?.revisedContractCompletion || (original ? addCalendarDays(original, version?.versionDates?.timeExtensionDays ?? 0) : a.contractEnd))
  const forecast = phaseDate(a.projectedEnd || a.projected_end || a.forecastFinish || a.forecast_finish || a.projectedFinish)
  const dataDate = version?.versionDates?.manualDataDate || a.dataDate || a.data_date || version?.dataDate
  const difference = authorized && forecast ? Math.round((Date.parse(forecast) - Date.parse(authorized)) / 86400000) : null
  const position = !basis.ntp || !original ? 'Contract basis incomplete' : difference === null ? 'Forecast unavailable' : difference > 0 ? `${difference} calendar days behind` : difference < 0 ? `${-difference} calendar days ahead` : 'Forecast matches authorized completion'
  const review = version?.approvalResult
  const comments = register?.projectId === project?.id ? register : null
  const decision = comments?.blocking ? 'NOT READY — OPEN REVIEW COMMENTS' : !review ? 'Not reviewed' : !comments ? 'Review disposition not verified — comment register unavailable' : review.readinessLabel || review.recommendation || review.readinessStatus || 'Review completed'
  return <section className="space-y-3 mb-5" aria-label="Current project summary">
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] uppercase font-bold text-slate-500">Current contractual position</div><div className="text-lg font-bold text-slate-900">{position}</div></div>
    <div className="grid grid-cols-3 gap-3 text-xs">
      {[['Contract start / NTP',phaseDate(basis.ntp || a.projectStartDate || a.projectStart || a.project_start)],['Original completion',phaseDate(original)],['Authorized completion',authorized],['Substantial completion',phaseDate(basis.currentSubstantialCompletion || basis.substantialCompletion)],['Current forecast',forecast],['Data date',phaseDate(dataDate)]].map(([label,value])=><div key={label}><div className="text-[10px] text-slate-500">{label}</div><div className="font-semibold">{value || 'Not reported'}</div></div>)}
    </div>
    <div className="grid grid-cols-2 gap-3 text-xs">
      <div className="rounded border border-slate-200 p-3"><div className="font-semibold mb-1">Selected schedule</div>{version?.versionLabel || version?.fileName || 'Not selected'}<div className="mt-1 text-slate-500">{a.totalActivities ?? '—'} activities · {String(version?.scheduleType || 'schedule').replaceAll('_',' ')}</div></div>
      <div className="rounded border border-slate-200 p-3"><div className="font-semibold mb-1">Saved review decision</div><div className="font-bold">{decision}</div><div className="mt-1 text-slate-500">{comments ? `${comments.open} open comments · ${comments.blocking} formal blockers` : failed ? 'Unable to verify formal comments. Retry before issuing.' : 'Comment register loading — verify before issuing.'}</div><div className="mt-1 text-[10px] text-slate-500">Automated and saved review information; final approval belongs to the authorized reviewer.</div></div>
    </div>
    <PhaseProgressStrip analysis={a} originalBaseline={version?.scheduleType === 'baseline'} dataDate={dataDate} reportMode />
  </section>
}
