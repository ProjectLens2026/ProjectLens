'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Project,
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

  const versionCount = getVisibleVersions(project).length

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-14 flex-shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-6 py-3">
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
