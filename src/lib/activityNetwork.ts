// Pure relationship traversal; no date calculation or critical ranking.
export function exploreActivity(root:string,tasks:Record<string,any>,links:any[],direction:string,depth=0) {
 const ids=new Set<string>(tasks[root]?[root]:[]),edges=new Set<number>()
 function walk(back:boolean) {
  const adj:Record<string,{id:string;i:number}[]>={}
  links.forEach((r,i)=>{const k=back?r.task_id:r.pred_task_id,id=back?r.pred_task_id:r.task_id;if(k&&id)(adj[k]||=[]).push({id,i})})
  const seen=new Set([root]),queue=[{id:root,d:0}]
  for(let i=0;i<queue.length;i++){const n=queue[i];if(depth&&n.d>=depth)continue
   for(const e of adj[n.id]||[]){edges.add(e.i);if(!tasks[e.id]||seen.has(e.id))continue;seen.add(e.id);ids.add(e.id);queue.push({id:e.id,d:n.d+1})}
  }
 }
 if(tasks[root]){if(direction!=='succ')walk(true);if(direction!=='pred')walk(false)}
 const relationships=Array.from(edges).sort((a,b)=>a-b).map(i=>links[i])
 // Topological order follows relationships, rather than BFS discovery order.
 // Cyclic residuals are retained and disclosed, never silently discarded.
 const degree:Record<string,number>={},next:Record<string,string[]>={}
 ids.forEach(id=>degree[id]=0)
 relationships.forEach(r=>{if(ids.has(r.pred_task_id)&&ids.has(r.task_id)){degree[r.task_id]++;(next[r.pred_task_id]||=[]).push(r.task_id)}})
 const queue=Array.from(ids).filter(id=>degree[id]===0).sort(),ordered:string[]=[]
 for(let i=0;i<queue.length;i++){const id=queue[i];ordered.push(id);for(const n of next[id]||[])if(--degree[n]===0)queue.push(n)}
 const cycle=ordered.length<ids.size,done=new Set(ordered)
 ids.forEach(id=>{if(!done.has(id))ordered.push(id)})
 // The selected target is the endpoint of a backward trace, even for bad logic.
 if(direction==='pred'&&ids.has(root)){ordered.splice(ordered.indexOf(root),1);ordered.push(root)}
 if(direction==='succ'&&ids.has(root)){ordered.splice(ordered.indexOf(root),1);ordered.unshift(root)}
 return {tasks:ordered.map(id=>tasks[id]),relationships,cycle,unresolved:relationships.filter(r=>!tasks[r.task_id]||!tasks[r.pred_task_id]).length}
}
export function upstreamPaths(root:string,tasks:Record<string,any>,links:any[],limit=20) {
 limit=Math.max(1,Math.min(100,Math.floor(limit)||1))
 const adj:Record<string,string[]>={};links.forEach(r=>{if(r.task_id&&r.pred_task_id)(adj[r.task_id]||=[]).push(r.pred_task_id)})
 const stack:{ids:string[];boundary?:string}[]=tasks[root]?[{ids:[root]}]:[],paths:{ids:string[];boundary:string}[]=[]
 let steps=0,overflow=false
 while(stack.length&&paths.length<limit&&steps++<20000){const p=stack.pop()!,id=p.ids[0]
  if(p.boundary||!adj[id]?.length||p.ids.length>=250){paths.push({ids:p.ids,boundary:p.boundary||(p.ids.length>=250?'Depth limit':'No recorded predecessor')});continue}
  const parents=Array.from(new Set(adj[id]));for(let i=parents.length-1;i>=0;i--){if(stack.length>=20000){overflow=true;continue}const n=parents[i];stack.push({ids:[n,...p.ids],boundary:p.ids.includes(n)?'Cycle detected':!tasks[n]?'External / unresolved endpoint':undefined})}
 }
 return {paths,truncated:overflow||stack.length>0}
}
export function downstreamPaths(root:string,tasks:Record<string,any>,links:any[],limit=20) {
 const result=upstreamPaths(root,tasks,links.map(r=>({...r,task_id:r.pred_task_id,pred_task_id:r.task_id})),limit)
 return {...result,paths:result.paths.map(p=>({...p,ids:p.ids.slice().reverse(),boundary:p.boundary==='No recorded predecessor'?'No recorded successor':p.boundary}))}
}
// Calendar dates are never parsed in local time; timezone shifts are prohibited.
export function displayScheduleDate(value:unknown):string {
 const match=String(value??'').match(/^(\d{4})-(\d{2})-(\d{2})/)
 if(!match)return '—'
 const [,y,m,d]=match,date=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)))
 return date.getUTCFullYear()===Number(y)&&date.getUTCMonth()===Number(m)-1&&date.getUTCDate()===Number(d)?`${m}-${d}-${y.slice(-2)}`:'—'
}
export function floatDays(task:any,calendars:Record<string,any>={},override?:number):number|null {
 const raw=task.total_float_hr_cnt,hours=override??Number(calendars[task.clndr_id]?.day_hr_cnt)
 if(raw===null||raw===undefined||String(raw).trim()===''||!Number.isFinite(Number(raw))||!Number.isFinite(hours)||hours<=0)return null
 return Math.round(Number(raw)/hours*100)/100
}
export function activityColor(task:any):string {
 if(task.status_code==='TK_Complete')return '#2563eb'
 const raw=task.total_float_hr_cnt
 if(raw===null||raw===undefined||String(raw).trim()===''||!Number.isFinite(Number(raw)))return '#94a3b8'
 return Number(raw)<=0?'#dc2626':'#16a34a'
}
export function displayActivityDates(task:any) {
 if(task.status_code==='TK_Complete')return {start:task.act_start_date,finish:task.act_end_date,basis:'Actual'}
 if(task.status_code==='TK_Active')return {start:task.act_start_date,finish:task.early_end_date,basis:'Actual start / early finish'}
 return {start:task.early_start_date,finish:task.early_end_date,basis:'Source early dates'}
}
export function sourceBarRange(task:any):{start:number;finish:number}|null {
 const read=(s:unknown)=>{if(displayScheduleDate(s)==='—')return NaN;return Date.parse(String(s).slice(0,10)+'T00:00:00Z')}
 const start=read(task.early_start_date),finish=read(task.early_end_date)
 return Number.isFinite(start)&&Number.isFinite(finish)&&finish>=start?{start,finish}:null
}
