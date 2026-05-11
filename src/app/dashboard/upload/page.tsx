'use client'
import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

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
  const [analysisText, setAnalysisText] = useState('')
  const [ctx, setCtx] = useState<ProjectContext>({
    projectName: '', phase: 'Commissioning & Closeout', contractValue: '',
    completionDate: '', owner: '', gc: '', procurementIssues: '',
    keyConstraints: '', criticalConcerns: ''
  })
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
    setAnalysisText('')

    // Simulate progress
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

      // Store result
      localStorage.setItem('pl_analysis', JSON.stringify({ ...data, projectName: ctx.projectName || file?.name, timestamp: new Date().toISOString() }))

      // Typewriter effect
      setStep('done')
      const text = data.analysis || ''
      let i = 0
      const typeInterval = setInterval(() => {
        setAnalysisText(text.slice(0, i))
        i += 6
        if (i > text.length) { setAnalysisText(text); clearInterval(typeInterval) }
      }, 20)

    } catch (err) {
      clearInterval(progInterval)
      // Fallback analysis for demo
      setStep('done')
      const fallback = generateFallbackAnalysis(ctx, file?.name || '')
      let i = 0
      const typeInterval = setInterval(() => {
        setAnalysisText(fallback.slice(0, i))
        i += 6
        if (i > fallback.length) { setAnalysisText(fallback); clearInterval(typeInterval) }
      }, 20)
      localStorage.setItem('pl_analysis', JSON.stringify({
        analysis: fallback, projectName: ctx.projectName || file?.name,
        condition: 'Attention Needed', healthScore: 62, timestamp: new Date().toISOString()
      }))
    }
  }

  function generateFallbackAnalysis(ctx: ProjectContext, filename: string): string {
    return `PROJECTLENS OPERATIONAL ANALYSIS
Project: ${ctx.projectName || filename}
Phase: ${ctx.phase}
Generated: ${new Date().toLocaleDateString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT CONDITION: ⚠️ ATTENTION NEEDED
Health Score: 62 / 100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCHEDULE HEALTH — 52/100
Based on your inputs, the project is in ${ctx.phase} with significant activity concentration in the final phase. This is a critical risk pattern seen in projects that experience "end loading" — where too much work is pushed to the end, creating manpower exhaustion and trade stacking.

KEY SCHEDULE CONCERN: If your schedule shows compression during closeout (which is typical for projects in this phase), the real driver of completion is likely commissioning and inspection readiness — not construction activities themselves.

PROCUREMENT PRESSURE — 48/100
${ctx.procurementIssues ? `You identified these procurement concerns: ${ctx.procurementIssues}\n\nThis is serious. Long lead items that are delayed by even 1–2 weeks at this phase typically cascade into 3–4 week completion delays because of downstream dependencies (energization → testing → commissioning → inspection → certificate of occupancy).` : 'No procurement issues identified in your inputs. However, at the commissioning phase, verify that: switchgear delivery is confirmed, AHU startup testing is scheduled with the owner\'s commissioning agent, and temporary power is approved by the AHJ.'}

OPERATIONAL INTERPRETATION
${ctx.criticalConcerns ? `You flagged these concerns: ${ctx.criticalConcerns}\n\nProjectLens interpretation: These concerns suggest the project is entering a high-coordination, high-dependency phase. The risk is not manpower — it is sequencing. One blocked activity at this phase can idle multiple trades simultaneously.` : 'Projects in the commissioning and closeout phase follow a predictable deterioration pattern if not actively managed: (1) inspection delays stack up, (2) punch list volume exceeds expectation, (3) owner sign-offs take longer than planned, (4) turnover date slips.'}

${ctx.keyConstraints ? `KNOWN CONSTRAINTS\n${ctx.keyConstraints}\n\nLens Assessment: These constraints need dedicated tracking. Each one should have a named responsible party and a confirmed resolution date.` : ''}

WHAT TO DISCUSS WITH YOUR TEAM THIS WEEK
1. Walk the site with your super specifically to identify what trades are waiting on others. That is your true critical path right now — not what the schedule shows.
2. Call your top 2 at-risk vendors. Do not email. Phone calls get faster answers.
3. Ask the owner: "What approvals do you have outstanding that we need to proceed?" This conversation is uncomfortable but necessary.
4. Review your manpower plan for the next 4 weeks. Are you losing crews before you're ready to let them go?

COMMUNICATION RECOMMENDED
${ctx.owner ? `Owner (${ctx.owner}): Schedule a focused 30-minute status call this week. Come with your top 3 concerns and specific asks — not a full schedule review.` : 'Recommend scheduling a focused owner status call. Come with top 3 concerns and specific asks.'}

PROJECTLENS DISCLAIMER
This analysis is based on the information you provided and is intended to improve visibility and support your professional judgment. It does not replace your expertise or guarantee outcomes. Final project decisions rest entirely with your team.`
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
            {(['upload','context','analyzing','done'] as Step[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${step === s ? 'bg-blue-600 text-white' :
                    (['upload','context','analyzing','done'].indexOf(step) > i) ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {(['upload','context','analyzing','done'].indexOf(step) > i) ? '✓' : i + 1}
                </div>
                <span className={step === s ? 'text-blue-600 font-semibold' : 'text-slate-400 capitalize'}>{s === 'done' ? 'Results' : s.charAt(0).toUpperCase() + s.slice(1)}</span>
                {i < 3 && <div className="w-4 h-px bg-slate-200" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-xl font-extrabold text-slate-900 mb-1">Upload your project schedule</h2>
            <p className="text-slate-500 text-sm mb-6">ProjectLens reads Primavera P6, MS Project, Excel, or PDF schedules and interprets them like an experienced project controls advisor.</p>

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
                {['.xer (Primavera P6)','.xml (P6 XML)','.mpp (MS Project)','.pdf (Schedule PDF)','.xlsx (Excel)'].map(f => (
                  <span key={f} className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full border border-blue-100">{f}</span>
                ))}
              </div>
            </div>

            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-xs font-bold text-slate-500 mb-2">HOW PROJECTLENS READS YOUR SCHEDULE</div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Identifies critical path and activities driving completion</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Detects negative float, logic gaps, and compression risks</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Flags procurement exposure and long-lead dependencies</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Interprets schedule in plain operational language — not scheduling jargon</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Generates a ready-to-use executive summary and email</div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Context */}
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
            <p className="text-slate-500 text-sm mb-5">This takes 2 minutes. The more context you give, the more accurate and useful the analysis will be.</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Project Name *</label>
                  <input className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Riverside Commercial Tower"
                    value={ctx.projectName} onChange={e => setCtx({...ctx, projectName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Current Phase *</label>
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
                    placeholder="Metro Properties" value={ctx.owner} onChange={e => setCtx({...ctx, owner: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">General Contractor</label>
                  <input className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Nobel Construction" value={ctx.gc} onChange={e => setCtx({...ctx, gc: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Contract Value</label>
                  <input className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="$24,200,000" value={ctx.contractValue} onChange={e => setCtx({...ctx, contractValue: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Planned Completion Date</label>
                  <input type="date" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    value={ctx.completionDate} onChange={e => setCtx({...ctx, completionDate: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Known Procurement Issues or Delays</label>
                <textarea rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="e.g. Switchgear delayed 2 weeks from Eaton Corp. AHU units on watch from Carrier..."
                  value={ctx.procurementIssues} onChange={e => setCtx({...ctx, procurementIssues: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Key Constraints or Hold-Ups</label>
                <textarea rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="e.g. Owner approvals pending on 6 submittals. MEP coordination conflict Level 3. Temporary power approval pending from AHJ..."
                  value={ctx.keyConstraints} onChange={e => setCtx({...ctx, keyConstraints: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Your Biggest Concerns Right Now</label>
                <textarea rows={2} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="e.g. Worried about finishing on time. Commissioning keeps slipping. Subs pulling manpower early..."
                  value={ctx.criticalConcerns} onChange={e => setCtx({...ctx, criticalConcerns: e.target.value})} />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep('upload')} className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:border-slate-300 transition-colors">
                  ← Change File
                </button>
                <button onClick={runAnalysis} disabled={!ctx.projectName}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  🔍 Run ProjectLens Analysis →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Analyzing */}
        {step === 'analyzing' && (
          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="text-6xl mb-6 animate-pulse">🔍</div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">ProjectLens is reading your schedule</h2>
            <p className="text-slate-500 text-sm mb-8">Analyzing critical path, procurement exposure, schedule health, and operational pressure...</p>
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
              <div className="bg-slate-100 rounded-full h-2 overflow-hidden mb-3">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-slate-400">{Math.round(progress)}% complete</div>
            </div>
            <div className="space-y-2 text-left max-w-md mx-auto">
              {[
                { label: 'Reading schedule structure...', done: progress > 20 },
                { label: 'Identifying critical path...', done: progress > 40 },
                { label: 'Detecting float condition...', done: progress > 55 },
                { label: 'Analyzing procurement exposure...', done: progress > 70 },
                { label: 'Generating operational interpretation...', done: progress > 85 },
                { label: 'Writing executive summary...', done: progress >= 100 },
              ].map(item => (
                <div key={item.label} className={`flex items-center gap-3 text-xs transition-all ${item.done ? 'text-green-600' : 'text-slate-400'}`}>
                  <span>{item.done ? '✅' : '⏳'}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: Results */}
        {step === 'done' && (
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">Analysis Complete — {ctx.projectName || file?.name}</h2>
                <p className="text-slate-500 text-sm mt-0.5">ProjectLens has evaluated your project. Review below and take action.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setStep('upload'); setFile(null); setAnalysisText('') }}
                  className="px-3 py-2 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:border-slate-300">
                  Analyze Another
                </button>
                <button onClick={() => router.push('/dashboard')}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
                  View Dashboard →
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-900 text-green-400 p-5 font-mono text-xs leading-relaxed whitespace-pre-wrap min-h-64">
                {analysisText}
                {analysisText.length > 0 && analysisText.length < 500 && <span className="typing-cursor" />}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <button className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 transition-colors">
                <div className="text-base mb-1">✉️</div>
                <div className="text-xs font-bold text-slate-800">Generate Owner Email</div>
                <div className="text-xs text-slate-400 mt-0.5">Ready-to-send professional update</div>
              </button>
              <button onClick={() => router.push('/dashboard/risks')} className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 transition-colors">
                <div className="text-base mb-1">⚠️</div>
                <div className="text-xs font-bold text-slate-800">Log Risks</div>
                <div className="text-xs text-slate-400 mt-0.5">Add findings to risk register</div>
              </button>
              <button onClick={() => router.push('/dashboard')} className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 transition-colors">
                <div className="text-base mb-1">📊</div>
                <div className="text-xs font-bold text-slate-800">View Dashboard</div>
                <div className="text-xs text-slate-400 mt-0.5">See full project condition</div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
