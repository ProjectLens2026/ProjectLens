'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getActiveProject, getLatestVersion } from '@/lib/projectStore'

export default function ChangeOrdersPage() {
  const [project, setProject] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [])

  function refresh() {
    const p = getActiveProject()
    setProject(p)
    const v = getLatestVersion(p)
    setAnalysis(v?.analysis || null)
  }

  if (!project) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <span className="font-bold text-slate-900 text-base">Change Orders</span>
          <span className="text-slate-400 text-sm ml-2">· No active project</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">🔄</span>
            </div>
            <div className="text-lg font-bold text-slate-700 mb-2">Select a project first</div>
            <Link href="/dashboard/projects" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 mt-3">
              Go to Projects →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <span className="font-bold text-slate-900 text-base">Change Orders</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name}</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-sm text-slate-500">No analysis available. Upload a fresh XER to populate change order data.</div>
        </div>
      </div>
    )
  }

  const allChanges = analysis.changeOrders || []

  const filtered = allChanges.filter((item: any) => {
    if (search) {
      const q = search.toLowerCase()
      return (item.task_name || '').toLowerCase().includes(q) || (item.task_code || '').toLowerCase().includes(q)
    }
    return true
  })

  function shortDate(d?: string) { return d ? d.slice(0, 10) : '—' }

  function statusBadge(t: any) {
    if (t.status_code === 'TK_Complete') return { label: 'Complete', color: 'bg-green-100 text-green-700' }
    if (t.status_code === 'TK_Active') return { label: 'In Progress', color: 'bg-amber-100 text-amber-700' }
    return { label: 'Not Started', color: 'bg-slate-100 text-slate-700' }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Change Orders</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name} · {allChanges.length} items</span>
        </div>
        <button onClick={() => window.print()} className="ml-auto text-xs border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-400 font-semibold">
          🖨 Print
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="max-w-6xl mx-auto space-y-3">

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">🔄</span>
            <div>
              <div className="font-bold text-blue-900 text-sm">Change orders detected from your schedule</div>
              <div className="text-xs text-blue-800 mt-0.5">
                Activities with change-related keywords (CHANGE, CO-, DESIGN CHANGE, FIELD CHANGE, MODIFICATION, AMENDMENT, REVISION, PO-, PURCHASE ORDER) found in your XER.
                These typically represent fragnets for changes to scope, contract, baseline, or duration.
              </div>
            </div>
          </div>

          <div className="flex gap-2 no-print">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search change orders..."
              className="ml-auto text-xs px-3 py-2 border border-slate-200 rounded-lg w-72 focus:outline-none focus:border-blue-500" />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-bold text-slate-600">Status</th>
                  <th className="text-left px-3 py-2 font-bold text-slate-600">Code</th>
                  <th className="text-left px-3 py-2 font-bold text-slate-600">Change Activity</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Date Submitted</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Expected Finish</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Duration</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Float</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">
                    {allChanges.length === 0 ? 'No change orders detected. Upload a fresh XER if you expect changes data.' : 'No change orders match your search.'}
                  </td></tr>
                ) : filtered.map((item: any, i: number) => {
                  const status = statusBadge(item)
                  const float = Math.round(parseFloat(item.total_float_hr_cnt || '0') / 8)
                  const duration = Math.round(parseFloat(item.target_drtn_hr_cnt || '0') / 8)
                  return (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span></td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.task_code}</td>
                      <td className="px-3 py-2 text-slate-700">{item.task_name}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{shortDate(item.early_start_date || item.target_start_date || item.act_start_date)}</td>
                      <td className="px-3 py-2 text-right text-slate-600 font-semibold">{shortDate(item.early_end_date || item.target_end_date)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{duration}d</td>
                      <td className={`px-3 py-2 text-right font-bold ${float < 0 ? 'text-red-600' : float <= 14 ? 'text-amber-600' : 'text-green-600'}`}>
                        {float}d
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
