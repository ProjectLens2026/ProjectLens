'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Project,
  ScheduleVersion,
  getActiveProject,
  getVisibleVersions,
  subscribeToProjects,
  whenHydrated,
} from '@/lib/projectStore'
import { usePermissions } from '@/lib/usePermissions'

interface ControlArea {
  href: string
  icon: string
  title: string
  description: string
  advanced?: boolean
}

const CONTROL_AREAS: ControlArea[] = [
  {
    href: '/dashboard/risks',
    icon: '⚠',
    title: 'Risks & Issues',
    description: 'Track project threats, ownership, mitigation and unresolved management actions.',
  },
  {
    href: '/dashboard/procurement',
    icon: '🚚',
    title: 'Procurement & Long Lead',
    description: 'Control buyout, fabrication, delivery and schedule exposure for critical materials and equipment.',
  },
  {
    href: '/dashboard/submittals',
    icon: '📋',
    title: 'Submittals',
    description: 'Monitor submission, review, approval and release dependencies across the project.',
  },
  {
    href: '/dashboard/evm',
    icon: '◈',
    title: 'Cost & EVM',
    description: 'Measure planned value, earned value, actual cost and project performance by period.',
    advanced: true,
  },
  {
    href: '/dashboard/trend',
    icon: '↗',
    title: 'Schedule Trends',
    description: 'Measure milestone movement, forecast change, float deterioration and performance across versions.',
    advanced: true,
  },
  {
    href: '/dashboard/changes',
    icon: '⇄',
    title: 'Changes',
    description: 'Review project changes and understand how the current version differs from prior submissions.',
    advanced: true,
  },
]

export default function ProjectControlsPage() {
  const permissions = usePermissions()
  const [project, setProject] = useState<Project | null>(null)

  useEffect(() => {
    let mounted = true
    function sync() {
      if (mounted) setProject(getActiveProject())
    }
    whenHydrated().then(sync)
    const unsubscribe = subscribeToProjects(sync)
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  if (!project) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">Select a project</h1>
          <p className="mt-2 text-sm text-slate-500">Project Controls measures the complete project across all schedule versions.</p>
          <Link href="/dashboard/projects" className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
            Go to Projects
          </Link>
        </div>
      </div>
    )
  }

  const visibleVersions = getVisibleVersions(project)
  const versionCount = visibleVersions.length
  const xerVersions = visibleVersions.filter(version => version.analysis?.sourceFormat !== 'MS_PROJECT_XML')
  const byMostRecent = (a: ScheduleVersion, b: ScheduleVersion) =>
    new Date(b.dataDate || b.uploadedAt).getTime() - new Date(a.dataDate || a.uploadedAt).getTime()
  const latestUnimpacted = [...xerVersions]
    .filter(version => version.scheduleType !== 'fragnet')
    .sort(byMostRecent)[0]
  const latestFragnet = [...xerVersions]
    .filter(version => version.scheduleType === 'fragnet')
    .sort(byMostRecent)[0]
  const tiaReady = Boolean(latestUnimpacted && latestFragnet)
  const versionName = (version: ScheduleVersion | undefined) =>
    version ? (version.versionLabel || version.fileName) : 'Not uploaded'
  const versionDate = (version: ScheduleVersion | undefined) => {
    if (!version?.dataDate) return 'Data date unavailable'
    const date = new Date(version.dataDate)
    return Number.isNaN(date.getTime()) ? version.dataDate : date.toLocaleDateString('en-US')
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-14 flex-shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
        <Link href="/dashboard" className="text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap">
          ← Back to Overview
        </Link>
        <div className="h-6 border-l border-slate-200" />
        <div>
          <span className="text-base font-bold text-slate-900">Project Controls</span>
          <span className="ml-2 text-sm text-slate-400">· {project.name}</span>
        </div>
        <span className="ml-auto rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700">
          Project-level · {versionCount} version{versionCount === 1 ? '' : 's'}
        </span>
      </header>

      <main className="flex-1 overflow-y-auto bg-slate-50 p-5">
        <div className="mx-auto max-w-5xl">
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-extrabold text-slate-950">Control the complete project</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  These controls continue across every XER version. Schedule versions provide evidence, but risks, procurement, submittals, cost and changes belong to the project.
                </p>
              </div>
              <Link href="/dashboard/project-setup" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                Project Setup
              </Link>
            </div>
          </section>

          <section className="mb-5 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-blue-100 bg-blue-50 px-5 py-4">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-blue-700">Primary project control</div>
                <h2 className="mt-1 text-lg font-extrabold text-slate-950">Time Impact Analysis</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
                  Establish the schedule immediately before the delay, compare it with the impacted fragnet schedule, and trace the change in the controlling path.
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide ${tiaReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                {tiaReady ? 'Ready to compare' : 'Schedule evidence required'}
              </span>
            </div>

            <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${latestUnimpacted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white'}`}>1</span>
                  <h3 className="text-sm font-extrabold text-slate-900">Unimpacted update</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">Use the most recent unimpacted update immediately before the delay event was inserted.</p>
                <div className={`mt-3 rounded-lg border p-3 ${latestUnimpacted ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="truncate text-xs font-bold text-slate-900">{versionName(latestUnimpacted)}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{versionDate(latestUnimpacted)}</div>
                </div>
                {!latestUnimpacted && (
                  <Link href="/dashboard/upload" className="mt-3 inline-flex text-xs font-bold text-blue-600 hover:text-blue-800">Upload current update →</Link>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${latestFragnet ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white'}`}>2</span>
                  <h3 className="text-sm font-extrabold text-slate-900">Impacted fragnet schedule</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">Upload the same update with the fragnet inserted and logically tied to the affected work.</p>
                <div className={`mt-3 rounded-lg border p-3 ${latestFragnet ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="truncate text-xs font-bold text-slate-900">{versionName(latestFragnet)}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{versionDate(latestFragnet)}</div>
                </div>
                {!latestFragnet && (
                  <Link href="/dashboard/upload" className="mt-3 inline-flex text-xs font-bold text-blue-600 hover:text-blue-800">Upload fragnet schedule →</Link>
                )}
              </div>

              <div className="p-5">
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${tiaReady ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
                  <h3 className="text-sm font-extrabold text-slate-900">Compare controlling paths</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">Measure completion impact and compare the unimpacted and impacted critical paths side by side.</p>
                <Link
                  href="/dashboard/tia"
                  aria-disabled={!tiaReady}
                  className={`mt-5 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-xs font-extrabold ${tiaReady ? 'bg-blue-600 text-white hover:bg-blue-700' : 'pointer-events-none bg-slate-100 text-slate-400'}`}
                >
                  {tiaReady ? 'Run TIA Comparison →' : 'Complete steps 1 and 2'}
                </Link>
                <div className="mt-2 text-center text-[10px] text-slate-400">Results include path divergence, milestone movement, fragnet effects and a formal Word report.</div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {CONTROL_AREAS.filter(area => !area.advanced || permissions.can.runAdvancedAnalytics).map(area => (
              <Link key={area.href} href={area.href} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-700 group-hover:bg-blue-50 group-hover:text-blue-700">
                    {area.icon}
                  </span>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">{area.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{area.description}</p>
                    <div className="mt-3 text-[11px] font-bold text-blue-600">Open control →</div>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        </div>
      </main>
    </div>
  )
}
