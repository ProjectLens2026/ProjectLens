import { exploreActivity, displayActivityDates } from './activityNetwork'

export type ReviewTask = Record<string, any> & {task_id: string; task_code?: string; task_name?: string}
export type ReviewLink = Record<string, any> & {task_id: string; pred_task_id: string}
export type PhaseTarget = {id:string; taskId?:string; name:string; code:string; phase:string; family:string; kind:'milestone'|'activity'|'unmapped'; constraint:boolean; assignmentNote?:string}
export type PathComment = {id:string; title:string; text:string; classification:'Clarification required'|'Required correction'; activityIds:string[]; sourceLabel?:string}
export type ReviewIndex = {tasks:Record<string,ReviewTask>; links:ReviewLink[]; targets:PhaseTarget[]; phases:string[]; predecessors:Record<string,ReviewLink[]>}
export const UNASSIGNED='Shared / unassigned'
export const LEVEL_GUIDE=[['L0','Design review'],['L1','Submittal review and factory testing'],['L2','Installation checks, pre-startup tests and verification'],['L3','Equipment startup and energization'],['L4','Functional performance testing'],['L5','Integrated systems testing']]
const phaseSort=(a:string,b:string)=>a.localeCompare(b,undefined,{numeric:true})
const phaseTokens=(s:string)=>{
 const found=Array.from(s.matchAll(/(?:ROMP|PHASE|PH|POD)\s*[-_. ]?\s*0*(\d{1,3})(?!\d)/gi),m=>'Phase '+Number(m[1]))
 for(const m of Array.from(s.matchAll(/(?:ROMP|PHASE|PH|POD)\s*0*(\d{1,3})\s*[/&-]\s*0*(\d{1,3})(?!\d)/gi)))found.push('Phase '+Number(m[1]),'Phase '+Number(m[2]))
 return Array.from(new Set(found))
}
export function taskPhase(t:ReviewTask):{phase:string;note?:string} {
 const code=phaseTokens(t.task_code||''),name=phaseTokens(t.task_name||'')
 if(code.length===1){const disagree=name.some(n=>n!==code[0]);return {phase:code[0],note:disagree?'Activity code and name reference different phases; confirm assignment.':undefined}}
 if(code.length>1||name.length>1)return {phase:UNASSIGNED,note:'Multiple phase references; assign the milestone scope.'}
 if(name.length===1)return {phase:name[0]}
 const path=Array.isArray(t.wbs_path)?[...t.wbs_path].reverse():[t.wbs_name||'']
 for(const p of path){const found=phaseTokens(String(p));if(found.length===1)return {phase:found[0]};if(found.length>1)break}
 return {phase:UNASSIGNED}
}
export function targetFamily(t:ReviewTask):string {
 const s=`${t.task_code||''} ${t.task_name||''}`.toUpperCase()
 if(/\bNEA\s*READY\b|[-.]NEAR\d*/.test(s))return 'NEA Ready'
 if(/(?:^|[^A-Z])H2C(?:[^A-Z]|$)/.test(s))return 'H2C'
 if(/(?:^|[^A-Z])PFHO(?:[^A-Z]|$)/.test(s))return 'PFHO'
 if(/(?:^|[^A-Z])NEA(?:[^A-Z]|$)|NETWORK EARLY ACCESS/.test(s))return 'NEA'
 if(/SUBSTANTIAL COMPLETION|[-.]SC(?:[^A-Z0-9]|$)/.test(s))return 'SC'
 if(/ENERGIZ|PERMANENT POWER|UTILITY POWER/.test(s))return 'Energization / power'
 if(/TEST AND BALANCE|TESTING.*BALANC|(?:^|[^A-Z])TAB(?:[^A-Z]|$)/.test(s))return 'TAB'
 return 'Other'
}
export function buildReviewIndex(analysis:any,contractMilestones:any[]=[],assignments:Record<string,string>={}):ReviewIndex {
 const tasks:Record<string,ReviewTask>=analysis?.traceTasks||{},links:ReviewLink[]=analysis?.traceRelationships||[]
 const targets:PhaseTarget[]=[],predecessors:Record<string,ReviewLink[]>={}
 for(const r of links)(predecessors[r.task_id]||=[]).push(r)
 for(const t of Object.values(tasks)){
  const milestone=['TT_Mile','TT_StartMile','TT_FinMile'].includes(t.task_type)
  const family=targetFamily(t)
  const p=taskPhase(t)
  targets.push({id:t.task_id,taskId:t.task_id,name:t.task_name||t.task_code||t.task_id,code:t.task_code||t.task_id,phase:assignments[t.task_id]||p.phase,family,kind:milestone?'milestone':'activity',constraint:Boolean(t.cstr_type||t.cstr_type2),assignmentNote:p.note})
 }
 for(const m of contractMilestones){
  const mapped=m.mappedActivityCode&&Object.values(tasks).find(t=>t.task_code===m.mappedActivityCode)
  if(mapped){
   const existing=targets.find(t=>t.taskId===mapped.task_id)
   const rawPhase=assignments[mapped.task_id]||m.phaseOrArea||taskPhase(mapped).phase
   const phase=phaseTokens(rawPhase).length===1?phaseTokens(rawPhase)[0]:rawPhase
   if(existing){existing.phase=phase;existing.kind='milestone';continue}
   targets.push({id:mapped.task_id,taskId:mapped.task_id,code:mapped.task_code||mapped.task_id,name:mapped.task_name||m.name,phase,family:targetFamily(mapped),kind:'milestone',constraint:Boolean(mapped.cstr_type||mapped.cstr_type2)})
  } else {
   const id='contract:'+(m.id||m.mappedActivityCode||m.name)
   targets.push({id,name:m.name||m.acronym||'Contract milestone',code:m.mappedActivityCode||'Not mapped',phase:assignments[id]||m.phaseOrArea||UNASSIGNED,family:m.acronym||'Other',kind:'unmapped',constraint:false,assignmentNote:'Contract milestone has no confirmed source activity mapping.'})
  }
 }
 targets.sort((a,b)=>phaseSort(a.phase,b.phase)||a.name.localeCompare(b.name))
 return {tasks,links,targets,phases:Array.from(new Set(targets.map(t=>t.phase))).sort(phaseSort),predecessors}
}
export function filterTargets(index:ReviewIndex,phases:string[],families:string[],constraint:'all'|'with'|'without'='all',includeActivities=false,query=''):PhaseTarget[]{
 const q=query.toLowerCase().trim()
 return index.targets.filter(t=>(!phases.length||phases.includes(t.phase))&&(!families.length||families.includes(t.family))&&(constraint==='all'||(t.kind!=='unmapped'&&(constraint==='with'?t.constraint:!t.constraint)))&&(includeActivities||t.kind!=='activity')&&(!q||`${t.code} ${t.name}`.toLowerCase().includes(q)))
}
export function backwardReview(index:ReviewIndex,target:PhaseTarget){
 const root=target.taskId||''
 const graph=exploreActivity(root,index.tasks,index.links,'pred',0)
 const direct=index.predecessors[root]||[]
 const sourceDriving=direct.filter(r=>['Y','TRUE','1'].includes(String(r.driving_flag??r.driving_path_flag??'').toUpperCase()))
 const reported=graph.tasks.filter(t=>t.driving_path_flag==='Y')
 return {...graph,direct,sourceDriving,reported,target}
}
const key=(t:ReviewTask)=>t.task_code||t.task_id
const isStage=(t:ReviewTask,n:number)=>new RegExp(`(?:^|[^A-Z0-9])(?:L${n}|LEVEL\\s*${n})(?=[^A-Z0-9]|$)`,'i').test(t.task_name||'')
export function commentsForTarget(index:ReviewIndex,target:PhaseTarget):PathComment[]{
 const out:PathComment[]=[]
 const add=(id:string,title:string,text:string,ids:string[]=[],classification:PathComment['classification']='Clarification required')=>out.push({id:target.id+':'+id,title,text,activityIds:ids,classification})
 if(!target.taskId){add('mapping','Map the contractual milestone','This contractual milestone has no confirmed XER activity mapping. Assign its activity and phase before tracing its path.');return out}
 const graph=backwardReview(index,target),root=index.tasks[target.taskId]
 if(root.status_code==='TK_Complete')return out
 const connected=graph.tasks as ReviewTask[],open=connected.filter(t=>t.status_code!=='TK_Complete')
 const d=graph.direct,parents=d.map(r=>index.tasks[r.pred_task_id]).filter(Boolean)
 if(!d.length)add('no-incoming','Milestone path is not shown',`${target.code} has no recorded predecessor. Show the required work and acceptance links supporting this target.`,[target.taskId])
 const lags=d.filter(r=>r.pred_type==='PR_FS'&&Number(r.lag_hr_cnt)>0)
 if(lags.length)add('lags','Explain milestone waiting periods',`${target.code} receives positive FS lag from ${lags.map(r=>key(index.tasks[r.pred_task_id]||{task_id:r.pred_task_id})).join(', ')}. Identify the work or approved restriction covered by these waits, or replace them with activities.`,lags.map(r=>r.pred_task_id))
 const crossed=parents.filter(t=>{const p=taskPhase(t).phase;return p!==UNASSIGNED&&p!==target.phase})
 if(crossed.length)add('shared','Confirm cross-phase dependencies',`${crossed.map(key).join(', ')} feeds ${target.code} from another phase. Identify the shared equipment, crew, test or contractual restriction that requires this link. Preserve valid shared dependencies.`,crossed.map(t=>t.task_id))
 const family=target.family
 if(family==='PFHO'){
  if(!connected.some(t=>/\bIST\b|INTEGRATED SYSTEMS? TEST/i.test(t.task_name||'')))add('ist','Clarify IST and turnover acceptance',`The path to ${target.code} does not explicitly name IST execution. ${connected.some(t=>/L4\s*\/\s*L5/i.test(t.task_name||''))?'A combined L4/L5 closeout activity is connected, but its name does not establish IST execution. ':''}Identify the activities covering applicable IST, corrections, retesting and acceptance, and their links to turnover.`,connected.filter(t=>isStage(t,4)||isStage(t,5)||/L4\s*\/\s*L5/i.test(t.task_name||'')).map(t=>t.task_id))
 }
 if(family==='H2C'){
  const tab=connected.filter(t=>targetFamily(t)==='TAB'&&taskPhase(t).phase===target.phase)
  if(!tab.length)add('tab','Locate phase TAB and approval',`No phase-specific TAB activity is identified on the path to ${target.code}. Confirm whether TAB is bundled or shared with another phase. Identify report review and acceptance and connect the required work.`,[target.taskId])
  add('power','Confirm required source-path acceptance',`Identify the equipment and source paths required for ${target.code}, including applicable normal/catcher distribution and transfer/control acceptance. Show their releases on this path. Broad L2/L3 names alone do not establish coverage; confirm project requirements before adding work.`,connected.filter(t=>isStage(t,2)||isStage(t,3)).map(t=>t.task_id))
 }
 if(family==='NEA')add('nea','Identify the accepted NEA power and readiness path',`Identify the accepted permanent-power arrangement, cooling/controls and network/checklist work supporting ${target.code}. Show when that arrangement is available. Do not treat completion of an entire L3 package as the only possible power-availability event.`,parents.map(t=>t.task_id))
 if(family==='Energization / power'||family==='H2C'){
  const nodeIds=new Set(connected.map(t=>t.task_id))
  const overlaps=graph.relationships.filter(r=>r.pred_type==='PR_FF'&&nodeIds.has(r.pred_task_id)&&isStage(index.tasks[r.pred_task_id],2)&&isStage(index.tasks[r.task_id],3))
  if(overlaps.length)add('release','Show the release for initial energization',`The connected path includes L2-to-L3 FF links. They constrain finish dates but do not release the start of energization. Identify required dead tests, protection settings and controls acceptance before the relevant first-energization step. Retain approved rolling work where appropriate.`,overlaps.flatMap(r=>[r.pred_task_id,r.task_id]))
 }
 const impacts=open.filter(t=>/\bRFI\s*[-#]?\s*\d|\bRMI\s*[-#]?\s*\d|OFCI|LONG.LEAD/i.test(`${t.task_code} ${t.task_name}`))
 if(impacts.length)add('holds','Check connected technical and supply restrictions',`Open items ${impacts.slice(0,8).map(key).join(', ')}${impacts.length>8?' and other connected items':''} occur upstream. Confirm which actually restrict this milestone now; ancestry alone does not establish a current driver.`,impacts.map(t=>t.task_id))
 if(graph.cycle)add('cycle','Resolve the cycle on this milestone path','The backward network contains a cycle. Correct or explain it before relying on the path order.',[], 'Required correction')
 if(graph.unresolved)add('external','Resolve external predecessor endpoints',`${graph.unresolved} upstream relationship endpoints are outside the saved task set. Identify their scope and dates before accepting path completeness.`)
 return out
}
// Associate existing review items only through confirmed activity references.
// A phase label or generic title alone is not evidence that a finding belongs to a path.
export function linkedReviewComments(index:ReviewIndex,target:PhaseTarget,findings:any[]=[],register:any[]=[],scopeTasks?:ReviewTask[]):PathComment[]{
 const tasks=scopeTasks||backwardReview(index,target).tasks,ids=new Set(tasks.map(t=>String(t.task_id))),codes=new Set(tasks.map(t=>t.task_code).filter(Boolean))
 const matches=(refs:any[])=>refs.some(a=>ids.has(String(a.activityId??a.id??''))||codes.has(a.activityCode??a.code)||codes.has(a.activityId??a.id))
 const validFindings=findings.filter(f=>matches(f.affectedActivities||[]))
 const validIds=new Set(validFindings.map(f=>f.id))
 const linked=register.filter(c=>!['VOID','WITHDRAWN'].includes(c.status)&&(matches(c.affectedActivities||[])||(c.sourceFindingIds||[]).some((id:string)=>validIds.has(id))))
 const covered=new Set(linked.flatMap(c=>c.sourceFindingIds||[]))
 return [
  ...linked.map(c=>({id:target.id+':register:'+c.id,title:c.title||c.commentNumber||'Review comment',text:[c.concern,c.requiredCorrection&&'Recommendation: '+c.requiredCorrection].filter(Boolean).join('\n\n'),classification:(c.classification==='REQUIRED'?'Required correction':'Clarification required') as PathComment['classification'],activityIds:(c.affectedActivities||[]).map((a:any)=>String(a.activityId||a.activityCode||'')),sourceLabel:`Register ${c.commentNumber||''} · ${c.status||'Status unavailable'} (report copy)`})),
  ...validFindings.filter(f=>!covered.has(f.id)).map(f=>({id:target.id+':finding:'+f.id,title:f.title||'Schedule review finding',text:[f.whatFound,f.whyItMatters,f.reviewerCheck&&'Recommendation: '+f.reviewerCheck].filter(Boolean).join('\n\n'),classification:(f.commentDisposition==='REQUIRED_CORRECTION'?'Required correction':'Clarification required') as PathComment['classification'],activityIds:(f.affectedActivities||[]).map((a:any)=>String(a.id||a.code||'')),sourceLabel:f.kind==='RECOMMENDATION'?'Existing review recommendation':'Existing review finding'}))
 ]
}
export function commentsForPhase(index:ReviewIndex,phase:string,findings:any[]=[],register:any[]=[]):PathComment[]{
 const target:PhaseTarget={id:'phase:'+phase,phase,name:phase,code:phase,family:'Other',kind:'unmapped',constraint:false}
 const scope=index.targets.filter(t=>t.phase===phase&&t.taskId).map(t=>index.tasks[t.taskId!])
 return linkedReviewComments(index,target,findings,register,scope)
}
export const reviewCommentSourceKey=(c:PathComment)=>c.id.includes(':register:')?'register:'+c.id.split(':register:')[1]:c.id.includes(':finding:')?'finding:'+c.id.split(':finding:')[1]:c.id
export function commentsForReview(index:ReviewIndex,target:PhaseTarget,findings:any[]=[],register:any[]=[]):PathComment[]{return [...linkedReviewComments(index,target,findings,register),...commentsForTarget(index,target)]}
export function escapeReviewHtml(s:unknown):string{return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
export function reportModel(index:ReviewIndex,selected:string[],excludedComments:string[]=[],edits:Record<string,string>={},findings:any[]=[],register:any[]=[]){
 const wanted=new Set(selected),excluded=new Set(excludedComments)
 return index.targets.filter(t=>wanted.has(t.id)).map(target=>({target,graph:backwardReview(index,target),comments:commentsForReview(index,target,findings,register).filter(c=>!excluded.has(c.id)).map(c=>({...c,text:edits[c.id]??c.text}))}))
}
export function reviewTaskDate(t:ReviewTask){return displayActivityDates(t)}
