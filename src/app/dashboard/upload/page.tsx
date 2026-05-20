'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  getActiveProjectId, loadProjects,
  createProject, addVersionToProject,
  subscribeToProjects,
  ScheduleVersion
} from '@/lib/projectStore'
// XER parser — runs in the browser to avoid Vercel's serverless function
// body limit (which was truncating large XER files like the 620 KB DCDGS
// file from 1,048 activities down to 557). See runAnalysis() below.
import { parseXER, analyzeXER } from '@/lib/xerParser'

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

// Read a File as text with encoding auto-detection.
//
// Primavera P6 exports XER files as UTF-16LE by default. Other tools and
// some scripts export as UTF-8. We auto-detect by looking at the BOM and,
// when no BOM is present, by sampling the first 100 byte-pairs for the
// characteristic UTF-16 "every other byte is zero" pattern.
async function readXERFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.slice(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.slice(2))
  }
  let zeroByteCount = 0
  const sampleSize = Math.min(200, bytes.length)
  for (let i = 1; i < sampleSize; i += 2) {
    if (bytes[i] === 0x00) zeroByteCount++
  }
  if (zeroByteCount > sampleSize / 4) {
    return new TextDecoder('utf-16le').decode(bytes)
  }
  return new TextDecoder('utf-8').decode(bytes)
}

export default function UploadPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<any>(null)
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
    refreshProjectsList()
    const unsubscribe = subscribeToProjects(refreshProjectsList)
    return unsubscribe
  }, [])

  function refreshProjectsList() {
    const all = loadProjects()
    setExistingProjects(all)
    const activeId = getActiveProjectId()
    if (activeId && all.find(p => p.id === activeId)) {
      setSelectedProjectId(activeId)
      setProjectMode('existing')
    } else if (all.length === 0) {
      setSelectedProjectId('')
      setProjectMode('new')
    }
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const accept = '.xer,.xml,.mpp,.pdf,.xlsx,.xls,.csv'
  const phases = ['Pre-Construction','Foundation & Sitework','Structure','MEP Rough-In','Interior Finishes','Commissioning & Closeout','Punch & Turnover']

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) {
      setFile(f)
      refreshProjectsList()
      setStep('context')
    }
  }
  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      refreshProjectsList()
      setStep('context')
    }
  }

  async function runAnalysis() {
    setStep('analyzing')
    setProgress(0)
    // Engine-only now — much faster. Parsing is done client-side in
    // seconds, server-side analyze just acknowledges. No more 30-sec
    // wait for AI generation on every upload.
    const progInterval = setInterval(() => {
      setProgress(p => p < 85 ? p + Math.random() * 12 : p)
    }, 200)
    try {
      if (!file) {
        throw new Error('No file selected')
      }
      const ext = file.name.split('.').pop()?.toLowerCase()
      let analysis: any
      let rawXER: string | undefined
      if (ext === 'xer') {
        // CLIENT-SIDE XER PARSING — bypasses Vercel's serverless function
        // upload size limit. The browser reads the entire file into
        // memory, auto-detects encoding (Primavera P6 defaults to
        // UTF-16LE), then runs parseXER + analyzeXER. Only the small
        // parsed analysis JSON is sent to the server.
        setProgress(15)
        const text = await readXERFileAsText(file)
        rawXER = text
        setProgress(45)
        const parsed = parseXER(text)
        const result = analyzeXER(parsed)
        analysis = {
          ...result,
          projectName: parsed.projectName || ctx.projectName || file.name,
          dataDate: parsed.dataDate,
          contractEnd: parsed.contractEnd,
          projectedEnd: parsed.projectedEnd,
          fileType: 'Primavera P6 XER',
        }
        setProgress(70)
      } else {
        // Non-XER files — build a fallback analysis. No parsing happens
        // for these formats yet. The project context the user typed in
        // is preserved for later use.
        analysis = {
          fileType: ext?.toUpperCase() || 'UNKNOWN',
          projectName: ctx.projectName || file.name,
          message: 'File received. Detailed parsing is currently optimized for Primavera P6 XER files.',
          healthScore: 65,
          condition: 'Monitor Closely',
          totalActivities: 0,
          complete: 0,
          inProgress: 0,
          notStarted: 0,
          negativeFloat: 0,
          outOfSequence: [],
          noTies: [],
          longLeadItems: [],
          criticalDrivers: [],
          inProgressActivities: [],
          delayDays: 0,
        }
      }

      // Send parsed analysis to server for acknowledgement. Engine-only
      // now — no AI call here. Operational Analysis is generated on
      // demand via /api/generate-narrative when the PM requests it
      // on the Schedule Analysis page.
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis,
          context: ctx,
          fileName: file.name,
        }),
      })
      clearInterval(progInterval)
      setProgress(100)

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error')
        throw new Error(`Server error: ${errText}`)
      }
      const data = await res.json()
      setResult(data)

      // Save as a project version. No aiNarrative on initial save —
      // the PM generates it on-demand from the Schedule Analysis page.
      try {
        const version: ScheduleVersion = {
          id: 'ver_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          uploadedAt: new Date().toISOString(),
          dataDate: data.analysis?.dataDate || undefined,
          fileName: file?.name || 'schedule.xer',
          analysis: data.analysis,
          // aiNarrative intentionally omitted. PM generates on demand.
          context: ctx,
          rawXER,
        }
        console.log('[ControlLens] Saving version', { projectMode, selectedProjectId, versionId: version.id })
        if (projectMode === 'existing' && selectedProjectId) {
          const updated = addVersionToProject(selectedProjectId, version)
          console.log('[ControlLens] Added version to existing project', { success: !!updated, totalVersions: updated?.versions.length })
        } else {
          const projectName = ctx.projectName || data.analysis?.projectName || file?.name?.replace(/\.[a-z]+$/i, '') || 'Untitled Project'
          const newProj = createProject({
            name: projectName,
            projectId: newProjectId.trim() || undefined,
            owner: ctx.owner,
            version,
          })
          console.log('[ControlLens] Created new project', { id: newProj.id, name: newProj.name })
        }
        try {
          localStorage.setItem('pl_last_analysis', JSON.stringify(data.analysis))
        } catch (legacyErr) {
          console.warn('[ControlLens] Could not write legacy pl_last_analysis key (non-critical):', legacyErr)
        }
      } catch (err: any) {
        console.error('[ControlLens] Failed to save project:', err)
        const userMessage = err?.message ||
          'Failed to save this project. The analysis displayed above is correct, but it was not saved.'
        alert(
          'Your schedule was analyzed successfully, but we could not save it:\n\n' +
          userMessage +
          '\n\nThe analysis below is still accurate — but it will not appear in your Projects list unless saving succeeds.'
        )
      }
      // Send the user straight to the Schedule Analysis page so they can
      // review the full analysis and choose whether to generate the
      // operational analysis narrative when they want it.
      setTimeout(() => router.push('/dashboard/lens'), 300)
    } catch (err: any) {
      clearInterval(progInterval)
      console.error('[ControlLens] Analysis error:', err)
      alert('Analysis failed: ' + (err.message || 'Unknown error'))
      setStep('context')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Upload Schedule</span>
          <span className="text-slate-400 text-sm ml-2">· Full Analysis</span>
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
            <p className="text-slate-500 text-sm mb-6">ControlLens reads Primavera P6 XER files and interprets them like an experienced project controls advisor — including logic checks, long lead detection, and TIA evidence.</p>
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
              <div className="text-xs font-bold text-slate-500 mb-2">WHAT CONTROLLENS WILL ANALYZE</div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Critical path drivers and float condition</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Logic violations and out-of-sequence work</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Long lead items and procurement risk</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Activities with no logic ties (schedule quality)</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Field reality check on in-progress activities</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Plain language summary and TIA evidence</div>
                <div className="flex gap-2"><span className="text-green-500 font-bold">✓</span>Operational Analysis available on demand</div>
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
                <div className="text-green-600 text-xs mt-0.5">{file ? (file.size / 1024).toFixed(0) + ' KB' : ''} · Add context to enrich the analysis</div>
              </div>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-1">Tell us about your project</h2>
            <p className="text-slate-500 text-sm mb-5">Takes 2 minutes. The more context you give, the more accurate the analysis — and the Operational Analysis you can generate later.</p>
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
                  🔍 Run Full Analysis →
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="max-w-2xl mx-auto text-center py-16">
            <div className="text-6xl mb-6 animate-pulse">🔍</div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">ControlLens is reading your schedule</h2>
            <p className="text-slate-500 text-sm mb-8">Parsing activities, relationships, logic, and critical path...</p>
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
              <div className="bg-slate-100 rounded-full h-2 overflow-hidden mb-3">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-slate-400">{Math.round(progress)}% complete</div>
            </div>
            <div className="space-y-2 text-left max-w-md mx-auto">
              {[
                { label: 'Parsing XER structure...', done: progress > 20 },
                { label: 'Building relationship maps...', done: progress > 40 },
                { label: 'Identifying critical path...', done: progress > 55 },
                { label: 'Detecting logic violations...', done: progress > 70 },
                { label: 'Flagging long lead items...', done: progress > 85 },
                { label: 'Finalizing analysis...', done: progress > 95 },
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
