'use client'

import { useEffect, useState } from 'react'
import { getActiveProject, getActiveVersion } from '@/lib/projectStore'
import { reportNumber } from '@/lib/reports'
import { buildRiskItems } from '@/lib/reportData'
import RiskRegisterReport from '@/components/reports/RiskRegisterReport'
import ReportPageFrame from '@/components/reports/ReportPageFrame'

export default function RiskRegisterPage() {
  const [project,setProject]=useState<any>(null); const [version,setVersion]=useState<any>(null); const [ready,setReady]=useState(false)
  useEffect(()=>{ const p=getActiveProject(); setProject(p); setVersion(getActiveVersion(p)); setReady(true) },[])
  if(!ready) return <ReportPageFrame><div className="text-sm text-slate-500">Loading report…</div></ReportPageFrame>
  const a=version?.analysis
  if(!project||!version||!a) return <ReportPageFrame><Missing/></ReportPageFrame>
  return <ReportPageFrame><RiskRegisterReport orgName={(project as any).company||''} reportNo={reportNumber(project.projectId||project.name,'RISK')} versionLabel={version.versionLabel||version.fileName||'Active version'} project={project} dataDate={a.dataDate||version.dataDate} risks={buildRiskItems(a)} /></ReportPageFrame>
}
function Missing(){return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No active schedule analysis is available for the selected project/version.</div>}
