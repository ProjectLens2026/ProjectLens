'use client'
import {displayScheduleDate,sourceBarRange} from '@/lib/activityNetwork'

export default function ActivityBars({tasks,selected,onSelect}:{tasks:any[];selected:string;onSelect:(id:string)=>void}) {
 const ranges=tasks.map(sourceBarRange),valid=ranges.filter((r):r is NonNullable<typeof r>=>!!r)
 if(!valid.length)return <p className="p-3 text-sm text-slate-500">No valid source early-date ranges for a bar chart.</p>
 const min=Math.min(...valid.map(r=>r.start)),max=Math.max(...valid.map(r=>r.finish)),span=Math.max(86400000,max-min)
 const ticks=Array.from({length:5},(_,i)=>new Date(min+span*i/4).toISOString().slice(0,10))
 return <div className="border rounded-xl overflow-auto max-h-[560px]">
  <div className="min-w-[760px]">
   <div className="grid grid-cols-[300px_minmax(460px,1fr)] sticky top-0 z-10 bg-slate-100 text-xs p-3"><span>Source early dates · calendar-time axis</span><div className="flex justify-between">{ticks.map((t,i)=><span key={i}>{displayScheduleDate(t)}</span>)}</div></div>
   {tasks.map((t,i)=>{const r=ranges[i],milestone=['TT_Mile','TT_StartMile','TT_FinMile'].includes(t.task_type),isSelected=t.task_id===selected
    return <div key={`${t.task_id}-${i}`} className={`grid grid-cols-[300px_minmax(460px,1fr)] border-t px-3 py-2 text-xs items-center ${isSelected?'bg-teal-50':'bg-white'}`}>
     <button onClick={()=>onSelect(t.task_id)} className="text-left pr-3"><strong className="text-blue-700">{t.task_code||t.task_id}</strong><span className="block truncate" title={t.task_name}>{t.task_name}</span><span className="text-slate-500">{displayScheduleDate(t.early_start_date)} – {displayScheduleDate(t.early_end_date)}</span></button>
     <div className="relative h-8 mr-3" style={{backgroundImage:'linear-gradient(to right,#e2e8f0 1px,transparent 1px)',backgroundSize:'25% 100%'}}>
      {!r?<span className="text-slate-400">Missing or invalid source dates</span>:milestone?<span title={`${t.task_code}: ${displayScheduleDate(t.early_end_date)}`} className="absolute top-2 text-teal-700" style={{left:`${100*(r.finish-min)/span}%`,transform:'translateX(-50%)'}}>◆</span>:<span title={`${t.task_code}: ${displayScheduleDate(t.early_start_date)} – ${displayScheduleDate(t.early_end_date)}`} className={`absolute top-2 h-4 rounded ${isSelected?'bg-teal-600':'bg-blue-500'}`} style={{left:`${100*(r.start-min)/span}%`,width:`${100*(r.finish-r.start)/span}%`,minWidth:3}}/>}
     </div>
    </div>
   })}
  </div>
 </div>
}
