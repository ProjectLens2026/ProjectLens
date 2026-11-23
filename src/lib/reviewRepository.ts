import type {ReportCheck} from './reportChecks'
import {newReportBlock,newReportSection,sectionBlocks,type ReportDraft} from './schedulerReport'
import {plainRich} from './reportRichText'
export const REPOSITORY_SECTIONS=['Executive summary','Key comments','Critical path','Milestones','Logic','Float','Constraints','Durations','Calendars','Progress','Resources','Procurement','Commissioning','Risks','Recommendations']
export type ReviewRecord={status:'new'|'reviewed'|'dismissed';reason:string;comment:string}
export type RepositoryState={records:Record<string,ReviewRecord>}
export type Finding={id:string;key:string;section:string;title:string;comment:string;basis:string;rows:any[];priority:'Attention'|'Review';count:number;kind:string}
const rules:Record<string,[string,string]>={
 outOfSequence:['Logic','Review the recorded out-of-sequence work and confirm how remaining relationships are being scheduled.'],
 unknownStatus:['Progress','Reconcile unrecognized activity status codes.'],
 milestoneInventory:['Milestones','Confirm which recorded milestones are contractual and check their scope, constraints and acceptance requirements. A milestone record alone does not establish its driving path.'],
 logic:['Logic','Confirm legitimate project endpoints and connect remaining open ends to the appropriate work.'],
 external:['Logic','Confirm the external dependencies and whether their source projects are included in this review.'],
 'check-positiveLag':['Logic','Identify the work or approved waiting period represented by the positive lags. Replace lags with activities where measurable work is missing.'],
 'check-negativeLag':['Logic','Explain the negative lags and confirm whether the intended sequence can be represented by explicit activities.'],
 SF:['Logic','Confirm the technical basis for the start-to-finish relationships.'],
 unknownRelationship:['Logic','Correct or explain the unrecognized relationship types.'],
 missingLag:['Logic','Confirm the missing relationship lag values before evaluating the network.'],
 hardCheck:['Constraints','Provide the approved basis for mandatory constraints and confirm their effect on the forecast.'],
 softCheck:['Constraints','Confirm the contractual or technical basis of each constraint and its milestone mapping.'],
 negativeFloat:['Float','Identify the dates causing negative float and the work required to recover them.'],
 largeFloat:['Float','Review the activities with high float for missing successors or incomplete turnover logic.'],
 longDuration:['Durations','Explain the long remaining durations and whether the work can be measured in smaller activities.'],
 originalDuration:['Durations','Confirm the basis for original durations above the selected threshold; distinguish construction work from procurement and design.'],
 missingCalendar:['Calendars','Assign or confirm the calendar for each affected activity.'],
 'check-actualAfter':['Progress','Reconcile actual dates recorded after the source data date.'],
 invalidBefore:['Progress','Reconcile incomplete work forecast before the source data date.'],
 baselineProgress:['Progress','Confirm whether the submitted baseline is a statused or reconstructed baseline and explain its actual dates.'],
 missedStart:['Progress','Explain the missed planned starts and their effect on upcoming milestones.'],
 missedFinish:['Progress','Explain the missed planned finishes and provide the remaining work and recovery actions.'],
 durationChanged:['Durations','Explain original-duration changes against the selected comparison XER.'],
 'changed-remain_drtn_hr_cnt':['Durations','Confirm the basis for changes in remaining durations.'],
 'changed-clndr_id':['Calendars','Explain the changed calendar assignments and any forecast impact.'],
 'changed-cstr_type':['Constraints','Explain the changed primary constraint types.'],
 'changed-cstr_date':['Constraints','Provide the approved basis for changed constraint dates.'],
 logicAdded:['Logic','Explain the added or changed relationships and their effect on sequencing.'],
 logicRemoved:['Logic','Explain the removed or changed relationships and confirm the remaining network is complete.'],
 added:['Key comments','Explain the added activities and identify whether they represent new scope or schedule detail.'],
 deleted:['Key comments','Explain activities absent from this update and confirm how their scope is now represented.'],
 'duplicate-task_code':['Key comments','Resolve repeated activity IDs before matching activities across versions.'],
 'duplicate-task_name':['Key comments','Confirm whether repeated descriptions represent distinct scope; clarify naming where needed.'],
 sourceLongestPath:['Critical path','Review the P6-reported project longest-path activities. These flags alone do not establish a separate driving path for each milestone.']}
function fingerprint(s:string){let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return (n>>>0).toString(16)}
export function repositoryFindings(checks:ReportCheck[],type:string,analysis?:any):Finding[]{
 const milestones=(Object.values(analysis?.traceTasks||{}) as any[]).filter(t=>['TT_Mile','TT_FinMile'].includes(t.task_type));
 const source=milestones.length?[...checks,{id:'milestoneInventory',label:'Recorded start and finish milestones',count:milestones.length,population:milestones.length,actual:milestones.length,rule:{include:false,op:'none' as const,target:'',unit:'count' as const,basis:'Source inventory; reviewer confirmation required'},result:'Information',basis:'XER activity type; includes constrained and unconstrained milestones',rows:milestones,kind:'activity'}]:checks;
 return source.flatMap(c=>{
 const rule=rules[c.id];if(!rule||c.count===null||c.count<=0||c.custom)return [];
 const signature=JSON.stringify([type,c.id,c.count,c.basis,[c.rule.op,c.rule.target,c.rule.unit,c.rule.basis],c.rows]);
 return [{id:c.id,key:c.id+':'+fingerprint(signature),section:rule[0],title:c.label,comment:`${c.label}: ${c.count} affected ${c.kind==='relationship'?'relationships':'records'}. ${rule[1]}`,basis:c.basis+' Target basis: '+c.rule.basis,rows:c.rows,count:c.count,kind:c.kind,priority:(['negativeFloat','hardCheck','invalidBefore','check-actualAfter','duplicate-task_code'].includes(c.id)?'Attention':'Review') as Finding['priority']}]
 }).sort((a,b)=>Number(b.priority==='Attention')-Number(a.priority==='Attention')||a.title.localeCompare(b.title))}
export function findingAdded(d:ReportDraft,key:string){return d.sections.some(s=>sectionBlocks(s).some(b=>b.repositoryRef===key))}
export function addFindings(d:ReportDraft,findings:Finding[],destination:string,source:string):ReportDraft{
 const sections=d.sections.map(s=>({...s,blocks:[...sectionBlocks(s)]}));
 for(const f of findings){if(findingAdded({...d,sections},f.key))continue;const title=destination||f.section;let s=sections.find(x=>x.title.toLowerCase()===title.toLowerCase());if(!s){if(sections.length>=100)throw Error('Report section limit reached.');s=newReportSection(title) as typeof sections[number];sections.push(s)}if(s.blocks.length>=200)throw Error('Subtitle limit reached for '+title);
 const content=d.repository?.records[f.key]?.comment??f.comment;const b=newReportBlock(f.title);b.repositoryRef=f.key;b.comments=content+'\n\nSource: '+source+'\nReview basis: '+f.basis;b.richComments=plainRich(b.comments);s.blocks.push(b);
 }return {...d,sections};
}
