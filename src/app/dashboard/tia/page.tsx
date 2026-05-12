'use client'
import { useState, useRef } from 'react'

type Step = 'upload' | 'analyzing' | 'review' | 'categorize' | 'generating'

interface FragnetCategorization {
  category: string
  description: string
}

export default function TIAPage() {
  const [step, setStep] = useState<Step>('upload')
  const [fileA, setFileA] = useState<File | null>(null)
  const [fileB, setFileB] = useState<File | null>(null)
  const [comparison, setComparison] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('summary')
  const [progress, setProgress] = useState(0)
  const [categorizations, setCategorizations] = useState<Record<string, FragnetCategorization>>({})
  const [ctx, setCtx] = useState({
    projectName: '',
    projectNumber: '',
    owner: '',
    preparedBy: '',
    contractCompletionDate: '',
  })

  const fileARef = useRef<HTMLInputElement>(null)
  const fileBRef = useRef<HTMLInputElement>(null)

  const categories = [
    { value: 'owner', label: 'Owner-Caused' },
    { value: 'force_majeure', label: 'Force Majeure (weather, pandemic)' },
    { value: 'third_party', label: 'Third-Party (utility, AHJ, permit)' },
    { value: 'subcontractor', label: 'Subcontractor / Vendor' },
    { value: 'contractor', label: 'Contractor-Caused' },
    { value: 'excusable', label: 'Excusable / Non-Compensable' },
  ]

  function shortDate(d?: string) {
    if (!d) return '—'
    return d.slice(0, 10)
  }

  async function runComparison() {
    if (!fileA || !fileB) return
    setStep('analyzing')
    setProgress(0)
    const prog = setInterval(() => setProgress(p => p < 85 ? p + Math.random() * 8 : p), 400)

    try {
      const fd = new FormData()
      fd.append('fileA', fileA)
      fd.append('fileB', fileB)
      fd.append('mode', 'compare')
      const res = await fetch('/api/compare', { method: 'POST', body: fd })
      clearInterval(prog)
      setProgress(100)
      if (!res.ok) throw new Error('Comparison failed')
      const data = await res.json()
      setComparison(data.comparison)

      // Initialize categorizations
      const initialCats: Record<string, FragnetCategorization> = {}
      for (const frag of data.comparison.fragnetActivities || []) {
        initialCats[frag.task_id] = { category: 'owner', description: '' }
      }
      setCategorizations(initialCats)

      setTimeout(() => setStep('review'), 400)
    } catch (err: any) {
      clearInterval(prog)
      alert('Failed: ' + err.message)
      setStep('upload')
    }
  }

  async function generateReport() {
    if (!fileA || !fileB || !comparison) return
    setStep('generating')

    try {
      const fd = new FormData()
      fd.append('fileA', fileA)
      fd.append('fileB', fileB)
      fd.append('mode', 'tia')
      fd.append('context', JSON.stringify(ctx))
      fd.append('fragnetCategorizations', JSON.stringify(categorizations))

      const res = await fetch('/api/compare', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Report generation failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `TIA_Report_${ctx.projectNumber || 'Schedule'}.docx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setStep('review')
    } catch (err: any) {
      alert('Failed: ' + err.message)
      setStep('categorize')
    }
  }

  // ===== UPLOAD STEP =====
  if (step === 'upload') {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center">
          <span className="font-bold text-slate-900 text-base">TIA Comparison</span>
          <span className="text-slate-400 text-sm ml-2">· Compare two schedules · Generate Time Impact Analysis</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl font-extrabold text-slate-900 mb-1">Compare Two Schedules</h2>
            <p className="text-slate-500 text-sm mb-6">
              Upload an un-impacted current schedule (without fragnet) and an impacted current schedule (with fragnet WBS inserted).
              ProjectLens will analyze the differences and generate a TIA report.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Schedule A */}
              <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-6 hover:border-blue-400 transition-colors cursor-pointer"
                onClick={() => fileARef.current?.click()}>
                <input ref={fileARef} type="file" accept=".xer" className="hidden"
                  onChange={e => setFileA(e.target.files?.[0] || null)} />
                <div className="text-center">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="font-bold text-slate-700 text-sm">Schedule A</div>
                  <div className="text-xs text-slate-500 mb-3">Un-Impacted Current Schedule</div>
                  {fileA ? (
                    <div className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg font-semibold">
                      ✓ {fileA.name}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">Click to upload .xer file</div>
                  )}
                </div>
              </div>

              {/* Schedule B */}
              <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-6 hover:border-blue-400 transition-colors cursor-pointer"
                onClick={() => fileBRef.current?.click()}>
                <input ref={fileBRef} type="file" accept=".xer" className="hidden"
                  onChange={e => setFileB(e.target.files?.[0] || null)} />
                <div className="text-center">
                  <div className="text-3xl mb-2">📊</div>
                  <div className="font-bold text-slate-700 text-sm">Schedule B</div>
                  <div className="text-xs text-slate-500 mb-3">Impacted Current Schedule (with Fragnet)</div>
                  {fileB ? (
                    <div className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg font-semibold">
                      ✓ {fileB.name}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">Click to upload .xer file</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
              <div className="text-xs font-bold text-slate-600 mb-3">PROJECT INFORMATION (for the TIA report)</div>
              <div className="grid grid-cols-2 gap-3">
                <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Project Name"
                  value={ctx.projectName} onChange={e => setCtx({...ctx, projectName: e.target.value})} />
                <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Project / Contract Number"
                  value={ctx.projectNumber} onChange={e => setCtx({...ctx, projectNumber: e.target.value})} />
                <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Owner (e.g. USACE, DGS, GSA)"
                  value={ctx.owner} onChange={e => setCtx({...ctx, owner: e.target.value})} />
                <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Prepared By (your name)"
                  value={ctx.preparedBy} onChange={e => setCtx({...ctx, preparedBy: e.target.value})} />
              </div>
            </div>

            <button
              disabled={!fileA || !fileB}
              onClick={runComparison}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold disabled:bg-slate-200 disabled:text-slate-400 hover:bg-blue-700 transition-colors">
              🔍 Compare Schedules →
            </button>

            <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg text-xs text-blue-900 leading-relaxed">
              <strong>How ProjectLens detects fragnets:</strong> The system looks for activities and WBS sections containing keywords like "Frag", "Schedule Issue", "TIA", or "Delay Event" in the impacted schedule. Make sure your fragnet WBS uses one of these naming conventions in P6.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== ANALYZING STEP =====
  if (step === 'analyzing') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6 animate-pulse">🔍</div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Comparing schedules</h2>
            <p className="text-slate-500 text-sm mb-6">Reading both XER files and analyzing differences...</p>
            <div className="bg-slate-100 rounded-full h-2 overflow-hidden mb-3">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-xs text-slate-400">{Math.round(progress)}% complete</div>
          </div>
        </div>
      </div>
    )
  }

  // ===== REVIEW STEP =====
  if (step === 'review' && comparison) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4">
          <span className="font-bold text-slate-900 text-base">Comparison Results</span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => { setStep('upload'); setFileA(null); setFileB(null); setComparison(null) }}
              className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400">
              ← Compare Other Files
            </button>
            <button onClick={() => setStep('categorize')}
              className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-blue-700">
              Generate TIA Report →
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {/* Summary banner */}
          <div className={`rounded-xl border p-4 flex items-center gap-4 ${comparison.totalDelayDays > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <div className="text-3xl">{comparison.totalDelayDays > 0 ? '🔴' : '🟢'}</div>
            <div className="flex-1">
              <div className={`font-bold text-sm ${comparison.totalDelayDays > 0 ? 'text-red-900' : 'text-green-900'}`}>
                {comparison.totalDelayDays > 0
                  ? `IMPACTED SCHEDULE IS ${comparison.totalDelayDays} CALENDAR DAYS LATER THAN UN-IMPACTED`
                  : 'NO TIME IMPACT DETECTED'}
              </div>
              <div className="text-xs mt-1 opacity-80">
                Un-impacted projected end: {shortDate(comparison.projectA.end)} · Impacted projected end: {shortDate(comparison.projectB.end)}
              </div>
            </div>
            <div className="text-center flex-shrink-0">
              <div className={`text-3xl font-extrabold ${comparison.totalDelayDays > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {comparison.totalDelayDays >= 0 ? '+' : ''}{comparison.totalDelayDays}
              </div>
              <div className="text-[10px] opacity-70">calendar days</div>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-5 gap-2">
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Activities Changed</div><div className="text-xl font-bold text-amber-600">{comparison.changed?.length || 0}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Activities Added</div><div className="text-xl font-bold text-blue-600">{comparison.added?.length || 0}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Activities Removed</div><div className="text-xl font-bold text-slate-600">{comparison.removed?.length || 0}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Milestones Moved</div><div className="text-xl font-bold text-red-600">{comparison.milestoneMovements?.length || 0}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Fragnets Found</div><div className="text-xl font-bold text-blue-600">{comparison.fragnetActivities?.length || 0}</div></div>
          </div>

          {/* Tabs */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex gap-0 border-b border-slate-100 overflow-x-auto">
              {[
                { id: 'summary', label: 'Summary' },
                { id: 'milestones', label: 'Milestone Movements' },
                { id: 'changed', label: 'Changed Activities' },
                { id: 'added', label: 'Added' },
                { id: 'removed', label: 'Removed' },
                { id: 'fragnets', label: 'Fragnets' },
                { id: 'cp', label: 'Critical Path' },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${activeTab === t.id ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-slate-500 hover:text-slate-900'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {activeTab === 'summary' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Comparison Summary</h3>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="font-bold text-slate-700 mb-2">Un-Impacted (Schedule A)</div>
                      <div className="text-slate-600">Project: {comparison.projectA.name}</div>
                      <div className="text-slate-600">Data Date: {shortDate(comparison.projectA.dataDate)}</div>
                      <div className="text-slate-600">Projected End: <span className="font-bold">{shortDate(comparison.projectA.end)}</span></div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="font-bold text-slate-700 mb-2">Impacted (Schedule B)</div>
                      <div className="text-slate-600">Project: {comparison.projectB.name}</div>
                      <div className="text-slate-600">Data Date: {shortDate(comparison.projectB.dataDate)}</div>
                      <div className="text-slate-600">Projected End: <span className="font-bold">{shortDate(comparison.projectB.end)}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'milestones' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Milestones with date movements ({comparison.milestoneMovements?.length || 0})</h3>
                  {(comparison.milestoneMovements || []).length === 0 ? (
                    <div className="text-sm text-slate-500 py-6 text-center">No milestone movements detected.</div>
                  ) : (
                    <div className="space-y-1">
                      {comparison.milestoneMovements.map((m: any, i: number) => (
                        <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 text-xs">
                          <div className="col-span-2 font-mono font-semibold">{m.task_code}</div>
                          <div className="col-span-5 text-slate-700">{m.task_name}</div>
                          <div className="col-span-2 text-slate-500">{shortDate(m.a_finish)}</div>
                          <div className="col-span-2 text-slate-500">→ {shortDate(m.b_finish)}</div>
                          <div className={`col-span-1 text-right font-bold ${m.delta_days > 0 ? 'text-red-600' : 'text-green-600'}`}>{m.delta_days > 0 ? '+' : ''}{m.delta_days}d</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'changed' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Activities with changes ({comparison.changed?.length || 0})</h3>
                  <div className="space-y-1 max-h-[500px] overflow-y-auto">
                    {(comparison.changed || []).slice(0, 100).map((c: any, i: number) => (
                      <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 text-xs">
                        <div className="col-span-2 font-mono font-semibold">{c.task_code}</div>
                        <div className="col-span-5 text-slate-700">{c.task_name}</div>
                        <div className="col-span-2 text-slate-500">Δ Start: <span className={c.start_delta_days > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>{c.start_delta_days > 0 ? '+' : ''}{c.start_delta_days}d</span></div>
                        <div className="col-span-2 text-slate-500">Δ Finish: <span className={c.finish_delta_days > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>{c.finish_delta_days > 0 ? '+' : ''}{c.finish_delta_days}d</span></div>
                        <div className="col-span-1 text-right">{c.logic_changed && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 rounded-full font-bold">Logic</span>}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'added' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Activities added in impacted schedule ({comparison.added?.length || 0})</h3>
                  <div className="space-y-1 max-h-[500px] overflow-y-auto">
                    {(comparison.added || []).map((c: any, i: number) => (
                      <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 text-xs">
                        <div className="col-span-3 font-mono font-semibold">{c.task_code}</div>
                        <div className="col-span-7 text-slate-700">{c.task_name}</div>
                        <div className="col-span-2 text-right text-slate-500">{shortDate(c.b_start)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'removed' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Activities removed from impacted schedule ({comparison.removed?.length || 0})</h3>
                  <div className="space-y-1 max-h-[500px] overflow-y-auto">
                    {(comparison.removed || []).map((c: any, i: number) => (
                      <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 text-xs">
                        <div className="col-span-3 font-mono font-semibold">{c.task_code}</div>
                        <div className="col-span-9 text-slate-700">{c.task_name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'fragnets' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Fragnet activities detected ({comparison.fragnetActivities?.length || 0})</h3>
                  {(comparison.fragnetActivities || []).length === 0 ? (
                    <div className="text-sm text-slate-500 py-6 text-center">
                      No fragnet activities detected. To use the TIA workflow, ensure your impacted schedule contains activities with "Frag" or "Schedule Issue" in their name or WBS.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {comparison.fragnetActivities.map((frag: any, i: number) => (
                        <div key={i} className="border border-slate-200 rounded-lg p-3">
                          <div className="font-bold text-sm">{frag.task_code} — {frag.task_name}</div>
                          <div className="text-xs text-slate-500 mt-1">
                            {shortDate(frag.start)} → {shortDate(frag.finish)} · {frag.duration_days}d · {frag.affected_successors?.length || 0} affected activities
                          </div>
                          {frag.affected_successors?.length > 0 && (
                            <div className="mt-2 text-xs text-slate-600">
                              <div className="font-semibold mb-1">Affects:</div>
                              {frag.affected_successors.slice(0, 5).map((s: any, j: number) => (
                                <div key={j} className="ml-3">• {s.task_code} {s.task_name} (delay: {s.delay_days}d)</div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'cp' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Critical Path Comparison</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="font-semibold text-xs mb-2 text-green-700">Un-Impacted CP ({comparison.criticalPath?.unimpactedPath?.length || 0})</div>
                      <div className="space-y-1 max-h-[400px] overflow-y-auto">
                        {(comparison.criticalPath?.unimpactedPath || []).slice(0, 30).map((t: any, i: number) => (
                          <div key={i} className="text-xs py-1 border-b border-slate-100">
                            <span className="font-mono font-semibold">{t.task_code}</span> <span className="text-slate-600">{t.task_name?.slice(0, 40)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-xs mb-2 text-red-700">Impacted CP ({comparison.criticalPath?.impactedPath?.length || 0})</div>
                      <div className="space-y-1 max-h-[400px] overflow-y-auto">
                        {(comparison.criticalPath?.impactedPath || []).slice(0, 30).map((t: any, i: number) => (
                          <div key={i} className="text-xs py-1 border-b border-slate-100">
                            <span className="font-mono font-semibold">{t.task_code}</span> <span className="text-slate-600">{t.task_name?.slice(0, 40)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== CATEGORIZE STEP =====
  if (step === 'categorize') {
    const frags = comparison?.fragnetActivities || []
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center">
          <span className="font-bold text-slate-900 text-base">Categorize Fragnets</span>
          <span className="text-slate-400 text-sm ml-2">· Assign cause and description to each delay event</span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setStep('review')} className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400">
              ← Back
            </button>
            <button onClick={generateReport} className="text-xs bg-green-600 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-green-700">
              📄 Generate Word Report
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-extrabold text-slate-900 mb-1">Categorize each fragnet activity</h2>
            <p className="text-slate-500 text-sm mb-6">For each delay event, select the responsible party and add a brief narrative description that will appear in the TIA report.</p>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
              <input className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white"
                placeholder="Contract Completion Date (e.g. 2024-09-30)"
                value={ctx.contractCompletionDate}
                onChange={e => setCtx({...ctx, contractCompletionDate: e.target.value})} />
            </div>

            {frags.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                <div className="text-3xl mb-2">⚠️</div>
                <div className="font-bold text-slate-700 mb-1">No fragnets detected</div>
                <div className="text-sm text-slate-500">The Word report will still generate, but the Fragnet Analysis and Trend Analysis sections will be empty.</div>
                <button onClick={generateReport} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">
                  Generate Report Anyway →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {frags.map((frag: any, i: number) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">{i+1}</div>
                      <div className="flex-1">
                        <div className="font-bold text-sm">{frag.task_code} — {frag.task_name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {shortDate(frag.start)} → {shortDate(frag.finish)} · {frag.duration_days}d · affects {frag.affected_successors?.length || 0} activities
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 ml-11">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Responsibility</label>
                        <select className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                          value={categorizations[frag.task_id]?.category || 'owner'}
                          onChange={e => setCategorizations({...categorizations, [frag.task_id]: { ...categorizations[frag.task_id], category: e.target.value, description: categorizations[frag.task_id]?.description || '' }})}>
                          {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cause Description / Narrative</label>
                        <input className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                          placeholder="e.g. RFI #045 approval delayed by 30 days affecting MEP submittal sequence..."
                          value={categorizations[frag.task_id]?.description || ''}
                          onChange={e => setCategorizations({...categorizations, [frag.task_id]: { ...categorizations[frag.task_id], category: categorizations[frag.task_id]?.category || 'owner', description: e.target.value }})} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ===== GENERATING STEP =====
  if (step === 'generating') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6 animate-pulse">📄</div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">Generating TIA Report</h2>
            <p className="text-slate-500 text-sm">Building Word document with cover page, executive summary, critical path comparison, fragnet analysis, and trend analysis...</p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
