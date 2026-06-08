'use client'

// =============================================================================
// src/app/dashboard/reports/page.tsx
// =============================================================================
// The Reports hub — the front door to ControlLens's reporting library.
//
// Customers come here when they want a polished, printable document to
// share with owners, contracting officers, or executives. Each card opens
// a dedicated branded report with Print / Save-as-PDF and (eventually) Word.
//
// Pattern matches EstimateLens's /reports hub: 2-column responsive grid,
// each card has a tag chip, a title, a description, and a Ready/Planned
// status pill.
// =============================================================================

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getActiveProject, Project } from '@/lib/projectStore'

interface ReportCard {
  href: string                    // route when Ready, '#' when Planned
  title: string
  desc: string
  live: boolean
  tag: string
}

export default function ReportsHubPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setProject(getActiveProject())
    setReady(true)
  }, [])

  // Cards in the order customers think about them — exec first, then
  // detailed analyses, then deliverables (book) last.
  const reports: ReportCard[] = [
    {
      href: '/dashboard/reports/executive',
      title: 'Executive Summary',
      desc: 'Schedule health, key dates, top risks, and the planned-vs-actual curve. For owners and execs who want the shape of the project in one page.',
      live: true,
      tag: 'EXEC',
    },
    {
      href: '/dashboard/reports/full',
      title: 'Full Analysis Report',
      desc: 'Every diagnostic the Lens engine produces — critical path drivers, float distribution, logic anomalies, activity-level risk, and TIA evidence.',
      live: true,
      tag: 'FULL',
    },
    {
      href: '/dashboard/reports/risks',
      title: 'Risk Register',
      desc: 'Every detected risk grouped by severity (Critical / High / Medium) with the activity, the cause in plain English, and the recommended action.',
      live: true,
      tag: 'RISK',
    },
    {
      href: '/dashboard/reports/oos',
      title: 'Out-of-Sequence Report',
      desc: 'The exact activities P6 Schedule Log would flag — successors actualized before their predecessors. Matches the federal audit convention.',
      live: true,
      tag: 'OOS',
    },
    {
      href: '/dashboard/reports/tia',
      title: 'Time Impact Analysis',
      desc: 'Quantifies the delay caused by a fragnet or schedule change. Shows the un-impacted vs impacted path with the day-by-day variance.',
      live: true,
      tag: 'TIA',
    },
    {
      href: '/dashboard/reports/trend',
      title: 'Trend & Variance Report',
      desc: 'Compare any two schedule versions side-by-side — added, removed, and changed activities, milestone movement, and logic deltas.',
      live: true,
      tag: 'TREND',
    },
    {
      href: '#',
      title: 'Long-Lead & Procurement',
      desc: 'Long-lead items, procurement activities, and their float exposure. Surfaces what could trip up the construction sequence weeks out.',
      live: false,
      tag: 'LEAD',
    },
    {
      href: '#',
      title: 'Earned Value Report',
      desc: 'PV, EV, AC, SV, CV, CPI, SPI with time-phased curves. Construction-only activities; LOE and milestone work excluded by default.',
      live: false,
      tag: 'EVM',
    },
    {
      href: '#',
      title: 'Submittals & RFI Impact',
      desc: 'Outstanding submittals and RFIs mapped to the activities they hold up. Shows which schedule risks trace back to a paperwork bottleneck.',
      live: false,
      tag: 'SUB',
    },
    {
      href: '/dashboard/report',
      title: 'Complete Project Report',
      desc: 'Everything in one printable document — executive summary, critical path, longest path, multiple float paths, sequence problems, long lead, submittals, milestones, lookahead, EVM, and appendices. One PDF for the owner.',
      live: true,
      tag: 'BOOK',
    },
  ]

  // Loading state — projectStore reads from IndexedDB asynchronously
  if (!ready) {
    return <div className="p-6 text-sm text-slate-500">Loading reports…</div>
  }

  // No project loaded — direct them to upload
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
            <span className="text-3xl">📄</span>
          </div>
          <div className="text-lg font-bold text-slate-700 mb-2">No project loaded</div>
          <div className="text-sm text-slate-500 mb-4">
            Upload a P6 XER file to generate reports. The reports library opens once a project is active.
          </div>
          <Link href="/dashboard/upload" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">
            Upload Schedule
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-1">
          Project · {project.projectId || project.name}
        </div>
        <h1 className="text-[26px] font-extrabold leading-tight" style={{ color: '#13202e' }}>
          Reports
        </h1>
        <p className="text-[13px] text-slate-500 mt-1.5 max-w-[680px] leading-relaxed">
          Branded, printable documents for the active project. Each report uses
          the latest schedule version. Click a card to open it, then Print /
          Save as PDF or download as Word.
        </p>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((r) =>
          r.live ? (
            <Link
              key={r.title}
              href={r.href}
              className="rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-400 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="font-mono text-[10px] font-bold text-white rounded px-1.5 py-0.5 tracking-wide"
                  style={{ background: '#13202e' }}
                >
                  {r.tag}
                </span>
                <span className="text-[14px] font-extrabold" style={{ color: '#13202e' }}>
                  {r.title}
                </span>
                <span
                  className="ml-auto text-[10px] font-bold uppercase tracking-wide rounded px-2 py-0.5"
                  style={{ background: '#e6f5ee', color: '#1f9d63' }}
                >
                  Ready
                </span>
              </div>
              <p className="text-[12px] text-slate-500 leading-relaxed">{r.desc}</p>
            </Link>
          ) : (
            <div
              key={r.title}
              className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 opacity-80"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-[10px] font-bold text-slate-500 rounded px-1.5 py-0.5 bg-slate-100 tracking-wide">
                  {r.tag}
                </span>
                <span className="text-[14px] font-extrabold text-slate-600">{r.title}</span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide rounded px-2 py-0.5 bg-slate-100 text-slate-500">
                  Planned
                </span>
              </div>
              <p className="text-[12px] text-slate-400 leading-relaxed">{r.desc}</p>
            </div>
          )
        )}
      </div>

      {/* Footer note */}
      <div className="mt-6 text-[11px] text-slate-400 leading-relaxed border-t border-slate-200 pt-4">
        <span className="font-bold text-slate-500">Generated by ControlLens</span> — analysis is advisory; the P6 schedule of record governs.
        New reports ship monthly. Tell us which one you need next at <a href="mailto:support@control-lens.com" className="text-blue-600 hover:underline">support@control-lens.com</a>.
      </div>
    </div>
  )
}
