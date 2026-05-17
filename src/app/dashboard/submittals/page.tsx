'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion } from '@/lib/projectStore'
type Tier = 'critical' | 'near' | 'healthy'
export default function SubmittalsPage() {
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
    // Show the SELECTED version (V1 / V2 / etc. from sidebar), falling back
    // to the latest version when nothing is explicitly selected. Previously
    // this always called getLatestVersion which ignored sidebar selection.
    const v = getActiveVersion(p)
    setAnalysis(v?.analysis || null)
  }
  function tierOf(floatDays: number): Tier {
    if (floatDays <= 0) return 'critical'
    if (floatDays <= 14) return 'near'
    return 'healthy'
  }
  function tierStyle(tier: Tier) {
    if (tier === 'critical') return { badge: 'bg-red-100 text-red-700', label: 'Critical Path' }
    if (tier === 'near') return { badge: 'bg-amber-100 text-amber-700', label: 'Near Critical' }
    return { badge: 'bg-green-100 text-green-700', label: 'Healthy' }
  }
  if (!project) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <span className="font-bold text-slate-900 text-base">Submittals</span>
          <span className="text-slate-400 text-sm ml-2">· No active project</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">📋</span>
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
          <span className="font-bold text-slate-900 text-base">Submittals</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name}</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-sm text-slate-500">No analysis available. Upload a fresh XER to populate submittals data.</div>
        </div>
      </div>
    )
  }
  function floatDaysOf(t: any) {
    return Math.round(parseFloat(t.total_float_hr_cnt || '0') / 8)
  }
  const allSubmittals = (analysis.submittals || []).map((t: any) => ({
    ...t,
    floatDays: floatDaysOf(t),
    tier: tierOf(floatDaysOf(t)),
  }))
  const filtered = allSubmittals.filter((item: any) => {
    if (filter !== 'all' && item.tier !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (item.task_name || '').toLowerCase().includes(q) || (item.task_code || '').toLowerCase().includes(q)
    }
    return true
  })
  const counts = {
    critical: allSubmittals.filter((i: any) => i.tier === 'critical').length,
    near: allSubmittals.filter((i: any) => i.tier === 'near').length,
    healthy: allSubmittals.filter((i: any) => i.tier === 'healthy').length,
  }
  function shortDate(d?: string) { return d ? d.slice(0, 10) : '—' }
  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Submittals</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name} · {allSubmittals.length} items</span>
        </div>
        <button onClick={() => window.print()} className="ml-auto text-xs border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-400 font-semibold">
          🖨 Print
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="max-w-6xl mx-auto space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <div className="font-bold text-blue-900 text-sm">Critical path & near-critical submittals</div>
              <div className="text-xs text-blue-800 mt-0.5">
                Review and approval activities (shop drawings, submittals, coordination drawings, O&M) detected from your XER.
                Classified by float — those impacting the critical path first.
              </div>
            </div>
          </div>
          <div className="flex gap-2 no-print">
            <button onClick={() => setFilter('all')}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              All ({allSubmittals.length})
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
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 font-bold text-slate-600">Status</th>
                  <th className="text-left px-3 py-2 font-bold text-slate-600">Code</th>
                  <th className="text-left px-3 py-2 font-bold text-slate-600">Submittal</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Submit Date</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Approval Date</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">% Complete</th>
                  <th className="text-right px-3 py-2 font-bold text-slate-600">Float</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-slate-400">No submittals detected. Upload a fresh XER if you expect submittals data.</td></tr>
                ) : filtered.map((item: any, i: number) => {
                  const style = tierStyle(item.tier)
                  const pct = parseFloat(item.phys_complete_pct || '0')
                  return (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.badge}`}>{style.label}</span></td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.task_code}</td>
                      <td className="px-3 py-2 text-slate-700">{item.task_name}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{shortDate(item.early_start_date || item.target_start_date)}</td>
                      <td className="px-3 py-2 text-right text-slate-600 font-semibold">{shortDate(item.early_end_date || item.target_end_date)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{pct}%</td>
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
