import type { TIAReportSnapshot } from '@/lib/tiaReportSnapshot'
import { tiaResultHeading } from '@/lib/tiaReportSnapshot'

export default function TIAComparisonReport({ snapshot }: { snapshot: TIAReportSnapshot }) {
  const c = snapshot.comparison
  const blocked = snapshot.validation.some(i => i.severity === 'error')
  const date = (v?: string) => v ? v.slice(0, 10) : '—'
  const duration = c.changed.filter(a => Math.abs(a.duration_delta_days || 0) > 0)
  function table(headers: string[], rows: (string | number | undefined)[][]) {
    return rows.length ? <table className="w-full border-collapse text-left text-xs my-3"><thead><tr>{headers.map(h => <th key={h} className="border border-slate-300 bg-slate-100 p-2">{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} className="border border-slate-200 p-2 align-top break-words">{v ?? '—'}</td>)}</tr>)}</tbody></table> : <p className="text-xs text-slate-500 my-2">None detected in this comparison.</p>
  }
  return <article id="tia-comparison-report" className="bg-white text-slate-900 p-6 space-y-5">
    <header className="border-b border-slate-300 pb-4">
      <h1 className="text-xl font-extrabold">{blocked ? 'TIA Diagnostic Comparison' : 'TIA Comparison — Draft for Review'}</h1>
      <p className="text-sm font-bold mt-1">{snapshot.projectName} · {snapshot.context.projectNumber}</p>
      <p className="text-xs mt-1">Comparison run: {snapshot.createdAt} · Prepared by: {snapshot.context.preparedBy || 'Not recorded'}</p>
      <p className="text-xs">Owner: {snapshot.context.owner || 'Not recorded'} · Contract completion: {date(snapshot.context.contractCompletionDate)}</p>
    </header>
    <section className={`border p-4 ${blocked ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
      <h2 className="font-bold">{tiaResultHeading(c, snapshot.validation)}</h2>
      <p className="text-xs mt-2">{blocked ? 'Diagnostic export only. Formal TIA reporting remains blocked. Resolve the listed issues and rerun the comparison; the finish difference is not an accepted event impact.' : 'Automated input checks do not establish causation, responsibility or entitlement. Verify event logic, calendars, scheduling settings and the controlling milestone before issuing this draft.'}</p>
      <p className="text-xs mt-2">Observed exported project finish difference: {c.totalDelayDays} calendar days. Milestone movements below may differ from project finish movement.</p>
    </section>
    <section><h2 className="font-bold">1. Schedules compared</h2>
      {table(['Source', 'Version / file', 'Data date', 'Exported finish'], [
        ['Unimpacted', `${snapshot.unimpacted.label} / ${snapshot.unimpacted.fileName}`, date(c.projectA.dataDate), date(c.projectA.end)],
        ['Impacted', `${snapshot.impacted.label} / ${snapshot.impacted.fileName}`, date(c.projectB.dataDate), date(c.projectB.end)],
      ])}
    </section>
    <section><h2 className="font-bold">2. Validation and corrections</h2>
      {snapshot.validation.length ? snapshot.validation.map(i => <p key={i.code} className={`text-xs my-2 ${i.severity === 'error' ? 'text-red-800' : 'text-amber-800'}`}><strong>{i.severity === 'error' ? 'BLOCKER' : 'REVIEW'} — {i.title}.</strong> {i.detail}</p>) : <p className="text-xs mt-2">Automated input checks passed; technical review is still required.</p>}
      {duration.length > 0 && <><h3 className="text-sm font-bold mt-3">Existing duration changes ({duration.length})</h3><p className="text-xs">Comparison values use the current parser’s eight-hour conversion. Verify original duration hours and activity calendars in the source schedules; these are not elapsed calendar days.</p>{table(['Activity ID — name', 'Unimpacted duration', 'Impacted duration', 'Difference'], duration.map(a => [`${a.task_code} — ${a.task_name}`, a.a_duration_days, a.b_duration_days, a.duration_delta_days]))}</>}
    </section>
    <section><h2 className="font-bold">3. Event activities and narrative</h2><p className="text-xs mt-2">Selection: {snapshot.confirmedCodes?.length ? `${snapshot.confirmedCodes.length} activities confirmed by the user` : 'Not confirmed — suggestions only'}</p>
      {table(['Activity ID — name', 'Responsibility (user entry)', 'Narrative (user entry)'], c.fragnetActivities.map(a => [`${a.task_code} — ${a.task_name}`, snapshot.categorizations[a.task_id]?.category || 'Not assessed', snapshot.categorizations[a.task_id]?.description || 'Not recorded']))}
    </section>
    <section><h2 className="font-bold">4. Milestone movements</h2>{table(['Activity ID — name', 'Unimpacted finish', 'Impacted finish', 'Calendar-day movement'], c.milestoneMovements.map(a => [`${a.task_code} — ${a.task_name}`, date(a.a_finish), date(a.b_finish), a.delta_days]))}</section>
    <section><h2 className="font-bold">5. Changed activities ({c.changed.length})</h2>{table(['Activity ID — name', 'Unimpacted finish', 'Impacted finish', 'Logic changed'], c.changed.map(a => [`${a.task_code} — ${a.task_name}`, date(a.a_finish), date(a.b_finish), a.logic_changed ? 'Yes' : 'No']))}</section>
    <section><h2 className="font-bold">6. Added and removed activities</h2>{table(['Change', 'Activity ID — name'], [...c.added.map(a => ['Added', `${a.task_code} — ${a.task_name}`]), ...c.removed.map(a => ['Removed', `${a.task_code} — ${a.task_name}`])])}</section>
    <section><h2 className="font-bold">7. Submitted critical activity comparison</h2><p className="text-xs mt-2">These are the comparator’s submitted critical-activity lists. They are not a verified continuous controlling path or proof that a fragnet caused the finish movement. No scheduling-engine recalculation was performed.</p>
      {table(['Unimpacted activities'], c.criticalPath.unimpactedPath.map(a => [`${a.task_code} — ${a.task_name}`]))}
      {table(['Impacted activities'], c.criticalPath.impactedPath.map(a => [`${a.task_code} — ${a.task_name}`]))}
    </section>
    <footer className="text-xs border-t border-slate-300 pt-3 font-bold">{blocked ? 'DIAGNOSTIC ONLY — NOT A VALIDATED TIA OR TIME-EXTENSION DETERMINATION' : 'DRAFT — SUBJECT TO SCHEDULER AND AUTHORIZED REVIEWER VERIFICATION'}</footer>
  </article>
}
