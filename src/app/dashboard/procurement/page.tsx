'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getActiveProject, getLatestVersion } from '@/lib/projectStore'

type Tier = 'critical' | 'near' | 'healthy'

export default function ProcurementPage() {
  const [project, setProject] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [filter, setFilter] = useState<'all' | Tier>('all')
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

  function tierOf(floatDays: number): Tier {
    if (floatDays <= 0) return 'critical'
    if (floatDays <= 14) return 'near'
    return 'healthy'
  }

  function tierStyle(tier: Tier) {
    if (tier === 'critical') return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700', label: 'Critical Path' }
    if (tier === 'near') return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', label: 'Near Critical' }
    return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-700', label: 'Healthy' }
  }

  if (!project) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <span className="font-bold text-slate-900 text-base">Procurement</span>
          <span className="text-slate-400 text-sm ml-2">· No active project</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">🚚</span>
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
          <span className="font-bold text-slate-900 text-base">Procurement</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name}</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-sm text-slate-500">No analysis available yet.</div>
        </div>
      </div>
    )
  }

  // Combine long lead + short lead with tier classification
  const allLeadItems = [...(analysis.longLeadItems || []), ...(analysis.shortLeadItems || [])]
    .map((item: any) => ({
      ...item,
      tier: tierOf(item.floatDays),
      isLongLead: (analysis.longLeadItems || []).includes(item) || item.durationDays >= 35,
    }))
    .sort((a, b) => a.floatDays - b.floatDays)

  const filtered = allLeadItems.filter(item => {
    if (filter !== 'all' && item.tier !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (item.task_name || '').toLowerCase().includes(q) || (item.task_code || '').toLowerCase().includes(q)
    }
    return true
  })

  const counts = {
    critical: allLeadItems.filter(i => i.tier === 'critical').length,
    near: allLeadItems.filter(i => i.tier === 'near').length,
    healthy: allLeadItems.filter(i => i.tier === 'healthy').length,
  }

  function shortDate(d?: string) { return d ? d.slice(0, 10) : '—' }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Procurement</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name} · {allLeadItems.length} items</span>
        </div>
        <button onClick={() => window.print()} className="ml-auto text-xs border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-400 font-semibold">
          🖨 Print
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="max-w-6xl mx-auto space-y-3">

          {/* Intro */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">🚚</span>
            <div>
              <div className="font-bold text-blue-900 text-sm">Long lead + short lead procurement items</div>
              <div className="text-xs text-blue-800 mt-0.5">
                Material and equipment delivery activities. Tracking delivery dates and fabrication periods.
                Classified by float — critical path items first.
              </div>
            </div>
          </div>

          {/* Filter buttons */}
          <div className="flex gap-2 no-print">
            <button onClick={() => setFilter('all')}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              All ({allLeadItems.length})
            </button>
            <button onClick={() => setFilter('critical')}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${filter === 'critical' ? 'bg-red-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              🚨 Critical Path ({counts.critical})
            </button>
            <button onClick={() => setFilter('near')}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${filter === 'near' ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              ⚠️ Near Critical ({counts.near})
            </button>
            <button onClick={() => setFilter('healthy')}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${filter === 'healthy' ? 'bg-green-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              ✓ Healthy ({counts.healthy})
            </button>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or code..."
              className="ml-auto text-xs px-3 py-2 border border-slate-200 rounded-lg w-56 focus:outline-none focus:border-blue-500" />
          </div>

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-bold text-slate-600">Status</th>
                  <th className="text-left px-3 py-2 font-bold text-slate-600">Code</th>
                  <th className="text-left px-3 py-2 font-bold text-slate-600">Activity</th>
                  <th className="text-left px-3 py-2 font-bold text-slate-600">Type</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Start</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Delivery / Finish</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Duration</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Float</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-slate-400">No procurement items match your filter</td></tr>
                ) : filtered.map((item: any, i: number) => {
                  const style = tierStyle(item.tier)
                  return (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>{style.label}</span></td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.task_code}</td>
                      <td className="px-3 py-2 text-slate-700">{item.task_name}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.isLongLead ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {item.isLongLead ? 'Long Lead' : 'Short Lead'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{shortDate(item.early_start_date || item.target_start_date || item.act_start_date)}</td>
                      <td className="px-3 py-2 text-right text-slate-600 font-semibold">{shortDate(item.early_end_date || item.target_end_date || item.act_end_date)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{item.durationDays}d</td>
                      <td className={`px-3 py-2 text-right font-bold ${item.floatDays < 0 ? 'text-red-600' : item.floatDays <= 14 ? 'text-amber-600' : 'text-green-600'}`}>
                        {item.floatDays}d
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
