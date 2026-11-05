'use client'
import {useState,useRef} from 'react'
import {displayScheduleDate,sourceBarRange,displayActivityDates,floatDays,activityColor} from '@/lib/activityNetwork'
import {ganttScale} from '@/lib/ganttScale'
export default function ActivityBars({tasks,selected,onSelect,calendars={},hoursPerDay}:{tasks:any[];selected:string;onSelect:(id:string)=>void;calendars?:Record<string,any>;hoursPerDay?:number}) {
 const [page,setPage]=useState(0),[scale,setScale]=useState('fit'),[labelWidth,setLabelWidth]=useState(340)
 const drag=useRef<{x:number;width:number}|null>(null)
 const dates=tasks.map(displayActivityDates),ranges=dates.map(d=>sourceBarRange({early_start_date:d.start,early_end_date:d.finish})),valid=ranges.filter((r):r is NonNullable<typeof r>=>!!r)
 const min=valid.length?Math.min(...valid.map(r=>r.start)):0,max=valid.length?Math.max(...valid.map(r=>r.finish)):0,span=Math.max(86400000,max-min)
 const axis=ganttScale(min,max,scale)
 const columns=`${labelWidth}px 100px 110px 110px minmax(${axis.width}px,1fr)`
 const pages=Math.max(1,Math.ceil(tasks.length/100)),current=Math.min(page,pages-1)
 return <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
  <div className="flex flex-wrap items-center gap-4 p-3 border-b"><label className="text-sm font-semibold">Timescale <select aria-label="Gantt timescale" value={scale} onChange={e=>setScale(e.target.value)} className="ml-2 border rounded-lg p-2">{['fit','day','week','month','quarter'].map(v=><option key={v} value={v}>{v==='fit'?'Fit to path':v[0].toUpperCase()+v.slice(1)}</option>)}</select></label><span className="text-xs text-slate-500">Drag the Activity divider to resize columns. Drag the bottom-right corner to resize chart height.</span></div>
  <div className="flex flex-wrap gap-4 px-4 py-3 text-xs text-slate-600 border-b bg-slate-50">{[['#2563eb','Completed'],['#dc2626','Zero / negative float'],['#16a34a','Positive float'],['#94a3b8','Float unknown']].map(([color,label])=><span key={label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:color}}/>{label}</span>)}<span>◆ Milestone · Calendar-time axis</span></div>
  <div className="overflow-auto" style={{height:520,minHeight:240,maxHeight:1200,resize:'vertical'}}><div style={{minWidth:labelWidth+400+axis.width}}>
   <div style={{gridTemplateColumns:columns}} className="grid sticky top-0 z-10 bg-slate-100 text-xs font-semibold px-4 py-3 gap-3"><span className="relative">Activity<span role="separator" tabIndex={0} aria-label="Resize activity column" aria-orientation="vertical" aria-valuemin={200} aria-valuemax={700} aria-valuenow={labelWidth} className="absolute -right-2 -top-3 w-3 h-10 cursor-col-resize border-r-2 border-blue-400 touch-none" onPointerDown={e=>{drag.current={x:e.clientX,width:labelWidth};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(drag.current)setLabelWidth(Math.max(200,Math.min(700,drag.current.width+e.clientX-drag.current.x)))}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setLabelWidth(w=>Math.max(200,Math.min(700,w+(e.key==='ArrowRight'?20:-20))))}}}/></span><span>Float · days</span><span>Start</span><span>Finish</span><div className="relative h-8 mx-2 overflow-hidden">{axis.ticks.map((t,i)=><span key={i} className="absolute whitespace-nowrap" style={{left:`${100*(t.time-min)/span}%`,transform:i===axis.ticks.length-1?'translateX(-100%)':undefined}}>{/^\d{4}-/.test(t.label)?displayScheduleDate(t.label):t.label}</span>)}</div></div>
   {tasks.slice(current*100,(current+1)*100).map((t,j)=>{const i=current*100+j,r=ranges[i],d=dates[i],float=floatDays(t,calendars,hoursPerDay),milestone=['TT_Mile','TT_StartMile','TT_FinMile'].includes(t.task_type)
    return <div key={`${t.task_id}-${i}`} style={{gridTemplateColumns:columns}} className={`grid gap-3 border-t border-slate-100 px-4 py-3 text-sm items-center ${t.task_id===selected?'bg-teal-50 ring-1 ring-inset ring-teal-300':'bg-white hover:bg-slate-50'}`}>
     <button onClick={()=>onSelect(t.task_id)} className="text-left"><strong className="text-slate-900">{t.task_code||t.task_id}</strong><span className="block text-slate-600" title={t.task_name}>{t.task_name}</span><span className="text-xs text-slate-400">{d.basis}</span></button>
     <span className="font-semibold tabular-nums" style={{color:activityColor(t)}}>{float===null?'—':float.toLocaleString(undefined,{maximumFractionDigits:2})}</span><span className="tabular-nums text-slate-600">{displayScheduleDate(d.start)}</span><span className="tabular-nums text-slate-600">{displayScheduleDate(d.finish)}</span>
     <div className="relative h-10 mx-2" >
      {axis.ticks.map((t,i)=><span key={i} className="absolute inset-y-0 border-l border-slate-200" style={{left:`${100*(t.time-min)/span}%`}}/>)}
      {!r?<span className="text-xs text-slate-400">Dates not available</span>:milestone?<span title={t.task_code} className="absolute top-2 text-xl" style={{color:activityColor(t),left:`${100*(r.finish-min)/span}%`,transform:'translateX(-50%)'}}>◆</span>:<span title={`${t.task_code}: ${displayScheduleDate(d.start)} – ${displayScheduleDate(d.finish)}`} className="absolute top-3 h-4 rounded-full shadow-sm" style={{backgroundColor:activityColor(t),left:`${100*(r.start-min)/span}%`,width:`${100*(r.finish-r.start)/span}%`,minWidth:4}}/>}
     </div>
    </div>
   })}
  </div></div>
  <div className="flex justify-between items-center p-3 border-t text-xs text-slate-500"><span>{tasks.length} activities · Dates: MM-DD-YY · — means unavailable</span>{pages>1&&<span className="flex gap-4"><button disabled={!current} onClick={()=>setPage(current-1)}>Previous</button>{current+1} / {pages}<button disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Next</button></span>}</div>
 </div>
}
