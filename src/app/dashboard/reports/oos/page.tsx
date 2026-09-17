'use client'
import { useEffect,useState } from 'react'
import { getActiveProject,getActiveVersion } from '@/lib/projectStore'
import { reportNumber } from '@/lib/reports'
import OOSReport from '@/components/reports/OOSReport'
import ReportPageFrame from '@/components/reports/ReportPageFrame'
export default function OOSPage(){
 const [project,setProject]=useState<any>(null),[version,setVersion]=useState<any>(null),[ready,setReady]=useState(false)
 useEffect(()=>{const p=getActiveProject();setProject(p);setVersion(getActiveVersion(p));setReady(true)},[])
 if(!ready)return <ReportPageFrame><div className="text-sm text-slate-500">Loading report…</div></ReportPageFrame>
 const a=version?.analysis
 if(!project||!version||!a)return <ReportPageFrame><Missing/></ReportPageFrame>
 return <ReportPageFrame><OOSReport orgName={(project as any).company||''} reportNo={reportNumber(project.projectId||project.name,'OOS')} versionLabel={version.versionLabel||version.fileName||'Active version'} project={project} dataDate={a.dataDate||version.dataDate} oos={Array.isArray(a.outOfSequence)?a.outOfSequence:[]} totalActivities={Number(a.totalActivities||0)} /></ReportPageFrame>
}
function Missing(){return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No active schedule analysis is available for the selected project/version.</div>}
