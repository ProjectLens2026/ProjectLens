'use client'
import { useEffect,useState } from 'react'
import { getActiveProject,getActiveVersion } from '@/lib/projectStore'
import { evmCumulative,fmtDollars,fmtRatio } from '@/lib/evm'
import { reportNumber } from '@/lib/reports'
import EVMReport from '@/components/reports/EVMReport'
import ReportPageFrame from '@/components/reports/ReportPageFrame'
export default function EVMReportPage(){
 const [project,setProject]=useState<any>(null),[version,setVersion]=useState<any>(null),[ready,setReady]=useState(false)
 useEffect(()=>{const p=getActiveProject();setProject(p);setVersion(getActiveVersion(p));setReady(true)},[])
 if(!ready)return <ReportPageFrame><div className="text-sm text-slate-500">Loading report…</div></ReportPageFrame>
 if(!project||!version)return <ReportPageFrame><Missing/></ReportPageFrame>
 const evm=project.evm||{}; const months=Array.isArray(evm.months)?evm.months:[]; const cutoff=(version.analysis?.dataDate||version.dataDate||'').slice(0,7)||undefined
 const cumulative=evmCumulative(Number(evm.totalBudget||0),months,cutoff)
 return <ReportPageFrame><EVMReport orgName={(project as any).company||''} reportNo={reportNumber(project.projectId||project.name,'EVM')} versionLabel={version.versionLabel||version.fileName||'Active version'} project={project} totalBudget={Number(evm.totalBudget||0)} currency={evm.currency||'USD'} distributionMode={evm.distributionMode} months={months} cumulative={cumulative} fmtDollars={fmtDollars} fmtRatio={fmtRatio}/></ReportPageFrame>
}
function Missing(){return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No active project/version is selected.</div>}
