'use client'
import { useEffect,useState } from 'react'
import { getActiveProject,getActiveVersion,getVersionEffectiveDate } from '@/lib/projectStore'
import { reportNumber } from '@/lib/reports'
import { projectedEnd,workCompletePct,daysBetween } from '@/lib/reportData'
import TrendReport from '@/components/reports/TrendReport'
import ReportPageFrame from '@/components/reports/ReportPageFrame'
export default function TrendReportPage(){
 const [project,setProject]=useState<any>(null),[version,setVersion]=useState<any>(null),[ready,setReady]=useState(false)
 useEffect(()=>{const p=getActiveProject();setProject(p);setVersion(getActiveVersion(p));setReady(true)},[])
 if(!ready)return <ReportPageFrame><div className="text-sm text-slate-500">Loading report…</div></ReportPageFrame>
 if(!project||!version)return <ReportPageFrame><Missing/></ReportPageFrame>
 const versions=[...(project.versions||[])].filter((v:any)=>!v.deletedAt&&v.analysis).sort((x:any,y:any)=>new Date(getVersionEffectiveDate(x)).getTime()-new Date(getVersionEffectiveDate(y)).getTime())
 const points=versions.map((v:any)=>{const a=v.analysis||{};return {versionLabel:v.versionLabel||v.fileName||'Version',dataDate:a.dataDate||v.dataDate||v.uploadedAt,projectedEnd:projectedEnd(a),healthScore:Number(a.healthScore||0),workCompletePct:workCompletePct(a),daysBehind:Number(a.delayDays||0),negativeFloat:Number(a.negativeFloat||0),oosCount:Array.isArray(a.outOfSequence)?a.outOfSequence.length:0,criticalDriversCount:Array.isArray(a.criticalDrivers)?a.criticalDrivers.length:0,longLeadAtRisk:Number(a.longLeadAtRisk??0),totalActivities:Number(a.totalActivities||0)}})
 const span=points.length>1?Math.max(0,daysBetween(points[0].dataDate,points[points.length-1].dataDate)):0
 return <ReportPageFrame><TrendReport orgName={(project as any).company||''} reportNo={reportNumber(project.projectId||project.name,'TREND')} versionLabel={version.versionLabel||version.fileName||'Active version'} project={project} points={points} spanDays={span}/></ReportPageFrame>
}
function Missing(){return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No active project/version is selected.</div>}
