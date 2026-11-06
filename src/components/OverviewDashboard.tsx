'use client'
import Link from 'next/link'
import { Activity, CalendarDays, CheckCircle2, CircleDashed, Clock3, Link2, LockKeyhole, Layers, ArrowRight, ArrowLeftRight, Flag, BarChart3 as ChartNoAxesColumnIncreasing, TriangleAlert } from 'lucide-react'
import { Statistic } from '@/lib/scheduleStatistics'

export default function OverviewDashboard({stats,available,reviewCount,onOpen,onSection}:{stats:Statistic[];available:boolean;reviewCount:number;onOpen:(s:Statistic)=>void;onSection:(n:number)=>void}) {
  const find=(id:string)=>stats.find(s=>s.id===id)
  const total=find('total')?.count??0
  const summaries=[['total','Activities',CalendarDays],['completed','Completed',CheckCircle2],['inProgress','In progress',CircleDashed],['notStarted','Not started',Clock3]] as const
  return <div className="approved-overview no-print">
    <div className="overview-kpis">{summaries.map(([id,label,Icon],i)=>{const s=find(id);return <button key={id} className={`overview-kpi accent-${i%2?'teal':'blue'}`} disabled={!s||s.count===null} onClick={()=>s&&onOpen(s)}><Icon size={29} strokeWidth={1.7}/><span><span className="kpi-label">{label}</span><strong>{s?.count===null||!s?'—':s.count.toLocaleString()}</strong></span></button>})}</div>
    <div className="overview-panels">
      <div className="overview-surface"><h2><ChartNoAxesColumnIncreasing size={25}/>Schedule statistics</h2>
        <div className="status-track" aria-label="Activity status distribution">{[['completed','Completed'],['inProgress','In progress'],['notStarted','Not started'],['unknownStatus','Unknown status']].map(([id,label])=>{const n=find(id)?.count??0;return n>0&&total>0?<span key={id} className={'status-'+id} style={{width:`${100*n/total}%`}} title={`${label}: ${n.toLocaleString()}`}/>:null})}</div>
        <div className="status-legend"><span><i className="status-completed"/>Completed</span><span><i className="status-inProgress"/>In progress</span><span><i className="status-notStarted"/>Not started</span>{(find('unknownStatus')?.count??0)>0&&<span><i className="status-unknownStatus"/>Unknown</span>}</div>
        {!available&&<p role="status">Detailed source data is unavailable.</p>}
        <div className="overview-stat-links">{[['internal','Relationships','Review activity logic and network structure.',Link2],['constraints','Constraints','Review imposed constraints and their impact.',LockKeyhole],['calendars','Calendars','Review project and activity calendars.',CalendarDays]].map(([id,label,description,Icon]:any)=>{const s=find(id);return <button key={id} disabled={!s||s.count===null} onClick={()=>s&&onOpen(s)}><h3><Icon size={21}/>{label}</h3><p>{description}</p><span>View details <ArrowRight size={15}/></span></button>})}</div>
      </div>
      <div className="overview-surface overview-health"><h2><Activity size={25}/>Schedule health</h2><div className="health-notice"><TriangleAlert size={25}/>{!available?'Not evaluated':reviewCount?'Review required':'Review checks'}</div><p>{!available?'Load detailed XER evidence to evaluate checks.':reviewCount?`${reviewCount} checks exceed your entered targets. Inspect supporting findings.`:'No acceptance is implied. Inspect evidence and configure diagnostic targets.'}</p><button className="overview-primary" onClick={()=>onSection(2)}>View findings <ArrowRight size={17}/></button></div>
    </div>
    <div className="overview-surface overview-controls"><div className="overview-controls-heading"><div><h2><Layers size={26}/>Project Controls</h2><p>Compare updates and track project-level performance.</p></div><Link href="/dashboard/controls">Open Project Controls <ArrowRight size={17}/></Link></div><div className="overview-control-links">{[['Changes','Review and compare schedule updates.','/dashboard/changes',ArrowLeftRight],['Milestone variances','Analyze milestone date changes.','/dashboard/trend',Flag],['Period progress','Track progress by reporting period.','/dashboard/controls/progress',ChartNoAxesColumnIncreasing]].map(([label,description,href,Icon]:any)=><Link key={href} href={href}><Icon size={24}/><span><b>{label}</b><small>{description}</small></span><ArrowRight size={17}/></Link>)}</div></div>
  </div>
}
