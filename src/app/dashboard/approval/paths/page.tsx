'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import PhaseMilestoneReview from '@/components/PhaseMilestoneReview'
import {getActiveProject,getActiveVersion,loadVersionAnalysis,subscribeToProjects} from '@/lib/projectStore'

export default function PhaseMilestoneReviewPage(){
 const [state,setState]=useState<any>({project:null,version:null,loading:true,error:''})
 useEffect(()=>{
  let alive=true;const pending=new Set<string>()
  const refresh=()=>{
   const project=getActiveProject(),version=getActiveVersion(project)
   if(!alive)return
   setState({project,version,loading:Boolean(version&&!version.analysis?.traceTasks&&['summary','loading',undefined].includes(version.analysisState)),error:version?.analysisError||''})
   if(version&&!version.analysis?.traceTasks&&!pending.has(version.id)&&!['error','unavailable'].includes(version.analysisState||'')){
    pending.add(version.id)
    void loadVersionAnalysis(version.id).then(()=>{if(alive)refresh()}).catch(()=>{if(alive)setState((s:any)=>({...s,loading:false,error:'Could not load the saved schedule network.'}))})
   }
  }
  refresh();const unsub=subscribeToProjects(refresh);return()=>{alive=false;unsub()}
 },[])
 const {project,version,loading,error}=state
 return <main className="p-5 max-w-[1700px] mx-auto"><div className="flex flex-wrap gap-4 mb-4 text-sm"><Link className="text-blue-700" href="/dashboard/approval">Review Version</Link><span>Phase and milestone paths</span><Link className="text-blue-700" href="/dashboard/reports/logic-trace">Open full tracing</Link></div>{loading?<p>Loading schedule network…</p>:!project||!version?<p>Select a project and schedule version.</p>:error?<p role="alert">{error}</p>:<PhaseMilestoneReview key={project.id+':'+version.id} analysis={version.analysis} contractMilestones={project.contractDates?.contractMilestones} storageKey={'cpmr:milestone-review:v1:'+project.id+':'+version.id} label={project.projectId||project.name} source={version.fileName}/>}</main>
}
