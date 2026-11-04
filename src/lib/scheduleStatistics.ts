// Overview statistics are descriptive diagnostics, not approval decisions.
// Hours remain hours: never silently assume an eight-hour calendar.
export type Evidence = Record<string, any>
export interface Statistic {
  id: string; label: string; count: number | null; eligible: number | null
  basis: string; rows: Evidence[]; kind: 'activity' | 'relationship' | 'calendar'
}
export interface CheckLimits { longLag: number; largeFloat: number; longDuration: number }
export const defaultCheckLimits: CheckLimits = { longLag: 160, largeFloat: 352, longDuration: 160 }
export const numeric = (value: unknown): number | null => {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const n = Number(value); return Number.isFinite(n) ? n : null
}
export const scheduleDay = (value: unknown): string => {
  const s = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(s + 'T00:00:00Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : ''
}
export const sourceDataDate = (a: Evidence): string => {
  if(a.projectSettings&&Object.prototype.hasOwnProperty.call(a.projectSettings,'last_recalc_date'))return scheduleDay(a.projectSettings.last_recalc_date)
  if(Object.prototype.hasOwnProperty.call(a,'sourceDataDate'))return scheduleDay(a.sourceDataDate)
  return scheduleDay(a.dataDate||a.data_date)
}
export function calculateStatistics(a: Evidence = {}, incomplete = false, limits = defaultCheckLimits) {
  const available = !!a.traceTasks && typeof a.traceTasks === 'object'
  const all: Evidence[] = available ? Object.values(a.traceTasks) : []
  const tasks = all.filter(t => !incomplete || t.status_code !== 'TK_Complete')
  const ids = new Set(all.map(t => t.task_id))
  const selected = new Set(tasks.map(t => t.task_id))
  const relationshipsAvailable = available && Array.isArray(a.traceRelationships)
  const relationships: Evidence[] = relationshipsAvailable ? a.traceRelationships : []
  const external = (r: Evidence) => (!!r.proj_id && !!r.pred_proj_id && r.proj_id !== r.pred_proj_id) || !ids.has(r.task_id) || !ids.has(r.pred_task_id)
  const scoped = relationships.filter(r => selected.has(r.task_id) || selected.has(r.pred_task_id))
  const internal = scoped.filter(r => !external(r))
  const pred = new Set(relationships.map(r => r.task_id)), succ = new Set(relationships.map(r => r.pred_task_id))
  const n = available ? tasks.length : null
  const stats: Statistic[] = []
  function activity(id: string, label: string, rows: Evidence[], ok = available, basis = 'Selected activities', eligible = n) {
    const v: Statistic = { id, label, rows: ok ? rows : [], count: ok ? rows.length : null, eligible: ok ? eligible : null, basis, kind: 'activity' }; stats.push(v); return v
  }
  function rel(id: string, label: string, rows: Evidence[], pool = internal, basis = 'Internal relationships touching selected activities') {
    const v: Statistic = { id, label, rows, count: relationshipsAvailable ? rows.length : null, eligible: relationshipsAvailable ? pool.length : null, basis, kind: 'relationship' }; stats.push(v); return v
  }
  activity('total', 'Total activities', tasks)
  for (const [id, label, code] of [['notStarted','Not started','TK_NotStart'],['inProgress','In progress','TK_Active'],['completed','Completed','TK_Complete']]) activity(id,label,tasks.filter(t=>t.status_code===code))
  activity('unknownStatus','Unrecognized status',tasks.filter(t=>!['TK_NotStart','TK_Active','TK_Complete'].includes(t.status_code)))
  rel('internal','Internal relationships',internal,scoped,'All relationships touching selected activities')
  rel('external','External / unresolved relationships',scoped.filter(external),scoped,'Cross-project or missing endpoint; inspect details')
  for (const type of ['FS','SS','FF','SF']) rel(type,`${type} relationships`,internal.filter(r=>String(r.pred_type).replace(/^PR_/,'')===type))
  rel('unknownRelationship','Unrecognized relationship type',internal.filter(r=>!['FS','SS','FF','SF'].includes(String(r.pred_type).replace(/^PR_/,''))))
  const knownLag = internal.filter(r=>numeric(r.lag_hr_cnt)!==null)
  for (const [id,label,test] of [ ['positiveLag','Positive lag',(n:number)=>n>0], ['negativeLag','Negative lag',(n:number)=>n<0], ['zeroLag','Zero lag',(n:number)=>n===0] ] as const) rel(id,label,knownLag.filter(r=>test(numeric(r.lag_hr_cnt)!)),knownLag,'Internal relationships with recorded lag')
  rel('missingLag','Missing lag value',internal.filter(r=>numeric(r.lag_hr_cnt)===null))
  const lagIds = new Set(scoped.filter(r=>numeric(r.lag_hr_cnt)!==null && numeric(r.lag_hr_cnt)!==0).flatMap(r=>[r.task_id,r.pred_task_id]))
  activity('activitiesLag','Activities touching nonzero lag',tasks.filter(t=>lagIds.has(t.task_id)),relationshipsAvailable)
  activity('withPred','With predecessors',tasks.filter(t=>pred.has(t.task_id)),relationshipsAvailable)
  activity('withSucc','With successors',tasks.filter(t=>succ.has(t.task_id)),relationshipsAvailable)
  activity('noPred','Without predecessors',tasks.filter(t=>!pred.has(t.task_id)),relationshipsAvailable)
  activity('noSucc','Without successors',tasks.filter(t=>!succ.has(t.task_id)),relationshipsAvailable)
  activity('neither','Without either predecessor or successor',tasks.filter(t=>!pred.has(t.task_id)&&!succ.has(t.task_id)),relationshipsAvailable)
  const constraintsKnown = tasks.every(t=>'cstr_type' in t)
  const types = (t:Evidence) => [t.cstr_type,t.cstr_type2].filter(x=>x && x!=='CS_None')
  const hard = (v:string) => ['CS_MSON','CS_MEON'].includes(v) || /MANDATORY|MUST/i.test(v)
  activity('constraints','Activities with constraints',tasks.filter(t=>types(t).length>0),available&&constraintsKnown)
  activity('hard','Mandatory constraints',tasks.filter(t=>types(t).some(hard)),available&&constraintsKnown)
  activity('soft','Other / soft constraints',tasks.filter(t=>types(t).some(v=>!hard(v))),available&&constraintsKnown,'Primary or secondary constraint; can overlap mandatory')
  const calendarIds = Array.from(new Set(tasks.map(t=>t.clndr_id).filter(Boolean)))
  const calendarRows = calendarIds.map(id=>({clndr_id:id,...a.calendars?.[id],activities:tasks.filter(t=>t.clndr_id===id).length}))
  stats.push({id:'calendars',label:'Calendars used',count:available&&tasks.every(t=>'clndr_id'in t)?calendarIds.length:null,eligible:null,basis:'Distinct assigned calendar IDs, not all exported calendars',rows:calendarRows,kind:'calendar'})
  activity('missingCalendar','Activities without calendar ID',tasks.filter(t=>!t.clndr_id))
  const dd = sourceDataDate(a)
  const actualsKnown = tasks.every(t=>'act_start_date'in t && 'act_end_date'in t)
  const after = (t:Evidence) => [t.act_start_date,t.act_end_date].some(d=>scheduleDay(d)>dd)
  activity('actualAfter','Actual dates after data date',tasks.filter(after),available&&!!dd&&actualsKnown)
  const oosIds = new Set((Array.isArray(a.outOfSequence)?a.outOfSequence:[]).map((x:Evidence)=>x.task?.task_id || x.task_id))
  activity('outOfSequence','Out-of-sequence activities',tasks.filter(t=>oosIds.has(t.task_id)),available&&Array.isArray(a.outOfSequence),'Reported by existing relationship-aware parser; selected activities')
  const remaining = tasks.filter(t=>t.status_code!=='TK_Complete')
  const checks: Statistic[] = []
  function check(id:string,label:string,rows:Evidence[],pool:Evidence[],ok:boolean,kind:Statistic['kind']='activity',basis='Incomplete activities; no automatic endpoint exemptions') {
    checks.push({id,label,rows,count:ok?rows.length:null,eligible:ok?pool.length:null,kind,basis})
  }
  check('logic','Missing predecessor or successor',remaining.filter(t=>!pred.has(t.task_id)||!succ.has(t.task_id)),remaining,relationshipsAvailable)
  for (const id of ['negativeLag','positiveLag','FS']) { const s=stats.find(s=>s.id===id)!; checks.push({...s,id:'check-'+id}) }
  check('longLag',`Long positive lag > ${limits.longLag} h`,knownLag.filter(r=>numeric(r.lag_hr_cnt)!>limits.longLag),knownLag,relationshipsAvailable,'relationship','Internal relationships with recorded lag')
  for (const [id,label,test] of [['hardCheck','Mandatory constraints',hard],['softCheck','Other / soft constraints',(s:string)=>!hard(s)]] as const) check(id,label,remaining.filter(t=>types(t).some(test)),remaining,available&&constraintsKnown)
  const floats=remaining.filter(t=>numeric(t.total_float_hr_cnt)!==null)
  check('largeFloat',`Total float > ${limits.largeFloat} h`,floats.filter(t=>numeric(t.total_float_hr_cnt)!>limits.largeFloat),floats,available,'activity','Incomplete activities with recorded total float')
  check('negativeFloat','Negative total float',floats.filter(t=>numeric(t.total_float_hr_cnt)!<0),floats,available,'activity','Incomplete activities with recorded total float')
  const durations=remaining.filter(t=>numeric(t.remain_drtn_hr_cnt)!==null)
  check('longDuration',`Remaining duration > ${limits.longDuration} h`,durations.filter(t=>numeric(t.remain_drtn_hr_cnt)!>limits.longDuration),durations,available,'activity','Incomplete activities with recorded remaining duration')
  check('invalidBefore','Incomplete forecast dates before data date',remaining.filter(t=>(t.status_code==='TK_NotStart'&&!!scheduleDay(t.early_start_date)&&scheduleDay(t.early_start_date)<dd)||(!!scheduleDay(t.early_end_date)&&scheduleDay(t.early_end_date)<dd)),remaining,available&&!!dd&&remaining.every(t=>'early_start_date'in t&&'early_end_date'in t),'activity','Incomplete: unstarted early start or early finish before data date')
  checks.push({...stats.find(s=>s.id==='actualAfter')!,id:'check-actualAfter'})
  return {available,relationshipsAvailable,all,tasks,stats,checks,dataDate:dd}
}

export function periodPerformance(previous:Evidence,current:Evidence) {
  const from=sourceDataDate(previous),to=sourceDataDate(current)
  if (!previous.traceTasks||!current.traceTasks) return {error:'Both versions need detailed activity data.',rows:[] as Evidence[]}
  if (!from||!to||from>=to) return {error:'Choose an earlier data date. The period must have a positive length.',rows:[] as Evidence[]}
  const before:Evidence[]=Object.values(previous.traceTasks),after:Evidence[]=Object.values(current.traceTasks)
  const countCodes=(ts:Evidence[])=>ts.reduce((m:Map<string,number>,t)=>m.set(t.task_code,(m.get(t.task_code)||0)+1),new Map<string,number>())
  const beforeCodes=countCodes(before),afterCodes=countCodes(after)
  const lookup=new Map(after.map(t=>[t.task_code,t]))
  const rows=before.filter(t=>t.status_code!=='TK_Complete'&&scheduleDay(t.early_end_date)>from&&scheduleDay(t.early_end_date)<=to).map(t=>{
    const c=lookup.get(t.task_code)
    const matched=!!t.task_code&&beforeCodes.get(t.task_code)===1&&afterCodes.get(t.task_code)===1
    let outcome='Unmatched / duplicate ID'
    if(matched&&c) {
      if(c.status_code==='TK_Complete') outcome=scheduleDay(c.act_end_date)&&scheduleDay(c.act_end_date)<=to?'Completed by data date':'Completed; actual finish missing / after data date'
      else if(c.status_code==='TK_Active') outcome='In progress'
      else if(c.status_code==='TK_NotStart') outcome='Not started'
      else outcome='Unrecognized status'
    }
    return {...t,priorFinish:t.early_end_date,currentFinish:c?.early_end_date,actualFinish:c?.act_end_date,outcome,currentFloat:c?.total_float_hr_cnt}
  })
  return {from,to,rows,error:''}
}
