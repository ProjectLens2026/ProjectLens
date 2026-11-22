export type ReportSection={id:string;title:string;comments:string;include:boolean;path:boolean;phase:string;milestone:string;summary:string;summaryIncluded:boolean;imageIncluded:boolean;images:{id:string;data:string;caption:string}[];checks?:boolean}
export type ReportDraft={format:1;type:'baseline'|'update';meta:Record<string,string>;logo:string;sections:ReportSection[]}
export const BASELINE_SECTIONS=['Schedule Review Summary','Status Summary','Key Comments and Recommendations','Scope','WBS','Milestones','Critical Path','Calendars','Activities','DCMA-14','Health & Quality','Logic and Relationships','Lags / Leads','Constraints','Total Float','Original Duration','Other Checks','Prior Comments and Recommendations']
export const UPDATE_SECTIONS=['Schedule Review Summary','Status Summary','Key Comments and Recommendations','Milestones','Critical and Multiple Float Path Analysis','Schedule Health Check and DCMA14','Other Checks','Calendars','Constraints','Activities Riding Data Date','Failed to Start','Failed to Finish','Project Progress and Performance','Forensic Analysis','Activities / WBS Added or Deleted','Duration Changes','Relationship Changes','Prior Comments and Recommendations']
export const META_FIELDS:Record<string,string>={company:'Company',client:'Client',project:'Project name',projectId:'Project ID',address:'Project address',contractor:'Contractor',scheduler:'Prepared by / scheduler',manager:'Project manager',reviewer:'Reviewer',title:'Report title',issued:'Report date',revision:'Revision',status:'Report status',comparison:'Comparison version / data date'}
export const newReportSection=(title:string,path=false):ReportSection=>({id:crypto.randomUUID(),title,comments:'',include:true,path:path||/Critical Path|Float Path/.test(title),phase:'',milestone:'',summary:'',summaryIncluded:true,imageIncluded:true,images:[]})
export function initialReport(project:any,version:any):ReportDraft{return {format:1,type:['baseline','rebaseline'].includes(version.scheduleType)?'baseline':'update',logo:'',meta:{company:'',project:project.name||'',projectId:project.projectId||'',title:'Schedule Review Report',issued:new Date().toLocaleDateString('en-CA'),revision:'01',status:'Draft'},sections:[newReportSection('Status Summary'),newReportSection('Key Comments and Recommendations')]}}
export function validateReport(value:any):ReportDraft{
 if(!value||value.format!==1||!['baseline','update'].includes(value.type)||!value.meta||typeof value.meta!=='object'||Array.isArray(value.meta)||!Array.isArray(value.sections)||value.sections.length>100)throw Error('Unsupported report draft.')
 const text=(v:any,max:number)=>{if(typeof v!=='string'||v.length>max)throw Error('Invalid report text.');return v}
 const image=(v:any)=>{text(v,3000000);if(v&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v))throw Error('Unsupported report image.');return v}
 image(value.logo);for(const [k,v] of Object.entries(value.meta)){if(!Object.hasOwn(META_FIELDS,k))throw Error('Unknown report field.');text(v,2000)}
 const ids=new Set<string>();for(const s of value.sections){text(s.id,100);if(ids.has(s.id))throw Error('Duplicate section.');ids.add(s.id);for(const k of ['title','phase','milestone'])text(s[k],500);text(s.comments,100000);text(s.summary,10000);if(!Array.isArray(s.images)||s.images.length>10)throw Error('Too many images in one section.');for(const i of s.images){text(i.id,100);text(i.caption,1000);image(i.data)}for(const k of ['include','path','summaryIncluded','imageIncluded'])if(typeof s[k]!=='boolean')throw Error('Invalid report selection.')}
 if(new TextEncoder().encode(JSON.stringify(value)).length>12000000)throw Error('Report is too large to save. Use fewer or smaller screenshots (12 MB total limit).')
 return value as ReportDraft
}
export function reportFacts(analysis:any){
 const tasks=Object.values(analysis?.traceTasks||{}) as any[],relationships=analysis?.traceRelationships;
 if(!tasks.length||!Array.isArray(relationships))return null
 const ids=new Set(tasks.map(t=>String(t.task_id))),pred=new Set<string>(),succ=new Set<string>();let external=0;
 for(const r of relationships){const p=String(r.pred_task_id),s=String(r.task_id);if(ids.has(s))pred.add(s);if(ids.has(p))succ.add(p);if(!ids.has(s)||!ids.has(p))external++}
 // Raw open ends are evidence; legitimate endpoints must be assessed by the scheduler.
 return {tasks,relationships,missingPred:tasks.filter(t=>!pred.has(String(t.task_id))),missingSucc:tasks.filter(t=>!succ.has(String(t.task_id))),positive:relationships.filter((r:any)=>Number(r.lag_hr_cnt)>0).length,negative:relationships.filter((r:any)=>Number(r.lag_hr_cnt)<0).length,constraints:tasks.filter(t=>t.cstr_type||t.cstr_type2).length,external}
}
