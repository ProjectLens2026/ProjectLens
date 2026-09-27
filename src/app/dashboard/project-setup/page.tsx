'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ContractMilestone,
  ContractDates,
  P6SettingsBasis,
  Project,
  ProjectControlBasis,
  ProjectPhaseBasis,
  ProjectSourceDocument,
  ScheduleRequirementsBasis,
  TimeModificationBasis,
  addCalendarDays,
  getActiveProject,
  subscribeToProjects,
  updateProjectContractDates,
  updateProjectControlBasis,
  whenHydrated,
} from '@/lib/projectStore'
import {
  deleteProjectSourceDocumentFile,
  getProjectSourceDocumentSignedUrl,
  uploadProjectSourceDocument,
} from '@/lib/supabase/db'

type BasisSection =
  | 'contract-dates'
  | 'milestones'
  | 'requirements'
  | 'p6-settings'
  | 'modifications'
  | 'documents'

const BASIS_SECTIONS: Array<{ id: BasisSection; label: string; implemented: boolean }> = [
  { id: 'contract-dates', label: 'Contract dates', implemented: true },
  { id: 'milestones', label: 'Milestones & phases', implemented: true },
  { id: 'requirements', label: 'Schedule requirements', implemented: true },
  { id: 'p6-settings', label: 'P6 settings', implemented: true },
  { id: 'modifications', label: 'Time modifications', implemented: true },
  { id: 'documents', label: 'Source documents', implemented: true },
]

const EMPTY_REQUIREMENTS: ScheduleRequirementsBasis = {
  profile: 'NOT_SET',
  deliveryMethod: 'NOT_SET',
  schedulingSoftware: 'NOT_SET',
  updateFrequency: 'NOT_SET',
  preliminaryScheduleRequired: false,
  initialScheduleRequired: false,
  periodicUpdatesRequired: false,
  recoveryScheduleRequired: false,
  timeImpactAnalysisRequired: false,
  costLoadedRequired: false,
  resourceLoadedRequired: false,
  sdefRequired: false,
  narrativeRequired: false,
}

const UFGS_REQUIREMENTS: ScheduleRequirementsBasis = {
  ...EMPTY_REQUIREMENTS,
  profile: 'UFGS_01_32_01_00_10',
  specificationSection: '01 32 01.00 10',
  specificationEdition: '08/2026',
  schedulingSoftware: 'PRIMAVERA_P6',
  updateFrequency: 'MONTHLY',
  preliminaryScheduleRequired: true,
  initialScheduleRequired: true,
  periodicUpdatesRequired: true,
  recoveryScheduleRequired: true,
  timeImpactAnalysisRequired: true,
  costLoadedRequired: true,
  resourceLoadedRequired: true,
  sdefRequired: true,
  narrativeRequired: true,
  maxActivityDurationDays: 20,
  longLeadThresholdDays: 90,
}

const EMPTY_P6_SETTINGS: P6SettingsBasis = {
  profile: 'NOT_SET',
  activityCodesProjectLevel: false,
  calendarsProjectLevel: false,
  durationType: 'NOT_SET',
  percentCompleteType: 'NOT_SET',
  criticalActivities: 'NOT_SET',
  progressedActivities: 'NOT_SET',
  negativeLagsAllowed: false,
  startToFinishAllowed: false,
  verbNounActivityNames: false,
  commonCalendarEndTime: false,
}

const UFGS_P6_SETTINGS: P6SettingsBasis = {
  profile: 'UFGS_2026',
  activityCodesProjectLevel: true,
  calendarsProjectLevel: true,
  durationType: 'FIXED_DURATION_AND_UNITS',
  percentCompleteType: 'PHYSICAL',
  hoursPerDay: 8,
  hoursPerWeek: 40,
  hoursPerMonth: 172,
  hoursPerYear: 2000,
  criticalActivities: 'LONGEST_PATH',
  progressedActivities: 'RETAINED_LOGIC',
  negativeLagsAllowed: false,
  startToFinishAllowed: false,
  maxActivityIdLength: 10,
  verbNounActivityNames: true,
  commonCalendarEndTime: true,
}

function formatDate(value?: string) {
  if (!value) return 'Not recorded'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

function formatFileSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function validateDates(dates: ContractDates): string | null {
  const ntp = dates.ntp || ''
  const substantial = dates.substantialCompletion || ''
  const finalCompletion = dates.originalContractCompletion || ''
  if (ntp && substantial && ntp >= substantial) return 'Original Substantial Completion must be after Notice to Proceed.'
  if (ntp && finalCompletion && ntp >= finalCompletion) return 'Original Final Completion must be after Notice to Proceed.'
  if (substantial && finalCompletion && substantial > finalCompletion) return 'Original Final Completion cannot be before Original Substantial Completion.'
  return null
}

function requirementsComplete(value: ScheduleRequirementsBasis) {
  return value.profile !== 'NOT_SET'
    && value.schedulingSoftware !== 'NOT_SET'
    && value.updateFrequency !== 'NOT_SET'
}

function p6SettingsComplete(value: P6SettingsBasis) {
  return value.profile !== 'NOT_SET'
    && value.durationType !== 'NOT_SET'
    && value.percentCompleteType !== 'NOT_SET'
    && value.criticalActivities !== 'NOT_SET'
    && value.progressedActivities !== 'NOT_SET'
}

function newBasisId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function calculateAuthorizedPosition(
  dates: ContractDates,
  modifications: TimeModificationBasis[],
) {
  let substantialDays = 0
  let finalDays = 0
  let currentSubstantialCompletion = dates.substantialCompletion
  let currentFinalCompletion = dates.originalContractCompletion
  const interimDates = new Map<string, string>()

  const chronological = [...modifications].sort((a, b) =>
    String(a.approvalDate || a.submittedDate || '').localeCompare(String(b.approvalDate || b.submittedDate || ''))
  )
  for (const modification of chronological) {
    if (modification.status !== 'APPROVED') continue
    const approvedDays = modification.approvedDays || 0
    if (modification.target === 'SUBSTANTIAL_COMPLETION' || modification.target === 'BOTH') {
      substantialDays += approvedDays
      currentSubstantialCompletion = modification.target === 'SUBSTANTIAL_COMPLETION' && modification.approvedRevisedDate
        ? modification.approvedRevisedDate
        : addCalendarDays(currentSubstantialCompletion, approvedDays) || currentSubstantialCompletion
    }
    if (modification.target === 'FINAL_COMPLETION' || modification.target === 'BOTH') {
      finalDays += approvedDays
      currentFinalCompletion = modification.target === 'FINAL_COMPLETION' && modification.approvedRevisedDate
        ? modification.approvedRevisedDate
        : addCalendarDays(currentFinalCompletion, approvedDays) || currentFinalCompletion
    }
    if (modification.target === 'INTERIM_MILESTONE' && modification.milestoneId) {
      const original = dates.contractMilestones?.find(item => item.id === modification.milestoneId)?.date
      const current = interimDates.get(modification.milestoneId) || original
      const revised = modification.approvedRevisedDate || addCalendarDays(current, approvedDays)
      if (revised) interimDates.set(modification.milestoneId, revised)
    }
  }

  const contractMilestones = (dates.contractMilestones || []).map(milestone => ({
    ...milestone,
    currentDate: interimDates.get(milestone.id) || milestone.date,
  }))

  return {
    substantialDays,
    finalDays,
    currentSubstantialCompletion,
    currentFinalCompletion,
    contractMilestones,
  }
}

export default function ProjectControlBasisPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [section, setSection] = useState<BasisSection>('contract-dates')
  const [dates, setDates] = useState<ContractDates>({})
  const [basis, setBasis] = useState<ProjectControlBasis>({})
  const [milestones, setMilestones] = useState<ContractMilestone[]>([])
  const [phasingStrategy, setPhasingStrategy] = useState<ProjectControlBasis['phasingStrategy']>('NOT_SET')
  const [phases, setPhases] = useState<ProjectPhaseBasis[]>([])
  const [timeModifications, setTimeModifications] = useState<TimeModificationBasis[]>([])
  const [sourceDocuments, setSourceDocuments] = useState<ProjectSourceDocument[]>([])
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null)
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null)
  const [requirements, setRequirements] = useState<ScheduleRequirementsBasis>({ ...EMPTY_REQUIREMENTS })
  const [p6Settings, setP6Settings] = useState<P6SettingsBasis>({ ...EMPTY_P6_SETTINGS })
  const [error, setError] = useState('')
  const [savedSection, setSavedSection] = useState<BasisSection | null>(null)

  useEffect(() => {
    let mounted = true
    function syncProject() {
      if (!mounted) return
      const active = getActiveProject()
      setProject(active)
      setDates({
        ntp: active?.contractDates?.ntp || '',
        substantialCompletion: active?.contractDates?.substantialCompletion || '',
        originalContractCompletion: active?.contractDates?.originalContractCompletion || '',
        contractMilestones: active?.contractDates?.contractMilestones || [],
        approvedTimeExtensionDays: active?.contractDates?.approvedTimeExtensionDays,
        currentSubstantialCompletion: active?.contractDates?.currentSubstantialCompletion,
        currentFinalCompletion: active?.contractDates?.currentFinalCompletion,
      })
      setBasis(active?.controlBasis || {})
      setMilestones(active?.contractDates?.contractMilestones || [])
      setPhasingStrategy(active?.controlBasis?.phasingStrategy || 'NOT_SET')
      setPhases(active?.controlBasis?.projectPhases || [])
      setTimeModifications(active?.controlBasis?.timeModifications || [])
      setSourceDocuments(active?.controlBasis?.sourceDocuments || [])
      setRequirements({ ...EMPTY_REQUIREMENTS, ...(active?.controlBasis?.scheduleRequirements || {}) })
      setP6Settings({ ...EMPTY_P6_SETTINGS, ...(active?.controlBasis?.p6Settings || {}) })
    }
    whenHydrated().then(syncProject)
    const unsubscribe = subscribeToProjects(syncProject)
    return () => { mounted = false; unsubscribe() }
  }, [])

  const datesComplete = Boolean(dates.ntp && dates.originalContractCompletion)
  const requirementsAreComplete = requirementsComplete(requirements)
  const milestonesAreComplete = Boolean(basis.milestonesConfigured)
  const timeModificationsAreComplete = Boolean(basis.timeModificationsConfigured)
  const sourceDocumentsAreComplete = Boolean(basis.sourceDocumentsConfigured)
  const p6IsApplicable = requirements.schedulingSoftware === 'PRIMAVERA_P6' || requirements.schedulingSoftware === 'EITHER'
  const p6IsComplete = !p6IsApplicable || p6SettingsComplete(p6Settings)
  const authorizedPreview = useMemo(
    () => calculateAuthorizedPosition(dates, timeModifications),
    [dates, timeModifications],
  )
  const pendingModificationCount = timeModifications.filter(item => item.status === 'PENDING' || item.status === 'UNDER_REVIEW').length
  const pendingRequestedDays = timeModifications
    .filter(item => item.status === 'PENDING' || item.status === 'UNDER_REVIEW')
    .reduce((total, item) => total + (item.requestedDays || 0), 0)
  const currentSourceCount = sourceDocuments.filter(item => item.status === 'CURRENT').length
  const authoritativeSourceCount = sourceDocuments.filter(item => item.authority === 'CONTRACTUAL' || item.authority === 'GOVERNING_REQUIREMENT').length
  const completeSections = useMemo(() => (
    [datesComplete, milestonesAreComplete, requirementsAreComplete, p6IsComplete && requirementsAreComplete, timeModificationsAreComplete, sourceDocumentsAreComplete].filter(Boolean).length
  ), [datesComplete, milestonesAreComplete, requirementsAreComplete, p6IsComplete, timeModificationsAreComplete, sourceDocumentsAreComplete])
  const completionPercent = Math.round((completeSections / 6) * 100)

  function clearMessages() {
    setError('')
    setSavedSection(null)
  }

  function saveContractDates() {
    if (!project) return
    const validationError = validateDates(dates)
    if (validationError) { setError(validationError); return }
    const authorized = calculateAuthorizedPosition(dates, timeModifications)
    updateProjectContractDates(project.id, {
      ntp: dates.ntp || '',
      substantialCompletion: dates.substantialCompletion || '',
      originalContractCompletion: dates.originalContractCompletion || '',
      approvedTimeExtensionDays: authorized.finalDays,
      currentSubstantialCompletion: authorized.currentSubstantialCompletion,
      currentFinalCompletion: authorized.currentFinalCompletion,
      contractMilestones: authorized.contractMilestones,
    })
    setSavedSection('contract-dates')
    setError('')
  }

  function saveMilestonesAndPhases() {
    if (!project) return
    if (!phasingStrategy || phasingStrategy === 'NOT_SET') {
      setError('Select whether the project is single-phase or multi-phase before saving.')
      return
    }
    if (phasingStrategy === 'MULTI_PHASE' && (phases.length === 0 || phases.some(phase => !phase.name.trim()))) {
      setError('A multi-phase project must include at least one named phase.')
      return
    }
    if (milestones.some(milestone => !milestone.name.trim() || !milestone.date || !milestone.sourceReference?.trim())) {
      setError('Every additional contractual milestone must have a name, required date, and authorized source reference.')
      return
    }
    const normalizedPhases = phases
      .map((phase, index) => ({ ...phase, name: phase.name.trim(), sequence: index + 1 }))
      .filter(phase => phase.name)
    const normalizedMilestones = milestones.map(milestone => ({
      ...milestone,
      name: milestone.name.trim(),
      phaseOrArea: milestone.phaseOrArea?.trim(),
      sourceReference: milestone.sourceReference?.trim(),
    }))
    const missingTarget = timeModifications.find(item =>
      item.target === 'INTERIM_MILESTONE'
      && item.milestoneId
      && !normalizedMilestones.some(milestone => milestone.id === item.milestoneId)
    )
    if (missingTarget) {
      setError(`Cannot remove the milestone referenced by ${missingTarget.referenceNumber || 'a time modification'}. Update the Time Modifications register first.`)
      return
    }
    const authorized = calculateAuthorizedPosition(
      { ...dates, contractMilestones: normalizedMilestones },
      timeModifications,
    )

    updateProjectContractDates(project.id, {
      contractMilestones: authorized.contractMilestones,
      approvedTimeExtensionDays: authorized.finalDays,
      currentSubstantialCompletion: authorized.currentSubstantialCompletion,
      currentFinalCompletion: authorized.currentFinalCompletion,
    })
    updateProjectControlBasis(project.id, {
      phasingStrategy,
      projectPhases: phasingStrategy === 'MULTI_PHASE' ? normalizedPhases : [],
      milestonesConfigured: true,
    })
    setSavedSection('milestones')
    setError('')
  }

  function applyRequirementsProfile(profile: ScheduleRequirementsBasis['profile']) {
    clearMessages()
    if (profile === 'UFGS_01_32_01_00_10') {
      setRequirements({ ...UFGS_REQUIREMENTS })
      setBasis(current => ({ ...current, governingStandard: 'UFGS 01 32 01.00 10' }))
      return
    }
    setRequirements(current => ({ ...current, profile }))
    if (profile === 'OWNER_DATA_CENTER') {
      setBasis(current => ({ ...current, governingStandard: 'Owner / data center schedule requirements' }))
    }
  }

  function saveRequirements() {
    if (!project) return
    if (!requirementsComplete(requirements)) {
      setError('Select a requirements profile, scheduling software, and update frequency before saving.')
      return
    }
    updateProjectControlBasis(project.id, {
      contractor: basis.contractor?.trim(),
      governingStandard: basis.governingStandard?.trim(),
      scheduleRequirements: requirements,
    })
    setSavedSection('requirements')
    setError('')
  }

  function saveP6Settings() {
    if (!project) return
    if (p6IsApplicable && !p6SettingsComplete(p6Settings)) {
      setError('Complete the required P6 calculation settings before saving.')
      return
    }
    updateProjectControlBasis(project.id, { p6Settings })
    setSavedSection('p6-settings')
    setError('')
  }

  function saveTimeModifications() {
    if (!project) return
    if (timeModifications.some(item => !item.referenceNumber.trim() || !item.title.trim())) {
      setError('Every time modification must have a reference number and title.')
      return
    }
    const approvedItems = timeModifications.filter(item => item.status === 'APPROVED')
    if (approvedItems.some(item => !item.approvalDate || !item.sourceReference?.trim())) {
      setError('Every approved modification must have an approval date and authorized source reference.')
      return
    }
    if (approvedItems.some(item => item.target === 'INTERIM_MILESTONE' && !item.milestoneId)) {
      setError('Select the affected interim milestone for each approved interim-milestone modification.')
      return
    }
    const normalized = timeModifications.map(item => ({
      ...item,
      referenceNumber: item.referenceNumber.trim(),
      title: item.title.trim(),
      sourceReference: item.sourceReference?.trim(),
      notes: item.notes?.trim(),
    }))
    const authorized = calculateAuthorizedPosition(dates, normalized)
    if (authorized.currentSubstantialCompletion && authorized.currentFinalCompletion
      && authorized.currentSubstantialCompletion > authorized.currentFinalCompletion) {
      setError('The resulting authorized Final Completion cannot be before authorized Substantial Completion.')
      return
    }

    updateProjectContractDates(project.id, {
      approvedTimeExtensionDays: authorized.finalDays,
      currentSubstantialCompletion: authorized.currentSubstantialCompletion,
      currentFinalCompletion: authorized.currentFinalCompletion,
      contractMilestones: authorized.contractMilestones,
    })
    updateProjectControlBasis(project.id, {
      timeModifications: normalized,
      timeModificationsConfigured: true,
    })
    setSavedSection('modifications')
    setError('')
  }

  function saveSourceDocuments() {
    if (!project) return
    if (sourceDocuments.length === 0) {
      setError('Add at least one authoritative or supporting source document before completing this section.')
      return
    }
    if (sourceDocuments.some(item => !item.title.trim())) {
      setError('Every source-document record must have a title.')
      return
    }
    if (sourceDocuments.some(item => !item.storagePath && !item.externalUrl?.trim())) {
      setError('Every source-document record must include an uploaded file or controlled external link.')
      return
    }
    if (sourceDocuments.some(item => item.appliesTo.length === 0)) {
      setError('Every source-document record must identify at least one project-basis section it supports.')
      return
    }
    if (sourceDocuments.some(item =>
      (item.authority === 'CONTRACTUAL' || item.authority === 'GOVERNING_REQUIREMENT') && !item.issueDate
    )) {
      setError('Contractual and governing documents must include an issue date.')
      return
    }
    for (const item of sourceDocuments) {
      if (!item.externalUrl?.trim()) continue
      try {
        const url = new URL(item.externalUrl)
        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid protocol')
      } catch {
        setError(`Enter a valid http(s) link for “${item.title || 'source document'}”.`)
        return
      }
    }
    const normalized = sourceDocuments.map(item => ({
      ...item,
      title: item.title.trim(),
      referenceNumber: item.referenceNumber?.trim(),
      revision: item.revision?.trim(),
      externalUrl: item.externalUrl?.trim(),
      notes: item.notes?.trim(),
    }))
    updateProjectControlBasis(project.id, {
      sourceDocuments: normalized,
      sourceDocumentsConfigured: true,
    })
    setSavedSection('documents')
    setError('')
  }

  async function handleSourceDocumentUpload(documentId: string, file: File) {
    if (!project) return
    const allowedExtensions = /\.(pdf|doc|docx|xls|xlsx|csv|txt|png|jpg|jpeg)$/i
    if (!allowedExtensions.test(file.name)) {
      setError('Use PDF, Word, Excel, CSV, text, PNG, or JPEG source documents.')
      return
    }
    setUploadingDocumentId(documentId)
    setError('')
    const result = await uploadProjectSourceDocument(project.id, documentId, file)
    setUploadingDocumentId(null)
    if (!result.ok || !result.path) {
      setError(result.error || 'The source document could not be uploaded.')
      return
    }
    const previousPath = sourceDocuments.find(item => item.id === documentId)?.storagePath
    setSourceDocuments(current => current.map(item => item.id === documentId ? {
      ...item,
      fileName: file.name,
      storagePath: result.path,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
    } : item))
    if (previousPath && previousPath !== result.path) {
      await deleteProjectSourceDocumentFile(previousPath)
    }
    setSavedSection(null)
  }

  async function openSourceDocument(document: ProjectSourceDocument) {
    if (document.externalUrl && !document.storagePath) {
      window.open(document.externalUrl, '_blank', 'noopener,noreferrer')
      return
    }
    if (!document.storagePath) return
    setOpeningDocumentId(document.id)
    const result = await getProjectSourceDocumentSignedUrl(document.storagePath)
    setOpeningDocumentId(null)
    if (!result.ok || !result.signedUrl) {
      setError(result.error || 'The source document could not be opened.')
      return
    }
    window.open(result.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function removeDraftSourceDocument(document: ProjectSourceDocument) {
    if (document.status !== 'DRAFT') return
    if (!window.confirm('Remove this draft source-document record?')) return
    if (document.storagePath) {
      const removed = await deleteProjectSourceDocumentFile(document.storagePath)
      if (!removed) {
        setError('The draft file could not be removed from storage.')
        return
      }
    }
    setSourceDocuments(current => current.filter(item => item.id !== document.id))
    setSavedSection(null)
  }

  function sectionIsComplete(id: BasisSection) {
    if (id === 'contract-dates') return datesComplete
    if (id === 'milestones') return milestonesAreComplete
    if (id === 'requirements') return requirementsAreComplete
    if (id === 'p6-settings') return requirementsAreComplete && p6IsComplete
    if (id === 'modifications') return timeModificationsAreComplete
    if (id === 'documents') return sourceDocumentsAreComplete
    return false
  }

  if (!project) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Select a project first</h1>
          <p className="mt-2 text-sm text-slate-500">Project Setup belongs to a project and remains separate from an individual schedule review.</p>
          <Link href="/dashboard/projects" className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Go to Projects</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="text-xs font-bold tracking-wide text-slate-900">
            PROJECT SETUP <span className="ml-2 font-medium text-blue-600">· {project.name}</span>
          </div>
          <div className="text-xs text-slate-500">Project-level control basis</div>
        </div>

        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Project Control Basis</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              The contractual source of truth used for every baseline approval, update, comparison, recovery review and time impact analysis.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset ${completeSections === 6 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>
            {completeSections === 6 ? 'Basis complete' : 'Basis setup in progress'}
          </span>
        </div>

        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <SummaryItem label="Project number" value={project.projectId || 'Not recorded'} />
            <SummaryItem label="Owner" value={project.owner || 'Not recorded'} />
            <SummaryItem label="Contractor" value={basis.contractor || 'Not recorded'} muted={!basis.contractor} />
            <SummaryItem label="Governing standard" value={basis.governingStandard || 'Not recorded'} muted={!basis.governingStandard} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold leading-5 text-slate-900">Basis completeness</span>
              <span className="text-right text-xs font-bold leading-5 text-emerald-700">{completeSections} of 6<br />sections</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-600 transition-all" style={{ width: `${completionPercent}%` }} />
            </div>
            <p className="mt-3 text-[11px] leading-4 text-slate-500">Contract requirements are entered once and applied to every schedule version.</p>
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[205px_1fr]">
          <nav className="space-y-1" aria-label="Project Setup sections">
            {BASIS_SECTIONS.map(item => {
              const active = section === item.id
              const complete = sectionIsComplete(item.id)
              return (
                <button key={item.id} type="button" onClick={() => { setSection(item.id); clearMessages() }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm transition-colors ${active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
                  <span>{item.label}</span>
                  <span className={`text-[10px] font-bold ${complete ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {complete ? '✓' : item.implemented ? 'SET UP' : 'NEXT'}
                  </span>
                </button>
              )
            })}
          </nav>

          {section === 'contract-dates' && (
            <BasisCard title="Contract dates" description="Original dates are preserved. Only approved modifications change the current contractual dates." action="Save contract dates" onAction={saveContractDates}>
              <Notice>Pending requests and contractor forecasts do not replace the current contractual completion date.</Notice>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <ReadOnlyField label="Contract award" value="Not yet captured" source="Source field coming next" />
                <DateField label="Notice to Proceed" value={dates.ntp || ''} onChange={value => { setDates(current => ({ ...current, ntp: value })); clearMessages() }} source="Project basis" />
                <DateField label="Original substantial completion" value={dates.substantialCompletion || ''} onChange={value => { setDates(current => ({ ...current, substantialCompletion: value })); clearMessages() }} source="Project basis" />
                <DateField label="Original final completion" value={dates.originalContractCompletion || ''} onChange={value => { setDates(current => ({ ...current, originalContractCompletion: value })); clearMessages() }} source="Project basis" />
              </div>
              <SaveMessage error={error} saved={savedSection === 'contract-dates'} label="Contract dates saved to the project basis." />
              <div className="my-6 border-t border-slate-200" />
              <h3 className="text-sm font-bold text-slate-950">Authorized completion position</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">Until approved time modifications are recorded, the original contract dates remain the working contractual position.</p>
              <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <PositionCard label="Original substantial completion" value={formatDate(dates.substantialCompletion)} note="Original contract" />
                <div className="flex items-center justify-center px-2 text-lg text-slate-400">→</div>
                <PositionCard
                  label="Current contractual substantial completion"
                  value={formatDate(dates.currentSubstantialCompletion || dates.substantialCompletion)}
                  note={dates.currentSubstantialCompletion && dates.currentSubstantialCompletion !== dates.substantialCompletion ? 'Approved modification incorporated' : 'No approved modification recorded'}
                  current
                />
              </div>
            </BasisCard>
          )}

          {section === 'milestones' && (
            <BasisCard
              title="Milestones & phases"
              description="Define contractual gates and turnover structure before comparing them with submitted schedule milestones."
              action="Save milestones & phases"
              onAction={saveMilestonesAndPhases}
            >
              <Notice>
                Dates found in an XER or XML are schedule evidence. They do not become contractual milestones unless they are recorded here from an authorized source.
              </Notice>

              <h3 className="mb-3 mt-6 text-sm font-bold text-slate-950">Core contract anchors</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <AnchorCard label="Notice to Proceed" value={formatDate(dates.ntp)} />
                <AnchorCard label="Substantial Completion" value={formatDate(dates.substantialCompletion)} />
                <AnchorCard label="Final Completion" value={formatDate(dates.originalContractCompletion)} />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Edit these fixed anchors under Contract dates. Do not duplicate them below.</p>

              <div className="my-6 border-t border-slate-200" />

              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">Project phasing</h3>
                  <p className="mt-1 text-xs text-slate-500">Use multi-phase only when the contract recognizes separate areas, turnovers, or completion obligations.</p>
                </div>
                <div className="w-full sm:w-72">
                  <SelectField
                    label="Phasing strategy"
                    value={phasingStrategy || 'NOT_SET'}
                    onChange={value => {
                      setPhasingStrategy(value as ProjectControlBasis['phasingStrategy'])
                      clearMessages()
                    }}
                    options={[
                      ['NOT_SET', 'Select phasing strategy'],
                      ['SINGLE_PHASE', 'Single-phase project'],
                      ['MULTI_PHASE', 'Multi-phase / phased turnover'],
                    ]}
                  />
                </div>
              </div>

              {phasingStrategy === 'MULTI_PHASE' && (
                <div className="mt-4 space-y-3">
                  {phases.map((phase, index) => (
                    <div key={phase.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[52px_1fr_1.4fr_auto] sm:items-end">
                      <div>
                        <FieldLabel label="Order" />
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center text-sm font-bold text-slate-700">{index + 1}</div>
                      </div>
                      <TextField
                        label="Phase / turnover name"
                        value={phase.name}
                        placeholder="Example: Building A turnover"
                        onChange={value => setPhases(current => current.map(item => item.id === phase.id ? { ...item, name: value } : item))}
                      />
                      <TextField
                        label="Scope / description"
                        value={phase.description || ''}
                        placeholder="Area, system, or contractual scope"
                        onChange={value => setPhases(current => current.map(item => item.id === phase.id ? { ...item, description: value } : item))}
                      />
                      <button type="button" onClick={() => setPhases(current => current.filter(item => item.id !== phase.id))} className="rounded-lg border border-red-200 bg-white px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50">Remove</button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPhases(current => [...current, { id: newBasisId('phase'), name: '', sequence: current.length + 1 }])}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                  >+ Add project phase</button>
                </div>
              )}

              <div className="my-6 border-t border-slate-200" />

              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">Additional contractual milestones</h3>
                  <p className="mt-1 text-xs text-slate-500">Record only milestones supported by the contract, modification, directive, or other authorized source.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMilestones(current => [...current, {
                    id: newBasisId('milestone'),
                    name: '',
                    date: '',
                    type: 'INTERIM_CONTRACT',
                    isApprovalGate: true,
                  }])}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                >+ Add contractual milestone</button>
              </div>

              {milestones.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
                  No additional contractual milestones recorded. Core contract anchors remain in effect.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {milestones.map(milestone => (
                    <div key={milestone.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <TextField
                          label="Milestone name"
                          value={milestone.name}
                          placeholder="Contract milestone"
                          onChange={value => setMilestones(current => current.map(item => item.id === milestone.id ? { ...item, name: value } : item))}
                        />
                        <SelectField
                          label="Milestone type"
                          value={milestone.type || 'INTERIM_CONTRACT'}
                          onChange={value => setMilestones(current => current.map(item => item.id === milestone.id ? { ...item, type: value as ContractMilestone['type'] } : item))}
                          options={[
                            ['INTERIM_CONTRACT', 'Interim contract milestone'],
                            ['PHASE_TURNOVER', 'Phase / area turnover'],
                            ['BENEFICIAL_OCCUPANCY', 'Beneficial occupancy'],
                            ['COMMISSIONING_IST', 'Commissioning / IST'],
                            ['UTILITY_POWER', 'Utility / permanent power'],
                            ['OWNER_FURNISHED', 'Owner-furnished equipment'],
                            ['OTHER', 'Other contractual milestone'],
                          ]}
                        />
                        <DateField
                          label="Required date"
                          value={milestone.date}
                          source="Contract basis"
                          onChange={value => setMilestones(current => current.map(item => item.id === milestone.id ? { ...item, date: value } : item))}
                        />
                        <TextField
                          label="Phase / area"
                          value={milestone.phaseOrArea || ''}
                          placeholder="Optional"
                          onChange={value => setMilestones(current => current.map(item => item.id === milestone.id ? { ...item, phaseOrArea: value } : item))}
                        />
                        <div className="lg:col-span-2">
                          <TextField
                            label="Authorized source reference"
                            value={milestone.sourceReference || ''}
                            placeholder="Contract clause, modification, NTP, or directive"
                            onChange={value => setMilestones(current => current.map(item => item.id === milestone.id ? { ...item, sourceReference: value } : item))}
                          />
                        </div>
                        <Toggle
                          label="Approval gate"
                          checked={Boolean(milestone.isApprovalGate)}
                          onChange={checked => setMilestones(current => current.map(item => item.id === milestone.id ? { ...item, isApprovalGate: checked } : item))}
                        />
                        <div className="flex items-end">
                          <button type="button" onClick={() => setMilestones(current => current.filter(item => item.id !== milestone.id))} className="w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50">Remove milestone</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <SaveMessage error={error} saved={savedSection === 'milestones'} label="Contractual milestones and project phasing saved." />
            </BasisCard>
          )}

          {section === 'requirements' && (
            <BasisCard title="Schedule requirements" description="Record what the contract requires before evaluating any baseline or update." action="Save requirements" onAction={saveRequirements}>
              <Notice>Choose the governing profile; do not infer contractual requirements from the uploaded schedule.</Notice>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <TextField label="Contractor" value={basis.contractor || ''} onChange={value => { setBasis(current => ({ ...current, contractor: value })); clearMessages() }} placeholder="Prime contractor" />
                <TextField label="Governing standard / specification" value={basis.governingStandard || ''} onChange={value => { setBasis(current => ({ ...current, governingStandard: value })); clearMessages() }} placeholder="Contract-specific requirement" />
                <SelectField label="Requirements profile" value={requirements.profile} onChange={value => applyRequirementsProfile(value as ScheduleRequirementsBasis['profile'])}
                  options={[['NOT_SET', 'Select profile'], ['UFGS_01_32_01_00_10', 'UFGS 01 32 01.00 10'], ['OWNER_DATA_CENTER', 'Owner / data center'], ['CUSTOM', 'Custom / project-specific']]} />
                <SelectField label="Delivery method" value={requirements.deliveryMethod || 'NOT_SET'} onChange={value => { setRequirements(current => ({ ...current, deliveryMethod: value as ScheduleRequirementsBasis['deliveryMethod'] })); clearMessages() }}
                  options={[['NOT_SET', 'Select method'], ['DESIGN_BID_BUILD', 'Design-Bid-Build'], ['DESIGN_BUILD', 'Design-Build'], ['CM_AT_RISK', 'CM at Risk'], ['OTHER', 'Other']]} />
                <TextField label="Specification section" value={requirements.specificationSection || ''} onChange={value => { setRequirements(current => ({ ...current, specificationSection: value })); clearMessages() }} placeholder="Example: 01 32 01.00 10" />
                <TextField label="Specification edition" value={requirements.specificationEdition || ''} onChange={value => { setRequirements(current => ({ ...current, specificationEdition: value })); clearMessages() }} placeholder="Example: 08/2026" />
                <SelectField label="Scheduling software" value={requirements.schedulingSoftware || 'NOT_SET'} onChange={value => { setRequirements(current => ({ ...current, schedulingSoftware: value as ScheduleRequirementsBasis['schedulingSoftware'] })); clearMessages() }}
                  options={[['NOT_SET', 'Select software'], ['PRIMAVERA_P6', 'Primavera P6'], ['MICROSOFT_PROJECT', 'Microsoft Project'], ['EITHER', 'P6 or Microsoft Project'], ['OTHER', 'Other']]} />
                <SelectField label="Update frequency" value={requirements.updateFrequency || 'NOT_SET'} onChange={value => { setRequirements(current => ({ ...current, updateFrequency: value as ScheduleRequirementsBasis['updateFrequency'] })); clearMessages() }}
                  options={[['NOT_SET', 'Select frequency'], ['MONTHLY', 'Monthly'], ['BIWEEKLY', 'Every two weeks'], ['WEEKLY', 'Weekly'], ['CUSTOM', 'Custom']]} />
              </div>
              <h3 className="mb-3 mt-6 text-sm font-bold text-slate-950">Required submissions and controls</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Toggle label="Preliminary schedule" checked={requirements.preliminaryScheduleRequired} onChange={checked => setRequirements(current => ({ ...current, preliminaryScheduleRequired: checked }))} />
                <Toggle label="Initial / baseline schedule" checked={requirements.initialScheduleRequired} onChange={checked => setRequirements(current => ({ ...current, initialScheduleRequired: checked }))} />
                <Toggle label="Periodic updates" checked={requirements.periodicUpdatesRequired} onChange={checked => setRequirements(current => ({ ...current, periodicUpdatesRequired: checked }))} />
                <Toggle label="Recovery schedule" checked={requirements.recoveryScheduleRequired} onChange={checked => setRequirements(current => ({ ...current, recoveryScheduleRequired: checked }))} />
                <Toggle label="Time impact analysis" checked={requirements.timeImpactAnalysisRequired} onChange={checked => setRequirements(current => ({ ...current, timeImpactAnalysisRequired: checked }))} />
                <Toggle label="Update narrative" checked={requirements.narrativeRequired} onChange={checked => setRequirements(current => ({ ...current, narrativeRequired: checked }))} />
                <Toggle label="Cost loaded" checked={requirements.costLoadedRequired} onChange={checked => setRequirements(current => ({ ...current, costLoadedRequired: checked }))} />
                <Toggle label="Resource loaded" checked={requirements.resourceLoadedRequired} onChange={checked => setRequirements(current => ({ ...current, resourceLoadedRequired: checked }))} />
                <Toggle label="SDEF export" checked={requirements.sdefRequired} onChange={checked => setRequirements(current => ({ ...current, sdefRequired: checked }))} />
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <NumberField label="Maximum normal activity duration" value={requirements.maxActivityDurationDays} suffix="workdays" onChange={value => setRequirements(current => ({ ...current, maxActivityDurationDays: value }))} />
                <NumberField label="Long-lead procurement threshold" value={requirements.longLeadThresholdDays} suffix="calendar days" onChange={value => setRequirements(current => ({ ...current, longLeadThresholdDays: value }))} />
              </div>
              <TextArea label="Project-specific requirements / exceptions" value={requirements.notes || ''} onChange={value => setRequirements(current => ({ ...current, notes: value }))} />
              <SaveMessage error={error} saved={savedSection === 'requirements'} label="Schedule requirements saved at the project level." />
            </BasisCard>
          )}

          {section === 'p6-settings' && (
            <BasisCard title="Required P6 settings" description="Record the contract-required calculation settings. Each P6 version can then be checked against them." action="Save P6 settings" onAction={saveP6Settings}>
              {!p6IsApplicable ? (
                <Notice tone="blue">The selected schedule software is not P6-only. Keep project-specific P6 requirements here only if P6 submissions are permitted.</Notice>
              ) : (
                <Notice>These are required settings, not values observed in a particular XER. Version compliance is reviewed separately.</Notice>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-xs font-bold text-slate-900">Settings profile</div>
                  <div className="mt-1 text-[11px] text-slate-500">Use the contract specification if it differs from the standard profile.</div>
                </div>
                <button type="button" onClick={() => { setP6Settings({ ...UFGS_P6_SETTINGS }); clearMessages() }} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">Apply UFGS 08/2026 defaults</button>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <SelectField label="Duration type" value={p6Settings.durationType} onChange={value => setP6Settings(current => ({ ...current, profile: 'PROJECT_SPECIFIC', durationType: value as P6SettingsBasis['durationType'] }))}
                  options={[['NOT_SET', 'Select setting'], ['FIXED_DURATION_AND_UNITS', 'Fixed Duration & Units'], ['PROJECT_SPECIFIC', 'Project-specific']]} />
                <SelectField label="Percent complete type" value={p6Settings.percentCompleteType} onChange={value => setP6Settings(current => ({ ...current, profile: 'PROJECT_SPECIFIC', percentCompleteType: value as P6SettingsBasis['percentCompleteType'] }))}
                  options={[['NOT_SET', 'Select setting'], ['PHYSICAL', 'Physical'], ['PROJECT_SPECIFIC', 'Project-specific']]} />
                <SelectField label="Critical activity definition" value={p6Settings.criticalActivities} onChange={value => setP6Settings(current => ({ ...current, profile: 'PROJECT_SPECIFIC', criticalActivities: value as P6SettingsBasis['criticalActivities'] }))}
                  options={[['NOT_SET', 'Select setting'], ['LONGEST_PATH', 'Longest Path'], ['TOTAL_FLOAT', 'Total Float threshold'], ['PROJECT_SPECIFIC', 'Project-specific']]} />
                <SelectField label="Progressed activity calculation" value={p6Settings.progressedActivities} onChange={value => setP6Settings(current => ({ ...current, profile: 'PROJECT_SPECIFIC', progressedActivities: value as P6SettingsBasis['progressedActivities'] }))}
                  options={[['NOT_SET', 'Select setting'], ['RETAINED_LOGIC', 'Retained Logic'], ['PROGRESS_OVERRIDE', 'Progress Override'], ['ACTUAL_DATES', 'Actual Dates'], ['PROJECT_SPECIFIC', 'Project-specific']]} />
              </div>
              <h3 className="mb-3 mt-6 text-sm font-bold text-slate-950">Calendars and coding</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Toggle label="Project-level activity codes" checked={p6Settings.activityCodesProjectLevel} onChange={checked => setP6Settings(current => ({ ...current, activityCodesProjectLevel: checked }))} />
                <Toggle label="Project-level calendars" checked={p6Settings.calendarsProjectLevel} onChange={checked => setP6Settings(current => ({ ...current, calendarsProjectLevel: checked }))} />
                <Toggle label="Common daily calendar end time" checked={p6Settings.commonCalendarEndTime} onChange={checked => setP6Settings(current => ({ ...current, commonCalendarEndTime: checked }))} />
                <Toggle label="Verb-noun activity names" checked={p6Settings.verbNounActivityNames} onChange={checked => setP6Settings(current => ({ ...current, verbNounActivityNames: checked }))} />
                <Toggle label="Allow negative lags" checked={p6Settings.negativeLagsAllowed} onChange={checked => setP6Settings(current => ({ ...current, negativeLagsAllowed: checked }))} warning={p6Settings.negativeLagsAllowed} />
                <Toggle label="Allow Start-to-Finish logic" checked={p6Settings.startToFinishAllowed} onChange={checked => setP6Settings(current => ({ ...current, startToFinishAllowed: checked }))} warning={p6Settings.startToFinishAllowed} />
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <NumberField label="Hours / day" value={p6Settings.hoursPerDay} onChange={value => setP6Settings(current => ({ ...current, hoursPerDay: value }))} />
                <NumberField label="Hours / week" value={p6Settings.hoursPerWeek} onChange={value => setP6Settings(current => ({ ...current, hoursPerWeek: value }))} />
                <NumberField label="Hours / month" value={p6Settings.hoursPerMonth} onChange={value => setP6Settings(current => ({ ...current, hoursPerMonth: value }))} />
                <NumberField label="Hours / year" value={p6Settings.hoursPerYear} onChange={value => setP6Settings(current => ({ ...current, hoursPerYear: value }))} />
                <NumberField label="Max Activity ID" value={p6Settings.maxActivityIdLength} suffix="chars" onChange={value => setP6Settings(current => ({ ...current, maxActivityIdLength: value }))} />
              </div>
              <TextArea label="Project-specific P6 settings / exceptions" value={p6Settings.notes || ''} onChange={value => setP6Settings(current => ({ ...current, notes: value }))} />
              <SaveMessage error={error} saved={savedSection === 'p6-settings'} label="Required P6 settings saved at the project level." />
            </BasisCard>
          )}

          {section === 'modifications' && (
            <BasisCard
              title="Time modifications"
              description="Track requested time separately from approved contractual time and maintain one defensible authorized completion position."
              action="Save time modifications"
              onAction={saveTimeModifications}
            >
              <Notice>
                Pending requests, contractor forecasts, and submitted TIAs do not change the contract. Only records marked Approved—with an approval date and authorized source—change the dates shown as authorized.
              </Notice>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard label="Original final completion" value={formatDate(dates.originalContractCompletion)} />
                <MetricCard label="Net approved extension" value={`${authorizedPreview.finalDays >= 0 ? '+' : ''}${authorizedPreview.finalDays} days`} tone={authorizedPreview.finalDays === 0 ? 'slate' : 'green'} />
                <MetricCard label="Authorized final completion" value={formatDate(authorizedPreview.currentFinalCompletion)} tone="green" />
                <MetricCard label="Pending requests" value={`${pendingModificationCount} · ${pendingRequestedDays >= 0 ? '+' : ''}${pendingRequestedDays} requested days`} tone={pendingModificationCount > 0 ? 'amber' : 'slate'} />
              </div>

              <div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-t border-slate-200 pt-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">Modification register</h3>
                  <p className="mt-1 text-xs text-slate-500">Record the full history; do not delete rejected or withdrawn requests merely because they do not affect the authorized date.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTimeModifications(current => [...current, {
                    id: newBasisId('time_mod'),
                    referenceNumber: '',
                    title: '',
                    type: 'TIME_IMPACT_ANALYSIS',
                    status: 'PENDING',
                    target: 'FINAL_COMPLETION',
                  }])}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                >+ Add time modification</button>
              </div>

              {timeModifications.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <div className="text-sm font-bold text-slate-700">No time modifications recorded</div>
                  <div className="mt-1 text-xs text-slate-500">The original contract dates remain the authorized position.</div>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {timeModifications.map((modification, index) => {
                    const approved = modification.status === 'APPROVED'
                    return (
                      <div key={modification.id} className={`rounded-xl border p-4 ${approved ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{index + 1}</span>
                            <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${approved ? 'bg-emerald-100 text-emerald-700' : modification.status === 'REJECTED' || modification.status === 'WITHDRAWN' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                              {modification.status.replaceAll('_', ' ')}
                            </span>
                          </div>
                          <button type="button" onClick={() => setTimeModifications(current => current.filter(item => item.id !== modification.id))} className="text-xs font-bold text-red-600 hover:text-red-800">Remove</button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <TextField
                            label="Reference number"
                            value={modification.referenceNumber}
                            placeholder="MOD-0001 / CO-001 / TIA-01"
                            onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, referenceNumber: value } : item))}
                          />
                          <div className="lg:col-span-2">
                            <TextField
                              label="Title / cause"
                              value={modification.title}
                              placeholder="Describe the event or authorized change"
                              onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, title: value } : item))}
                            />
                          </div>
                          <SelectField
                            label="Status"
                            value={modification.status}
                            onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, status: value as TimeModificationBasis['status'] } : item))}
                            options={[
                              ['PENDING', 'Pending'],
                              ['UNDER_REVIEW', 'Under review'],
                              ['APPROVED', 'Approved'],
                              ['REJECTED', 'Rejected'],
                              ['WITHDRAWN', 'Withdrawn'],
                            ]}
                          />
                          <SelectField
                            label="Record type"
                            value={modification.type}
                            onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, type: value as TimeModificationBasis['type'] } : item))}
                            options={[
                              ['CONTRACT_MODIFICATION', 'Contract modification'],
                              ['CHANGE_ORDER', 'Change order'],
                              ['TIME_IMPACT_ANALYSIS', 'Time impact analysis'],
                              ['ADMINISTRATIVE', 'Administrative change'],
                              ['OTHER', 'Other'],
                            ]}
                          />
                          <SelectField
                            label="Affected contract target"
                            value={modification.target}
                            onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? {
                              ...item,
                              target: value as TimeModificationBasis['target'],
                              milestoneId: value === 'INTERIM_MILESTONE' ? item.milestoneId : undefined,
                              approvedRevisedDate: value === 'BOTH' ? undefined : item.approvedRevisedDate,
                            } : item))}
                            options={[
                              ['FINAL_COMPLETION', 'Final Completion'],
                              ['SUBSTANTIAL_COMPLETION', 'Substantial Completion'],
                              ['BOTH', 'Substantial and Final'],
                              ['INTERIM_MILESTONE', 'Interim contractual milestone'],
                            ]}
                          />
                          {modification.target === 'INTERIM_MILESTONE' ? (
                            <SelectField
                              label="Affected milestone"
                              value={modification.milestoneId || ''}
                              onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, milestoneId: value } : item))}
                              options={[
                                ['', 'Select contractual milestone'],
                                ...milestones.map(item => [item.id, item.name] as [string, string]),
                              ]}
                            />
                          ) : <div />}
                          <DateField
                            label="Submitted / requested date"
                            value={modification.submittedDate || ''}
                            source="Request record"
                            onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, submittedDate: value } : item))}
                          />
                          <SignedNumberField
                            label="Requested days"
                            value={modification.requestedDays}
                            onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, requestedDays: value } : item))}
                          />
                          <DateField
                            label="Approval date"
                            value={modification.approvalDate || ''}
                            source={approved ? 'Required for approved record' : 'If approved'}
                            onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, approvalDate: value } : item))}
                          />
                          <SignedNumberField
                            label="Approved days"
                            value={modification.approvedDays}
                            onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, approvedDays: value } : item))}
                          />
                          {modification.target === 'BOTH' ? (
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[10px] leading-4 text-slate-500">
                              For both completion dates, approved days are applied to each original date. Create separate records if the modification establishes two explicit dates.
                            </div>
                          ) : (
                            <DateField
                              label="Approved revised date"
                              value={modification.approvedRevisedDate || ''}
                              source="Optional explicit override"
                              onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, approvedRevisedDate: value } : item))}
                            />
                          )}
                          <div className="lg:col-span-2">
                            <TextField
                              label="Authorized source reference"
                              value={modification.sourceReference || ''}
                              placeholder="Executed modification, directive, or approval letter"
                              onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, sourceReference: value } : item))}
                            />
                          </div>
                        </div>
                        <TextArea
                          label="Notes / entitlement position"
                          value={modification.notes || ''}
                          onChange={value => setTimeModifications(current => current.map(item => item.id === modification.id ? { ...item, notes: value } : item))}
                        />
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-bold text-emerald-900">Resulting authorized position</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <PositionCard label="Current contractual substantial completion" value={formatDate(authorizedPreview.currentSubstantialCompletion)} note="Approved modifications only" current />
                  <PositionCard label="Current contractual final completion" value={formatDate(authorizedPreview.currentFinalCompletion)} note="Approved modifications only" current />
                </div>
                <p className="mt-3 text-[10px] leading-4 text-emerald-700">If an approved revised date is entered, it controls over the calculated original date plus approved days.</p>
              </div>

              <SaveMessage error={error} saved={savedSection === 'modifications'} label="Time modification register and authorized completion position saved." />
            </BasisCard>
          )}

          {section === 'documents' && (
            <BasisCard
              title="Source documents"
              description="Maintain the authoritative record supporting the project control basis and every formal schedule review."
              action="Save source documents"
              onAction={saveSourceDocuments}
            >
              <Notice>
                A filename alone is not evidence. Identify the document’s authority, revision, issue date, status, and the project-basis sections it governs.
              </Notice>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MetricCard label="Registered documents" value={String(sourceDocuments.length)} />
                <MetricCard label="Current documents" value={String(currentSourceCount)} tone={currentSourceCount > 0 ? 'green' : 'slate'} />
                <MetricCard label="Contractual / governing" value={String(authoritativeSourceCount)} tone={authoritativeSourceCount > 0 ? 'green' : 'amber'} />
              </div>

              <div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-t border-slate-200 pt-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-950">Document register</h3>
                  <p className="mt-1 text-xs text-slate-500">Supersede obsolete documents instead of deleting the historical record.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSourceDocuments(current => [...current, {
                    id: newBasisId('source_doc'),
                    title: '',
                    category: 'SCHEDULE_SPECIFICATION',
                    authority: 'GOVERNING_REQUIREMENT',
                    status: 'DRAFT',
                    appliesTo: ['SCHEDULE_REQUIREMENTS', 'P6_SETTINGS'],
                  }])}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
                >+ Add source document</button>
              </div>

              {sourceDocuments.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
                  <div className="text-sm font-bold text-slate-700">No source documents registered</div>
                  <div className="mt-1 text-xs text-slate-500">Start with the executed contract and governing schedule specification.</div>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {sourceDocuments.map((document, index) => (
                    <div key={document.id} className={`rounded-xl border p-4 ${document.status === 'CURRENT' ? 'border-blue-200 bg-blue-50/20' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{index + 1}</span>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${document.authority === 'CONTRACTUAL' ? 'bg-red-100 text-red-700' : document.authority === 'GOVERNING_REQUIREMENT' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                            {document.authority.replaceAll('_', ' ')}
                          </span>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${document.status === 'CURRENT' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                            {document.status}
                          </span>
                        </div>
                        {document.status === 'DRAFT' ? (
                          <button type="button" onClick={() => void removeDraftSourceDocument(document)} className="text-xs font-bold text-red-600 hover:text-red-800">Remove draft</button>
                        ) : (
                          <span className="text-[10px] text-slate-400">Change status to Superseded or Archived to retain history.</span>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="lg:col-span-2">
                          <TextField
                            label="Document title"
                            value={document.title}
                            placeholder="Official document title"
                            onChange={value => setSourceDocuments(current => current.map(item => item.id === document.id ? { ...item, title: value } : item))}
                          />
                        </div>
                        <SelectField
                          label="Document category"
                          value={document.category}
                          onChange={value => setSourceDocuments(current => current.map(item => item.id === document.id ? { ...item, category: value as ProjectSourceDocument['category'] } : item))}
                          options={[
                            ['EXECUTED_CONTRACT', 'Executed contract'],
                            ['SCHEDULE_SPECIFICATION', 'Schedule specification'],
                            ['NOTICE_TO_PROCEED', 'Notice to Proceed'],
                            ['CONTRACT_MODIFICATION', 'Contract modification'],
                            ['CHANGE_ORDER', 'Change order'],
                            ['APPROVAL_LETTER', 'Approval letter / directive'],
                            ['OWNER_REQUIREMENT', 'Owner requirement / standard'],
                            ['BASIS_OF_DESIGN', 'Basis of Design'],
                            ['COMMISSIONING_PLAN', 'Commissioning plan'],
                            ['UTILITY_AGREEMENT', 'Utility agreement'],
                            ['OTHER', 'Other'],
                          ]}
                        />
                        <SelectField
                          label="Authority"
                          value={document.authority}
                          onChange={value => setSourceDocuments(current => current.map(item => item.id === document.id ? { ...item, authority: value as ProjectSourceDocument['authority'] } : item))}
                          options={[
                            ['CONTRACTUAL', 'Contractual'],
                            ['GOVERNING_REQUIREMENT', 'Governing requirement'],
                            ['SUPPORTING_REFERENCE', 'Supporting reference'],
                            ['INFORMATIONAL', 'Informational'],
                          ]}
                        />
                        <SelectField
                          label="Document status"
                          value={document.status}
                          onChange={value => setSourceDocuments(current => current.map(item => item.id === document.id ? { ...item, status: value as ProjectSourceDocument['status'] } : item))}
                          options={[
                            ['DRAFT', 'Draft / not authoritative'],
                            ['CURRENT', 'Current'],
                            ['SUPERSEDED', 'Superseded'],
                            ['ARCHIVED', 'Archived'],
                          ]}
                        />
                        <TextField
                          label="Reference number"
                          value={document.referenceNumber || ''}
                          placeholder="Contract / spec / modification number"
                          onChange={value => setSourceDocuments(current => current.map(item => item.id === document.id ? { ...item, referenceNumber: value } : item))}
                        />
                        <TextField
                          label="Revision"
                          value={document.revision || ''}
                          placeholder="Revision / amendment"
                          onChange={value => setSourceDocuments(current => current.map(item => item.id === document.id ? { ...item, revision: value } : item))}
                        />
                        <DateField
                          label="Issue date"
                          value={document.issueDate || ''}
                          source="Required for authoritative documents"
                          onChange={value => setSourceDocuments(current => current.map(item => item.id === document.id ? { ...item, issueDate: value } : item))}
                        />
                        <DateField
                          label="Effective date"
                          value={document.effectiveDate || ''}
                          source="If different"
                          onChange={value => setSourceDocuments(current => current.map(item => item.id === document.id ? { ...item, effectiveDate: value } : item))}
                        />
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <FieldLabel label="Stored file" />
                          {document.storagePath ? (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-bold text-slate-800">{document.fileName || 'Stored source document'}</div>
                                <div className="mt-1 text-[10px] text-slate-400">{formatFileSize(document.fileSize)}{document.uploadedAt ? ` · uploaded ${formatDate(document.uploadedAt.slice(0, 10))}` : ''}</div>
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => void openSourceDocument(document)} disabled={openingDocumentId === document.id} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                                  {openingDocumentId === document.id ? 'Opening…' : 'Open file'}
                                </button>
                                <label className="cursor-pointer rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">
                                  {uploadingDocumentId === document.id ? 'Uploading…' : 'Replace'}
                                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" className="hidden" disabled={uploadingDocumentId === document.id} onChange={event => { const file = event.target.files?.[0]; if (file) void handleSourceDocumentUpload(document.id, file); event.currentTarget.value = '' }} />
                                </label>
                              </div>
                            </div>
                          ) : (
                            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:border-blue-300 hover:bg-blue-50">
                              <span className="text-xs font-bold text-blue-700">{uploadingDocumentId === document.id ? 'Uploading…' : 'Upload source file'}</span>
                              <span className="mt-1 text-[10px] text-slate-400">PDF, Word, Excel, image, CSV, or text · maximum 25 MB</span>
                              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg" className="hidden" disabled={uploadingDocumentId === document.id} onChange={event => { const file = event.target.files?.[0]; if (file) void handleSourceDocumentUpload(document.id, file); event.currentTarget.value = '' }} />
                            </label>
                          )}
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <TextField
                            label="Controlled external link"
                            value={document.externalUrl || ''}
                            placeholder="https://…"
                            onChange={value => setSourceDocuments(current => current.map(item => item.id === document.id ? { ...item, externalUrl: value } : item))}
                          />
                          <p className="mt-2 text-[10px] leading-4 text-slate-400">Optional when a file is uploaded. Use only a stable owner-controlled document location.</p>
                        </div>
                      </div>

                      <h4 className="mb-2 mt-4 text-[11px] font-bold text-slate-700">This document supports</h4>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        {([
                          ['CONTRACT_DATES', 'Contract dates'],
                          ['MILESTONES_PHASES', 'Milestones & phases'],
                          ['SCHEDULE_REQUIREMENTS', 'Schedule requirements'],
                          ['P6_SETTINGS', 'P6 settings'],
                          ['TIME_MODIFICATIONS', 'Time modifications'],
                        ] as Array<[ProjectSourceDocument['appliesTo'][number], string]>).map(([value, label]) => (
                          <Toggle
                            key={value}
                            label={label}
                            checked={document.appliesTo.includes(value)}
                            onChange={checked => setSourceDocuments(current => current.map(item => item.id === document.id ? {
                              ...item,
                              appliesTo: checked
                                ? Array.from(new Set([...item.appliesTo, value]))
                                : item.appliesTo.filter(entry => entry !== value),
                            } : item))}
                          />
                        ))}
                      </div>

                      <TextArea
                        label="Document notes / controlling provisions"
                        value={document.notes || ''}
                        onChange={value => setSourceDocuments(current => current.map(item => item.id === document.id ? { ...item, notes: value } : item))}
                      />
                    </div>
                  ))}
                </div>
              )}

              <SaveMessage error={error} saved={savedSection === 'documents'} label="Source-document register saved. The project control basis is now complete." />
            </BasisCard>
          )}

          {!['contract-dates', 'milestones', 'requirements', 'p6-settings', 'modifications', 'documents'].includes(section) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-lg text-blue-700">⌁</div>
              <h2 className="mt-4 text-lg font-bold text-slate-950">{BASIS_SECTIONS.find(item => item.id === section)?.label}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">This is the next controlled build stage. It will use this same project-level basis and will not be stored against one schedule version.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function BasisCard({ title, description, action, onAction, children }: { title: string; description: string; action: string; onAction: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-lg font-bold text-slate-950">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">{description}</p></div>
        <button type="button" onClick={onAction} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">{action}</button>
      </div>
      {children}
    </section>
  )
}

function Notice({ children, tone = 'amber' }: { children: React.ReactNode; tone?: 'amber' | 'blue' }) {
  return <div className={`mt-5 rounded-xl border px-4 py-3 text-xs font-medium leading-5 ${tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{children}</div>
}

function SaveMessage({ error, saved, label }: { error: string; saved: boolean; label: string }) {
  if (error) return <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>
  if (saved) return <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{label}</div>
  return null
}

function SummaryItem({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div><div className="text-[10px] font-medium text-slate-500">{label}</div><div className={`mt-1 text-xs font-bold leading-5 ${muted ? 'text-slate-400' : 'text-slate-900'}`}>{value}</div></div>
}

function AnchorCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 text-sm font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-[10px] text-slate-400">Project contract basis</div>
    </div>
  )
}

function MetricCard({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'green' | 'amber' }) {
  const toneClass = tone === 'green'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-slate-200 bg-slate-50 text-slate-800'
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1.5 text-sm font-black">{value}</div>
    </div>
  )
}

function DateField({ label, value, source, onChange }: { label: string; value: string; source: string; onChange: (value: string) => void }) {
  return <label className="block"><FieldLabel label={label} source={source} /><input type="date" value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" /></label>
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <label className="block"><FieldLabel label={label} /><input type="text" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" /></label>
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <label className="block"><FieldLabel label={label} /><select value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>
}

function NumberField({ label, value, suffix, onChange }: { label: string; value?: number; suffix?: string; onChange: (value: number | undefined) => void }) {
  return <label className="block"><FieldLabel label={label} /><div className="relative"><input type="number" min="0" value={value ?? ''} onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))} className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 pr-16 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" />{suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-400">{suffix}</span>}</div></label>
}

function SignedNumberField({ label, value, onChange }: { label: string; value?: number; onChange: (value: number | undefined) => void }) {
  return (
    <label className="block">
      <FieldLabel label={label} />
      <div className="relative">
        <input
          type="number"
          value={value ?? ''}
          onChange={event => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 pr-14 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-400">days</span>
      </div>
    </label>
  )
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="mt-5 block"><FieldLabel label={label} /><textarea value={value} onChange={event => onChange(event.target.value)} rows={3} className="w-full resize-y rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100" /></label>
}

function FieldLabel({ label, source }: { label: string; source?: string }) {
  return <span className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium text-slate-600"><span>{label}</span>{source && <span className="text-[10px] font-semibold text-blue-600">{source}</span>}</span>
}

function Toggle({ label, checked, warning = false, onChange }: { label: string; checked: boolean; warning?: boolean; onChange: (checked: boolean) => void }) {
  return <label className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs font-semibold ${warning ? 'border-red-200 bg-red-50 text-red-700' : checked ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-blue-600" /></label>
}

function ReadOnlyField({ label, value, source }: { label: string; value: string; source: string }) {
  return <div><FieldLabel label={label} source={source} /><div className="min-h-[42px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-500">{value}</div></div>
}

function PositionCard({ label, value, note, current = false }: { label: string; value: string; note: string; current?: boolean }) {
  return <div className={`rounded-xl p-4 ${current ? 'border border-emerald-100 bg-emerald-50/50' : 'bg-slate-50'}`}><div className="text-[10px] leading-4 text-slate-500">{label}</div><div className="mt-1 text-sm font-bold text-slate-900">{value}</div><div className={`mt-1 text-[10px] font-medium ${current ? 'text-emerald-700' : 'text-slate-500'}`}>{note}</div></div>
}
