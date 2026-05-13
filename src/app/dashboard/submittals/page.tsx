'use client'
import { useState, useEffect } from 'react'
import { getActiveAnalysis } from '@/lib/projectStore'

export default function SubmittalsPage() {
  const [analysis, setAnalysis] = useState<any>(null)
  const [filter, setFilter] = useState<'all' | 'long' | 'short'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [])

  function refresh() {
    setAnalysis(getActiveAnalysis())
  }

  function shortDate(d?: string) {
    if (!d) return '—'
    return d.slice(0, 10)
  }

  function getEffectiveStart(t: any) {
    return t.act_start_date || t.early_start_date || t.target_start_date || ''
  }

  function getEffectiveFinish(t: any) {
    return t.early_end_date || t.act_end_date || t.target_end_date || ''
  }

  const longLead = analysis?.longLeadItems || []
  const shortLead = analysis?.shortLeadItems || []

  const allItems = [
    ...longLead.map((t: any) => ({ ...t, leadType: 'Long Lead' })),
    ...shortLead.map((t: any) => ({ ...t, leadType: 'Short Lead' })),
  ]

  const filtered = allItems
    .filter(t => filter === 'all' ? true : filter === 'long' ? t.leadType === 'Long Lead' : t.leadType === 'Short Lead')
    .filter(t => search ? (t.task_code + ' ' + t.task_name).toLowerCase().includes(search.toLowerCase()) : true)

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Submittals</span>
          <span className="text-slate-400 text-sm ml-2">· Procurement lead items from schedule</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.print()}
            className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-slate-400 font-semibold">
            🖨 Print / Save PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!analysis ? (
          <div className="max-w-lg mx-auto text-center py-20">
            <div className="text-5xl mb-4">📋</div>
            <div className="text-lg font-bold text-slate-700 mb-2">No schedule uploaded yet</div>
            <div className="text-sm text-slate-500 mb-6">Upload a schedule first to see procurement lead items.</div>
            <a href="/dashboard/upload"
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
              Upload Schedule →
            </a>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="text-xs text-red-600 font-semibold mb-1">Long Lead Items (≥ 35 days)</div>
                <div className="text-3xl font-extrabold text-red-700">{longLead.length}</div>
                <div className="text-xs text-red-500 mt-1">
                  {longLead.filter((t: any) => t.floatDays < 0).length} with negative float
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-xs text-amber-600 font-semibold mb-1">Short Lead Items (20-34 days)</div>
                <div className="text-3xl font-extrabold text-amber-700">{shortLead.length}</div>
                <div className="text-xs text-amber-500 mt-1">
                  {shortLead.filter((t: any) => t.floatDays < 0).length} with negative float
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500 font-semibold mb-1">Schedule Data Date</div>
                <div className="text-lg font-extrabold text-slate-700">{shortDate(analysis.dataDate)}</div>
                <div className="text-xs text-slate-400 mt-1">From: {analysis.projectName}</div>
              </div>
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border-l-4 border-blue-500 rounded-r-lg p-3 mb-5 text-xs text-blue-900 leading-relaxed">
              Showing procurement activities from the uploaded XER. Durations calculated using each activity's assigned P6 calendar.
              Sorted by total float — most critical first. Items below 20 days are not shown.
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                {[
                  { key: 'all', label: `All (${allItems.length})` },
                  { key: 'long', label: `Long Lead (${longLead.length})` },
                  { key: 'short', label: `Short Lead (${shortLead.length})` },
                ].map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key as any)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${filter === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <input
                className="ml-auto px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400 w-48"
                placeholder="Search activity..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <div className="col-span-2">Activity ID</div>
                <div className="col-span-4">Description</div>
                <div className="col-span-1 text-right">Duration</div>
                <div className="col-span-1 text-right">Remaining</div>
                <div className="col-span-1 text-center">% Done</div>
                <div className="col-span-1 text-right">Float</div>
                <div className="col-span-1 text-center">Type</div>
                <div className="col-span-1 text-center">Status</div>
              </div>

              {filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">No items match your filter.</div>
              ) : (
                filtered.map((t: any, i: number) => {
                  const isNegFloat = t.floatDays < 0
                  const isZeroFloat = t.floatDays === 0
                  const isComplete = t.status_code === 'TK_Complete'
                  const isLong = t.leadType === 'Long Lead'
                  const pct = parseFloat(t.phys_complete_pct || '0')

                  return (
                    <div key={i} className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-100 last:border-0 text-xs items-center hover:bg-slate-50 transition-colors ${isNegFloat && !isComplete ? 'bg-red-50/30' : ''}`}>
                      <div className="col-span-2 font-mono font-bold text-slate-900">{t.task_code}</div>
                      <div className="col-span-4 text-slate-700 leading-tight">{t.task_name}</div>
                      <div className="col-span-1 text-right text-slate-600">{t.durationDays}d</div>
                      <div className="col-span-1 text-right font-semibold text-slate-700">{t.remainingDays}d</div>
                      <div className="col-span-1 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <div className="w-10 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-500">{pct}%</span>
                        </div>
                      </div>
                      <div className={`col-span-1 text-right font-bold ${isNegFloat ? 'text-red-600' : isZeroFloat ? 'text-amber-600' : 'text-green-600'}`}>
                        {t.floatDays}d
                      </div>
                      <div className="col-span-1 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isLong ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {isLong ? 'Long' : 'Short'}
                        </span>
                      </div>
                      <div className="col-span-1 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isComplete ? 'bg-green-100 text-green-700' : t.status_code === 'TK_Active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {isComplete ? 'Done' : t.status_code === 'TK_Active' ? 'Active' : 'Not Started'}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
