'use client'
import { useEffect,useState } from 'react'
import { getActiveProject,getActiveVersion } from '@/lib/projectStore'
import { reportNumber } from '@/lib/reports'
import { daysBetween,projectedEnd } from '@/lib/reportData'
import TIAReport from '@/components/reports/TIAReport'
import ReportPageFrame from '@/components/reports/ReportPageFrame'
export default function TIAReportPage(){
 const [project,setProject]=useState<any>(null),[version,setVersion]=useState<any>(null),[ready,setReady]=useState(false)
 useEffect(()=>{const p=getActiveProject();setProject(p);setVersion(getActiveVersion(p));setReady(true)},[])
 if(!ready)return <ReportPageFrame><div className="text-sm text-slate-500">Loading report…</div></ReportPageFrame>
 const a=version?.analysis
 if(!project||!version||!a)return <ReportPageFrame><Missing/></ReportPageFrame>
 const ntp=project.contractDates?.ntp||a.projectStartDate; const original=project.contractDates?.originalContractCompletion||a.contractEnd
 const revised=version.versionDates?.revisedContractCompletion||original; const forecast=projectedEnd(a)
 const behindRevised=revised&&forecast?Math.max(0,daysBetween(revised,forecast)):Math.max(0,Number(a.delayDays||0)); const behindOriginal=original&&forecast?Math.max(0,daysBetween(original,forecast)):behindRevised
 return <ReportPageFrame><TIAReport orgName={(project as any).company||''} reportNo={reportNumber(project.projectId||project.name,'TIA')} versionLabel={version.versionLabel||version.fileName||'Active version'} project={project} ntp={ntp} originalCompletion={original} revisedCompletion={revised} timeExtensionDays={Number(version.versionDates?.timeExtensionDays||0)} dataDate={a.dataDate||version.dataDate} projectedEnd={forecast} daysBehindRevised={behindRevised} daysBehindOriginal={behindOriginal} criticalDrivers={Array.isArray(a.criticalDrivers)?a.criticalDrivers.slice(0,10):[]} criticalDriversTotal={Array.isArray(a.criticalDrivers)?a.criticalDrivers.length:0} oosCount={Array.isArray(a.outOfSequence)?a.outOfSequence.length:0} noTiesCount={Array.isArray(a.noTies)?a.noTies.length:0} longLeadAtRisk={Number(a.longLeadAtRisk??0)} negativeFloatCount={Number(a.negativeFloat||0)}/></ReportPageFrame>
}
function Missing(){return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No active schedule analysis is available for the selected project/version.</div>}
