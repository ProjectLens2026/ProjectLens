'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  getActiveProject, getActiveProjectRFIs, addRFIToActiveProject,
  deleteRFIFromActiveProject
} from '@/lib/projectStore'

interface RFIEvaluation {
  rfi_number: string
  subject: string
  date_submitted: string
  date_response_required: string
  contractor_request: string
  ae_response: string
  classification: 'INFORMATIONAL' | 'POTENTIALLY_IMPACTING' | 'SCHEDULE_IMPACTING'
  classification_reason: string
  schedule_impact_signals: string[]
  time_extension_requested: boolean
  days_requested: number | null
  impact_type: string
  impact_type_reason: string
  fragnet_required: boolean
  fragnet_instructions: {
    wbs_name: string
    activity_name: string
    recommended_duration_days: number | null
    duration_basis: string
    p6_steps: string[]
    activities_likely_affected: string
  }
  tia_narrative: string
  pm_action_summary: string
}

interface RFIRecord {
  id: string
  filename: string
  uploadedAt: string
  evaluation: RFIEvaluation
}

export default function RFIsPage() {
  const [rfis, setRfis] = useState<RFIRecord[]>([])
  const [project, setProject] = useState<any>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [selectedRFI, setSelectedRFI] = useState<RFIRecord | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [])

  function refresh() {
    setProject(getActiveProject())
    setRfis(getActiveProjectRFIs())
  }

  async function analyzeRFI(file: File) {
    if (!project) {
      alert('Please create or select a project first before uploading RFIs.')
      return
    }

    setUploading(true)
    setProgress('Reading RFI document...')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('projectName', project.name)

      setProgress('ProjectLens is evaluating schedule impact...')

      const res = await fetch('/api/rfi', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Analysis failed')

      const data = await res.json()
      setProgress('Analysis complete')

      const record: RFIRecord = {
        id: 'rfi_' + Date.now().toString(36),
        filename: file.name,
        uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        evaluation: data.evaluation,
      }

      addRFIToActiveProject(record)
      refresh()
      setSelectedRFI(record)

    } catch (err: any) {
      alert('Failed to analyze RFI: ' + err.message)
    } finally {
      setUploading(false)
      setProgress('')
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') analyzeRFI(file)
    else alert('Please upload a PDF file')
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) analyzeRFI(file)
    e.target.value = ''
  }

  function classificationColor(c: string) {
    if (c === 'SCHEDULE_IMPACTING') return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800', dot: 'bg-red-500', icon: '🔴' }
    if (c === 'POTENTIALLY_IMPACTING') return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', icon: '🟡' }
    return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800', dot: 'bg-green-500', icon: '🟢' }
  }

  function classificationLabel(c: string) {
    if (c === 'SCHEDULE_IMPACTING') return 'Schedule Impacting'
    if (c === 'POTENTIALLY_IMPACTING') return 'Potentially Impacting'
    return 'Informational Only'
  }

  function impactTypeLabel(t: string) {
    const labels: Record<string, string> = {
      OWNER_CAUSED: 'Owner-Caused',
      DESIGN_DEFICIENCY: 'Design Deficiency',
      DIFFERING_SITE_CONDITION: 'Differing Site Condition',
      FORCE_MAJEURE: 'Force Majeure',
      INFORMATIONAL: 'Informational',
      UNKNOWN: 'To Be Determined',
    }
    return labels[t] || t
  }

  const scheduleImpacting = rfis.filter(r => r.evaluation.classification === 'SCHEDULE_IMPACTING')
  const potentiallyImpacting = rfis.filter(r => r.evaluation.classification === 'POTENTIALLY_IMPACTING')
  const informational = rfis.filter(r => r.evaluation.classification === 'INFORMATIONAL')

  // No active project — show empty state
  if (!project) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <div>
            <span className="font-bold text-slate-900 text-base">RFIs</span>
            <span className="text-slate-400 text-sm ml-2">· No active project</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">❓</span>
            </div>
            <div className="text-lg font-bold text-slate-700 mb-2">Select a project first</div>
            <div className="text-sm text-slate-500 mb-6">RFIs are tied to specific projects. Open a project to upload and evaluate its RFIs.</div>
            <Link href="/dashboard/projects"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
              Go to Projects →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel - RFI list */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-slate-200 bg-white">
        <div className="px-4 py-4 border-b border-slate-200">
          <div className="font-bold text-slate-900 text-sm mb-1">RFI Evaluation</div>
          <div className="text-[10px] text-blue-600 font-semibold mb-1 truncate">{project.name}</div>
          <div className="text-xs text-slate-500">Upload RFI PDFs for schedule impact analysis</div>
        </div>

        {/* Summary badges */}
        {rfis.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-100 flex gap-2 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">{scheduleImpacting.length} Schedule Impact</span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">{potentiallyImpacting.length} Potential</span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-green-100 text-green-700">{informational.length} Info Only</span>
          </div>
        )}

        {/* Upload zone */}
        <div
          className={`mx-3 my-3 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={onPick} />
          {uploading ? (
            <div>
              <div className="text-2xl mb-1 animate-pulse">📄</div>
              <div className="text-xs text-blue-600 font-semibold">{progress}</div>
            </div>
          ) : (
            <div>
              <div className="text-2xl mb-1">📄</div>
              <div className="text-xs font-semibold text-slate-600">Drop RFI PDF here</div>
              <div className="text-[10px] text-slate-400 mt-0.5">or click to browse</div>
            </div>
          )}
        </div>

        {/* RFI list */}
        <div className="flex-1 overflow-y-auto">
          {rfis.length === 0 && !uploading && (
            <div className="text-center py-8 px-4">
              <div className="text-3xl mb-2">📋</div>
              <div className="text-xs text-slate-400">No RFIs evaluated yet. Upload a PDF to begin.</div>
            </div>
          )}
          {rfis.map(r => {
            const col = classificationColor(r.evaluation.classification)
            const isSelected = selectedRFI?.id === r.id
            return (
              <div key={r.id}
                onClick={() => setSelectedRFI(r)}
                className={`px-4 py-3 border-b border-slate-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-slate-50'}`}>
                <div className="flex items-start gap-2">
                  <span className="text-base flex-shrink-0 mt-0.5">{col.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {r.evaluation.rfi_number ? `RFI #${r.evaluation.rfi_number}` : r.filename}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">{r.evaluation.subject}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${col.badge}`}>
                        {classificationLabel(r.evaluation.classification)}
                      </span>
                      {r.evaluation.days_requested && (
                        <span className="text-[9px] text-red-600 font-bold">{r.evaluation.days_requested}d requested</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right panel - RFI detail */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        {!selectedRFI ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-5xl mb-3">📋</div>
              <div className="text-slate-500 text-sm font-semibold">Upload an RFI PDF to see the analysis</div>
              <div className="text-slate-400 text-xs mt-1">ProjectLens will evaluate schedule impact and generate TIA guidance</div>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900 text-base">
                  {selectedRFI.evaluation.rfi_number ? `RFI #${selectedRFI.evaluation.rfi_number}` : selectedRFI.filename}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{selectedRFI.evaluation.subject} · Analyzed {selectedRFI.uploadedAt}</div>
              </div>
              <button onClick={() => window.print()} className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 hover:border-slate-400 font-semibold">
                🖨 Print / PDF
              </button>
            </div>

            {/* Classification banner */}
            {(() => {
              const col = classificationColor(selectedRFI.evaluation.classification)
              return (
                <div className={`${col.bg} ${col.border} border rounded-xl p-4 flex items-start gap-3`}>
                  <div className="text-2xl flex-shrink-0">{col.icon}</div>
                  <div className="flex-1">
                    <div className={`font-bold text-sm ${col.text}`}>
                      {classificationLabel(selectedRFI.evaluation.classification)}
                      {selectedRFI.evaluation.time_extension_requested && selectedRFI.evaluation.days_requested &&
                        ` — ${selectedRFI.evaluation.days_requested} calendar days requested`}
                    </div>
                    <div className={`text-xs mt-1 ${col.text} opacity-80 leading-relaxed`}>
                      {selectedRFI.evaluation.classification_reason}
                    </div>
                    {selectedRFI.evaluation.schedule_impact_signals?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedRFI.evaluation.schedule_impact_signals.map((s, i) => (
                          <span key={i} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${col.badge}`}>"{s}"</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-bold text-slate-600">{impactTypeLabel(selectedRFI.evaluation.impact_type)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Responsibility</div>
                  </div>
                </div>
              )
            })()}

            {/* RFI Details */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">RFI Details</div>
              <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">RFI Number</div>
                  <div className="font-bold text-slate-900">{selectedRFI.evaluation.rfi_number || '—'}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">Date Submitted</div>
                  <div className="font-bold text-slate-900">{selectedRFI.evaluation.date_submitted || '—'}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">Response Required</div>
                  <div className="font-bold text-slate-900">{selectedRFI.evaluation.date_response_required || '—'}</div>
                </div>
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="font-bold text-slate-600 mb-1">Contractor's Request</div>
                  <div className="text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3">{selectedRFI.evaluation.contractor_request}</div>
                </div>
                <div>
                  <div className="font-bold text-slate-600 mb-1">AE / Owner Response</div>
                  <div className="text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3">{selectedRFI.evaluation.ae_response}</div>
                </div>
              </div>
            </div>

            {/* Fragnet Instructions — only show if schedule impacting */}
            {selectedRFI.evaluation.fragnet_required && selectedRFI.evaluation.fragnet_instructions && (
              <div className="bg-white border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🔧</span>
                  <div className="text-xs font-bold text-red-700 uppercase tracking-wider">Fragnet Required — P6 Instructions</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 mb-4 text-xs text-red-900 leading-relaxed">
                  This RFI requires a fragnet activity to be inserted in your impacted current schedule in Primavera P6.
                  Follow the steps below, then upload both schedules (un-impacted and impacted) to the TIA Comparison page.
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-slate-400 mb-1">WBS Location</div>
                    <div className="font-bold font-mono text-slate-900">{selectedRFI.evaluation.fragnet_instructions.wbs_name}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-slate-400 mb-1">Activity Name</div>
                    <div className="font-bold font-mono text-slate-900">{selectedRFI.evaluation.fragnet_instructions.activity_name}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-slate-400 mb-1">Recommended Duration</div>
                    <div className="font-bold text-slate-900">
                      {selectedRFI.evaluation.fragnet_instructions.recommended_duration_days
                        ? `${selectedRFI.evaluation.fragnet_instructions.recommended_duration_days} calendar days`
                        : 'To be determined'}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-slate-400 mb-1">Duration Basis</div>
                    <div className="text-slate-700">{selectedRFI.evaluation.fragnet_instructions.duration_basis}</div>
                  </div>
                </div>

                <div className="mb-4 text-xs">
                  <div className="font-bold text-slate-600 mb-2">Activities Likely Affected</div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 leading-relaxed">
                    {selectedRFI.evaluation.fragnet_instructions.activities_likely_affected}
                  </div>
                </div>

                <div className="text-xs">
                  <div className="font-bold text-slate-600 mb-2">Step-by-step P6 instructions</div>
                  <div className="space-y-2">
                    {selectedRFI.evaluation.fragnet_instructions.p6_steps.map((step, i) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div className="text-slate-700 leading-relaxed">{step.replace(/^Step \d+:\s*/i, '')}</div>
                      </div>
                    ))}
                    <div className="flex gap-3 items-start">
                      <div className="w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">✓</div>
                      <div className="text-slate-700 leading-relaxed">
                        Re-export the impacted schedule as XER, then go to{' '}
                        <a href="/dashboard/tia" className="text-blue-600 font-semibold hover:underline">TIA Comparison</a>{' '}
                        and upload both the un-impacted and impacted XER files to generate the full TIA report.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PM Action Summary */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">👷</span>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">What to do next — plain language</div>
              </div>
              <div className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-4">
                {selectedRFI.evaluation.pm_action_summary}
              </div>
            </div>

            {/* TIA Narrative */}
            <div className="bg-white border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📝</span>
                <div className="text-xs font-bold text-blue-700 uppercase tracking-wider">TIA Narrative — ready for report</div>
              </div>
              <div className="text-sm text-slate-700 leading-relaxed bg-blue-50 rounded-lg p-4 italic">
                {selectedRFI.evaluation.tia_narrative}
              </div>
              <div className="text-[10px] text-slate-400 mt-2">
                This narrative will automatically appear in the Fragnet Analysis section of your TIA Word report when generated from the TIA Comparison page.
              </div>
            </div>

            {/* Impact type explanation */}
            {selectedRFI.evaluation.impact_type !== 'INFORMATIONAL' && (
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Responsibility Classification</div>
                <div className="flex items-start gap-3 text-xs">
                  <span className="font-bold text-slate-900 flex-shrink-0">{impactTypeLabel(selectedRFI.evaluation.impact_type)}</span>
                  <span className="text-slate-600 leading-relaxed">— {selectedRFI.evaluation.impact_type_reason}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
