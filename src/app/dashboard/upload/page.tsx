'use client'
// =============================================================================
// Upload Schedule — Day 6, v14
//
// v14 changes (from previous version):
//   1. Project ID is now MANDATORY for new projects (red asterisk, validation).
//   2. Schedule Type dropdown (Baseline / Rebaseline / Update) — no default,
//      PM must pick. Disabled states follow the rules:
//        - New project (no versions yet) → only Baseline is enabled.
//        - Existing project with no baseline → only Baseline is enabled
//          (rare case; baseline migrates first version automatically).
//        - Existing project with baseline → Rebaseline + Update are enabled;
//          Baseline is disabled with "delete to replace" tooltip.
//   3. Auto-generated version label preview shown in gray below the dropdown.
//   4. Owner/Client/GC placeholders are now generic — no "Azizi" or "USACE".
//
// Everything else (XER parsing, contract dates form, save flow) is the same
// as v13 — we just append the schedule-type / labeling metadata on top.
// =============================================================================

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePermissions } from '@/lib/usePermissions'
import {
  getActiveProjectId, loadProjects,
  createProject, addVersionToProject,
  subscribeToProjects, updateProjectContractDates,
  computeRevisedCompletion,
  ScheduleVersion, ContractDates, VersionDates, Project,
} from '@/lib/projectStore'
import {
  generateVersionLabel,
  buildDateSnapshot,
  validateProjectId,
  sanitizeProjectId,
  sanitizeProjectIdLive,
  canUploadType,
  getNextSequenceNumber,
  type ScheduleType,
} from '@/lib/versionLabeler'
// XER parser — runs in the browser to avoid Vercel's serverless function
// body limit (which was truncating large XER files like the 620 KB DCDGS
// file from 1,048 activities down to 557). See runAnalysis() below.
import { parseXER, analyzeXER } from '@/lib/xerParser'
import { getOrgPlanInfo, OrgPlanInfo } from '@/lib/supabase/db'

type Step = 'upload' | 'context' | 'analyzing' | 'done'

interface ProjectContext {
  projectName: string
  owner: string
  gc: string
}

interface ContractDatesFormState {
  ntp: string
  originalContractCompletion: string
  timeExtensionDays: number
  revisedContractCompletion: string
  manualDataDate: string
  substantialCompletion: string
}

const EMPTY_CONTRACT_DATES: ContractDatesFormState = {
  ntp: '',
  originalContractCompletion: '',
  timeExtensionDays: 0,
  revisedContractCompletion: '',
  manualDataDate: '',
  substantialCompletion: '',
}

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
  const perms = usePermissions()
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [ctx, setCtx] = useState<ProjectContext>({
    projectName: '', owner: '', gc: ''
  })
  const [cd, setCd] = useState<ContractDatesFormState>(EMPTY_CONTRACT_DATES)
  const [dateError, setDateError] = useState<string>('')

  // Project assignment state
  const [existingProjects, setExistingProjects] = useState<Project[]>([])
  const [projectMode, setProjectMode] = useState<'new' | 'existing'>('new')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [newProjectId, setNewProjectId] = useState<string>('')

  // v14 — schedule type + validation state
  const [scheduleType, setScheduleType] = useState<ScheduleType | null>(null)
  const [projectIdError, setProjectIdError] = useState<string>('')

  // Phase A.1 — Pro plan project limit info (loaded on mount)
  const [planInfo, setPlanInfo] = useState<OrgPlanInfo | null>(null)

  useEffect(() => {
    refreshProjectsList()
    getOrgPlanInfo().then(setPlanInfo)
    const unsubscribe = subscribeToProjects(refreshProjectsList)
    return unsubscribe
  }, [])

  function refreshProjectsList() {
    const all = loadProjects()
    setExistingProjects(all)
    const activeId = getActiveProjectId()
    // Phase 3D — PMs can NEVER create new projects via upload. Force them
    // into existing-project mode regardless of what's selected.
    if (!perms.loading && !perms.can.createProject) {
      setProjectMode('existing')
      if (activeId && all.find(p => p.id === activeId)) {
        setSelectedProjectId(activeId)
      } else if (all.length > 0) {
        setSelectedProjectId(all[0].id)
      }
      return
    }
    // Phase A.1 + A.2 — if org is at plan limit OR trial expired, force existing
    // mode so they can't start a new project. Banner above will explain why.
    if (planInfo && (planInfo.atLimit || planInfo.trialExpired) && all.length > 0) {
      setProjectMode('existing')
      if (activeId && all.find(p => p.id === activeId)) {
        setSelectedProjectId(activeId)
      } else {
        setSelectedProjectId(all[0].id)
      }
      return
    }
    if (activeId && all.find(p => p.id === activeId)) {
      setSelectedProjectId(activeId)
      setProjectMode('existing')
    } else if (all.length === 0) {
      setSelectedProjectId('')
      setProjectMode('new')
    }
  }

  useEffect(() => {
    if (projectMode !== 'existing' || !selectedProjectId) return
    const project = existingProjects.find(p => p.id === selectedProjectId)
    if (!project) return
    const projCD = project.contractDates
    const latestVersionDates = project.versions[0]?.versionDates
    const ntp = projCD?.ntp || ''
    const origComp = projCD?.originalContractCompletion || ''
    const substComp = projCD?.substantialCompletion || ''
    const timeExt = latestVersionDates?.timeExtensionDays ?? 0
    const revised = computeRevisedCompletion(origComp, timeExt) || ''
    setCd({
      ntp,
      originalContractCompletion: origComp,
      timeExtensionDays: timeExt,
      revisedContractCompletion: revised,
      manualDataDate: '',
      substantialCompletion: substComp,
    })
    setDateError('')
    // v14 — reset schedule type when project changes, force PM to pick again
    setScheduleType(null)
  }, [projectMode, selectedProjectId, existingProjects])

  // v14 — reset schedule type when switching between new/existing modes
  useEffect(() => { setScheduleType(null) }, [projectMode])

  function updateOriginal(val: string) {
    setCd(c => ({
      ...c,
      originalContractCompletion: val,
      revisedContractCompletion: computeRevisedCompletion(val, c.timeExtensionDays) || '',
    }))
    setDateError('')
  }
  function updateTimeExt(valStr: string) {
    const n = parseInt(valStr || '0', 10)
    const days = isNaN(n) ? 0 : n
    setCd(c => ({
      ...c,
      timeExtensionDays: days,
      revisedContractCompletion: computeRevisedCompletion(c.originalContractCompletion, days) || '',
    }))
  }

  // v14 — Project ID input handler with live validation. Sanitizes as user
  // types (uppercase + filter chars + spaces→hyphens) but allows trailing
  // hyphens and repeated hyphens during typing. On save, runAnalysis runs
  // the strict sanitizeProjectId() that trims and collapses.
  function updateProjectId(raw: string) {
    const cleaned = sanitizeProjectIdLive(raw)
    setNewProjectId(cleaned)
    if (cleaned.length === 0) {
      setProjectIdError('')  // hide error while empty (shown only on submit)
    } else {
      // Validate against the strict form so the user knows the trailing
      // hyphen will get trimmed on save — but don't block typing.
      const err = validateProjectId(sanitizeProjectId(cleaned))
      setProjectIdError(err || '')
    }
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const accept = '.xer,.xml,.mpp,.pdf,.xlsx,.xls,.csv'

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

  // v14 — derive the dropdown state machine from current project mode +
  // selection. For new projects only Baseline is enabled (no versions yet).
  // For existing projects, defer to canUploadType from versionLabeler.
  const typeStates: Record<ScheduleType, { allowed: boolean; reason?: string }> = useMemo(() => {
    if (projectMode === 'new') {
      return {
        baseline: { allowed: true },
        rebaseline: { allowed: false, reason: 'New project — first upload must be baseline' },
        update: { allowed: false, reason: 'New project — first upload must be baseline' },
        fragnet: { allowed: false, reason: 'New project — first upload must be baseline' },
      }
    }
    const project = existingProjects.find(p => p.id === selectedProjectId)
    if (!project) {
      return {
        baseline: { allowed: false, reason: 'Pick a project first' },
        rebaseline: { allowed: false, reason: 'Pick a project first' },
        update: { allowed: false, reason: 'Pick a project first' },
        fragnet: { allowed: false, reason: 'Pick a project first' },
      }
    }
    const labelerVersions = project.versions.map(v => ({
      id: v.id,
      scheduleType: v.scheduleType,
      sequenceNumber: v.sequenceNumber,
      dataDate: v.dataDate,
    }))
    return {
      baseline: canUploadType(labelerVersions, 'baseline'),
      rebaseline: canUploadType(labelerVersions, 'rebaseline'),
      update: canUploadType(labelerVersions, 'update'),
      fragnet: canUploadType(labelerVersions, 'fragnet'),
    }
  }, [projectMode, selectedProjectId, existingProjects])

  // v14 — compute the version-label PREVIEW the PM will see saved. Uses the
  // same generator as the actual save path so what they see is what they get.
  const labelPreview = useMemo<string | null>(() => {
    if (!scheduleType) return null
    if (!cd.ntp) return null
    if (projectMode === 'new') {
      const pid = newProjectId.trim()
      if (!pid || validateProjectId(pid)) return null
      // New project always starts at sequence 0 (baseline). We don't show
      // rebaseline/update for new projects, but guard anyway.
      const seq = scheduleType === 'baseline' ? 0 : 1
      return generateVersionLabel({
        projectId: pid, ntp: cd.ntp, type: scheduleType, sequenceNumber: seq,
      })
    }
    const project = existingProjects.find(p => p.id === selectedProjectId)
    if (!project || !project.projectId) return null
    const labelerVersions = project.versions.map(v => ({
      id: v.id,
      scheduleType: v.scheduleType,
      sequenceNumber: v.sequenceNumber,
      dataDate: v.dataDate,
    }))
    const next = getNextSequenceNumber(labelerVersions, scheduleType)
    if (next === null) return null
    return generateVersionLabel({
      projectId: project.projectId,
      ntp: project.contractDates?.ntp || cd.ntp,
      type: scheduleType,
      sequenceNumber: next,
      dataDate: cd.manualDataDate || undefined,
    })
  }, [scheduleType, projectMode, newProjectId, selectedProjectId, existingProjects, cd.ntp])

  // -------------------------------------------------------------------------
  // runAnalysis — validate everything, parse XER, save version with the new
  // labeling metadata attached.
  // -------------------------------------------------------------------------
  async function runAnalysis() {
    // v14 — schedule type required
    if (!scheduleType) {
      setDateError('Please pick a Schedule Type (Baseline, Rebaseline, or Update) above')
      return
    }
    // v14 — Project ID required for new projects
    if (projectMode === 'new') {
      const trimmed = sanitizeProjectId(newProjectId)  // strict: trim + collapse hyphens
      const idErr = validateProjectId(trimmed)
      if (idErr) {
        setProjectIdError(idErr)
        setDateError('')
        return
      }
      // Block creating two projects with the same Project ID
      const collision = existingProjects.find(
        p => p.projectId?.toUpperCase() === trimmed.toUpperCase()
      )
      if (collision) {
        setProjectIdError(`Project ID "${trimmed}" is already used by "${collision.name}"`)
        setDateError('')
        return
      }
      // Save the cleaned form back into state so the label preview and save
      // path both use the strict version.
      setNewProjectId(trimmed)
    }
    // Validate contract dates
    if (!cd.ntp) {
      setDateError('NTP / Contract Start Date is required')
      return
    }
    if (!cd.originalContractCompletion) {
      setDateError('Original Contract Completion Date is required')
      return
    }
    if (cd.ntp >= cd.originalContractCompletion) {
      setDateError('Original Contract Completion must be after NTP')
      return
    }
    // v14 — Project Name required for new projects (matches the locked-once
    // rule from the spec). Empty falls back to file name if PM somehow gets
    // past this, but we nudge them to enter one.
    if (projectMode === 'new' && !ctx.projectName.trim()) {
      setDateError('Project Name is required')
      return
    }
    setDateError('')
    setProjectIdError('')

    setStep('analyzing')
    setProgress(0)
    const progInterval = setInterval(() => {
      setProgress(p => p < 85 ? p + Math.random() * 12 : p)
    }, 200)

    try {
      if (!file) throw new Error('No file selected')
      const ext = file.name.split('.').pop()?.toLowerCase()
      let analysis: any
      let rawXER: string | undefined

      if (ext === 'xer') {
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

      // v15 — Skip the /api/analyze server round-trip.
      //
      // Previously we POSTed the parsed analysis to /api/analyze just for
      // acknowledgement. With 50MB XER files producing 5-10MB analysis JSON,
      // that POST hit Vercel's serverless function body limit (4.5MB), causing
      // FUNCTION_PAYLOAD_TOO_LARGE errors. The analysis is fully computed in
      // the browser, so the server round-trip wasn't doing useful work — we
      // just use the local analysis directly now.
      clearInterval(progInterval)
      setProgress(100)
      const data = { analysis }
      setResult(data)

      // ---------------------------------------------------------------------
      // Save as a project version with v14 labeling metadata attached.
      // For NEW projects, we also need to figure out the sequence number
      // (always 0 for baseline since it's the first version). For EXISTING,
      // we look up the next sequence number for the chosen schedule type.
      // ---------------------------------------------------------------------
      try {
        const versionDates: VersionDates = {
          timeExtensionDays: cd.timeExtensionDays || 0,
          revisedContractCompletion: cd.revisedContractCompletion || undefined,
          manualDataDate: cd.manualDataDate || undefined,
        }
        const dataDate = cd.manualDataDate || data.analysis?.dataDate || undefined

        const projectContractDates: ContractDates = {
          ntp: cd.ntp,
          originalContractCompletion: cd.originalContractCompletion,
          substantialCompletion: cd.substantialCompletion || undefined,
        }

        if (projectMode === 'existing' && selectedProjectId) {
          updateProjectContractDates(selectedProjectId, projectContractDates)
          // Re-read project after the contractDates update so the labeler
          // sees the latest data when computing sequence numbers.
          const updatedProject = loadProjects().find(p => p.id === selectedProjectId)
          if (!updatedProject || !updatedProject.projectId) {
            throw new Error('Selected project is missing a Project ID')
          }
          const labelerVersions = updatedProject.versions.map(v => ({
            id: v.id,
            scheduleType: v.scheduleType,
            sequenceNumber: v.sequenceNumber,
            dataDate: v.dataDate,
          }))
          const nextSeq = getNextSequenceNumber(labelerVersions, scheduleType)
          if (nextSeq === null) {
            throw new Error(`Cannot upload a new ${scheduleType} — sequence is full or blocked`)
          }
          const versionLabel = generateVersionLabel({
            projectId: updatedProject.projectId,
            ntp: updatedProject.contractDates?.ntp || cd.ntp,
            type: scheduleType,
            sequenceNumber: nextSeq,
            dataDate,
          })
          const snapshot = buildDateSnapshot(updatedProject.contractDates || projectContractDates, dataDate)

          const version: ScheduleVersion = {
            id: 'ver_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            uploadedAt: new Date().toISOString(),
            dataDate,
            fileName: file?.name || 'schedule.xer',
            analysis: data.analysis,
            context: ctx,
            rawXER,
            versionDates,
            scheduleType,
            sequenceNumber: nextSeq,
            versionLabel,
            snapshot,
          }

          console.log('[ControlLens] Adding labeled version to existing project', {
            projectId: updatedProject.projectId,
            versionLabel,
            scheduleType,
            sequenceNumber: nextSeq,
          })
          const updated = addVersionToProject(selectedProjectId, version)
          console.log('[ControlLens] Add result:', { success: !!updated, totalVersions: updated?.versions.length })
        } else {
          // NEW project — schedule type is always baseline (UI enforces it).
          // Sequence number is 0 for baseline.
          const pid = sanitizeProjectId(newProjectId)
          const projectName = ctx.projectName.trim()
            || data.analysis?.projectName
            || file?.name?.replace(/\.[a-z]+$/i, '')
            || 'Untitled Project'
          const versionLabel = generateVersionLabel({
            projectId: pid,
            ntp: cd.ntp,
            type: scheduleType,                          // 'baseline' for new projects
            sequenceNumber: scheduleType === 'baseline' ? 0 : 1,
          })
          const snapshot = buildDateSnapshot(projectContractDates, dataDate)

          const version: ScheduleVersion = {
            id: 'ver_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            uploadedAt: new Date().toISOString(),
            dataDate,
            fileName: file?.name || 'schedule.xer',
            analysis: data.analysis,
            context: ctx,
            rawXER,
            versionDates,
            scheduleType,
            sequenceNumber: scheduleType === 'baseline' ? 0 : 1,
            versionLabel,
            snapshot,
          }

          const newProj = createProject({
            name: projectName,
            projectId: pid,
            owner: ctx.owner,
            contractDates: projectContractDates,
            version,
          })
          console.log('[ControlLens] Created new project', {
            id: newProj.id,
            name: newProj.name,
            projectId: newProj.projectId,
            versionLabel,
          })
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

      setTimeout(() => router.push('/dashboard'), 300)
    } catch (err: any) {
      clearInterval(progInterval)
      console.error('[ControlLens] Analysis error:', err)
      alert('Analysis failed: ' + (err.message || 'Unknown error'))
      setStep('context')
    }
  }

  const selectedProjectHasContractDates = projectMode === 'existing'
    && selectedProjectId
    && !!(existingProjects.find(p => p.id === selectedProjectId)?.contractDates?.ntp)

  // v14 — render a single schedule-type radio button. Reusable for the
  // three options in the dropdown row.
  function renderTypeButton(type: ScheduleType, icon: string, title: string) {
    const state = typeStates[type]
    const isSelected = scheduleType === type
    const isDisabled = !state.allowed
    return (
      <button
        type="button"
        key={type}
        onClick={() => {
          if (!state.allowed) return
          setScheduleType(type)
          setDateError('')
        }}
        disabled={isDisabled}
        title={state.reason || ''}
        className={`text-left p-3 rounded-lg border-2 transition-all
          ${isSelected ? 'border-blue-500 bg-white shadow-sm' : 'border-slate-200 bg-white/50'}
          ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-blue-300 cursor-pointer'}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-4 h-4 rounded-full border-2 ${isSelected ? 'border-blue-500' : 'border-slate-300'} flex items-center justify-center flex-shrink-0`}>
            {isSelected && <div className="w-2 h-2 rounded-full bg-blue-500" />}
          </div>
          <span className="text-base">{icon}</span>
          <span className="font-bold text-xs text-slate-900">{title}</span>
        </div>
        <div className="text-[10px] text-slate-500 ml-6 leading-tight">
          {isDisabled ? state.reason : (
            type === 'baseline' ? 'The approved schedule of record' :
            type === 'rebaseline' ? 'New approved baseline replacing prior plan' :
            type === 'update' ? 'Monthly progress update against current baseline' :
            'Impacted schedule with fragmentary network activities for TIA'
          )}
        </div>
      </button>
    )
  }

  // Phase 3D — Viewer lockdown. Block this page entirely for Viewers (and
  // anyone without uploadSchedule permission). Placed AFTER all hooks have
  // been called to avoid React hook ordering violations.
  if (!perms.loading && !perms.can.uploadSchedule) {
    return (
      <div className="flex flex-col h-full bg-slate-50 items-center justify-center p-6">
        <div className="max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-lg font-bold text-slate-900 mb-2">Access denied</div>
          <div className="text-sm text-slate-600 mb-6 leading-relaxed">
            Uploading schedule versions requires <strong>Project Manager</strong>, <strong>Admin</strong>, or <strong>Owner</strong> role. As a Viewer you have read-only access — ask your admin if you need to upload schedules.
          </div>
          <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
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
                <div className="text-green-600 text-xs mt-0.5">{file ? (file.size / 1024).toFixed(0) + ' KB' : ''} · Pick schedule type and project info before analysis</div>
              </div>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-1">Tell us about your project</h2>
            <p className="text-slate-500 text-sm mb-5">Project ID and Name lock once set. Contract dates feed into the dashboard. On future uploads, fields auto-fill — edit only what changed.</p>

            {/* Phase A.2 — Trial expired banner (red, hard block).
                Shown when subscription_status='trial' AND trial_ends_at < now.
                Soft-block model: existing data + version uploads still work,
                but no new projects, no Pro features. */}
            {planInfo && planInfo.trialExpired && perms.can.createProject && (
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-5">
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">⏰</div>
                  <div className="flex-1">
                    <div className="font-bold text-red-900 text-sm mb-1">
                      Your 15-day free trial has ended
                    </div>
                    <div className="text-xs text-red-800 mb-3 leading-relaxed">
                      You can still view your existing projects and upload new versions, but creating new projects, Time Impact Analysis, Trend, and EVM are locked. Upgrade to keep building.
                    </div>
                    <a
                      href={`mailto:sales@control-lens.com?subject=Upgrade%20after%20trial%20-%20activate%20ControlLens%20Pro&body=Hi%2C%20our%2015-day%20trial%20has%20ended%20and%20we%27d%20like%20to%20activate%20ControlLens%20Pro.%0A%0AOrg%20ID%3A%20${planInfo.orgId}%0A%0AThanks.`}
                      className="inline-block bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                      📧 Email sales to activate Pro →
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Phase A.2 — Trial countdown banner (amber, last 7 days only).
                Quiet during week one; urgent during week two. Never shown
                to lifetime/active/canceled orgs. */}
            {planInfo
              && !planInfo.trialExpired
              && planInfo.subscriptionStatus === 'trial'
              && planInfo.daysLeftInTrial !== null
              && planInfo.daysLeftInTrial <= 7
              && planInfo.daysLeftInTrial > 0
              && perms.can.createProject && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-5">
                <div className="flex items-center gap-3">
                  <div className="text-xl flex-shrink-0">⏳</div>
                  <div className="flex-1 text-xs text-amber-900">
                    <span className="font-bold">
                      {planInfo.daysLeftInTrial} day{planInfo.daysLeftInTrial === 1 ? '' : 's'} left in your free trial.
                    </span>
                    {' '}Upgrade to ControlLens Pro to keep new projects, TIA, Trend, and EVM after day 16.
                  </div>
                  <a
                    href={`mailto:sales@control-lens.com?subject=Upgrade%20to%20ControlLens%20Pro&body=Hi%2C%20we%27d%20like%20to%20upgrade%20to%20ControlLens%20Pro%20before%20our%20trial%20ends.%0A%0AOrg%20ID%3A%20${planInfo.orgId}%0ADays%20left%3A%20${planInfo.daysLeftInTrial}%0A%0AThanks.`}
                    className="flex-shrink-0 inline-block bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors">
                    Upgrade →
                  </a>
                </div>
              </div>
            )}

            {/* Phase A.1 — Project limit banner.
                Shown when org has hit its plan limit. Owners/Admins see an
                upgrade prompt; "+ New Project" becomes disabled. */}
            {planInfo && planInfo.atLimit && perms.can.createProject && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-5">
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">🔒</div>
                  <div className="flex-1">
                    <div className="font-bold text-amber-900 text-sm mb-1">
                      You've reached your project limit ({planInfo.currentCount} / {planInfo.projectLimit})
                    </div>
                    <div className="text-xs text-amber-800 mb-3 leading-relaxed">
                      Your Pro plan covers up to {planInfo.projectLimit} active projects. You can keep uploading new versions to existing projects, but creating a new project is locked until you upgrade.
                    </div>
                    <a
                      href={`mailto:sales@control-lens.com?subject=Upgrade%20request%20-%20more%20than%20${planInfo.projectLimit}%20projects&body=Hi%2C%20we%27ve%20reached%20our%20${planInfo.projectLimit}-project%20limit%20on%20ControlLens%20Pro.%20Please%20upgrade%20us%20to%20a%20higher%20tier.%0A%0AOrg%20ID%3A%20${planInfo.orgId}%0ACurrent%20projects%3A%20${planInfo.currentCount}%0A%0AThanks.`}
                      className="inline-block bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
                      📧 Email sales to upgrade →
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Project assignment */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-3">Assign this schedule to:</div>
              <div className={perms.can.createProject ? 'grid grid-cols-2 gap-3 mb-3' : 'mb-3'}>
                {/* Day 10 — "Create new project" is Owner/Admin only.
                    PMs upload to existing assigned projects, full stop.
                    Hiding the button (rather than disabling) makes the UX
                    cleaner — no temptation, no "why can't I click this?". */}
                {perms.can.createProject && (
                  <button
                    type="button"
                    onClick={() => { if (!(planInfo?.atLimit || planInfo?.trialExpired)) setProjectMode('new') }}
                    disabled={planInfo?.atLimit || planInfo?.trialExpired}
                    title={
                      planInfo?.trialExpired
                        ? 'Your free trial has ended. Upgrade to create new projects.'
                        : planInfo?.atLimit
                          ? 'You\'ve reached your project limit. Upgrade to add more.'
                          : undefined
                    }
                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                      (planInfo?.atLimit || planInfo?.trialExpired)
                        ? 'opacity-40 cursor-not-allowed border-slate-200 bg-slate-50'
                        : projectMode === 'new'
                          ? 'border-blue-500 bg-white'
                          : 'border-slate-200 bg-white/50 hover:border-blue-300'
                    }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-4 h-4 rounded-full border-2 ${projectMode === 'new' && !planInfo?.atLimit && !planInfo?.trialExpired ? 'border-blue-500' : 'border-slate-300'} flex items-center justify-center`}>
                        {projectMode === 'new' && !planInfo?.atLimit && !planInfo?.trialExpired && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                      </div>
                      <span className="font-bold text-xs text-slate-900">
                        {(planInfo?.atLimit || planInfo?.trialExpired) ? '🔒 Create new project' : 'Create new project'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 ml-6">
                      {planInfo?.trialExpired
                        ? 'Trial ended — upgrade to create new projects'
                        : planInfo?.atLimit
                          ? 'Plan limit reached — upgrade to add more'
                          : "First upload starts the project's baseline"}
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setProjectMode('existing')}
                  disabled={existingProjects.length === 0}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${projectMode === 'existing' ? 'border-blue-500 bg-white' : 'border-slate-200 bg-white/50 hover:border-blue-300'} ${existingProjects.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 ${projectMode === 'existing' ? 'border-blue-500' : 'border-slate-300'} flex items-center justify-center`}>
                      {projectMode === 'existing' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                    </div>
                    <span className="font-bold text-xs text-slate-900">
                      {perms.can.createProject ? 'Update existing project' : 'Add version to your project'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 ml-6">
                    {existingProjects.length === 0
                      ? (perms.can.createProject ? 'No projects yet' : 'No projects assigned — ask your admin')
                      : `Add as new version to one of your ${existingProjects.length} project${existingProjects.length > 1 ? 's' : ''}`}
                  </div>
                </button>
              </div>
              {!perms.can.createProject && (
                <div className="bg-white border border-blue-200 rounded-lg p-2.5 mb-3 text-[11px] text-blue-900">
                  <strong>🔒 PM access:</strong> You upload versions to projects your Admin has assigned to you. To create a new project, ask an Admin or Owner.
                </div>
              )}
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
                        {p.projectId ? `${p.projectId} · ` : ''}{p.name} · {p.versions.length} version{p.versions.length > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {projectMode === 'new' && (
                <div>
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                    Project ID <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={newProjectId}
                    onChange={e => updateProjectId(e.target.value)}
                    placeholder="e.g. CONTRACT-001 or PROJ-2024"
                    maxLength={20}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none bg-white font-mono uppercase
                      ${projectIdError ? 'border-red-400 focus:border-red-500' : 'border-blue-200 focus:border-blue-500'}`}
                  />
                  {projectIdError ? (
                    <div className="text-[10px] text-red-600 mt-1 font-semibold">⚠ {projectIdError}</div>
                  ) : (
                    <div className="text-[10px] text-slate-500 mt-1">
                      Letters, numbers, hyphens · 3-20 chars · LOCKED once set
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* v14 — SCHEDULE TYPE picker. No default selection — PM must pick. */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
              <div className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-3">
                Schedule Type <span className="text-red-600">*</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
                {renderTypeButton('baseline', '📍', 'Baseline')}
                {renderTypeButton('rebaseline', '🔄', 'Rebaseline')}
                {renderTypeButton('update', '📈', 'Update')}
                {renderTypeButton('fragnet', '⚠️', 'Fragnet')}
              </div>
              {labelPreview ? (
                <div className="bg-white border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Will save as:</span>
                  <code className="text-sm font-mono font-bold text-slate-900 tracking-tight">{labelPreview}</code>
                </div>
              ) : (
                <div className="text-[10px] text-amber-700 italic px-1">
                  {!scheduleType
                    ? 'Pick a schedule type to see the auto-generated version label →'
                    : projectMode === 'new'
                      ? 'Enter Project ID and NTP date below to see the version label →'
                      : 'Pick a project above to see the version label →'}
                </div>
              )}
            </div>

            {/* Project info — generic placeholders (Azizi/USACE removed in v14) */}
            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Project Name {projectMode === 'new' && <span className="text-red-600">*</span>}
                </label>
                <input
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  placeholder={projectMode === 'new' ? 'Full project name (locked once set)' : 'Project name'}
                  value={ctx.projectName}
                  onChange={e => setCtx({...ctx, projectName: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Owner / Client</label>
                  <input className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Client / owner name"
                    value={ctx.owner}
                    onChange={e => setCtx({...ctx, owner: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">General Contractor</label>
                  <input className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    placeholder="GC company name"
                    value={ctx.gc}
                    onChange={e => setCtx({...ctx, gc: e.target.value})} />
                </div>
              </div>
            </div>

            {/* CONTRACT DATES */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold text-blue-900 uppercase tracking-wider">📅 Contract Dates</div>
                {selectedProjectHasContractDates && (
                  <span className="text-[10px] font-semibold text-blue-700 bg-white border border-blue-200 px-2 py-0.5 rounded-full">
                    Auto-filled from project
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                    NTP / Contract Start <span className="text-red-600">*</span>
                  </label>
                  <input type="date"
                    value={cd.ntp}
                    onChange={e => { setCd(c => ({...c, ntp: e.target.value})); setDateError('') }}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                    Original Contract Completion <span className="text-red-600">*</span>
                  </label>
                  <input type="date"
                    value={cd.originalContractCompletion}
                    onChange={e => updateOriginal(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                    Time Extension (days)
                  </label>
                  <input type="number" min="0" step="1"
                    value={cd.timeExtensionDays}
                    onChange={e => updateTimeExt(e.target.value)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white" />
                  <div className="text-[10px] text-slate-500 mt-1">0 if no time extension granted</div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                    Revised Contract Completion
                  </label>
                  <input type="date"
                    value={cd.revisedContractCompletion}
                    onChange={e => setCd(c => ({...c, revisedContractCompletion: e.target.value}))}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white font-semibold" />
                  <div className="text-[10px] text-slate-500 mt-1">
                    Auto = Original + {cd.timeExtensionDays || 0} days. Override if needed.
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                    Substantial Completion (optional)
                  </label>
                  <input type="date"
                    value={cd.substantialCompletion}
                    onChange={e => setCd(c => ({...c, substantialCompletion: e.target.value}))}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white" />
                  <div className="text-[10px] text-slate-500 mt-1">Per contract. Dashboard shows this next to the XER-detected one.</div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                    Data Date for this Version (optional)
                  </label>
                  <input type="date"
                    value={cd.manualDataDate}
                    onChange={e => setCd(c => ({...c, manualDataDate: e.target.value}))}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white" />
                  <div className="text-[10px] text-slate-500 mt-1">Leave blank — the XER's data date will be used.</div>
                </div>
              </div>
              {dateError && (
                <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold">
                  ⚠ {dateError}
                </div>
              )}
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
