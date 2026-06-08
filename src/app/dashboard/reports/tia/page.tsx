'use client'

// =============================================================================
// src/app/dashboard/reports/tia/page.tsx
// =============================================================================
// TIA Report page wrapper. Computes baseline vs current schedule comparison
// from contract dates + version analysis. Defensive against missing fields.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getActiveProject, getActiveVersion, addCalendarDays,
  Project, ScheduleVersion,
} from '@/lib/projectStore'
import { createClient } from '@/lib/supabase/client'
import { reportNumber } from '@/lib/reports'
import TIAReport from '@/components/reports/TIAReport'

export default function TIAReportPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [version, setVersion] = useState<ScheduleVersion | null>(null)
  const [orgName, setOrgName] = useState<string>('—')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    setVersion(p ? getActiveVersion(p) : null)
    setReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadOrg() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: members } = await supabase
          .from('organization_members')
          .select('org_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
        if (!members || members.length === 0) return
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', members[0].org_id)
          .single()
        if (!cancelled && org?.name) setOrgName(org.name)
      } catch {}
    }
    loadOrg()
    return () => { cancelled = true }
  }, [])

  if (!ready) {
    return <div className="p-6 text-sm text-slate-500">Loading report…</div>
  }
  if (!project || !version) {
    return (
      <div className="p-6 max-w-[760px] mx-auto">
        <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">‹ Reports</Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center mt-4">
          <div className="text-3xl mb-3">📄</div>
          <div className="text-lg font-bold text-slate-700 mb-2">No project loaded</div>
          <div className="text-sm text-slate-500 mb-4">Pick a project from the sidebar to generate the TIA Report.</div>
          <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  const a: any = version.analysis || {}

  // Dates flow (same as Dashboard / Executive / Complete Report)
  const manualNtp = project.contractDates?.ntp || undefined
  const manualOriginal = project.contractDates?.originalContractCompletion || undefined
  const timeExtensionDays = version.versionDates?.timeExtensionDays ?? 0
  const manualRevised = version.versionDates?.revisedContractCompletion || undefined
  const manualDataDate = version.versionDates?.manualDataDate || undefined
  const revisedCompletion = manualRevised || (manualOriginal ? addCalendarDays(manualOriginal, timeExtensionDays) : undefined)

  const dataDate = manualDataDate || a.dataDate || version.dataDate || version.uploadedAt
  const ntp = manualNtp || a.projectStartDate || dataDate
  const originalCompletion = manualOriginal || a.contractEnd || a.contractFinish
  const projectedEnd = a.projectedEnd || a.forecastFinish || originalCompletion

  // Variances
  let daysBehindRevised = 0
  if (revisedCompletion && projectedEnd) {
    const cd = new Date(revisedCompletion), pd = new Date(projectedEnd)
    if (!isNaN(cd.getTime()) && !isNaN(pd.getTime())) {
      const cu = Date.UTC(cd.getFullYear(), cd.getMonth(), cd.getDate())
      const pu = Date.UTC(pd.getFullYear(), pd.getMonth(), pd.getDate())
      daysBehindRevised = Math.round((pu - cu) / 86_400_000)
    }
  }
  let daysBehindOriginal = 0
  if (originalCompletion && projectedEnd) {
    const cd = new Date(originalCompletion), pd = new Date(projectedEnd)
    if (!isNaN(cd.getTime()) && !isNaN(pd.getTime())) {
      const cu = Date.UTC(cd.getFullYear(), cd.getMonth(), cd.getDate())
      const pu = Date.UTC(pd.getFullYear(), pd.getMonth(), pd.getDate())
      daysBehindOriginal = Math.round((pu - cu) / 86_400_000)
    }
  }

  // Drivers + evidence
  const criticalDrivers = arr(a.criticalDrivers)
  const oosCount = arr(a.outOfSequence).length
  const noTiesCount = arr(a.noTies).length
  const negativeFloat = num(a.negativeFloat, 0)
  const longLeadAtRisk = num(a.longLeadAtRisk, 0)

  const projectCode = project.projectId || project.name
  const reportNo = reportNumber(projectCode, 'TIA')
  const versionLabel = version.versionLabel || version.fileName || 'v1 · working draft'

  return (
    <div className="p-6 max-w-[920px] mx-auto h-full overflow-y-auto">
      <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">‹ Reports</Link>
      <div className="mt-3">
        <TIAReport
          orgName={orgName}
          reportNo={reportNo}
          versionLabel={versionLabel}
          project={{
            name: project.name,
            projectId: project.projectId,
            project_code: (project as any).project_code,
            owner: (project as any).owner,
            location: (project as any).location,
          }}
          ntp={ntp}
          originalCompletion={originalCompletion}
          revisedCompletion={revisedCompletion}
          timeExtensionDays={timeExtensionDays}
          dataDate={dataDate}
          projectedEnd={projectedEnd}
          daysBehindRevised={daysBehindRevised}
          daysBehindOriginal={daysBehindOriginal}
          criticalDrivers={criticalDrivers.slice(0, 10)}
          criticalDriversTotal={criticalDrivers.length}
          oosCount={oosCount}
          noTiesCount={noTiesCount}
          longLeadAtRisk={longLeadAtRisk}
          negativeFloatCount={negativeFloat}
        />
      </div>
    </div>
  )
}

function num(v: any, def: number): number {
  if (v === null || v === undefined || v === '') return def
  const n = Number(v)
  return isNaN(n) ? def : n
}
function arr<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : []
}
