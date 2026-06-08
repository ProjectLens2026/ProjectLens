'use client'

// =============================================================================
// src/app/dashboard/reports/oos/page.tsx
// =============================================================================
// Out-of-Sequence Report page wrapper.
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getActiveProject, getActiveVersion,
  Project, ScheduleVersion,
} from '@/lib/projectStore'
import { createClient } from '@/lib/supabase/client'
import { reportNumber } from '@/lib/reports'
import OOSReport from '@/components/reports/OOSReport'

export default function OOSReportPage() {
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
          <div className="text-sm text-slate-500 mb-4">Pick a project from the sidebar to generate the OOS Report.</div>
          <Link href="/dashboard" className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg">Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  const a: any = version.analysis || {}
  const oos = Array.isArray(a.outOfSequence) ? a.outOfSequence : []
  const totalActivities = num(a.totalActivities, 0)
  const dataDate = version.versionDates?.manualDataDate || a.dataDate || version.dataDate || version.uploadedAt

  const projectCode = project.projectId || project.name
  const reportNo = reportNumber(projectCode, 'OOS')
  const versionLabel = version.versionLabel || version.fileName || 'v1 · working draft'

  return (
    <div className="p-6 max-w-[920px] mx-auto h-full overflow-y-auto">
      <Link href="/dashboard/reports" className="text-[12px] text-slate-500 hover:text-slate-800 print:hidden">‹ Reports</Link>
      <div className="mt-3">
        <OOSReport
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
          dataDate={dataDate}
          oos={oos}
          totalActivities={totalActivities}
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
