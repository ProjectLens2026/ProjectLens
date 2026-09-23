'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion, subscribeToProjects, type Project, type ScheduleVersion } from '@/lib/projectStore'
import { getSavedVersionXerSignedUrl } from '@/lib/supabase/db'

type ComparisonTab = 'summary' | 'added' | 'removed' | 'changed' | 'milestones'

function versionTime(version: ScheduleVersion): number {
  return new Date(version.dataDate || version.uploadedAt).getTime()
}
function versionName(version?: ScheduleVersion): string {
  return version?.versionLabel || version?.fileName || 'Schedule version'
}
function shortDate(value?: string): string {
  if (!value) return '—'
  const parsed = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10)
  return parsed.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}
function delta(value?: number): string {
  const amount = Number(value || 0)
  return `${amount > 0 ? '+' : ''}${amount}d`
}

export default function VersionComparisonPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [priorId, setPriorId] = useState('')
  const [currentId, setCurrentId] = useState('')
  const [comparison, setComparison] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ComparisonTab>('summary')

  useEffect(() => {
    function syncSelection() {
      const activeProject = getActiveProject()
      setProject(activeProject)
      if (!activeProject) return
      const available = activeProject.versions.filter(version => !version.deletedAt).sort((a, b) => versionTime(a) - versionTime(b))
      const selected = getActiveVersion(activeProject)
      let currentIndex = selected ? available.findIndex(version => version.id === selected.id) : available.length - 1
      if (currentIndex <= 0 && available.length > 1) currentIndex = available.length - 1
      setCurrentId(available[currentIndex]?.id || '')
      setPriorId(currentIndex > 0 ? available[currentIndex - 1].id : '')
      setComparison(null)
      setError(null)
    }
    syncSelection()
    return subscribeToProjects(syncSelection)
  }, [])

  const versions = useMemo(
    () => [...(project?.versions || [])].filter(version => !version.deletedAt).sort((a, b) => versionTime(a) - versionTime(b)),
    [project],
  )
  const priorVersion = versions.find(version => version.id === priorId)
  const currentVersion = versions.find(version => version.id === currentId)

  function selectCurrent(id: string) {
    setCurrentId(id)
    const index = versions.findIndex(version => version.id === id)
    setPriorId(index > 0 ? versions[index - 1].id : '')
    setComparison(null)
    setError(null)
  }

  async function signedUrl(version: ScheduleVersion): Promise<string | null> {
    const result = await getSavedVersionXerSignedUrl(version.id)
    return result.ok && result.signedUrl ? result.signedUrl : null
  }

  async function runComparison() {
    if (!priorVersion || !currentVersion) return
    if (priorVersion.id === currentVersion.id) {
      setError('Choose two different schedule versions.')
      return
    }
    setRunning(true)
    setError(null)
    setComparison(null)
    try {
      // Resolve sequentially. Two simultaneous browser-authenticated storage
      // requests can contend for the same Supabase Navigator Lock.
      const priorUrl = await signedUrl(priorVersion)
      const currentUrl = await signedUrl(currentVersion)
      const formData = new FormData()
      if (priorUrl && currentUrl) {
        formData.append('fileAUrl', priorUrl)
        formData.append('fileBUrl', currentUrl)
      } else if (priorVersion.rawXER && currentVersion.rawXER) {
        formData.append('fileA', new File([priorVersion.rawXER], priorVersion.fileName || 'prior.xer', { type: 'text/plain' }))
        formData.append('fileB', new File([currentVersion.rawXER], currentVersion.fileName || 'current.xer', { type: 'text/plain' }))
      } else {
        throw new Error('One of these versions has no retrievable XER source. Re-upload that version before comparing it.')
      }
      formData.append('mode', 'compare')
      const response = await fetch('/api/compare', { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Comparison failed (HTTP ${response.status})`)
      setComparison(data.comparison)
      setActiveTab('summary')
    } catch (comparisonError: any) {
      setError(comparisonError?.message || 'The version comparison could not be completed.')
    } finally {
      setRunning(false)
    }
  }

  if (!project) return <div className="flex h-full items-center justify-center bg-slate-50"><div className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><div className="text-lg font-bold text-slate-900">No active project</div><Link href="/dashboard/projects" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Open a project</Link></div></div>

  const tabs: Array<[ComparisonTab, string, number]> = comparison ? [
    ['summary', 'Summary', comparison.activities?.length || 0],
    ['added', 'Added', comparison.added?.length || 0],
    ['removed', 'Removed', comparison.removed?.length || 0],
    ['changed', 'Changed', comparison.changed?.length || 0],
    ['milestones', 'Milestones', comparison.milestoneMovements?.length || 0],
  ] : []
  const displayedActivities = activeTab === 'added' ? comparison?.added : activeTab === 'removed' ? comparison?.removed : comparison?.changed

  return <div className="flex h-full flex-col">
    <header className="flex h-14 flex-shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6 no-print">
      <Link href="/dashboard/approval" className="text-xs font-bold text-blue-600 hover:text-blue-800">← Back to Review Schedule</Link>
      <div className="h-6 border-l border-slate-200" />
      <div><span className="text-base font-bold text-slate-900">Version Comparison</span><span className="ml-2 text-sm text-slate-400">· {project.name}</span></div>
      {comparison && <button onClick={() => window.print()} className="ml-auto rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">🖨 Print / Save PDF</button>}
    </header>

    <main className="flex-1 overflow-y-auto bg-slate-50 p-5">
      <div className="mx-auto max-w-6xl space-y-4">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white p-5">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-600">Changes since prior version</div>
            <h1 className="mt-1 text-xl font-black text-slate-900">Compare the selected submission to its immediate predecessor</h1>
            <p className="mt-1 text-xs text-slate-500">This compares actual XER activities, dates, durations, float, logic and milestones. It does not depend on activity names containing “change” or “CO”.</p>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
            <label><span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-wide text-slate-500">Prior version</span><select value={priorId} onChange={event => { setPriorId(event.target.value); setComparison(null) }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-800"><option value="">Select prior version</option>{versions.filter(version => version.id !== currentId).map(version => <option key={version.id} value={version.id}>{versionName(version)} · {shortDate(version.dataDate)}</option>)}</select></label>
            <div className="pb-2 text-center text-slate-400">→</div>
            <label><span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-wide text-slate-500">Current / selected version</span><select value={currentId} onChange={event => selectCurrent(event.target.value)} className="w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2.5 text-xs font-bold text-slate-900"><option value="">Select current version</option>{versions.map(version => <option key={version.id} value={version.id}>{versionName(version)} · {shortDate(version.dataDate)}</option>)}</select></label>
            <button disabled={running || !priorVersion || !currentVersion} onClick={runComparison} className="rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40">{running ? 'Comparing XERs…' : 'Run Comparison'}</button>
          </div>
        </section>

        {versions.length < 2 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">At least two active schedule versions are required. Upload the next submission before running comparison.</div>}
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{error}</div>}

        {comparison && <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Completion movement', delta(comparison.totalDelayDays), comparison.totalDelayDays > 0 ? 'text-red-700' : 'text-green-700'],
              ['Activities added', comparison.added?.length || 0, 'text-blue-700'],
              ['Activities removed', comparison.removed?.length || 0, 'text-red-700'],
              ['Activities changed', comparison.changed?.length || 0, 'text-amber-700'],
              ['Milestones moved', comparison.milestoneMovements?.length || 0, 'text-purple-700'],
            ].map(([label, value, color]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-1 text-2xl font-black ${color}`}>{value}</div></div>)}
          </section>

          <div className="flex gap-1 overflow-x-auto border-b border-slate-200 no-print">{tabs.map(([tab, label, count]) => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-bold ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>{label} <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px]">{count}</span></button>)}</div>

          {activeTab === 'summary' && <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-[10px] font-bold uppercase text-slate-500">Prior submission</div><div className="mt-1 text-sm font-extrabold text-slate-900">{versionName(priorVersion)}</div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><b>Data date</b><div>{shortDate(comparison.projectA?.dataDate)}</div></div><div><b>Projected end</b><div>{shortDate(comparison.projectA?.end)}</div></div></div></div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5"><div className="text-[10px] font-bold uppercase text-blue-600">Current submission</div><div className="mt-1 text-sm font-extrabold text-slate-900">{versionName(currentVersion)}</div><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><b>Data date</b><div>{shortDate(comparison.projectB?.dataDate)}</div></div><div><b>Projected end</b><div>{shortDate(comparison.projectB?.end)}</div></div></div></div>
          </section>}

          {(['added', 'removed', 'changed'] as ComparisonTab[]).includes(activeTab) && <ActivityTable activities={displayedActivities || []} />}
          {activeTab === 'milestones' && <MilestoneTable milestones={comparison.milestoneMovements || []} />}
        </>}
      </div>
    </main>
  </div>
}

function ActivityTable({ activities }: { activities: any[] }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><table className="w-full text-xs"><thead className="border-b border-slate-200 bg-slate-50"><tr><th className="px-3 py-2 text-left">Activity ID</th><th className="px-3 py-2 text-left">Activity</th><th className="px-3 py-2 text-right">Prior finish</th><th className="px-3 py-2 text-right">Current finish</th><th className="px-3 py-2 text-right">Finish Δ</th><th className="px-3 py-2 text-right">Duration Δ</th><th className="px-3 py-2 text-right">Float Δ</th><th className="px-3 py-2 text-center">Logic</th></tr></thead><tbody>{activities.length ? activities.map(activity => <tr key={`${activity.status}-${activity.task_code}`} className="border-b border-slate-100 last:border-0"><td className="px-3 py-2 font-mono font-bold">{activity.task_code}</td><td className="px-3 py-2 text-slate-700">{activity.task_name}</td><td className="px-3 py-2 text-right text-slate-500">{shortDate(activity.a_finish)}</td><td className="px-3 py-2 text-right text-slate-700">{shortDate(activity.b_finish)}</td><td className={`px-3 py-2 text-right font-bold ${Number(activity.finish_delta_days || 0) > 0 ? 'text-red-700' : 'text-green-700'}`}>{delta(activity.finish_delta_days)}</td><td className="px-3 py-2 text-right">{delta(activity.duration_delta_days)}</td><td className="px-3 py-2 text-right">{delta(activity.float_delta_days)}</td><td className="px-3 py-2 text-center">{activity.logic_changed ? <span className="rounded bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">Changed</span> : '—'}</td></tr>) : <tr><td colSpan={8} className="p-8 text-center text-slate-400">No activities in this category.</td></tr>}</tbody></table></div>
}

function MilestoneTable({ milestones }: { milestones: any[] }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><table className="w-full text-xs"><thead className="border-b border-slate-200 bg-slate-50"><tr><th className="px-3 py-2 text-left">Milestone ID</th><th className="px-3 py-2 text-left">Milestone</th><th className="px-3 py-2 text-right">Prior finish</th><th className="px-3 py-2 text-right">Current finish</th><th className="px-3 py-2 text-right">Movement</th></tr></thead><tbody>{milestones.length ? milestones.map(milestone => <tr key={milestone.task_code} className="border-b border-slate-100 last:border-0"><td className="px-3 py-2 font-mono font-bold">{milestone.task_code}</td><td className="px-3 py-2">{milestone.task_name}</td><td className="px-3 py-2 text-right">{shortDate(milestone.a_finish)}</td><td className="px-3 py-2 text-right">{shortDate(milestone.b_finish)}</td><td className={`px-3 py-2 text-right font-bold ${milestone.delta_days > 0 ? 'text-red-700' : 'text-green-700'}`}>{delta(milestone.delta_days)}</td></tr>) : <tr><td colSpan={5} className="p-8 text-center text-slate-400">No milestone movement detected.</td></tr>}</tbody></table></div>
}
