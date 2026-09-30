'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveProject } from '@/lib/projectStore'
import { usePermissions } from '@/lib/usePermissions'
import { loadTIAReportSnapshot, TIAReportSnapshot } from '@/lib/tiaReportSnapshot'
import { printReport } from '@/lib/printReport'
import TIAComparisonReport from '@/components/reports/TIAComparisonReport'

export default function TIAReportPage() {
  const perms = usePermissions()
  const [snapshot, setSnapshot] = useState<TIAReportSnapshot | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const project = getActiveProject()
    setSnapshot(project ? loadTIAReportSnapshot(project) : null)
    setReady(true)
  }, [])
  if (!ready || perms.loading) return <div className="p-6">Loading TIA report…</div>
  if (!perms.can.runAdvancedAnalytics) return <div className="p-6">Ask your project administrator for access to Time Impact Analysis.</div>
  return <div className="h-full overflow-y-auto bg-slate-50">
    <header className="flex flex-wrap items-center gap-3 p-4 border-b bg-white">
      <Link href="/dashboard/reports" className="text-sm text-blue-600">← Reports</Link>
      <h1 className="font-bold">Time Impact Analysis Report</h1>
      {snapshot && <button className="ml-auto bg-blue-600 text-white rounded-lg px-3 py-2 text-xs font-bold" onClick={() => printReport('tia-comparison-report', { title: 'TIA Comparison' })}>Print / Save PDF</button>}
      <Link href={snapshot ? '/dashboard/tia?resume=1' : '/dashboard/tia'} className="text-xs border rounded-lg px-3 py-2">{snapshot ? 'Return to comparison / Word export' : 'Run TIA comparison'}</Link>
    </header>
    <main className="max-w-5xl mx-auto p-5">
      {snapshot ? <><p className="text-xs text-slate-500 mb-3">Last comparison for this project in this browser session. The two versions below define this report; changing the sidebar version does not change this comparison.</p><TIAComparisonReport snapshot={snapshot} /></> : <section className="bg-white rounded-xl border p-8 text-center"><h2 className="text-lg font-bold">Run a two-schedule comparison first</h2><p className="text-sm text-slate-600 mt-3">No comparison is available in this session for this project. A TIA cannot be generated from one active schedule. Select the unimpacted update and impacted fragnet schedule, then compare them.</p><Link href="/dashboard/tia" className="inline-block mt-5 rounded-lg bg-blue-600 px-4 py-2 text-white text-sm">Open Time Impact Analysis →</Link></section>}
    </main>
  </div>
}
