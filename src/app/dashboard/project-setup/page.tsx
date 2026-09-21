'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ContractDates,
  Project,
  getActiveProject,
  subscribeToProjects,
  updateProjectContractDates,
  whenHydrated,
} from '@/lib/projectStore'

type BasisSection =
  | 'contract-dates'
  | 'milestones'
  | 'requirements'
  | 'p6-settings'
  | 'modifications'
  | 'documents'

const BASIS_SECTIONS: Array<{
  id: BasisSection
  label: string
  count?: string
}> = [
  { id: 'contract-dates', label: 'Contract dates' },
  { id: 'milestones', label: 'Milestones & phases' },
  { id: 'requirements', label: 'Schedule requirements' },
  { id: 'p6-settings', label: 'P6 settings' },
  { id: 'modifications', label: 'Time modifications' },
  { id: 'documents', label: 'Source documents' },
]

function formatDate(value?: string) {
  if (!value) return 'Not recorded'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
}

function validateDates(dates: ContractDates): string | null {
  const ntp = dates.ntp || ''
  const substantial = dates.substantialCompletion || ''
  const finalCompletion = dates.originalContractCompletion || ''

  if (ntp && substantial && ntp >= substantial) {
    return 'Original Substantial Completion must be after Notice to Proceed.'
  }
  if (ntp && finalCompletion && ntp >= finalCompletion) {
    return 'Original Final Completion must be after Notice to Proceed.'
  }
  if (substantial && finalCompletion && substantial > finalCompletion) {
    return 'Original Final Completion cannot be before Original Substantial Completion.'
  }
  return null
}

export default function ProjectControlBasisPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [section, setSection] = useState<BasisSection>('contract-dates')
  const [form, setForm] = useState<ContractDates>({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let mounted = true

    function syncProject() {
      if (!mounted) return
      const active = getActiveProject()
      setProject(active)
      setForm({
        ntp: active?.contractDates?.ntp || '',
        substantialCompletion: active?.contractDates?.substantialCompletion || '',
        originalContractCompletion: active?.contractDates?.originalContractCompletion || '',
        contractMilestones: active?.contractDates?.contractMilestones || [],
      })
    }

    whenHydrated().then(syncProject)
    const unsubscribe = subscribeToProjects(syncProject)
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const completedFields = useMemo(() => [
    form.ntp,
    form.substantialCompletion,
    form.originalContractCompletion,
  ].filter(Boolean).length, [form])

  const completionPercent = Math.round((completedFields / 3) * 100)

  function updateDate(
    field: 'ntp' | 'substantialCompletion' | 'originalContractCompletion',
    value: string,
  ) {
    setForm(current => ({ ...current, [field]: value }))
    setError('')
    setSaved(false)
  }

  function saveContractDates() {
    if (!project) return
    const validationError = validateDates(form)
    if (validationError) {
      setError(validationError)
      return
    }

    updateProjectContractDates(project.id, {
      ntp: form.ntp || '',
      substantialCompletion: form.substantialCompletion || '',
      originalContractCompletion: form.originalContractCompletion || '',
    })
    setSaved(true)
    setError('')
  }

  if (!project) {
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Select a project first</h1>
          <p className="mt-2 text-sm text-slate-500">
            Project Control Basis belongs to a project and remains separate from an individual XER review.
          </p>
          <Link
            href="/dashboard/projects"
            className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Go to Projects
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="text-xs font-bold tracking-wide text-slate-900">
            CONTROL<span className="text-blue-600">LENS</span>
            <span className="ml-2 font-medium text-blue-600">· {project.name}</span>
          </div>
          <div className="text-xs text-slate-500">Project setup / Project Control Basis</div>
        </div>

        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Project Control Basis</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              The contractual source of truth used for every baseline approval, update, comparison,
              recovery review and time impact analysis.
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
            Basis setup in progress
          </span>
        </div>

        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <SummaryItem label="Project number" value={project.projectId || 'Not recorded'} />
            <SummaryItem label="Owner" value={project.owner || 'Not recorded'} />
            <SummaryItem label="Contractor" value="Not yet captured" muted />
            <SummaryItem label="Governing standard" value="Not yet captured" muted />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold leading-5 text-slate-900">Basis completeness</span>
              <span className="text-right text-xs font-bold leading-5 text-emerald-700">
                {completedFields} of 3<br />current fields
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-600 transition-all" style={{ width: `${completionPercent}%` }} />
            </div>
            <p className="mt-3 text-[11px] leading-4 text-slate-500">
              More required fields will be added as each basis section is implemented.
            </p>
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[190px_1fr]">
          <nav className="space-y-1" aria-label="Project Control Basis sections">
            {BASIS_SECTIONS.map(item => {
              const active = section === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm transition-colors ${
                    active
                      ? 'bg-blue-50 font-semibold text-blue-700'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <span>{item.label}</span>
                  {active ? <span aria-hidden="true">✓</span> : <span className="text-[10px] text-slate-400">NEXT</span>}
                </button>
              )
            })}
          </nav>

          {section === 'contract-dates' ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Contract dates</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">
                    Original dates are preserved. Only approved modifications change the current contractual dates.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={saveContractDates}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Save contract dates
                </button>
              </div>

              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium leading-5 text-amber-800">
                Pending requests and contractor forecasts do not replace the current contractual completion date.
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <ReadOnlyField label="Contract award" value="Not yet captured" source="Source field coming next" />
                <DateField label="Notice to Proceed" value={form.ntp || ''} onChange={value => updateDate('ntp', value)} source="Project basis" />
                <DateField label="Original substantial completion" value={form.substantialCompletion || ''} onChange={value => updateDate('substantialCompletion', value)} source="Project basis" />
                <DateField label="Original final completion" value={form.originalContractCompletion || ''} onChange={value => updateDate('originalContractCompletion', value)} source="Project basis" />
              </div>

              {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {error}
                </div>
              )}
              {saved && !error && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  Contract dates saved to the project basis.
                </div>
              )}

              <div className="my-6 border-t border-slate-200" />

              <h3 className="text-sm font-bold text-slate-950">Authorized completion position</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Until approved time modifications are recorded, Control Lens retains the original contract dates as the working contractual position.
              </p>

              <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <PositionCard
                  label="Original substantial completion"
                  value={formatDate(form.substantialCompletion)}
                  note="Original contract"
                />
                <div className="flex items-center justify-center px-2 text-lg text-slate-400" aria-hidden="true">→</div>
                <PositionCard
                  label="Current contractual substantial completion"
                  value={formatDate(form.substantialCompletion)}
                  note="No approved modification recorded"
                  current
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <ReadOnlyField label="Current substantial completion" value={formatDate(form.substantialCompletion)} source="Original basis only" />
                <ReadOnlyField label="Current final completion" value={formatDate(form.originalContractCompletion)} source="Original basis only" />
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-lg text-blue-700">⌁</div>
              <h2 className="mt-4 text-lg font-bold text-slate-950">
                {BASIS_SECTIONS.find(item => item.id === section)?.label}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                This section is intentionally reserved for the next controlled build step. No placeholder data will be treated as contractual evidence.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryItem({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-xs font-bold leading-5 ${muted ? 'text-slate-400' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

function DateField({
  label,
  value,
  source,
  onChange,
}: {
  label: string
  value: string
  source: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium text-slate-600">
        <span>{label}</span>
        <span className="text-[10px] font-semibold text-blue-600">{source}</span>
      </span>
      <input
        type="date"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
      />
    </label>
  )
}

function ReadOnlyField({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium text-slate-600">
        <span>{label}</span>
        <span className="text-[10px] font-semibold text-slate-400">{source}</span>
      </div>
      <div className="min-h-[42px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-500">
        {value}
      </div>
    </div>
  )
}

function PositionCard({
  label,
  value,
  note,
  current = false,
}: {
  label: string
  value: string
  note: string
  current?: boolean
}) {
  return (
    <div className={`rounded-xl p-4 ${current ? 'border border-emerald-100 bg-emerald-50/50' : 'bg-slate-50'}`}>
      <div className="text-[10px] leading-4 text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
      <div className={`mt-1 text-[10px] font-medium ${current ? 'text-emerald-700' : 'text-slate-500'}`}>{note}</div>
    </div>
  )
}
