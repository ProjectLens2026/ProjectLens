'use client'
import {useMemo,useState} from 'react'
import {exploreActivity,upstreamPaths,downstreamPaths,displayScheduleDate} from '@/lib/activityNetwork'
import ActivityBars from './ActivityBars'
import {downloadOverviewXlsx,type ExcelSheet} from '@/lib/overviewXlsx'
const input='border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white'
const headers=['Activity ID','Name','Type','Status','Early start (source)','Early finish (source)','Float (hours)','Calendar ID','Constraint','Secondary constraint','P6 float path','Path order']
const row=(t:any)=>[t.task_code||t.task_id,t.task_name||'',t.task_type||'',t.status_code||'',displayScheduleDate(t.early_start_date),displayScheduleDate(t.early_end_date),t.total_float_hr_cnt??'',t.clndr_id||'',t.cstr_type||'',t.cstr_type2||'',t.float_path||'',t.float_path_order||'']
export default function TraceLogicPanel({analysis,milestoneMode=false}:{analysis:any;milestoneMode?:boolean}) {
 const [root,setRoot]=useState(''),[query,setQuery]=useState(''),[type,setType]=useState(milestoneMode?'finish':'all'),[constraint,setConstraint]=useState(''),[page,setPage]=useState(0)
 const [direction,setDirection]=useState(milestoneMode?'pred':'both'),[depth,setDepth]=useState(0),[mode,setMode]=useState(milestoneMode?'paths':'trace'),[error,setError]=useState('')
 const tasks:Record<string,any>=analysis?.traceTasks||{},links:any[]=analysis?.traceRelationships||[]
 const all=useMemo(()=>Object.values(tasks),[tasks])
 const constraints=useMemo(()=>Array.from(new Set(all.flatMap(t=>[t.cstr_type,t.cstr_type2]).filter(Boolean))).sort(),[all])
 const matches=useMemo(()=>all.filter(t=>{
  const start=['TT_Mile','TT_StartMile'].includes(t.task_type),finish=t.task_type==='TT_FinMile',cs=[t.cstr_type,t.cstr_type2].filter(Boolean)
  return (type==='all'||type==='start'&&start||type==='finish'&&finish||type==='milestones'&&(start||finish))&&(!constraint||constraint==='any'&&cs.length||constraint==='none'&&!cs.length||cs.includes(constraint))&&`${t.task_code} ${t.task_name}`.toLowerCase().includes(query.trim().toLowerCase())
 }),[all,query,type,constraint])
 const network=useMemo(()=>exploreActivity(root,tasks,links,direction,depth),[root,tasks,links,direction,depth])
 const paths=useMemo(()=>mode==='paths'&&direction!=='succ'?upstreamPaths(root,tasks,links):null,[mode,root,tasks,links,direction])
 const forwardPaths=useMemo(()=>mode==='paths'&&direction!=='pred'?downstreamPaths(root,tasks,links):null,[mode,root,tasks,links,direction])
 const sourcePaths=Array.from(new Set(network.tasks.map(t=>t.float_path).filter(p=>p&&Number(p)>0))).sort((a,b)=>Number(a)-Number(b))
 const name=(id:string)=>tasks[id]?.task_code||`Unresolved: ${id}`
 function exportTrace(){try{
  const notes=[`Selected activity: ${name(root)}. Direction: ${direction}. Depth: ${depth||'all'}. Data date: ${displayScheduleDate(analysis?.dataDate)}.`,'Source dates and recorded relationships only; no CPM recalculation or critical ranking. Picker filters do not prune the trace.',`${network.unresolved} relationships have unresolved endpoints. Cycle in displayed network: ${network.cycle?'Yes':'No'}.`]
  const sheets:ExcelSheet[]=[{name:'Activities',headers,rows:network.tasks.map(row),notes},{name:'Relationships',headers:['Predecessor','Successor','Type','Lag (hours)'],rows:network.relationships.map(r=>[name(r.pred_task_id),name(r.task_id),r.pred_type||'',r.lag_hr_cnt??'']),notes}]
  if(paths)sheets.push({name:'Upstream paths',headers:['Path','Position','Activity ID','Name','Boundary'],rows:paths.paths.flatMap((p,i)=>p.ids.map((id,j)=>[i+1,j+1,name(id),tasks[id]?.task_name||'',p.boundary])),notes:[...notes,`Traversal order, not critical rank. Additional paths omitted: ${paths.truncated?'Yes':'No'}. Maximum 20 paths.`]})
  if(forwardPaths)sheets.push({name:'Downstream paths',headers:['Path','Position','Activity ID','Name','Boundary'],rows:forwardPaths.paths.flatMap((p,i)=>p.ids.map((id,j)=>[i+1,j+1,name(id),tasks[id]?.task_name||'',p.boundary])),notes:[...notes,`Traversal order, not critical rank. Additional paths omitted: ${forwardPaths.truncated?'Yes':'No'}. Maximum 20 paths.`]})
  downloadOverviewXlsx(sheets,`CPMReview_Trace_${name(root)}.xlsx`)
 }catch(e){setError(e instanceof Error?e.message:'Export failed')}}
 if(!analysis?.traceTasks||!Array.isArray(analysis?.traceRelationships))return <div className="p-6 bg-amber-50 rounded-xl">This saved analysis lacks network data. Re-analyze the source XER to enable tracing.</div>
 return <div className="space-y-5">
  <div className="bg-slate-900 text-white rounded-xl p-5"><h3 className="text-xl font-bold">{milestoneMode?'Phase / Finish Milestone Paths':'Logic Trace'}</h3><p className="mt-2 text-sm text-slate-300">{milestoneMode?'Select a finish milestone to inspect its incoming paths and downstream dependencies.':'Select any XER activity to inspect recorded predecessor and successor relationships.'}</p></div>
  <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-5">
   <section className="border rounded-xl bg-slate-50 p-4 space-y-3">
    <label className="block text-sm font-semibold">Find activity<input className={`${input} w-full mt-2`} value={query} onChange={e=>{setQuery(e.target.value);setPage(0)}} placeholder="Activity ID or name"/></label>
    {!milestoneMode&&<label className="block text-sm">Activity type<select className={`${input} w-full`} value={type} onChange={e=>{setType(e.target.value);setPage(0)}}><option value="all">All activities</option><option value="milestones">All milestones</option><option value="start">Start milestones</option><option value="finish">Finish milestones</option></select></label>}
    <label className="block text-sm">Constraint<select className={`${input} w-full`} value={constraint} onChange={e=>{setConstraint(e.target.value);setPage(0)}}><option value="">All</option><option value="any">Any constraint</option><option value="none">No constraint</option>{constraints.map(c=><option key={c}>{c}</option>)}</select></label>
    <p className="text-xs text-slate-500">{matches.length} matches. Filters narrow selection, not the traced network.</p>
    <div className="max-h-[460px] overflow-auto space-y-1">{matches.slice(page*50,page*50+50).map(t=><button key={t.task_id} aria-pressed={root===t.task_id} onClick={()=>{if(!milestoneMode||t.task_type==='TT_FinMile')setRoot(t.task_id)}} className={`w-full text-left rounded-lg p-3 border ${root===t.task_id?'bg-blue-100 border-blue-500':'bg-white border-slate-200 hover:border-blue-300'}`}><span className="block font-semibold text-sm">{t.task_code}</span><span className="block text-sm text-slate-600">{t.task_name}</span></button>)}{!matches.length&&<p>No matching activities.</p>}</div>
    <div className="flex justify-between text-sm"><button disabled={!page} onClick={()=>setPage(page-1)}>Previous</button><span>{page+1} / {Math.max(1,Math.ceil(matches.length/50))}</span><button disabled={(page+1)*50>=matches.length} onClick={()=>setPage(page+1)}>Next</button></div>
   </section>
   <section className="min-w-0 space-y-4">
    {!tasks[root]?<div className="border border-dashed rounded-xl p-10 text-slate-500">Select an activity or milestone to inspect its network.</div>:<>
     <div className="border-l-4 border-teal-500 bg-teal-50 p-4 rounded-r-xl"><h4 className="font-bold">{name(root)} · {tasks[root].task_name}</h4><p className="text-sm mt-1">Source total float: {tasks[root].total_float_hr_cnt??'Not reported'} hours · Calendar: {tasks[root].clndr_id||'Not reported'}</p></div>
     <div className="flex flex-wrap gap-2">{milestoneMode&&<select aria-label="Analysis view" className={input} value={mode} onChange={e=>setMode(e.target.value)}><option value="paths">Multiple connected paths</option><option value="source">P6 exported float paths</option></select>}<select aria-label="Trace direction" className={input} value={direction} onChange={e=>setDirection(e.target.value)}><option value="both">Both directions</option><option value="pred">Backward — predecessors</option><option value="succ">Forward — successors</option></select>{!milestoneMode&&<select aria-label="Trace depth" className={input} value={depth} onChange={e=>setDepth(Number(e.target.value))}><option value={0}>Full chain</option><option value={1}>Direct relationships</option><option value={2}>Two levels</option><option value={3}>Three levels</option></select>}<button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm" onClick={exportTrace}>Export trace (.xlsx)</button></div>
     {milestoneMode&&<p className="border border-amber-200 bg-amber-50 p-3 text-sm"><strong>Milestone-specific critical ranking is not yet available.</strong> These are connected paths, not verified driving paths. P6 source path assignments do not establish a new critical path for each selected milestone.</p>}
     <p className="text-sm text-slate-500">Recorded logic, not a recalculated CPM forward/backward pass. Float and lag use source hours. Connected does not mean driving or critical.</p>
     {error&&<p role="alert" className="text-red-700">{error}</p>}
     {network.cycle&&<p className="p-3 bg-amber-50 text-sm">Cycle detected in the displayed network. A complete precedence order cannot be established.</p>}
     {!!network.unresolved&&<p className="p-3 bg-amber-50 text-sm">{network.unresolved} relationships reach external or unresolved endpoints. Trace coverage is incomplete there.</p>}
     {[{label:'Incoming paths — target milestone last',data:paths},{label:'Outgoing paths — selected milestone first',data:forwardPaths}].map(group=>group.data&&<div key={group.label} className="space-y-3"><h4 className="font-semibold">{group.label}</h4><p className="text-sm text-slate-500">Up to 20 paths in traversal order, not critical rank.</p>{group.data.truncated&&<p className="text-amber-700">Additional paths omitted by the safety limit.</p>}{group.data.paths.map((p,i)=><details key={i} className="p-3 border rounded-lg" open={i===0}><summary>Path {i+1} · {p.ids.length} entries · {p.boundary}</summary><ActivityBars tasks={p.ids.map(id=>tasks[id]||{task_id:id,task_code:name(id),task_name:'External / unresolved endpoint'})} selected={root} onSelect={id=>{if(!milestoneMode&&tasks[id])setRoot(id)}}/></details>)}</div>)}
     {mode==='source'&&<div className="border rounded-lg p-4"><h4 className="font-semibold">P6 path assignments within this trace</h4><p className="text-sm text-slate-500">Assignments belong to the source scheduling run; not recalculated for this selected target.</p>{!sourcePaths.length?<p className="mt-2">No source path assignments available. Re-analyze an older saved version to read these fields; paths absent from the XER are not invented.</p>:sourcePaths.map(p=><details key={p} className="mt-3"><summary>Source float path {p}</summary><ActivityBars tasks={network.tasks.filter(t=>t.float_path===p).sort((a,b)=>Number(a.float_path_order)-Number(b.float_path_order))} selected={root} onSelect={id=>{if(!milestoneMode)setRoot(id)}}/></details>)}</div>}
     <h4 className="font-semibold">{network.tasks.length} activities · {network.relationships.length} relationships</h4>
     <ActivityBars tasks={network.tasks} selected={root} onSelect={id=>{if(!milestoneMode)setRoot(id)}}/>
     {!network.relationships.length&&<p className="p-4 bg-slate-50">No relationships found for this activity.</p>}
     <div className="overflow-auto max-h-[480px] border rounded-lg"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-100"><tr>{headers.map(h=><th key={h} className="p-3 whitespace-nowrap text-left">{h}</th>)}</tr></thead><tbody>{network.tasks.map(t=><tr key={t.task_id} className="border-t hover:bg-blue-50">{row(t).map((v,i)=><td key={i} className="p-3 whitespace-nowrap">{i===0?<button onClick={()=>{if(!milestoneMode||t.task_type==='TT_FinMile')setRoot(t.task_id)}} className="font-semibold text-blue-700">{v}</button>:v||'—'}</td>)}</tr>)}</tbody></table></div>
     <details className="border rounded-lg p-3"><summary>Relationship evidence — including converging branches</summary><div className="overflow-auto max-h-96"><table className="text-sm w-full"><thead><tr>{['Predecessor','Successor','Type','Lag (hours)'].map(h=><th key={h} className="text-left p-2">{h}</th>)}</tr></thead><tbody>{network.relationships.map((r,i)=><tr key={i} className="border-t"><td className="p-2">{name(r.pred_task_id)}</td><td className="p-2">{name(r.task_id)}</td><td className="p-2">{r.pred_type}</td><td className="p-2">{r.lag_hr_cnt??'Not reported'}</td></tr>)}</tbody></table></div></details>
    </>}
   </section>
  </div>
 </div>
}
