'use client'

// =============================================================================
// src/app/dashboard/report/page.tsx — Complete Project Report (v2 polish)
// =============================================================================
// EstimateLens-style restyle of the existing Complete Project Report.
// All sections preserved (Executive, Critical Path, Longest Path, Multi-Float,
// OOS, Long Lead, Submittals, Milestones, Lookahead, No-Ties, EVM, Appendices).
// Visual language now matches EstimateLens for cross-product consistency.
//
// Same URL (/dashboard/report) — customers' bookmarks still work.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getActiveProject, getActiveVersion, subscribeToProjects,
  addCalendarDays,
  Project, ScheduleVersion,
} from '@/lib/projectStore'
import { evmCumulative, fmtDollars, fmtRatio as fmtEvmRatio } from '@/lib/evm'
import { analyzeMultipleFloatPaths } from '@/lib/multipleFloatPaths'
import { createClient } from '@/lib/supabase/client'
import { reportNumber, fmtShortDate } from '@/lib/reports'
import ReportHeader from '@/components/ReportHeader'
import PrintButton from '@/components/PrintButton'
import WordButton from '@/components/WordButton'

const COLORS = {
  ink: '#13202e',
  blue: '#2563eb',
  red: '#dc2626',
  amber: '#f59e0b',
  green: '#16a34a',
  slate: '#1f2937',
}

export default function ReportPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [version, setVersion] = useState<ScheduleVersion | null>(null)
  const [orgName, setOrgName] = useState<string>('—')

  useEffect(() => {
    refresh()
    const unsub = subscribeToProjects(refresh)
    return unsub
  }, [])

  function refresh() {
    const p = getActiveProject()
    setProject(p)
    setVersion(p ? getActiveVersion(p) : null)
  }

  // Load org name from Supabase (shown in "Prepared by")
  useEffect(() => {
    let cancelled = false
    async function loadOrg() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: members } = await supabase
          .from('organization_members')
          .select('org_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
        if (!members || members.length === 0) return
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', members[0].org_id)
          .single()
        if (!cancelled && org?.name) setOrgName(org.name)
      } catch {}
    }
    loadOrg()
    return () => { cancelled = true }
  }, [])

  if (!project || !version) {
    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">
          ‹ Reports
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center mt-4">
          <div className="text-3xl mb-3">📄</div>
          <div className="text-lg font-bold text-slate-700 mb-2">No active project</div>
          <div className="text-sm text-slate-500 mb-4">
            Pick a project from the sidebar, then return here to generate the Complete Report.
          </div>
          <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return <ReportContent project={project} version={version} orgName={orgName} />
}

function ReportContent({ project, version, orgName }: { project: Project; version: ScheduleVersion; orgName: string }) {
  const a: any = version.analysis || {}

  // ── Manual dates flow (same as Executive Dashboard) ─────────────────────
  const manualNtp = project.contractDates?.ntp || undefined
  const manualOriginal = project.contractDates?.originalContractCompletion || undefined
  const manualSubst = project.contractDates?.substantialCompletion || undefined
  const timeExt = version.versionDates?.timeExtensionDays ?? 0
  const manualRevised = version.versionDates?.revisedContractCompletion || undefined
  const manualDataDate = version.versionDates?.manualDataDate || undefined
  const revisedComp = manualRevised || (manualOriginal ? addCalendarDays(manualOriginal, timeExt) : undefined)

  const dataDate = manualDataDate || a.dataDate || version.dataDate || version.uploadedAt
  const ntp = manualNtp || a.projectStartDate || dataDate
  const contractEnd = manualOriginal || a.contractEnd
  const projectedEnd = a.projectedEnd || contractEnd
  const substantialXER = a.substantialCompletionDate
  const finalCompletion = a.finalCompletionDate || projectedEnd

  // ── KPIs ────────────────────────────────────────────────────────────────
  const totalActivities = num(a.totalActivities, 0)
  const complete = num(a.complete, 0)
  const inProgress = num(a.inProgress, 0)
  const notStarted = num(a.notStarted, 0)
  const healthScore = num(a.healthScore, 0)
  const condition = a.condition || deriveCondition(healthScore)
  const negativeFloat = num(a.negativeFloat, 0)

  let daysBehind = 0
  if (revisedComp && projectedEnd) {
    const cd = new Date(revisedComp)
    const pd = new Date(projectedEnd)
    if (!isNaN(cd.getTime()) && !isNaN(pd.getTime())) {
      const cu = Date.UTC(cd.getFullYear(), cd.getMonth(), cd.getDate())
      const pu = Date.UTC(pd.getFullYear(), pd.getMonth(), pd.getDate())
      daysBehind = Math.round((pu - cu) / 86_400_000)
    }
  }

  const workComplete = num(a.workCompletePct, 0)
  const constructionCount = num(a.constructionActivityCount, 0)

  // ── Section data ────────────────────────────────────────────────────────
  const criticalDrivers = arr(a.criticalDrivers).slice(0, 50)
  const outOfSequence = arr(a.outOfSequence).slice(0, 50)
  const longLeadItems = arr(a.longLeadItems)
  const submittals = arr(a.submittals)
  const milestones = arr(a.milestones)
  const twoWeek = arr(a.twoWeekLookahead).slice(0, 50)
  const notStartedList = arr(a.notStartedActivities).slice(0, 100)
  const finishedList = arr(a.finishedActivities).slice(0, 100)
  const inProgressList = arr(a.inProgressActivities)
  const longestPath = arr(a.longestPathActivities).slice(0, 100)
  const noTies = arr(a.noTies).slice(0, 50)

  const multiPathsResult = (() => {
    try { return analyzeMultipleFloatPaths(arr(a.allTasksForPaths), 5, 5) }
    catch { return null }
  })()

  const risksCritical = num(a.risksCritical, 0)
  const risksHigh = num(a.risksHigh, 0)
  const risksMedium = num(a.risksMedium, 0)

  const longLeadAtRisk = num(a.longLeadAtRisk, 0)
  const longLeadTotal = num(a.longLeadTotal, longLeadItems.length)

  const evm = project.evm

  // Report metadata
  const projectCode = project.projectId || project.name
  const reportNo = reportNumber(projectCode, 'BOOK')
  const versionLabel = version.versionLabel || version.fileName || 'v1 · working draft'

  return (
    <div className="p-6 max-w-[920px] mx-auto h-full overflow-y-auto">
      <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">
        ‹ Reports
      </Link>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-slate-200 bg-white p-3 mt-3 mb-4">
        <span className="text-[12px] text-slate-500">
          Comprehensive project report — every diagnostic in one document. Print to PDF and send to the owner.
        </span>
        <span className="flex items-center gap-2">
          <WordButton enabled={false} />
          <PrintButton />
        </span>
      </div>

      {/* ── The printable card ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <ReportHeader
          title="Complete Project Report"
          reportNo={reportNo}
          versionLabel={versionLabel}
          orgName={orgName}
          project={{
            name: project.name,
            projectId: project.projectId,
            project_code: (project as any).project_code,
            owner: (project as any).owner,
            location: (project as any).location,
          }}
        />

        {/* ─────── 1. EXECUTIVE SUMMARY ──────────────────────────────── */}
        <SectionBar tag="EXEC" title="Executive Summary" />

        {/* Health banner */}
        <HealthBanner score={healthScore} label={condition} />

        {/* Key Dates */}
        <SubLabel>Key dates</SubLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 print:break-inside-avoid">
          <DateBox label="NTP" value={fmtShortDate(ntp)} />
          <DateBox label="Original Comp." value={fmtShortDate(contractEnd)} />
          <DateBox label="Revised Comp." value={fmtShortDate(revisedComp)} tone={revisedComp && contractEnd && revisedComp !== contractEnd ? 'amber' : undefined} />
          <DateBox label="Data Date" value={fmtShortDate(dataDate)} />
          <DateBox label="Substantial (manual)" value={fmtShortDate(manualSubst)} />
          <DateBox label="Substantial (XER)" value={fmtShortDate(substantialXER)} />
          <DateBox label="Final Completion" value={fmtShortDate(finalCompletion)} />
          <DateBox label="Projected End" value={fmtShortDate(projectedEnd)} tone={daysBehind > 0 ? 'red' : undefined} />
        </div>

        {/* KPI tiles */}
        <SubLabel>Key metrics</SubLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 print:break-inside-avoid">
          <KPI label="Days Behind" value={daysBehind > 0 ? `+${daysBehind}` : `${daysBehind}`} tone={daysBehind > 0 ? 'red' : 'green'} caption={daysBehind > 0 ? 'past revised end' : 'on or ahead of plan'} />
          <KPI label="Work Complete" value={`${Math.round(workComplete)}%`} tone="blue" caption={constructionCount ? `${constructionCount} construction acts` : 'effective % across activities'} />
          <KPI label="Total Activities" value={String(totalActivities)} tone="slate" caption={`${complete} done · ${inProgress} active · ${notStarted} not started`} />
          <KPI label="Negative Float" value={String(negativeFloat)} tone={negativeFloat > 0 ? 'red' : 'green'} caption="activities" />
        </div>

        {/* Risk summary */}
        <SubLabel>Risks detected · {risksCritical + risksHigh + risksMedium} {risksCritical + risksHigh + risksMedium === 1 ? 'category' : 'categories'}</SubLabel>
        <div className="grid grid-cols-3 gap-2 mb-4 print:break-inside-avoid">
          <RiskBar label="Critical" count={risksCritical} color={COLORS.red} total={risksCritical + risksHigh + risksMedium} />
          <RiskBar label="High" count={risksHigh} color={COLORS.amber} total={risksCritical + risksHigh + risksMedium} />
          <RiskBar label="Medium" count={risksMedium} color={COLORS.blue} total={risksCritical + risksHigh + risksMedium} />
        </div>

        {/* ─────── 2. CRITICAL PATH DRIVERS ──────────────────────────── */}
        {criticalDrivers.length > 0 && (
          <Section>
            <SectionBar tag="CRIT" title="Critical Path Drivers" rightMeta={`${criticalDrivers.length}${arr(a.criticalDrivers).length > criticalDrivers.length ? ` of ${arr(a.criticalDrivers).length}` : ''} activities`} />
            <Note>Activities driving the project finish — total float ≤ 0 days.</Note>
            <ActivityTable rows={criticalDrivers} columns={['code', 'name', 'float', 'earlyStart', 'earlyEnd']} />
          </Section>
        )}

        {/* ─────── 3. LONGEST PATH ───────────────────────────────────── */}
        {longestPath.length > 0 && (
          <Section>
            <SectionBar tag="LP" title="Longest Path" rightMeta={`${longestPath.length} activities`} />
            <Note>P6 driving_path_flag = 'Y' activities.</Note>
            <ActivityTable rows={longestPath} columns={['code', 'name', 'float', 'earlyStart', 'earlyEnd']} />
          </Section>
        )}

        {/* ─────── 4. MULTIPLE FLOAT PATHS ───────────────────────────── */}
        {multiPathsResult && multiPathsResult.paths.length > 0 && (
          <Section>
            <SectionBar tag="MFP" title="Multiple Float Paths" rightMeta={`Top ${multiPathsResult.paths.length} · drives ${multiPathsResult.finalCompletionMilestone}`} />
            <Note>
              ControlLens ranks the top driving chains beyond P6's single critical path.
              <b> Path 1 is critical</b> (≤0 float). <b>Paths 2–5 are near-critical</b> —
              today's near-critical becomes tomorrow's critical after one slip.
            </Note>
            {multiPathsResult.paths.map(path => {
              const tone = path.isCritical ? COLORS.red : path.isNearCritical ? COLORS.amber : COLORS.slate
              const tag = path.isCritical ? 'CRITICAL' : path.isNearCritical ? 'NEAR-CRITICAL' : 'PATH'
              return (
                <div key={path.pathNumber} className="mb-4 border border-slate-200 rounded-lg overflow-hidden print:break-inside-avoid">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50">
                    <span className="font-mono text-[9px] font-bold text-white px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ background: tone }}>
                      P{path.pathNumber} · {tag}
                    </span>
                    <span className="text-[12px] font-bold truncate flex-1" style={{ color: COLORS.ink }}>{path.pathName}</span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {path.activities.length} acts · {path.floatDays < 0 ? `${path.floatDays}d (behind)` : path.floatDays === 0 ? '0d' : `${path.floatDays}d float`}
                    </span>
                  </div>
                  <div className="px-3 py-2 text-[11px] text-slate-600 leading-relaxed border-b border-slate-200 italic">
                    {path.plainExplanation}
                  </div>
                  <table className="w-full text-[10.5px]">
                    <thead>
                      <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th className="py-1.5 px-3">Code</th>
                        <th className="py-1.5 px-3">Activity</th>
                        <th className="py-1.5 px-3 text-right">Start</th>
                        <th className="py-1.5 px-3 text-right">Finish</th>
                        <th className="py-1.5 px-3 text-right">Float</th>
                      </tr>
                    </thead>
                    <tbody>
                      {path.activities.slice(0, 30).map((t, i) => {
                        const fl = Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
                        const flColor = fl < 0 ? COLORS.red : fl === 0 ? COLORS.amber : COLORS.green
                        return (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-1 px-3 font-mono font-bold" style={{ color: COLORS.ink }}>{t.task_code}</td>
                            <td className="py-1 px-3 text-slate-700">{trunc(t.task_name, 60)}</td>
                            <td className="py-1 px-3 text-right text-slate-600 font-mono">{(t.early_start_date || t.target_start_date || '').slice(0, 10)}</td>
                            <td className="py-1 px-3 text-right text-slate-600 font-mono">{(t.early_end_date || t.target_end_date || '').slice(0, 10)}</td>
                            <td className="py-1 px-3 text-right font-mono font-bold" style={{ color: flColor }}>{fl}d</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {path.activities.length > 30 && (
                    <div className="px-3 py-1.5 text-[9px] text-slate-400 italic border-t border-slate-100">
                      Showing first 30 of {path.activities.length} activities.
                    </div>
                  )}
                </div>
              )
            })}
          </Section>
        )}

        {/* ─────── 5. OUT-OF-SEQUENCE ────────────────────────────────── */}
        {outOfSequence.length > 0 && (
          <Section>
            <SectionBar tag="OOS" title="Construction Sequence Problems" rightMeta={`${outOfSequence.length}${arr(a.outOfSequence).length > outOfSequence.length ? ` of ${arr(a.outOfSequence).length}` : ''}`} />
            <Note>Activities started or finished out of logical order with their predecessor — matches P6 Schedule Log convention.</Note>
            <table className="w-full text-[10.5px] mb-3">
              <THead cols={['Activity', 'Name', 'Category', 'Violations', 'Predecessor']} widths={['14%', undefined, '14%', '10%', '14%']} />
              <tbody>
                {outOfSequence.map((o: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 print:break-inside-avoid">
                    <td className="py-1.5 px-2 font-mono font-bold" style={{ color: COLORS.ink }}>{o.task?.task_code || '—'}</td>
                    <td className="py-1.5 px-2 text-slate-700">{trunc(o.task?.task_name, 50)}</td>
                    <td className="py-1.5 px-2 text-slate-600">{o.category || '—'}</td>
                    <td className="py-1.5 px-2 font-mono text-center">{Array.isArray(o.violations) ? o.violations.length : 1}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-600">{o.pred?.task_code || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ─────── 6. LONG LEAD ──────────────────────────────────────── */}
        {longLeadItems.length > 0 && (
          <Section>
            <SectionBar tag="LL" title="Long Lead Items" rightMeta={`${longLeadAtRisk} at risk · ${longLeadTotal} total`} />
            <Note>Procurement activities ≥35 calendar days duration. Sorted by float ascending.</Note>
            <table className="w-full text-[10.5px] mb-3">
              <THead cols={['Activity', 'Name', 'Duration', 'Remaining', 'Float', 'Status']} widths={['14%', undefined, '10%', '10%', '10%', '10%']} />
              <tbody>
                {longLeadItems.map((it: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 print:break-inside-avoid">
                    <td className="py-1.5 px-2 font-mono font-bold" style={{ color: COLORS.ink }}>{it.task_code || '—'}</td>
                    <td className="py-1.5 px-2 text-slate-700">{trunc(it.task_name, 50)}</td>
                    <td className="py-1.5 px-2 font-mono text-slate-600">{it.durationDays}d</td>
                    <td className="py-1.5 px-2 font-mono text-slate-600">{it.remainingDays}d</td>
                    <td className="py-1.5 px-2 font-mono font-bold" style={{ color: it.floatDays <= 14 ? COLORS.red : COLORS.ink }}>{it.floatDays}d</td>
                    <td className="py-1.5 px-2 text-slate-600">{statusLabel(it.status_code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ─────── 7. SUBMITTALS ─────────────────────────────────────── */}
        {submittals.length > 0 && (
          <Section>
            <SectionBar tag="SUB" title="Submittals" rightMeta={`${submittals.length} pairs`} />
            <Note>Submit + Review/Approval activity pairs detected by activity name.</Note>
            <ActivityTable rows={submittals} columns={['code', 'name', 'float', 'earlyStart', 'earlyEnd', 'status']} />
          </Section>
        )}

        {/* ─────── 8. MILESTONES ─────────────────────────────────────── */}
        {milestones.length > 0 && (
          <Section>
            <SectionBar tag="MS" title="Key Milestones" rightMeta={`${milestones.length}`} />
            <ActivityTable rows={milestones} columns={['code', 'name', 'earlyStart', 'earlyEnd', 'status']} />
          </Section>
        )}

        {/* ─────── 9. LOOKAHEAD ──────────────────────────────────────── */}
        {twoWeek.length > 0 && (
          <Section>
            <SectionBar tag="14D" title="Two-Week Lookahead" rightMeta={`${twoWeek.length} activities · from ${fmtShortDate(dataDate)}`} />
            <Note>Activities scheduled to start or finish within 14 days of the data date.</Note>
            <ActivityTable rows={twoWeek} columns={['code', 'name', 'earlyStart', 'earlyEnd', 'float', 'status']} />
          </Section>
        )}

        {/* ─────── 10. NO TIES ──────────────────────────────────────── */}
        {noTies.length > 0 && (
          <Section>
            <SectionBar tag="NT" title="Activities with No Logic Ties" rightMeta={`${noTies.length}${arr(a.noTies).length > noTies.length ? ` of ${arr(a.noTies).length}` : ''}`} />
            <Note>Activities missing either a predecessor or successor — schedule quality issues.</Note>
            <ActivityTable rows={noTies} columns={['code', 'name', 'earlyStart', 'earlyEnd', 'status']} />
          </Section>
        )}

        {/* ─────── 11. EVM ──────────────────────────────────────────── */}
        {evm && evm.totalBudget > 0 && Array.isArray(evm.months) && evm.months.length > 0 && (() => {
          const cum = evmCumulative(evm.totalBudget, evm.months, undefined)
          const currency = evm.currency || 'USD'
          return (
            <Section>
              <SectionBar tag="EVM" title="Earned Value Management" rightMeta={`${evm.months.length} mo · ${fmtDollars(evm.totalBudget, currency)} BAC`} />
              <Note>Cumulative values across {evm.months.length} project month{evm.months.length === 1 ? '' : 's'}.</Note>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <KPI label="BAC" value={fmtDollars(evm.totalBudget, currency)} tone="slate" caption="total budget" />
                <KPI label="Planned Value" value={fmtDollars(cum.pv, currency)} tone="blue" caption="cumulative PV" />
                <KPI label="Earned Value" value={fmtDollars(cum.ev, currency)} tone="green" caption="cumulative EV" />
                <KPI label="Actual Cost" value={cum.hasAnyActualCost ? fmtDollars(cum.ac, currency) : '—'} tone="slate" caption={cum.hasAnyActualCost ? 'cumulative AC' : 'not tracked'} />
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <KPI label="SPI" value={fmtEvmRatio(cum.spi)} tone={cum.spi !== null && cum.spi < 1 ? 'red' : 'green'} caption="schedule index" />
                <KPI label="CPI" value={cum.hasAnyActualCost ? fmtEvmRatio(cum.cpi) : '—'} tone={cum.cpi !== null && cum.cpi < 1 ? 'red' : 'green'} caption="cost index" />
                <KPI label="SV" value={fmtDollars(cum.sv, currency)} tone={cum.sv < 0 ? 'red' : 'green'} caption="schedule variance" />
                <KPI label="CV" value={cum.hasAnyActualCost && cum.cv !== null ? fmtDollars(cum.cv, currency) : '—'} tone={cum.cv !== null && cum.cv < 0 ? 'red' : 'green'} caption="cost variance" />
              </div>
            </Section>
          )
        })()}

        {/* ─────── APPENDICES ───────────────────────────────────────── */}
        {inProgressList.length > 0 && (
          <Section>
            <SectionBar tag="A1" title="Appendix · Activities In Progress" rightMeta={`${inProgressList.length}`} />
            <ActivityTable rows={inProgressList} columns={['code', 'name', 'pct', 'float', 'earlyStart', 'earlyEnd']} />
          </Section>
        )}

        {notStartedList.length > 0 && (
          <Section>
            <SectionBar tag="A2" title="Appendix · Activities Not Started" rightMeta={`${notStartedList.length}${arr(a.notStartedActivities).length > notStartedList.length ? ` of ${arr(a.notStartedActivities).length}` : ''}`} />
            <ActivityTable rows={notStartedList} columns={['code', 'name', 'float', 'earlyStart', 'earlyEnd']} />
          </Section>
        )}

        {finishedList.length > 0 && (
          <Section>
            <SectionBar tag="A3" title="Appendix · Recently Finished Activities" rightMeta={`${finishedList.length}${arr(a.finishedActivities).length > finishedList.length ? ` of ${arr(a.finishedActivities).length}` : ''}`} />
            <ActivityTable rows={finishedList} columns={['code', 'name', 'actStart', 'actEnd']} />
          </Section>
        )}

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-3 mt-6 border-t-2 text-[10px] text-slate-400" style={{ borderColor: COLORS.ink }}>
          <span>
            Generated by <b style={{ color: COLORS.ink }}>ControlLens</b> —
            analysis is advisory; the P6 schedule of record governs.
          </span>
          <span className="font-mono">{reportNo}</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <div className="mt-6">{children}</div>
}

function SectionBar({ tag, title, rightMeta }: { tag: string; title: string; rightMeta?: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 mb-3 rounded text-white" style={{ background: COLORS.ink }}>
      <span className="font-mono text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.15)' }}>
        {tag}
      </span>
      <span className="text-[13px] font-extrabold uppercase tracking-wide flex-1">{title}</span>
      {rightMeta && <span className="font-mono text-[10px] opacity-70">{rightMeta}</span>}
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-700 mb-2 mt-2">
      {children}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-slate-500 italic leading-relaxed mb-3 max-w-[90%]">
      {children}
    </p>
  )
}

function HealthBanner({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? COLORS.green : score >= 60 ? COLORS.amber : COLORS.red
  const bg = score >= 80 ? '#e6f5ee' : score >= 60 ? '#fef3c7' : '#fee2e2'
  return (
    <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-3 print:break-inside-avoid" style={{ background: bg, border: `1px solid ${color}33` }}>
      <div className="rounded-full w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ background: color, color: '#fff' }}>
        <span className="font-extrabold text-[13px]">{score}</span>
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-extrabold" style={{ color: COLORS.ink }}>{label} · Health {score}/100</div>
      </div>
    </div>
  )
}

function KPI({ label, value, caption, tone }: {
  label: string; value: string; caption: string;
  tone: 'blue' | 'red' | 'amber' | 'green' | 'slate'
}) {
  const accent = tone === 'red' ? COLORS.red : tone === 'amber' ? COLORS.amber : tone === 'green' ? COLORS.green : tone === 'slate' ? COLORS.slate : COLORS.blue
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: accent }} />
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="font-mono text-[17px] font-extrabold leading-none" style={{ color: accent }}>{value}</div>
      <div className="text-[9.5px] text-slate-500 mt-1 leading-snug">{caption}</div>
    </div>
  )
}

function DateBox({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'red' }) {
  const color = tone === 'red' ? COLORS.red : tone === 'amber' ? COLORS.amber : COLORS.ink
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-1.5">
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-[11.5px] font-bold mt-0.5" style={{ color }}>{value}</div>
    </div>
  )
}

function RiskBar({ label, count, color, total }: { label: string; count: number; color: string; total: number }) {
  const pct = total > 0 ? Math.max(count > 0 ? 4 : 0, (count / total) * 100) : 0
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</div>
        <div className="font-mono text-[16px] font-extrabold" style={{ color }}>{count}</div>
      </div>
      <svg width="100%" height="5" className="block">
        <rect x="0" y="0" width="100%" height="5" rx="2" fill="#eef2f7" />
        <rect x="0" y="0" width={`${pct}%`} height="5" rx="2" fill={color} />
      </svg>
    </div>
  )
}

function THead({ cols, widths }: { cols: string[]; widths?: (string | undefined)[] }) {
  return (
    <thead>
      <tr className="text-left text-[8.5px] uppercase tracking-wider text-slate-500 border-b-2 border-slate-200">
        {cols.map((c, i) => (
          <th key={c} className="py-1.5 px-2 font-extrabold" style={widths?.[i] ? { width: widths[i] } : undefined}>{c}</th>
        ))}
      </tr>
    </thead>
  )
}

function ActivityTable({ rows, columns }: { rows: any[]; columns: string[] }) {
  const colDef: Record<string, { label: string; width?: string; render: (r: any) => string; mono?: boolean; bold?: boolean; align?: 'left' | 'right' }> = {
    code: { label: 'Activity ID', width: '14%', render: r => r.task_code || r.code || '—', mono: true, bold: true },
    name: { label: 'Activity Name', render: r => trunc(r.task_name || r.name || '—', 55) },
    float: { label: 'Float (hr)', width: '10%', render: r => r.total_float_hr_cnt || '0', mono: true, align: 'right' },
    pct: { label: '% Complete', width: '10%', render: r => `${Math.round(parseFloat(r.phys_complete_pct || '0'))}%`, mono: true, align: 'right' },
    earlyStart: { label: 'Early Start', width: '13%', render: r => shortDate(r.early_start_date || r.target_start_date), mono: true },
    earlyEnd: { label: 'Early Finish', width: '13%', render: r => shortDate(r.early_end_date || r.target_end_date), mono: true },
    actStart: { label: 'Actual Start', width: '13%', render: r => shortDate(r.act_start_date), mono: true },
    actEnd: { label: 'Actual Finish', width: '13%', render: r => shortDate(r.act_end_date), mono: true },
    status: { label: 'Status', width: '10%', render: r => statusLabel(r.status_code) },
  }
  return (
    <table className="w-full text-[10.5px] mb-3">
      <THead cols={columns.map(c => colDef[c]?.label || c)} widths={columns.map(c => colDef[c]?.width)} />
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-100 print:break-inside-avoid">
            {columns.map(c => {
              const def = colDef[c]
              const align = def?.align === 'right' ? 'text-right' : 'text-left'
              const fontWeight = def?.bold ? 'font-bold' : ''
              const fontFamily = def?.mono ? 'font-mono' : ''
              const colColor = def?.bold ? { color: COLORS.ink } : undefined
              return (
                <td key={c} className={`py-1.5 px-2 ${align} ${fontWeight} ${fontFamily} text-slate-700`} style={colColor}>
                  {def?.render(r) || '—'}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function num(v: any, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return isFinite(n) ? n : fallback
}
function arr<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : []
}
function shortDate(d?: string): string {
  if (!d) return '—'
  try {
    const dt = new Date(d.replace(' ', 'T'))
    if (isNaN(dt.getTime())) return '—'
    return dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
  } catch { return '—' }
}
function trunc(s: string | undefined, max: number): string {
  if (!s) return '—'
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
function statusLabel(code?: string): string {
  switch (code) {
    case 'TK_NotStart': return 'Not Started'
    case 'TK_Active': return 'In Progress'
    case 'TK_Complete': return 'Complete'
    default: return code || '—'
  }
}
function deriveCondition(score: number): string {
  if (score >= 80) return 'Stable'
  if (score >= 60) return 'Monitor Closely'
  if (score >= 40) return 'Attention Needed'
  return 'Recovery Required'
}
