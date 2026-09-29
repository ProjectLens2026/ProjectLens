'use client'
// =============================================================================
// TIA Comparison page (Day 10 — project-only, fragnet-required rewrite)
//
// Simple flow:
//   1. Must have active project with at least one Fragnet version uploaded
//   2. Pick un-impacted version (any non-FRAG)
//   3. Pick fragnet version (any FRAG)
//   4. Both already in Supabase Storage → get signed URLs → send to API
//
// No file uploads happen on this page. TIA is purely about COMPARING already-
// saved versions. Want to test a new impacted schedule? Upload it as a Fragnet
// via the Upload page first, then come here.
// =============================================================================
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  getActiveProject, Project, ScheduleVersion,
} from '@/lib/projectStore'
import { getSavedVersionXerSignedUrl } from '@/lib/supabase/db'
import { usePermissions } from '@/lib/usePermissions'
import type { TIAValidationIssue } from '@/lib/xerComparator'

type Step = 'pick' | 'analyzing' | 'review' | 'categorize' | 'generating'

interface FragnetCategorization {
  category: string
  description: string
}

export default function TIAPage() {
  const perms = usePermissions()
  const [step, setStep] = useState<Step>('pick')
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [unimpactedId, setUnimpactedId] = useState<string>('')
  const [fragnetId, setFragnetId] = useState<string>('')
  const [comparison, setComparison] = useState<any>(null)
  const [validation, setValidation] = useState<TIAValidationIssue[]>([])
  const [selectedFragnetCodes, setSelectedFragnetCodes] = useState<string[]>([])
  const [confirmedFragnetCodes, setConfirmedFragnetCodes] = useState<string[] | null>(null)
  const [activeTab, setActiveTab] = useState('summary')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('Starting...')
  const [categorizations, setCategorizations] = useState<Record<string, FragnetCategorization>>({})
  const [ctx, setCtx] = useState({
    projectName: '',
    projectNumber: '',
    owner: '',
    preparedBy: '',
    contractCompletionDate: '',
  })

  useEffect(() => {
    const p = getActiveProject()
    setActiveProject(p)
    if (p) {
      // Default un-impacted = latest non-FRAG version
      const nonFragVersions = p.versions
        .filter(v => !v.deletedAt && v.scheduleType !== 'fragnet' && v.analysis?.sourceFormat !== 'MS_PROJECT_XML')
        .sort((a, b) => new Date(b.dataDate || b.uploadedAt).getTime() - new Date(a.dataDate || a.uploadedAt).getTime())
      // Default fragnet = latest FRAG version
      const fragVersions = p.versions
        .filter(v => !v.deletedAt && v.scheduleType === 'fragnet' && v.analysis?.sourceFormat !== 'MS_PROJECT_XML')
        .sort((a, b) => new Date(b.dataDate || b.uploadedAt).getTime() - new Date(a.dataDate || a.uploadedAt).getTime())
      if (fragVersions[0]) {
        setFragnetId(fragVersions[0].id)
        const linkedParent = nonFragVersions.find(v => v.id === fragVersions[0].parentVersionId)
        setUnimpactedId(linkedParent?.id || nonFragVersions[0]?.id || '')
      } else if (nonFragVersions[0]) {
        setUnimpactedId(nonFragVersions[0].id)
      }

      setCtx(prev => ({ ...prev, projectName: p.name, projectNumber: p.projectId || '' }))
    }
  }, [])

  const categories = [
    { value: 'unassigned', label: 'Not assessed' },
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

  function pairValidationIssues(): TIAValidationIssue[] {
    if (!activeProject || !unimpactedId || !fragnetId) return []
    const unimpacted = activeProject.versions.find(v => v.id === unimpactedId)
    const fragnet = activeProject.versions.find(v => v.id === fragnetId)
    if (!unimpacted || !fragnet) return []
    const issues: TIAValidationIssue[] = []
    if (fragnet.parentVersionId && fragnet.parentVersionId !== unimpacted.id) {
      const linked = activeProject.versions.find(v => v.id === fragnet.parentVersionId)
      issues.push({
        code: 'PARENT_VERSION_MISMATCH', severity: 'error',
        title: 'Wrong un-impacted parent selected',
        detail: `This fragnet was created from ${linked?.versionLabel || linked?.fileName || 'another version'}. Select that linked version.`,
      })
    } else if (!fragnet.parentVersionId) {
      issues.push({
        code: 'PARENT_VERSION_NOT_RECORDED', severity: 'warning',
        title: 'Legacy fragnet has no recorded parent',
        detail: 'Confirm that the selected un-impacted XER is the exact file copied before the fragnet was inserted.',
      })
    }
    const aDate = String(unimpacted.dataDate || '').slice(0, 10)
    const bDate = String(fragnet.dataDate || '').slice(0, 10)
    if (!aDate || !bDate) {
      issues.push({
        code: 'DATA_DATE_MISSING', severity: 'error', title: 'Data date is missing',
        detail: 'Both versions require a verifiable data date before TIA comparison.',
      })
    } else if (aDate !== bDate) {
      issues.push({
        code: 'DATA_DATE_MISMATCH', severity: 'error', title: 'The versions have different data dates',
        detail: `Un-impacted: ${aDate}; impacted: ${bDate}. Select the same statused schedule copy.`,
      })
    }
    return issues
  }

  function selectFragnet(versionId: string) {
    setFragnetId(versionId)
    setValidation([])
    const selected = activeProject?.versions.find(v => v.id === versionId)
    if (selected?.parentVersionId) setUnimpactedId(selected.parentVersionId)
  }

  // Cache resolved signed URLs so report-gen can reuse without re-fetching
  const signedUrlsRef = useRef<{ a?: string; b?: string }>({})

  async function resolveSignedUrls(): Promise<{ ok: true; aUrl: string; bUrl: string } | { ok: false; error: string }> {
    if (!unimpactedId || !fragnetId) {
      return { ok: false, error: 'Pick both an un-impacted version and a fragnet version' }
    }
    setProgressLabel('Fetching un-impacted schedule from storage...')
    const aResult = await getSavedVersionXerSignedUrl(unimpactedId)
    if (!aResult.ok || !aResult.signedUrl) {
      return { ok: false, error: aResult.error || 'Failed to get un-impacted URL' }
    }
    setProgress(30)
    setProgressLabel('Fetching fragnet schedule from storage...')
    const bResult = await getSavedVersionXerSignedUrl(fragnetId)
    if (!bResult.ok || !bResult.signedUrl) {
      return { ok: false, error: bResult.error || 'Failed to get fragnet URL' }
    }
    return { ok: true, aUrl: aResult.signedUrl, bUrl: bResult.signedUrl }
  }

  async function runComparison(confirmedCodes?: string[]) {
    const blockingPairIssues = pairValidationIssues().filter(issue => issue.severity === 'error')
    if (blockingPairIssues.length > 0) {
      alert(blockingPairIssues.map(issue => issue.title).join('\n'))
      return
    }
    setStep('analyzing')
    setProgress(5)
    setProgressLabel('Preparing files...')

    try {
      const urls = await resolveSignedUrls()
      if (!urls.ok) {
        alert(urls.error)
        setStep('pick')
        return
      }
      signedUrlsRef.current = { a: urls.aUrl, b: urls.bUrl }
      setProgress(50)
      setProgressLabel('Comparing schedules (this can take 30-60 seconds for large files)...')

      const fd = new FormData()
      fd.append('fileAUrl', urls.aUrl)
      fd.append('fileBUrl', urls.bUrl)
      fd.append('mode', 'compare')
      if (confirmedCodes) fd.append('confirmedFragnetCodes', JSON.stringify(confirmedCodes))

      const res = await fetch('/api/compare', { method: 'POST', body: fd })
      if (!res.ok) {
        let errMsg = `Comparison failed (HTTP ${res.status})`
        try {
          const errBody = await res.json()
          if (errBody.error) errMsg = errBody.error
        } catch {}
        throw new Error(errMsg)
      }

      setProgress(95)
      setProgressLabel('Loading results...')
      const data = await res.json()
      setComparison(data.comparison)
      setValidation(data.validation || [])
      setConfirmedFragnetCodes(confirmedCodes || null)
      setSelectedFragnetCodes((data.comparison.fragnetActivities || []).map((f: any) => f.task_code))
      // The controlling-path change is the primary TIA result. Open it first;
      // the activity and milestone detail remains available in the other tabs.
      setActiveTab('cp')

      const initialCats: Record<string, FragnetCategorization> = {}
      for (const frag of data.comparison.fragnetActivities || []) {
        initialCats[frag.task_id] = categorizations[frag.task_id] || { category: 'unassigned', description: '' }
      }
      setCategorizations(initialCats)
      setProgress(100)
      setTimeout(() => setStep('review'), 300)
    } catch (err: any) {
      console.error('[TIA] compare failed:', err)
      alert('Comparison failed: ' + (err?.message || 'Unknown error'))
      setStep('pick')
    }
  }

  async function generateReport() {
    if (!comparison) return
    if (!confirmedFragnetCodes?.length) return
    const blockingIssues = validation.filter(issue => issue.severity === 'error')
    if (blockingIssues.length > 0) {
      alert('Formal TIA report is blocked:\n\n' + blockingIssues.map(issue => `• ${issue.title}`).join('\n'))
      return
    }
    setStep('generating')

    try {
      let aUrl = signedUrlsRef.current.a
      let bUrl = signedUrlsRef.current.b
      if (!aUrl || !bUrl) {
        const urls = await resolveSignedUrls()
        if (!urls.ok) { alert(urls.error); setStep('categorize'); return }
        aUrl = urls.aUrl; bUrl = urls.bUrl
      }

      const fd = new FormData()
      fd.append('fileAUrl', aUrl)
      fd.append('fileBUrl', bUrl)
      fd.append('mode', 'tia')
      fd.append('confirmedFragnetCodes', JSON.stringify(confirmedFragnetCodes))
      fd.append('context', JSON.stringify(ctx))
      fd.append('fragnetCategorizations', JSON.stringify(categorizations))

      const res = await fetch('/api/compare', { method: 'POST', body: fd })
      if (!res.ok) {
        let errMsg = 'Report generation failed'
        try {
          const errBody = await res.json()
          if (errBody.error) errMsg = errBody.error
        } catch {}
        throw new Error(errMsg)
      }

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
      console.error('[TIA] report failed:', err)
      alert('Report generation failed: ' + (err?.message || 'Unknown error'))
      setStep('categorize')
    }
  }

  // Viewer lockdown
  if (!perms.loading && !perms.can.runAdvancedAnalytics) {
    return (
      <div className="flex flex-col h-full bg-slate-50 items-center justify-center p-6">
        <div className="max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-lg font-bold text-slate-900 mb-2">Access denied</div>
          <div className="text-sm text-slate-600 mb-6 leading-relaxed">
            <strong>TIA Comparison</strong> is available to <strong>Project Manager</strong>, <strong>Admin</strong>, and <strong>Owner</strong> roles. As a Viewer you have read-only access — ask your admin if you need this feature.
          </div>
          <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // No active project
  if (!activeProject) {
    return (
      <div className="flex flex-col h-full bg-slate-50 items-center justify-center p-6">
        <div className="max-w-md bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
          <div className="text-4xl mb-3">📁</div>
          <div className="text-lg font-bold text-slate-900 mb-2">No active project</div>
          <div className="text-sm text-slate-600 mb-6 leading-relaxed">
            TIA is run inside a project. Open a project first, then come back to compare an un-impacted version against a fragnet schedule.
          </div>
          <Link href="/dashboard/projects" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg">
            Go to Projects
          </Link>
        </div>
      </div>
    )
  }

  // Active project versions (filter out soft-deleted)
  // The existing TIA comparison API consumes raw XER files. Microsoft Project
  // XML versions remain fully reviewable but are withheld here until the TIA
  // comparator is migrated to the normalized schedule model.
  const activeVersions = activeProject.versions.filter(v => !v.deletedAt && v.analysis?.sourceFormat !== 'MS_PROJECT_XML')
  const fragnetVersions = activeVersions.filter(v => v.scheduleType === 'fragnet')
  const unimpactedVersions = activeVersions.filter(v => v.scheduleType !== 'fragnet')

  // No fragnets yet
  if (step === 'pick' && fragnetVersions.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center">
          <Link href="/dashboard/controls" className="mr-4 text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap">← Project Controls</Link>
          <div className="mr-4 h-6 border-l border-slate-200" />
          <span className="font-bold text-slate-900 text-base">TIA Comparison <span className="text-slate-400 text-xs font-normal">— Time Impact Analysis</span></span>
          <span className="text-slate-400 text-sm ml-2">· {activeProject.name}</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
          <div className="max-w-lg bg-white border border-amber-200 rounded-2xl shadow-sm p-8 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <div className="text-xl font-extrabold text-slate-900 mb-3">No fragnet schedule uploaded yet</div>
            <div className="text-sm text-slate-600 leading-relaxed mb-6">
              TIA compares an un-impacted schedule against an impacted (<strong>Fragnet</strong>) schedule.
              You need to upload at least one Primavera XER Fragnet version to this project first. Microsoft Project XML is supported for schedule review, but the current TIA comparison engine remains XER-only.
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left text-xs text-blue-900 mb-6 leading-relaxed">
              <div className="font-bold mb-2">How to add a fragnet:</div>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Go to the <strong>Upload</strong> page</li>
                <li>Pick this project</li>
                <li>Schedule Type → choose <strong>Fragnet ⚠️</strong></li>
                <li>Upload your impacted XER (the one with fragmentary network activities added to the critical path)</li>
                <li>Come back here — TIA will be ready to run</li>
              </ol>
            </div>
            <Link href="/dashboard/upload" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg">
              Go to Upload →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'pick') {
    const pairIssues = pairValidationIssues()
    const canRun = !!(unimpactedId && fragnetId && unimpactedId !== fragnetId)
      && !pairIssues.some(issue => issue.severity === 'error')
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center">
          <Link href="/dashboard/controls" className="mr-4 text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap">← Project Controls</Link>
          <div className="mr-4 h-6 border-l border-slate-200" />
          <span className="font-bold text-slate-900 text-base">TIA Comparison</span>
          <span className="text-slate-400 text-sm ml-2">· {activeProject.name}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl font-extrabold text-slate-900 mb-1">Pick the schedules to compare</h2>
            <p className="text-slate-500 text-sm mb-6">
              TIA shows the time impact between an un-impacted schedule and a fragnet (impacted) schedule. Both must already be uploaded Primavera XER versions; Microsoft Project XML TIA comparison is not enabled yet.
            </p>

            {/* Un-impacted */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
              <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Un-Impacted Schedule</div>
              <div className="text-xs text-slate-500 mb-3">
                The schedule as it stood BEFORE the impact. Pick the most recent baseline or update that doesn't yet include the fragnet activities.
              </div>
              <select
                value={unimpactedId}
                onChange={e => { setUnimpactedId(e.target.value); setValidation([]) }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Pick a version —</option>
                {unimpactedVersions.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.versionLabel || v.fileName} · data date {shortDate(v.dataDate)}
                  </option>
                ))}
              </select>
              {unimpactedVersions.length === 0 && (
                <div className="mt-2 text-xs text-amber-700">No non-fragnet versions in this project yet.</div>
              )}
            </div>

            {/* Fragnet */}
            <div className="bg-white border border-amber-300 rounded-xl p-5 mb-4">
              <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">⚠️ Fragnet (Impacted) Schedule</div>
              <div className="text-xs text-slate-500 mb-3">
                The schedule WITH fragmentary network activities added to model the delay event (RFI, bulletin, unforeseen condition).
              </div>
              <select
                value={fragnetId}
                onChange={e => selectFragnet(e.target.value)}
                className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:border-amber-500 bg-amber-50">
                <option value="">— Pick a fragnet —</option>
                {fragnetVersions.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.versionLabel || v.fileName} · data date {shortDate(v.dataDate)}
                  </option>
                ))}
              </select>
            </div>

            {pairIssues.length > 0 && (
              <div className="mb-4 space-y-2">
                {pairIssues.map(issue => (
                  <div key={issue.code} className={`rounded-lg border px-4 py-3 ${issue.severity === 'error' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                    <div className={`text-xs font-extrabold ${issue.severity === 'error' ? 'text-red-800' : 'text-amber-800'}`}>
                      {issue.severity === 'error' ? 'BLOCKED' : 'CONFIRM'} — {issue.title}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-slate-700">{issue.detail}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Project info for the report */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
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
              disabled={!canRun}
              onClick={() => runComparison()}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold disabled:bg-slate-200 disabled:text-slate-400 hover:bg-blue-700 transition-colors">
              🔍 Compare Schedules →
            </button>
            {unimpactedId && fragnetId && unimpactedId === fragnetId && (
              <div className="mt-3 text-xs text-red-600 text-center font-semibold">
                Un-impacted and fragnet must be different versions.
              </div>
            )}

            <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg text-xs text-blue-900 leading-relaxed">
              <strong>Controlled TIA pair:</strong> Both XERs must share the same data date. The impacted file must be a copy of the selected parent with only the delay fragnet and its tie-in/tie-out logic added.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'analyzing') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6 animate-pulse">🔍</div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">{progressLabel}</h2>
            <p className="text-slate-500 text-sm mb-6">Large XER files (50 MB+) may take a minute or two.</p>
            <div className="bg-slate-100 rounded-full h-2 overflow-hidden mb-3">
              <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-xs text-slate-400">{Math.round(progress)}% complete</div>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'review' && comparison) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4">
          <Link href="/dashboard/controls" className="text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap">← Project Controls</Link>
          <div className="h-6 border-l border-slate-200" />
          <span className="font-bold text-slate-900 text-base">Comparison Results</span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => { setStep('pick'); setComparison(null); setValidation([]); setConfirmedFragnetCodes(null); setSelectedFragnetCodes([]); signedUrlsRef.current = {} }}
              className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400">
              ← Pick different versions
            </button>
            <button
              disabled={validation.some(issue => issue.severity === 'error')}
              onClick={() => setStep('categorize')}
              className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed">
              {validation.some(issue => issue.severity === 'error') ? 'Report Blocked' : 'Generate TIA Report →'}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="rounded-xl border border-blue-200 bg-white p-4">
            <h3 className="text-sm font-bold">Confirm event activities</h3>
            <p className="mt-1 text-xs text-slate-600">Select the added activities that belong to this delay event, including event milestones. Suggested matches must be checked by the scheduler.</p>
            <div className="my-3 max-h-64 overflow-y-auto divide-y divide-slate-100">
              {(comparison.added || []).map((activity: any) => (
                <label key={activity.task_code} className="flex items-center gap-3 py-2 text-xs">
                  <input type="checkbox" checked={selectedFragnetCodes.includes(activity.task_code)} onChange={e => {
                    setSelectedFragnetCodes(current => e.target.checked ? [...current, activity.task_code] : current.filter(code => code !== activity.task_code))
                    setConfirmedFragnetCodes(null)
                    setValidation(current => [...current.filter(issue => issue.code !== 'FRAGNET_CONFIRMATION_REQUIRED'), { code: 'FRAGNET_CONFIRMATION_REQUIRED', severity: 'error', title: 'Confirm the revised selection', detail: 'Revalidate this selection before generating the report.' }])
                  }} />
                  <span><strong>{activity.task_code}</strong> — {activity.task_name}</span>
                </label>
              ))}
            </div>
            <button disabled={!selectedFragnetCodes.length} onClick={() => runComparison(selectedFragnetCodes)} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">Confirm {selectedFragnetCodes.length} activities and revalidate</button>
          </div>
          <div className={`rounded-xl border p-4 ${validation.some(issue => issue.severity === 'error') ? 'border-red-300 bg-red-50' : validation.length > 0 ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className={`text-sm font-extrabold ${validation.some(issue => issue.severity === 'error') ? 'text-red-900' : validation.length > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
                  {validation.some(issue => issue.severity === 'error') ? 'TIA VALIDATION FAILED — FORMAL REPORT BLOCKED' : validation.length > 0 ? 'TIA REQUIRES REVIEW' : 'TIA PAIR VALIDATED'}
                </div>
                <div className="mt-1 text-xs text-slate-700">
                  {validation.length === 0 ? 'Initial checks passed. Confirm calendars, scheduling settings, event logic and the controlling milestone before relying on the result.' : `${validation.filter(i => i.severity === 'error').length} blocking issue(s) · ${validation.filter(i => i.severity === 'warning').length} warning(s)`}
                </div>
              </div>
              <div className="text-2xl">{validation.some(issue => issue.severity === 'error') ? '⛔' : validation.length > 0 ? '⚠️' : '✓'}</div>
            </div>
            {validation.length > 0 && (
              <div className="mt-3 space-y-2 border-t border-current/10 pt-3">
                {validation.map(issue => (
                  <div key={issue.code} className="text-xs text-slate-800">
                    <span className={`font-extrabold ${issue.severity === 'error' ? 'text-red-800' : 'text-amber-800'}`}>{issue.severity === 'error' ? 'BLOCKER' : 'REVIEW'} — {issue.title}.</span>{' '}{issue.detail}
                  </div>
                ))}
              </div>
            )}
          </div>
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
          <div className="grid grid-cols-5 gap-2">
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Activities Changed</div><div className="text-xl font-bold text-amber-600">{comparison.changed?.length || 0}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Activities Added</div><div className="text-xl font-bold text-blue-600">{comparison.added?.length || 0}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Activities Removed</div><div className="text-xl font-bold text-slate-600">{comparison.removed?.length || 0}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Milestones Moved</div><div className="text-xl font-bold text-red-600">{comparison.milestoneMovements?.length || 0}</div></div>
            <div className="bg-slate-50 rounded-lg p-3"><div className="text-xs text-slate-500">Fragnets Found</div><div className="text-xl font-bold text-blue-600">{comparison.fragnetActivities?.length || 0}</div></div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex gap-0 border-b border-slate-100 overflow-x-auto">
              {[
                { id: 'summary', label: 'Summary' },
                { id: 'milestones', label: 'Milestone Movements' },
                { id: 'changed', label: 'Changed Activities' },
                { id: 'added', label: 'Added' },
                { id: 'removed', label: 'Removed' },
                { id: 'fragnets', label: 'Fragnets' },
                { id: 'cp', label: 'Path Comparison' },
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
                      No fragnet activities detected. Make sure your fragnet schedule has activities with "Frag" or "Schedule Issue" in their name or WBS.
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
                  <h3 className="text-sm font-bold mb-1">Controlling Path Comparison</h3>
                  <p className="mb-4 text-xs text-slate-500">Compare the path before the delay insertion with the impacted path after the fragnet was added.</p>
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

  if (step === 'categorize') {
    const frags = comparison?.fragnetActivities || []
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center">
          <Link href="/dashboard/controls" className="mr-4 text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap">← Project Controls</Link>
          <div className="mr-4 h-6 border-l border-slate-200" />
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
                <div className="text-sm text-slate-500">Return to the comparison and confirm the added event activities before generating a draft.</div>
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
                          value={categorizations[frag.task_id]?.category || 'unassigned'}
                          onChange={e => setCategorizations({...categorizations, [frag.task_id]: { ...categorizations[frag.task_id], category: e.target.value, description: categorizations[frag.task_id]?.description || '' }})}>
                          {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cause Description / Narrative</label>
                        <input className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                          placeholder="e.g. RFI #045 approval delayed by 30 days affecting MEP submittal sequence..."
                          value={categorizations[frag.task_id]?.description || ''}
                          onChange={e => setCategorizations({...categorizations, [frag.task_id]: { ...categorizations[frag.task_id], category: categorizations[frag.task_id]?.category || 'unassigned', description: e.target.value }})} />
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
