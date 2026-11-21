import {cloudId} from './controlWorkflow'
import {createClient} from './supabase/client'
import {compareScheduleVersions} from './versionBrowser'
export type ReferenceKind='baseline'|'update'
export function referenceCandidates(versions:any[],reviews:any[],kind:ReferenceKind){
 return versions.filter(v=>!v.deletedAt&&!v.archivedAt).filter(v=>{
  let id='';try{id=cloudId(v.id)}catch{return false}
  const disposition=reviews.find(r=>r.version_id===id)?.disposition
  return kind==='baseline'?['baseline','rebaseline'].includes(v.scheduleType)&&disposition==='APPROVED':v.scheduleType==='update'&&['APPROVED','ACCEPTED_WITH_COMMENTS'].includes(disposition)
 }).slice().sort(compareScheduleVersions)
}
export async function assignScheduleReference(projectId:string,versionId:string,kind:ReferenceKind,reason:string,revision:number){
 if(reason.trim().length<5)throw Error('Enter an approval letter or authority reference (at least 5 characters).')
 if(!Number.isInteger(revision)||revision<0)throw Error('Reload the control references before assigning.')
 const {data,error}=await createClient().rpc('cpmr_workflow_action',{p_project:cloudId(projectId),p_version:cloudId(versionId),p_action:kind==='baseline'?'assign_baseline':'assign_update',p_reason:reason.trim(),p_expected:revision})
 if(error)throw Error(error.message)
 if(data?.saved!==true)throw Error('The assignment could not be verified. Reload the references before retrying.')
 return data
}
