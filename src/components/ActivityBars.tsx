'use client'
import {useState} from 'react'
import {displayScheduleDate,sourceBarRange,displayActivityDates,floatDays,activityColor} from '@/lib/activityNetwork'
export default function ActivityBars({tasks,selected,onSelect,calendars={},hoursPerDay}:{tasks:any[];selected:string;onSelect:(id:string)=>void;calendars?:Record<string,any>;hoursPerDay?:number}) {
 const [page,setPage]=useState(0)
 const dates=tasks.map(displayActivityDates),ranges=dates.map(d=>sourceBarRange({early_start_date:d.start,early_end_date:d.finish})),valid=ranges.filter((r):r is NonNullable<typeof r>=>!!r)
 const min=valid.length?Math.min(...valid.map(r=>r.start)):0,max=valid.length?Math.max(...valid.map(r=>r.finish)):0,span=Math.max(86400000,max-min)
 const ticks=valid.length?Array.from({length:5},(_,i)=>new Date(min+span*i/4).toISOString().slice(0,10)):[]
 const pages=Math.max(1,Math.ceil(tasks.length/100)),current=Math.min(page,pages-1)
 return <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
  <div className="flex flex-wrap gap-4 px-4 py-3 text-xs text-slate-600 border-b bg-slate-50">{[['#2563eb','Completed'],['#dc2626','Zero / negative float'],['#16a34a','Positive float'],['#94a3b8','Float unknown']].map(([color,label])=><span key={label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:color}}/>{label}</span>)}<span>◆ Milestone · Calendar-time axis</span></div>
  <div className="overflow-auto max-h-[640px]"><div className="min-w-[1080px]">
   <div className="grid grid-cols-[340px_100px_110px_110px_minmax(420px,1fr)] sticky top-0 z-10 bg-slate-100 text-xs font-semibold px-4 py-3 gap-3"><span>Activity</span><span>Float · days</span><span>Start</span><span>Finish</span><div className="flex justify-between pr-3">{ticks.map((t,i)=><span key={i}>{displayScheduleDate(t)}</span>)}</div></div>
   {tasks.slice(current*100,(current+1)*100).map((t,j)=>{const i=current*100+j,r=ranges[i],d=dates[i],float=floatDays(t,calendars,hoursPerDay),milestone=['TT_Mile','TT_StartMile','TT_FinMile'].includes(t.task_type)
    return <div key={`${t.task_id}-${i}`} className={`grid grid-cols-[340px_100px_110px_110px_minmax(420px,1fr)] gap-3 border-t border-slate-100 px-4 py-3 text-sm items-center ${t.task_id===selected?'bg-teal-50 ring-1 ring-inset ring-teal-300':'bg-white hover:bg-slate-50'}`}>
     <button onClick={()=>onSelect(t.task_id)} className="text-left"><strong className="text-slate-900">{t.task_code||t.task_id}</strong><span className="block text-slate-600" title={t.task_name}>{t.task_name}</span><span className="text-xs text-slate-400">{d.basis}</span></button>
     <span className="font-semibold tabular-nums" style={{color:activityColor(t)}}>{float===null?'—':float.toLocaleString(undefined,{maximumFractionDigits:2})}</span><span className="tabular-nums text-slate-600">{displayScheduleDate(d.start)}</span><span className="tabular-nums text-slate-600">{displayScheduleDate(d.finish)}</span>
     <div className="relative h-10 mx-2" style={{backgroundImage:'linear-gradient(to right,#e2e8f0 1px,transparent 1px)',backgroundSize:'25% 100%'}}>
      {!r?<span className="text-xs text-slate-400">Dates not available</span>:milestone?<span title={t.task_code} className="absolute top-2 text-xl" style={{color:activityColor(t),left:`${100*(r.finish-min)/span}%`,transform:'translateX(-50%)'}}>◆</span>:<span title={`${t.task_code}: ${displayScheduleDate(d.start)} – ${displayScheduleDate(d.finish)}`} className="absolute top-3 h-4 rounded-full shadow-sm" style={{backgroundColor:activityColor(t),left:`${100*(r.start-min)/span}%`,width:`${100*(r.finish-r.start)/span}%`,minWidth:4}}/>}
     </div>
    </div>
   })}
  </div></div>
  <div className="flex justify-between items-center p-3 border-t text-xs text-slate-500"><span>{tasks.length} activities · Dates: MM-DD-YY · — means unavailable</span>{pages>1&&<span className="flex gap-4"><button disabled={!current} onClick={()=>setPage(current-1)}>Previous</button>{current+1} / {pages}<button disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Next</button></span>}</div>
 </div>
}
