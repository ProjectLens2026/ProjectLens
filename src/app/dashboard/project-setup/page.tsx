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
  ScheduleRequirementsBasis,
  getActiveProject,
  subscribeToProjects,
  updateProjectContractDates,
  updateProjectControlBasis,
  whenHydrated,
} from '@/lib/projectStore'

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
  { id: 'modifications', label: 'Time modifications', implemented: false },
  { id: 'documents', label: 'Source documents', implemented: false },
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

export default function ProjectControlBasisPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [section, setSection] = useState<BasisSection>('contract-dates')
  const [dates, setDates] = useState<ContractDates>({})
  const [basis, setBasis] = useState<ProjectControlBasis>({})
  const [milestones, setMilestones] = useState<ContractMilestone[]>([])
  const [phasingStrategy, setPhasingStrategy] = useState<ProjectControlBasis['phasingStrategy']>('NOT_SET')
  const [phases, setPhases] = useState<ProjectPhaseBasis[]>([])
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
      })
      setBasis(active?.controlBasis || {})
      setMilestones(active?.contractDates?.contractMilestones || [])
      setPhasingStrategy(active?.controlBasis?.phasingStrategy || 'NOT_SET')
      setPhases(active?.controlBasis?.projectPhases || [])
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
  const p6IsApplicable = requirements.schedulingSoftware === 'PRIMAVERA_P6' || requirements.schedulingSoftware === 'EITHER'
  const p6IsComplete = !p6IsApplicable || p6SettingsComplete(p6Settings)
  const completeSections = useMemo(() => (
    [datesComplete, milestonesAreComplete, requirementsAreComplete, p6IsComplete && requirementsAreComplete].filter(Boolean).length
  ), [datesComplete, milestonesAreComplete, requirementsAreComplete, p6IsComplete])
  const completionPercent = Math.round((completeSections / 6) * 100)

  function clearMessages() {
    setError('')
    setSavedSection(null)
  }

  function saveContractDates() {
    if (!project) return
    const validationError = validateDates(dates)
    if (validationError) { setError(validationError); return }
    updateProjectContractDates(project.id, {
      ntp: dates.ntp || '',
      substantialCompletion: dates.substantialCompletion || '',
      originalContractCompletion: dates.originalContractCompletion || '',
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

    updateProjectContractDates(project.id, { contractMilestones: normalizedMilestones })
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

  function sectionIsComplete(id: BasisSection) {
    if (id === 'contract-dates') return datesComplete
    if (id === 'milestones') return milestonesAreComplete
    if (id === 'requirements') return requirementsAreComplete
    if (id === 'p6-settings') return requirementsAreComplete && p6IsComplete
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
                <PositionCard label="Current contractual substantial completion" value={formatDate(dates.substantialCompletion)} note="No approved modification recorded" current />
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

          {!['contract-dates', 'milestones', 'requirements', 'p6-settings'].includes(section) && (
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
