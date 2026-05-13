'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  getActiveProject, getActiveProjectId, loadProjects,
  createProject, addVersionToProject,
  ScheduleVersion
} from '@/lib/projectStore'

// Gantt Chart Component
function GanttChart({ activities, drivingPath, dataDate, projectedEnd }: {
  activities: any[]  // 0 or negative float activities
  drivingPath: any[] // driving_path_flag = Y activities (fallback)
  dataDate: string
  projectedEnd: string
}) {
  const hasZeroNegFloat = activities && activities.length > 0
  const hasDrivingPath = drivingPath && drivingPath.length > 0
  const displayActivities = hasZeroNegFloat ? activities : (hasDrivingPath ? drivingPath : [])
  const mode = hasZeroNegFloat ? 'float' : hasDrivingPath ? 'driving' : 'none'

  function renderGantt(acts: any[]) {
    const start = new Date(dataDate?.replace(' ', 'T') || new Date())
    const end = new Date(projectedEnd?.replace(' ', 'T') || new Date())
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))

    function getLeft(dateStr?: string) {
      if (!dateStr) return 0
      const d = new Date(dateStr.replace(' ', 'T'))
      const days = Math.round((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      return Math.max(0, Math.min(100, (days / totalDays) * 100))
    }

    function getWidth(startStr?: string, endStr?: string) {
      if (!startStr || !endStr) return 1
      const s = new Date(startStr.replace(' ', 'T'))
      const e = new Date(endStr.replace(' ', 'T'))
      const days = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
      return Math.max(0.5, Math.min(100, (days / totalDays) * 100))
    }

    function shortDate(d?: string) { return d ? d.slice(0, 10) : '—' }

    const months: { label: string; left: number }[] = []
    const cur = new Date(start)
    cur.setDate(1)
    while (cur <= end) {
      const left = getLeft(cur.toISOString())
      if (left >= 0 && left <= 100) {
        months.push({ label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), left })
      }
      cur.setMonth(cur.getMonth() + 1)
    }

    const displayed = acts.slice(0, 100)

    return (
      <div className="overflow-auto max-h-[550px] border border-slate-200 rounded-xl">
        <div className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
          <div className="flex">
            <div className="w-80 flex-shrink-0 px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-r border-slate-200">Activity</div>
            <div className="flex-1 relative h-8 min-w-[600px]">
              {months.map((m, i) => (
                <div key={i} className="absolute top-0 h-full flex items-center" style={{ left: `${m.left}%` }}>
                  <div className="h-full border-l border-slate-300 border-dashed" />
                  <span className="text-[9px] text-slate-400 ml-1 whitespace-nowrap">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {displayed.map((t: any, i: number) => {
          const taskStart = t.act_start_date || t.early_start_date || t.target_start_date || ''
          const taskEnd = t.early_end_date || t.act_end_date || t.target_end_date || ''
          const float = parseFloat(t.total_float_hr_cnt || '0')
          const isComplete = t.status_code === 'TK_Complete'
          const barColor = isComplete ? 'bg-slate-400' : mode === 'driving' ? 'bg-blue-500' : float < 0 ? 'bg-red-500' : 'bg-amber-500'
          const left = getLeft(taskStart)
          const width = getWidth(taskStart, taskEnd)
          const pct = parseFloat(t.phys_complete_pct || '0')

          return (
            <div key={i} className={`flex border-b border-slate-100 hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
              <div className="w-80 flex-shrink-0 px-3 py-2 border-r border-slate-100 flex items-center gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono font-bold text-slate-800 truncate">{t.task_code}</div>
                  <div className="text-[10px] text-slate-500 truncate">{t.task_name}</div>
                </div>
                <div className={`ml-auto text-[10px] font-bold flex-shrink-0 ${float < 0 ? 'text-red-600' : float === 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {Math.round(float / 8)}d
                </div>
              </div>
              <div className="flex-1 relative py-2 min-w-[600px] h-10">
                <div className="absolute inset-y-0 flex items-center" style={{ left: `${left}%`, width: `${width}%`, minWidth: '4px' }}>
                  <div className={`relative h-5 w-full rounded-sm ${barColor} opacity-80 overflow-hidden`}>
                    <div className="absolute inset-y-0 left-0 bg-black/20 rounded-l-sm" style={{ width: `${pct}%` }} />
                    {width > 8 && (
                      <div className="absolute inset-0 flex items-center px-1">
                        <span className="text-[9px] text-white font-semibold truncate">{shortDate(taskEnd)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {acts.length > 100 && (
          <div className="text-center py-3 text-xs text-slate-400 border-t border-slate-200">
            Showing first 100 of {acts.length} activities
          </div>
        )}
      </div>
    )
  }

  // Case 1: No activities at all
  if (mode === 'none') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex gap-3 items-start">
          <div className="text-2xl">⚠️</div>
          <div>
            <div className="font-bold text-amber-900 mb-1">Gantt chart cannot be displayed</div>
            <div className="text-sm text-amber-800 leading-relaxed mb-3">
              ProjectLens could not find any activities with driving path or float data in this schedule.
              This usually means the schedule has not been calculated in P6, or the XER was exported before
              a schedule calculation was run.
            </div>
            <div className="text-xs font-bold text-amber-700 mb-1">What to do:</div>
            <div className="text-xs text-amber-700 leading-relaxed">
              Open the schedule in Primavera P6, run Schedule (F9), then re-export the XER and upload again.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Case 2: No 0/negative float but has driving path — explain why and show driving path
  if (mode === 'driving') {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex gap-3 items-start">
            <div className="text-2xl">ℹ️</div>
            <div>
              <div className="font-bold text-blue-900 mb-1">
                Critical path is showing positive float — here is why
              </div>
              <div className="text-sm text-blue-800 leading-relaxed mb-3">
                All activities in this schedule carry positive total float — meaning no activity is technically
                "late" according to the schedule calculation. This is usually caused by one of the following:
              </div>
              <div className="space-y-2 text-sm text-blue-800">
                <div className="flex gap-2">
                  <span className="font-bold flex-shrink-0">1.</span>
                  <span><span className="font-semibold">No "Must Finish By" constraint on the completion milestone.</span> If the project finish milestone has no hard constraint date, P6 calculates float against an open-ended horizon — so everything appears to have float even if the project is running late against the contract date.</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold flex-shrink-0">2.</span>
                  <span><span className="font-semibold">Schedule calculated without a project deadline.</span> The scheduler may not have set the contract completion date as a constraint in P6. The network drives the dates but there is no fixed end date to calculate float against.</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold flex-shrink-0">3.</span>
                  <span><span className="font-semibold">Float type set to "Finish Float" instead of "Total Float."</span> Some P6 configurations calculate float differently, which can show positive values even on a driving path.</span>
                </div>
              </div>
              <div className="mt-4 p-3 bg-blue-100 rounded-lg text-xs text-blue-900 leading-relaxed">
                <span className="font-bold">What this means operationally:</span> The schedule is showing a longest path but not a true critical path with float enforcement. 
                The PM should verify in P6 that a "Must Finish By" constraint is set on the contract completion milestone (MM-125 or equivalent). 
                Without this, the schedule cannot accurately calculate negative float or show the true delay condition.
                This is an important finding to discuss with the project scheduler and document in the schedule narrative.
              </div>
              <div className="mt-3 text-xs text-blue-700 font-semibold">
                ProjectLens is showing the Longest Path (driving path flag = Y) as the best available substitute:
              </div>
            </div>
          </div>
        </div>
        {renderGantt(displayActivities)}
        <div className="text-xs text-slate-400 text-center">
          Bars shown in blue = longest path activities · Float values shown are positive (no finish constraint detected)
        </div>
      </div>
    )
  }

  // Case 3: Normal — show 0/negative float activities
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-500" /><span className="text-slate-600">Negative float (behind schedule)</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500" /><span className="text-slate-600">Zero float (on the critical path)</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-slate-400" /><span className="text-slate-600">Complete</span></div>
        <div className="ml-auto text-slate-400">{activities.length} activities · sorted by early finish date</div>
      </div>
      {renderGantt(displayActivities)}
    </div>
  )
}


type Step = 'upload' | 'context' | 'analyzing' | 'done'

interface ProjectContext {
  projectName: string
  phase: string
  contractValue: string
  completionDate: string
  owner: string
  gc: string
  procurementIssues: string
  keyConstraints: string
  criticalConcerns: string
}

export default function UploadPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('critical')
  const [ctx, setCtx] = useState<ProjectContext>({
    projectName: '', phase: 'Commissioning & Closeout', contractValue: '',
    completionDate: '', owner: '', gc: '', procurementIssues: '',
    keyConstraints: '', criticalConcerns: ''
  })

  // Project assignment state
  const [existingProjects, setExistingProjects] = useState<any[]>([])
  const [projectMode, setProjectMode] = useState<'new' | 'existing'>('new')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [newProjectId, setNewProjectId] = useState<string>('')

  useEffect(() => {
    const all = loadProjects()
    setExistingProjects(all)
    // Default to existing project if there's an active one
    const activeId = getActiveProjectId()
    if (activeId && all.find(p => p.id === activeId)) {
      setSelectedProjectId(activeId)
      setProjectMode('existing')
    }
  }, [])

  const fileRef = useRef<HTMLInputElement>(null)

  const accept = '.xer,.xml,.mpp,.pdf,.xlsx,.xls,.csv'
  const phases = ['Pre-Construction','Foundation & Sitework','Structure','MEP Rough-In','Interior Finishes','Commissioning & Closeout','Punch & Turnover']

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); setStep('context') }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setStep('context') }
  }

  async function runAnalysis() {
    setStep('analyzing')
    setProgress(0)

    const progInterval = setInterval(() => {
      setProgress(p => p < 85 ? p + Math.random() * 8 : p)
    }, 400)

    try {
      const formData = new FormData()
      if (file) formData.append('file', file)
      formData.append('context', JSON.stringify(ctx))

      const res = await fetch('/api/analyze', { method: 'POST', body: formData })
      clearInterval(progInterval)
      setProgress(100)

      if (!res.ok) throw new Error('Analysis failed')
      const data = await res.json()
      setResult(data)

      // Save as a project version based on user selection
      try {
        const version: ScheduleVersion = {
          id: 'ver_' + Date.now().toString(36),
          uploadedAt: new Date().toISOString(),
          fileName: file?.name || 'schedule.xer',
          analysis: data.analysis,
          aiNarrative: data.aiNarrative,
          context: ctx,
        }

        if (projectMode === 'existing' && selectedProjectId) {
          // Add as new version to existing project
          addVersionToProject(selectedProjectId, version)
        } else {
          // Create a new project
          const projectName = ctx.projectName || data.analysis?.projectName || file?.name?.replace('.xer', '') || 'Untitled Project'
          createProject({
            name: projectName,
            projectId: newProjectId.trim() || undefined,
            owner: ctx.owner,
            version,
          })
        }

        // Keep legacy keys for backward compat
        localStorage.setItem('pl_last_analysis', JSON.stringify(data.analysis))
      } catch (err) {
        console.error('Failed to save project:', err)
      }

      setTimeout(() => setStep('done'), 500)

    } catch (err: any) {
      clearInterval(progInterval)
      alert('Analysis failed: ' + err.message)
      setStep('context')
    }
  }

  function fmtFloat(hours: string | number) {
    const h = typeof hours === 'string' ? parseFloat(hours || '0') : hours
    if (isNaN(h)) return '—'
    return Math.round(h / 8) + 'd'
  }

  function conditionColor(cond: string) {
    if (cond === 'Recovery Required') return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-900' }
    if (cond === 'Attention Needed') return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900' }
    if (cond === 'Monitor Closely') return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900' }
    return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900' }
  }

  if (step === 'done' && result?.analysis) {
    const a = result.analysis
    const condColor = conditionColor(a.condition)

    return (
      <div className="flex flex-col h-full">
        <style jsx global>{`
          @media print {
            .no-print { display: none !important; }
            .print-show { display: block !important; }
            .tab-pane { display: block !important; }
            .tab-bar { display: none !important; }
          }
        `}</style>
        
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0 no-print">
          <div>
            <span className="font-bold text-slate-900 text-base">ProjectLens Analysis</span>
            <span className="text-slate-400 text-sm ml-2">· {a.projectName}</span>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => window.print()} className="text-xs border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-400 transition-colors font-semibold flex items-center gap-1.5">
              🖨 Print / Save PDF
            </button>
            <button onClick={() => { setStep('upload'); setFile(null); setResult(null) }} className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors">
              Analyze Another File
            </button>
            <button onClick={() => router.push('/dashboard')} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-semibold">
              Dashboard →
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {/* Header */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-bold text-slate-900">{a.projectName}</div>
                <div className="text-xs text-slate-500 mt-0.5">{a.fileType} · Data date: {a.dataDate?.slice(0,10) || 'N/A'}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Contract completion</div>
                <div className="text-sm font-bold text-red-600">{a.contractEnd?.slice(0,10) || 'N/A'} <span className="text-xs font-normal text-slate-500">· Projected {a.projectedEnd?.slice(0,10) || 'N/A'}</span></div>
              </div>
            </div>
          </div>

          {/* Condition Banner */}
          <div className={`${condColor.bg} ${condColor.border} border rounded-xl p-4 flex items-center gap-4`}>
            <div className="text-3xl">{a.condition === 'Recovery Required' ? '🔴' : a.condition === 'Attention Needed' ? '⚠️' : '🟢'}</div>
            <div className="flex-1">
              <div className={`font-bold text-sm ${condColor.text}`}>
                {a.condition.toUpperCase()} {a.delayDays > 0 && `— PROJECT IS ${a.delayDays} DAYS BEHIND CONTRACT`}
              </div>
              <div className="text-xs mt-1 opacity-80">
                {a.negativeFloat} of {a.totalActivities} activities carry negative float · {a.notStarted} activities not yet started · {a.outOfSequence?.length || 0} out-of-sequence
              </div>
            </div>
            <div className="text-center flex-shrink-0">
              <div className={`text-3xl font-extrabold ${condColor.text}`}>{a.healthScore}</div>
              <div className="text-[10px] opacity-70">Health Score / 100</div>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-5 gap-2">
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Total activities</div><div className="text-xl font-bold">{a.totalActivities}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Complete</div><div className="text-xl font-bold text-green-600">{a.complete}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">In progress</div><div className="text-xl font-bold text-amber-600">{a.inProgress}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Negative float</div><div className="text-xl font-bold text-red-600">{a.negativeFloat}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Out-of-sequence</div><div className="text-xl font-bold text-red-600">{a.outOfSequence?.length || 0}</div></div>
          </div>

          {/* Tabs */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="tab-bar flex gap-0 border-b border-slate-100 overflow-x-auto no-print">
              {[
                { id: 'gantt', label: 'Gantt Chart', icon: '📊' },
              { id: 'critical', label: 'Critical Path', icon: '🎯' },
                { id: 'logic', label: 'Logic Check', icon: '🔧' },
                { id: 'noties', label: 'No Logic Ties', icon: '⛓️' },
                { id: 'longlead', label: 'Long Lead Items', icon: '📦' },
                { id: 'field', label: 'Field Reality', icon: '👷' },
                { id: 'plain', label: 'Plain Language', icon: '💬' },
                { id: 'ai', label: 'Narrative', icon: '📝' },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`px-4 py-3 text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === t.id ? 'text-blue-600 border-b-2 border-blue-600 -mb-px' : 'text-slate-500 hover:text-slate-900'}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* GANTT CHART */}
              {activeTab === 'gantt' && (
                <div>
                  <h3 className="text-sm font-bold mb-1">Critical Path Gantt — activities with 0 or negative float</h3>
                  <p className="text-xs text-slate-500 mb-4">Sorted by early finish date. Red = negative float, Orange = zero float, Gray = complete.</p>
                  <GanttChart activities={a.ganttActivities || []} drivingPath={a.criticalDrivers || []} dataDate={a.dataDate} projectedEnd={a.projectedEnd} />
                </div>
              )}

              {/* CRITICAL PATH */}
              {(activeTab === 'critical' || typeof window !== 'undefined' && window.matchMedia?.('print').matches) && (
                <div className="tab-pane">
                  <h3 className="text-sm font-bold mb-3">Critical path drivers — what is driving project completion</h3>
                  <p className="text-xs text-slate-500 mb-4">The critical path is the chain of activities that controls when the project finishes. If any of these slips, the whole project slips by that same amount.</p>
                  <div className="space-y-2">
                    {(a.criticalDrivers || []).slice(0, 12).map((t: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 text-xs">
                        <div className="font-mono font-semibold text-slate-900 w-32 flex-shrink-0">{t.task_code}</div>
                        <div className="flex-1 text-slate-700">{t.task_name}</div>
                        <div className="text-red-600 font-bold w-14 text-right">{fmtFloat(t.total_float_hr_cnt)}</div>
                        <div className="w-16 text-slate-500">{fmtFloat(t.remain_drtn_hr_cnt)}</div>
                        <div className="w-20"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.status_code === 'TK_Complete' ? 'bg-green-100 text-green-700' : t.status_code === 'TK_Active' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{t.status_code === 'TK_Complete' ? 'Done' : t.status_code === 'TK_Active' ? `${t.phys_complete_pct}%` : 'Not started'}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* LOGIC CHECK */}
              {activeTab === 'logic' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Schedule logic check — out-of-sequence work ({a.outOfSequence?.length || 0} violations)</h3>
                  <div className="bg-red-50 border-l-4 border-red-500 p-3 text-xs text-red-900 mb-4 leading-relaxed">
                    Out-of-sequence means an activity started before its predecessor was finished. This makes float calculations unreliable and creates rework risk — if the review comes back with changes after fabrication has started, materials may need to be remade.
                  </div>
                  {['Procurement', 'Pre-Construction', 'Other'].map(category => {
                    const items = (a.outOfSequence || []).filter((o: any) => o.category === category)
                    if (items.length === 0) return null
                    return (
                      <div key={category} className="mb-4">
                        <div className="text-xs font-bold mb-2 text-slate-700">{category} violations ({items.length})</div>
                        {items.slice(0, 10).map((o: any, i: number) => (
                          <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 text-xs">
                            <div className="col-span-3 font-mono font-semibold">{o.task.task_code}</div>
                            <div className="col-span-7 text-slate-600">{o.task.task_name} started before predecessor {o.pred.task_code} finished</div>
                            <div className="col-span-2 text-right"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Sequence error</span></div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* NO TIES */}
              {activeTab === 'noties' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Activities with no logic ties ({a.noTies?.length || 0} found)</h3>
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                    Every activity should be connected — at least one predecessor and one successor. Activities with no ties are "floating" in the schedule. Delays to them will not show up in the analysis. This is a schedule quality problem.
                  </div>
                  <div className="space-y-2">
                    {(a.noTies || []).slice(0, 20).map((t: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 text-xs">
                        <div className="font-mono font-semibold w-32 flex-shrink-0">{t.task_code}</div>
                        <div className="flex-1 text-slate-700">{t.task_name}</div>
                        <div className="text-red-600 font-bold w-14 text-right">{fmtFloat(t.total_float_hr_cnt)}</div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Logic gap</span>
                      </div>
                    ))}
                    {(!a.noTies || a.noTies.length === 0) && (
                      <div className="text-sm text-green-700 text-center py-6">✓ All activities have proper logic ties</div>
                    )}
                  </div>
                </div>
              )}

              {/* LONG LEAD */}
              {activeTab === 'longlead' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Long lead items ({a.longLeadItems?.length || 0} items, 20+ days duration)</h3>
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-blue-900 mb-4 leading-relaxed">
                    Long lead items are materials or equipment requiring significant time to fabricate and deliver. These are the items that most commonly cause delays. ProjectLens sorts by float — most critical first.
                  </div>
                  <div className="space-y-2">
                    {(a.longLeadItems || []).slice(0, 20).map((ll: any, i: number) => (
                      <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 text-xs">
                        <div className="col-span-2 font-mono font-semibold">{ll.task_code}</div>
                        <div className="col-span-5 text-slate-700">{ll.task_name}</div>
                        <div className="col-span-1 text-right">{ll.durationDays}d</div>
                        <div className="col-span-1 text-right">{ll.remainingDays}d</div>
                        <div className={`col-span-1 text-right font-bold ${ll.floatDays < 0 ? 'text-red-600' : ll.floatDays < 10 ? 'text-amber-600' : 'text-green-600'}`}>{ll.floatDays}d</div>
                        <div className="col-span-2 text-right"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ll.status_code === 'TK_Complete' ? 'bg-green-100 text-green-700' : ll.status_code === 'TK_Active' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{ll.status_code === 'TK_Complete' ? 'Delivered' : ll.status_code === 'TK_Active' ? `${ll.phys_complete_pct}%` : 'Not ordered'}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FIELD REALITY */}
              {activeTab === 'field' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Field reality — activities in progress right now ({a.inProgress})</h3>
                  <div className="bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-amber-900 mb-4 leading-relaxed">
                    These are activities the schedule says are being worked right now. Verify with your superintendent that progress matches what is physically happening on site.
                  </div>
                  <div className="space-y-2">
                    {(a.inProgressActivities || []).slice(0, 25).map((t: any, i: number) => {
                      const pct = parseFloat(t.phys_complete_pct || '0')
                      const fl = parseFloat(t.total_float_hr_cnt || '0')
                      return (
                        <div key={i} className="grid grid-cols-12 gap-2 py-2 border-b border-slate-100 text-xs items-center">
                          <div className="col-span-3 font-mono font-semibold">{t.task_code}</div>
                          <div className="col-span-5 text-slate-700">{t.task_name}</div>
                          <div className="col-span-2">
                            <div className="flex items-center gap-2"><span className="font-bold w-8">{pct}%</span>
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct > 90 ? 'bg-green-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} /></div></div>
                          </div>
                          <div className="col-span-1 text-right text-slate-500">{fmtFloat(t.remain_drtn_hr_cnt)}</div>
                          <div className={`col-span-1 text-right font-bold ${fl < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmtFloat(t.total_float_hr_cnt)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* PLAIN LANGUAGE */}
              {activeTab === 'plain' && (
                <div>
                  <h3 className="text-sm font-bold mb-3">Plain language summary</h3>
                  <div className="space-y-4 text-xs">
                    {a.delayDays > 30 && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">🚨</div>
                        <div>
                          <div className="font-bold text-slate-900">The project is {a.delayDays} days behind contract</div>
                          <div className="text-slate-600 mt-1 leading-relaxed">Contract completion was {a.contractEnd?.slice(0,10)}. Projected completion is now {a.projectedEnd?.slice(0,10)}. {a.negativeFloat} activities carry negative float, and {a.notStarted} have not yet started.</div>
                        </div>
                      </div>
                    )}
                    {a.outOfSequence?.length > 0 && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">📦</div>
                        <div>
                          <div className="font-bold text-slate-900">{a.outOfSequence.length} activities started in the wrong order</div>
                          <div className="text-slate-600 mt-1 leading-relaxed">In these cases, work began before its predecessor was finished. This usually means the contractor was trying to make up time — which is TIA evidence of schedule disruption from earlier delay events.</div>
                        </div>
                      </div>
                    )}
                    {(a.longLeadItems || []).filter((l: any) => l.status_code === 'TK_NotStart' && l.floatDays < 0).length > 0 && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">⚡</div>
                        <div>
                          <div className="font-bold text-slate-900">Critical long lead items not yet ordered</div>
                          <div className="text-slate-600 mt-1 leading-relaxed">{(a.longLeadItems || []).filter((l: any) => l.status_code === 'TK_NotStart' && l.floatDays < 0).length} long lead items have negative float and have not been ordered yet. Each day they sit unordered adds another day to the delay.</div>
                        </div>
                      </div>
                    )}
                    {a.noTies?.length > 0 && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">⛓️</div>
                        <div>
                          <div className="font-bold text-slate-900">{a.noTies.length} activities have no logic ties</div>
                          <div className="text-slate-600 mt-1 leading-relaxed">These activities are not properly connected to predecessors or successors. The float calculations for them are unreliable and they may not show up correctly in critical path analysis.</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* NARRATIVE */}
              {activeTab === 'ai' && (
                <div>
                  <h3 className="text-sm font-bold mb-1">Operational analysis — how to fix this</h3>
                  <p className="text-xs text-slate-500 mb-3">A direct read of what the schedule is telling you, what matters most, and what conversations to have this week.</p>
                  {result.aiNarrative ? (
                    <div className="bg-slate-50 border-l-4 border-blue-500 rounded-r-lg p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {result.aiNarrative}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 text-center py-8">Narrative generation requires the ANTHROPIC_API_KEY environment variable to be set.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-3 no-print">
            <button className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 transition-colors">
              <div className="text-lg mb-1">✉️</div>
              <div className="text-xs font-bold">Draft Owner Letter</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Professional status update</div>
            </button>
            <button className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 transition-colors">
              <div className="text-lg mb-1">📋</div>
              <div className="text-xs font-bold">Start TIA Outline</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Time Impact Analysis</div>
            </button>
            <button onClick={() => router.push('/dashboard/lens')} className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 transition-colors">
              <div className="text-lg mb-1">🔍</div>
              <div className="text-xs font-bold">Save to Project Lens</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Add to project record</div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Upload Schedule</span>
          <span className="text-slate-400 text-sm ml-2">· ProjectLens Analysis</span>
        </div>
        <div className="ml-auto">
          <div className="flex items-center gap-2 text-xs">
            {(['upload','context','analyzing'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${step === s ? 'bg-blue-600 text-white' :
                    (['upload','context','analyzing'].indexOf(step) > i) ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {(['upload','context','analyzing'].indexOf(step) > i) ? '✓' : i + 1}
                </div>
                <span className={step === s ? 'text-blue-600 font-semibold' : 'text-slate-400 capitalize'}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                {i < 2 && <div className="w-4 h-px bg-slate-200" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {step === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-extrabold text-slate-900 mb-1">Upload your project schedule</h2>
            <p className="text-slate-500 text-sm mb-6">ProjectLens reads Primavera P6 XER files and interprets them like an experienced project controls advisor — including logic checks, long lead detection, and TIA evidence.</p>

            <div
              className={`upload-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={onPick} />
              <div className="text-5xl mb-4">📁</div>
              <div className="text-base font-bold text-slate-700 mb-1">Drop your schedule file here</div>
              <div className="text-sm text-slate-400 mb-4">or click to browse your computer</div>
              <div className="inline-flex flex-wrap justify-center gap-2">
                <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full border border-blue-100">.xer (P6 — full analysis)</span>
                <span className="bg-slate-50 text-slate-500 text-xs font-semibold px-3 py-1 rounded-full border border-slate-100">.xml / .mpp / .pdf (limited)</span>
              </div>
            </div>

            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-xs font-bold text-slate-500 mb-2">WHAT PROJECTLENS WILL ANALYZE</div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Critical path drivers and float condition</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Logic violations and out-of-sequence work</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Long lead items and procurement risk</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Activities with no logic ties (schedule quality)</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Field reality check on in-progress activities</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Plain language summary and TIA evidence</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Operational narrative — how to fix this</div>
              </div>
            </div>
          </div>
        )}

        {step === 'context' && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
              <span className="text-2xl">✅</span>
              <div>
                <div className="font-bold text-green-800 text-sm">File ready: {file?.name}</div>
                <div className="text-green-600 text-xs mt-0.5">{file ? (file.size / 1024).toFixed(0) + ' KB' : ''} · Now tell ProjectLens about your project</div>
              </div>
            </div>

            <h2 className="text-xl font-extrabold text-slate-900 mb-1">Tell us about your project</h2>
            <p className="text-slate-500 text-sm mb-5">Takes 2 minutes. The more context you give, the more accurate the analysis.</p>

            {/* Project assignment */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-3">Assign this schedule to:</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setProjectMode('new')}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${projectMode === 'new' ? 'border-blue-500 bg-white' : 'border-slate-200 bg-white/50 hover:border-blue-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 ${projectMode === 'new' ? 'border-blue-500' : 'border-slate-300'} flex items-center justify-center`}>
                      {projectMode === 'new' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                    </div>
                    <span className="font-bold text-xs text-slate-900">Create new project</span>
                  </div>
                  <div className="text-[10px] text-slate-500 ml-6">This is a brand new construction project</div>
                </button>
                <button
                  type="button"
                  onClick={() => setProjectMode('existing')}
                  disabled={existingProjects.length === 0}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${projectMode === 'existing' ? 'border-blue-500 bg-white' : 'border-slate-200 bg-white/50 hover:border-blue-300'} ${existingProjects.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 ${projectMode === 'existing' ? 'border-blue-500' : 'border-slate-300'} flex items-center justify-center`}>
                      {projectMode === 'existing' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                    </div>
                    <span className="font-bold text-xs text-slate-900">Update existing project</span>
                  </div>
                  <div className="text-[10px] text-slate-500 ml-6">
                    {existingProjects.length === 0 ? 'No projects yet' : `Add as new version to one of your ${existingProjects.length} project${existingProjects.length > 1 ? 's' : ''}`}
                  </div>
                </button>
              </div>

              {projectMode === 'existing' && (
                <div>
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">Select Project</label>
                  <select
                    value={selectedProjectId}
                    onChange={e => setSelectedProjectId(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white">
                    <option value="">— Choose a project —</option>
                    {existingProjects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.projectId ? ` (${p.projectId})` : ''} · {p.versions.length} version{p.versions.length > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {projectMode === 'new' && (
                <div>
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">Project ID (optional)</label>
                  <input
                    value={newProjectId}
                    onChange={e => setNewProjectId(e.target.value)}
                    placeholder="e.g. USACE-CT-2024-001 (P6 Enterprise project ID)"
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white font-mono"
                  />
                  <div className="text-[10px] text-slate-500 mt-1">Unique identifier for this project (like P6 EPS structure)</div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Project Name</label>
                  <input className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="(Will use file if blank)" value={ctx.projectName} onChange={e => setCtx({...ctx, projectName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Current Phase</label>
                  <select className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white"
                    value={ctx.phase} onChange={e => setCtx({...ctx, phase: e.target.value})}>
                    {phases.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Owner / Client</label>
                  <input className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="e.g. USACE, GSA, DGS" value={ctx.owner} onChange={e => setCtx({...ctx, owner: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">General Contractor</label>
                  <input className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="GC company name" value={ctx.gc} onChange={e => setCtx({...ctx, gc: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Known Procurement Issues</label>
                <textarea rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="e.g. Switchgear delay from Eaton. AHU on watch from Carrier..."
                  value={ctx.procurementIssues} onChange={e => setCtx({...ctx, procurementIssues: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Key Constraints or Hold-Ups</label>
                <textarea rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="e.g. Owner approvals pending. MEP coordination conflict. Permit delays..."
                  value={ctx.keyConstraints} onChange={e => setCtx({...ctx, keyConstraints: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Your Biggest Concerns</label>
                <textarea rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="e.g. Worried about finishing on time. Commissioning slipping..."
                  value={ctx.criticalConcerns} onChange={e => setCtx({...ctx, criticalConcerns: e.target.value})} />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep('upload')} className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:border-slate-300">
                  ← Change File
                </button>
                <button onClick={runAnalysis}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors">
                  🔍 Run ProjectLens Analysis →
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="text-6xl mb-6 animate-pulse">🔍</div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">ProjectLens is reading your schedule</h2>
            <p className="text-slate-500 text-sm mb-8">Parsing activities, relationships, logic, and critical path...</p>
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
              <div className="bg-slate-100 rounded-full h-2 overflow-hidden mb-3">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-slate-400">{Math.round(progress)}% complete</div>
            </div>
            <div className="space-y-2 text-left max-w-md mx-auto">
              {[
                { label: 'Parsing XER structure...', done: progress > 15 },
                { label: 'Building relationship maps...', done: progress > 30 },
                { label: 'Identifying critical path...', done: progress > 45 },
                { label: 'Detecting logic violations...', done: progress > 60 },
                { label: 'Flagging long lead items...', done: progress > 75 },
                { label: 'Generating narrative...', done: progress > 90 },
              ].map(item => (
                <div key={item.label} className={`flex items-center gap-3 text-xs ${item.done ? 'text-green-600' : 'text-slate-400'}`}>
                  <span>{item.done ? '✅' : '⏳'}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
