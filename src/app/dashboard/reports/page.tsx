'use client'

// =============================================================================
// src/app/dashboard/reports/page.tsx
// =============================================================================
// Report center. Sidebar views are working spaces; this page packages those
// results into focused, individually printable reports. The complete package is
// deliberately optional rather than the default experience.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion } from '@/lib/projectStore'
import { fmtReportDate } from '@/lib/reports'

type Card = {
  title: string
  description: string
  href: string
  icon: string
  note?: string
}

type Group = {
  label: string
  description: string
  cards: Card[]
}

const GROUPS: Group[] = [
  {
    label: 'Management & Review',
    description: 'Decision-ready summaries and formal schedule review outputs.',
    cards: [
      { title: 'Executive Summary', description: 'High-level schedule position, key dates, performance, and major risks.', href: '/dashboard/reports/executive', icon: '◫' },
      { title: 'Schedule Review Report', description: 'Deep diagnostic of schedule health, path exposure, float, logic, and delivery readiness.', href: '/dashboard/reports/full', icon: '▤' },
      { title: 'Approval Readiness Report', description: 'Approval domains, reviewer observations, recommendations, and supporting schedule references.', href: '/dashboard/reports/approval-readiness', icon: '✓' },
    ],
  },
  {
    label: 'Schedule Paths & Logic',
    description: 'Focused path, network, and schedule-quality reports.',
    cards: [
      { title: 'Critical Path Report', description: 'Critical activities and the schedule chain currently controlling completion.', href: '/dashboard/reports/critical-path', icon: '◎' },
      { title: 'Longest Path Report', description: 'Activities identified on the XER longest path, presented as a standalone report.', href: '/dashboard/reports/longest-path', icon: '↦' },
      { title: 'Near-Critical / Multiple Float Paths', description: 'Ranked low-float paths that may become critical if further slippage occurs.', href: '/dashboard/reports/near-critical', icon: '≋' },
      { title: 'Logic Trace Report', description: 'Choose an activity or milestone and document its predecessor/successor thread.', href: '/dashboard/reports/logic-trace', icon: '⌁' },
      { title: 'Schedule Quality Report', description: 'Open logic conditions, out-of-sequence work, and negative-float exposure.', href: '/dashboard/reports/schedule-quality', icon: '◇' },
      { title: 'Out-of-Sequence Report', description: 'Detailed activity/relationship evidence for detected out-of-sequence conditions.', href: '/dashboard/reports/oos', icon: '↯' },
    ],
  },
  {
    label: 'Risk & Delivery',
    description: 'Schedule risks and delivery-readiness reports.',
    cards: [
      { title: 'Risk Register', description: 'Detected schedule risk categories, severity, evidence, and reviewer actions.', href: '/dashboard/reports/risks', icon: '⚠' },
      { title: 'Procurement & Long-Lead', description: 'Long-lead activities, delivery exposure, and available float.', href: '/dashboard/reports/long-lead', icon: '▱' },
      { title: 'Submittals Report', description: 'Schedule submittal activities, approval timing, and float exposure.', href: '/dashboard/reports/submittals', icon: '▧' },
    ],
  },
  {
    label: 'Performance & Change Over Time',
    description: 'Performance, update-to-update movement, and delay-analysis reports.',
    cards: [
      { title: 'Performance & EVM Report', description: 'Planned value, earned value, actual cost, SPI/CPI, and forecast metrics where available.', href: '/dashboard/reports/evm', icon: '$' },
      { title: 'Schedule Trends Report', description: 'Movement in completion, float, health, and other metrics across schedule versions.', href: '/dashboard/reports/trend', icon: '↗' },
      { title: 'Time Impact Analysis', description: 'Delay-event documentation and schedule impact comparison.', href: '/dashboard/reports/tia', icon: '∆' },
    ],
  },
]

export default function ReportsPage() {
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    setVersion(getActiveVersion(p))
    setReady(true)
  }, [])

  if (!ready) return <div className="p-6 text-sm text-slate-500">Loading reports…</div>

  if (!project || !version) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="text-2xl mb-2">📄</div>
          <div className="text-sm font-bold text-slate-900">Select a project and schedule version</div>
          <div className="text-xs text-slate-500 mt-1">Reports are generated from the active schedule version.</div>
        </div>
      </div>
    )
  }

  const dataDate = version?.analysis?.dataDate || version?.dataDate || version?.uploadedAt

  return (
    <div className="p-4 md:p-6 max-w-[1280px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Project Reports</div>
          <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">Reports</h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Open only the report you need. Each report has its own page and can be reviewed or exported independently.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500">
          <div><span className="font-semibold text-slate-700">{project.projectId || project.name}</span></div>
          <div>{version.versionLabel || version.fileName || 'Active version'} · Data Date {fmtReportDate(dataDate)}</div>
        </div>
      </div>

      <div className="space-y-6">
        {GROUPS.map(group => (
          <section key={group.label}>
            <div className="mb-2.5">
              <h2 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-700">{group.label}</h2>
              <p className="text-[10.5px] text-slate-400 mt-0.5">{group.description}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {group.cards.map(card => <ReportCard key={card.href} card={card} />)}
            </div>
          </section>
        ))}

        <section className="pt-1">
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-700">Complete Report Package</div>
              <div className="text-[10.5px] text-slate-500 mt-1 max-w-2xl">
                Optional. Use this only when a stakeholder wants the full combined schedule-review package rather than an individual report.
              </div>
            </div>
            <Link href="/dashboard/reports/complete"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-[11px] font-bold text-slate-800 hover:bg-slate-100">
              📚 Open complete package
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

function ReportCard({ card }: { card: Card }) {
  return (
    <Link href={card.href}
      className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors min-h-[128px] flex flex-col">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-lg flex-shrink-0 group-hover:bg-blue-100 group-hover:text-blue-700">{card.icon}</div>
        <div className="min-w-0">
          <div className="text-[12px] font-extrabold text-slate-900">{card.title}</div>
          <div className="text-[10.5px] text-slate-500 leading-relaxed mt-1">{card.description}</div>
        </div>
      </div>
      <div className="mt-auto pt-3 text-[10px] font-bold text-blue-600">Open report →</div>
    </Link>
  )
}
