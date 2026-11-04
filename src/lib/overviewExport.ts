import { Evidence, Statistic, numeric, scheduleDay, sourceDataDate, periodPerformance } from './scheduleStatistics'
import type { ExcelCell, ExcelSheet } from './overviewXlsx'

export interface OverviewExportInput {
  project: { id:string; name:string; projectId?:string }
  version: { id:string; fileName:string; versionLabel?:string }
  summary: string[][]
  analysis: Evidence
  stats: Statistic[]
  checks: Statistic[]
  performance: ReturnType<typeof periodPerformance> | null
  comparison?: { id:string; fileName:string; versionLabel?:string }
  comparisonDataDate?:string
  comparisonError?:string
  incomplete:boolean
  excluded:string[]
  targets:Record<string,{direction:'<'|'>';value:string}>
  mode:'all'|'selected'
}
export function diagnosticStatus(s:Statistic,targets:OverviewExportInput['targets']):string {
  if(s.count===null||!s.eligible)return 'Not evaluated'
  const target=targets[s.id],n=numeric(target?.value)
  if(n===null)return 'Information only'
  const value=100*s.count/s.eligible
  return (target.direction==='>'?value>n:value<n)?'Within entered target':'Review recommended'
}
export function recommendation(id:string):string {
  if(id==='check-FS')return 'Review the purpose and supporting logic of SS, FF and SF ties. Do not change valid relationships solely to increase the FS percentage.'
  if(id==='logic')return 'Confirm legitimate project endpoints and external dependencies; add missing logic where justified.'
  if(id.includes('Float'))return 'Trace affected paths and validate logic, calendars and constraints before proposing corrections.'
  if(id.includes('hard')||id.includes('soft'))return 'Confirm the contractual or technical basis for each constraint; retain justified restrictions.'
  return 'Review the listed evidence with the scheduler, document the basis and correct unsupported entries.'
}
export function performanceStatistics(p:ReturnType<typeof periodPerformance>|null):Statistic[] {
  if(!p||p.error)return []
  return [{id:'planned',label:'Planned to finish in period',rows:p.rows},...['Completed by data date','In progress','Not started','Completed; actual finish missing / after data date','Unmatched / duplicate ID','Unrecognized status'].map((outcome,index)=>({id:'outcome-'+index,label:outcome,rows:p.rows.filter(r=>r.outcome===outcome)})),{id:'criticalNotStarted',label:'Not started with current total float ≤ 0 (subset)',rows:p.rows.filter(r=>r.outcome==='Not started'&&numeric(r.currentFloat)!==null&&numeric(r.currentFloat)!<=0)}].map(s=>({...s,count:s.rows.length,eligible:p.rows.length,basis:'Prior-period planned-finish cohort',kind:'activity' as const}))
}
function date(value:unknown):ExcelCell {
  const day=scheduleDay(value)
  if(!day)return value?String(value):null
  return {value:(Date.parse(day+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000,format:'date'}
}
const text=(v:unknown):string=>v==null?'':String(v)
function ratio(s:Statistic,row:number):ExcelCell {
  return s.count===null||!s.eligible?'Not evaluated':{formula:`IF(AND(ISNUMBER(B${row}),ISNUMBER(C${row}),C${row}>0),B${row}/C${row},"Not evaluated")`,value:s.count/s.eligible,format:'percent'}
}
export function buildOverviewSheets(input:OverviewExportInput):ExcelSheet[] {
  const {project,version,analysis,mode}=input
  const include=(id:string)=>mode==='all'||!input.excluded.includes(id)
  if(mode==='selected'&&[0,1,2,3].every(i=>!include('section-'+i)))throw Error('Select at least one Overview section to export.')
  const currentDate=sourceDataDate(analysis)
  const context=[
    `Project: ${project.projectId||project.id} — ${project.name}`,
    `Current version: ${version.versionLabel||version.id}; file: ${version.fileName}; data date: ${currentDate||'Unavailable'}`,
    input.comparison?`Reference version: ${input.comparison.versionLabel||input.comparison.id}; file: ${input.comparison.fileName}; data date: ${input.comparisonDataDate||'Unavailable'}`:'Reference version: not selected. Period performance unavailable.',
    `Export: ${mode==='all'?'entire Overview':'selected sections and rows'}; activity population: ${input.incomplete?'incomplete':'all'}.`,
    'Editable export snapshot. Editing Excel does not update CPMReview. Percent formulas recalculate from the exported count cells; comments and status text are snapshots. Editing detailed records does not rerun schedule analysis.',
    'Diagnostic targets are reviewer-entered, not assumed client requirements. Activity-count completion is not physical progress. Source dates are date-only. Durations, float and lag are hours.',
  ]
  if(numeric(analysis.totalActivities)!==null&&Number(analysis.totalActivities)!==Object.keys(analysis.traceTasks||{}).length)context.push(`Source-count discrepancy: stored summary ${analysis.totalActivities}; available detailed records ${Object.keys(analysis.traceTasks||{}).length}. Investigate before relying on this report.`)
  const sheets:ExcelSheet[]=[],groups:{section:string;metric:Statistic}[]=[]
  const addMetrics=(section:string,rows:Statistic[],checks=false)=>{
    const selected=rows.filter(s=>include(s.id))
    selected.forEach(metric=>groups.push({section,metric}))
    sheets.push({name:section,headers:checks?['Check','Found','Eligible','Percent','Target direction','Target percent','Status at export','Calculation basis']:['Statistic','Found','Eligible','Percent','Calculation basis'],widths:checks?[48,14,14,14,20,18,28,64]:[48,14,14,14,64],rows:selected.map((s,i)=>{
      const common:ExcelCell[]=[s.label,s.count===null?'Unavailable':s.count,s.eligible===null?'Not applicable / unavailable':s.eligible,ratio(s,i+2)]
      return checks?[...common,input.targets[s.id]?.direction||'',numeric(input.targets[s.id]?.value)===null?'Not configured':{value:numeric(input.targets[s.id].value)!/100,format:'percent'},diagnosticStatus(s,input.targets),s.basis]:[...common,s.basis]
    }),notes:[...context,...(!selected.length?['No rows were selected in this section.']:[])]})
  }
  if(include('section-0'))sheets.push({name:'Submission Summary',headers:['Field','Value'],widths:[38,100],rows:[...input.summary.map(([key,value])=>{
    const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
    const dateField=['Schedule data date','Submission / received date','Review report issued'].includes(key)
    return [key,dateField&&match?date(`${match[3]}-${match[1]}-${match[2]}`):value] as ExcelCell[]
  }),['Exported at (UTC)',new Date().toISOString()],['Current version ID',version.id],['Reference version ID',input.comparison?.id||'Not selected']],notes:context})
  if(include('section-1'))addMetrics('Schedule Statistics',input.stats)
  if(include('section-2'))addMetrics('Schedule Checks',input.checks,true)
  if(include('section-3')){
    const p=input.performance
    if(!p||p.error)sheets.push({name:'Period Performance',headers:['Result','Reason'],widths:[28,100],rows:[['Not evaluated',input.comparisonError||p?.error||(input.comparison?'Comparison has not loaded.':'Select a previous submission in Overview, then export again.')]],notes:context})
    else addMetrics('Period Performance',performanceStatistics(p))
  }
  // Consolidate supporting entities once, retaining all relevant metric memberships.
  const evidence=new Map<string,{section:string;kind:string;row:Evidence;labels:string[]}>()
  const relationshipIndex=new Map<Evidence,number>()
  ;(analysis.traceRelationships||[]).forEach((r:Evidence,i:number)=>relationshipIndex.set(r,i))
  groups.forEach(({section,metric})=>metric.rows.forEach((row,index)=>{
    const key=metric.kind==='relationship'?`r:${row.proj_id}:${row.pred_proj_id}:${row.pred_task_id}:${row.task_id}:${row.pred_type}:${row.lag_hr_cnt}:${relationshipIndex.get(row)??index}`:metric.kind==='calendar'?`c:${row.clndr_id}`:`a:${section==='Period Performance'?'prior':'current'}:${row.task_id}`
    // Relationships retain row position to avoid hiding duplicate exported links.
    const existing=evidence.get(key)
    if(existing)existing.labels.push(`${section}: ${metric.label}`)
    else evidence.set(key,{section,kind:metric.kind,row,labels:[`${section}: ${metric.label}`]})
  }))
  const detailRows:ExcelCell[][]=[]
  evidence.forEach(({section,kind,row:r,labels})=>{
    const t=analysis.traceTasks?.[r.task_id],p=analysis.traceTasks?.[r.pred_task_id]
    detailRows.push([kind,labels.join('; '),kind==='calendar'?'':kind==='relationship'?(t?.task_code||r.task_id):r.task_code,kind==='relationship'?(t?.task_name||'External / unresolved endpoint'):r.task_name||r.clndr_name||'',kind==='relationship'?(p?.task_code||r.pred_task_id):'',kind==='relationship'?(p?.task_name||'External / unresolved endpoint'):'',text(r.pred_type),numeric(r.lag_hr_cnt),text(r.status_code),text(r.outcome),date(r.early_start_date),date(r.early_end_date),date(r.act_start_date),date(r.act_end_date),numeric(r.total_float_hr_cnt),numeric(r.remain_drtn_hr_cnt),text(r.cstr_type),date(r.cstr_date),text(r.cstr_type2),date(r.cstr_date2),text(r.clndr_id),text(analysis.calendars?.[r.clndr_id]?.clndr_name||r.clndr_name),kind==='calendar'?numeric(r.activities):null,kind==='calendar'?numeric(r.day_hr_cnt):null,date(r.priorFinish),date(r.currentFinish),date(r.actualFinish),numeric(r.currentFloat),section==='Period Performance'?input.comparison?.id||'':version.id,text(r.proj_id),text(r.pred_proj_id)])
  })
  if(groups.length)sheets.push({name:'Detailed Findings',headers:['Record type','Included in metrics','Activity / successor ID','Activity / successor name','Predecessor ID','Predecessor name','Relationship type','Lag (hours)','Activity status','Period outcome','Early start','Early finish','Actual start','Actual finish','Total float (hours)','Remaining duration (hours)','Primary constraint','Primary constraint date','Secondary constraint','Secondary constraint date','Calendar ID','Calendar name','Calendar activity count','Calendar hours/day','Prior forecast finish','Current forecast finish','Current actual finish','Current total float (hours)','Source version ID','Project ID','Predecessor project ID'],widths:[16,70,25,55,25,55,20,16,20,40,17,17,17,17,20,24,24,22,24,22,20,35,22,22,22,22,22,24,36,24,24],rows:detailRows,notes:[...context,'Metric memberships can overlap. Do not sum detailed rows to calculate the Overview totals. Period-cohort records use the reference version; current finish, actual finish and float are explicitly labeled.']})
  if(include('section-2')){
    const comments=input.checks.filter(s=>include(s.id)&&diagnosticStatus(s,input.targets)==='Review recommended')
    sheets.push({name:'Comments & Recommendations',headers:['Number','Check ID','Review comment','Recommendation','Status at export','Reviewer notes'],widths:[12,24,65,85,28,55],rows:comments.map((s,i)=>[i+1,s.id,`${s.label}: ${s.count} of ${s.eligible} (${(100*s.count!/s.eligible!).toFixed(2)}%).`,recommendation(s.id),'Open review comment','']),notes:[...context,...(!comments.length?['No exported checks exceed an entered target. Unset or unavailable checks are not acceptance determinations.']:[])]})
  }
  return sheets
}
