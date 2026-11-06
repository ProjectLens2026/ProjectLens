'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getActiveProject, getActiveVersion, loadProjects, subscribeToProjects, getProjectStatus, Project } from '@/lib/projectStore'
import { usePermissions, roleLabel } from '@/lib/usePermissions'
import { useVersionNavigation } from './VersionNavigation'
import { compareScheduleVersions, scheduleDataDate, browserDate } from '@/lib/versionBrowser'
import { Folder, FileText, ChevronRight, ChevronDown, Layers, BarChart3, Settings, CircleHelp } from 'lucide-react'

export default function WorkspaceSidebar({user}:{user:{name:string;company:string;initials:string}}) {
  const pathname=usePathname(), permissions=usePermissions()
  const navigation=useVersionNavigation()
  const [project,setProject]=useState<Project|null>(null)
  const [projects,setProjects]=useState<Project[]>([])
  const [versionId,setVersionId]=useState('')
  const [expanded,setExpanded]=useState<string[]>([])
  const [portfolioOpen,setPortfolioOpen]=useState(true)
  useEffect(()=>{const sync=()=>{const p=getActiveProject();setProjects(loadProjects().filter(p=>!['Archived','Deleted'].includes(getProjectStatus(p))));setProject(p&&!['Archived','Deleted'].includes(getProjectStatus(p))?p:null);setVersionId(getActiveVersion(p)?.id||'');if(p)setExpanded(ids=>ids.includes(p.id)?ids:[...ids,p.id])};sync();return subscribeToProjects(sync)},[])
  const identity=permissions.user
  const links=[['Portfolio','/dashboard/enterprise'],['Projects','/dashboard/projects']]
  const projectLinks=[['Schedule versions','/dashboard/projects?projectId='+encodeURIComponent(project?.id||'')],['Project Controls','/dashboard/controls'],['Reports','/dashboard/reports']]
  const controls=['controls','changes','tia','risks','procurement','submittals','evm','trend'].some(x=>pathname==='/dashboard/'+x||pathname.startsWith('/dashboard/'+x+'/'))
  const item=(label:string,href:string,selected:boolean)=><Link key={href} href={href} aria-current={selected?'page':undefined} className={`block rounded-xl px-3 py-2.5 text-sm transition-colors ${selected?'bg-blue-600 text-white shadow-lg shadow-blue-950/20':'text-slate-300 hover:bg-white/10 hover:text-white'}`}>{label}</Link>
  return <aside className="workspace-sidebar print:hidden bg-[#0c192e] text-white flex flex-col w-[272px] shrink-0 border-r border-white/5" aria-label="Company and project navigation" data-navigation-controls>
    <Link href="/dashboard/projects" className="workspace-brand shrink-0 flex items-center gap-3 px-6 py-6 border-b border-white/10">
      <svg width="32" height="24" viewBox="0 0 44 32" aria-label="CPMreview mark"><rect y="0" width="32" height="5" rx="1" fill="#2563eb"/><rect y="9" width="44" height="5" rx="1" fill="#dc2626"/><rect y="18" width="26" height="5" rx="1" fill="#16a34a"/><rect y="27" width="36" height="5" rx="1" fill="#1f2937"/></svg>
      <div><div className="font-extrabold text-xl tracking-tight">CPM<span className="text-blue-400">review</span></div><div className="text-[9px] text-slate-400">Construction Schedule Review</div></div>
    </Link>
    <div className="shrink-0 px-5 py-5 border-b border-white/10">
      <p className="text-[10px] tracking-[.16em] uppercase text-slate-400 mb-2">Your company</p>
      <p className="font-semibold text-sm leading-6">{identity?.orgName||identity?.company||user.company||'Workspace'}</p>
      <div className="flex items-center gap-3 mt-4"><span className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-200 grid place-items-center font-bold">{identity?.initials||user.initials}</span><div className="min-w-0"><p className="text-sm truncate">{identity?.displayName||user.name}</p><p className="text-xs text-teal-300 mt-1">{identity?roleLabel(identity.orgRole):'Loading role…'}</p></div></div>
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-5">
      <nav className="space-y-1" aria-label="Workspace">{links.map(([label,href])=>item(label,href,pathname===href))}</nav>
      <nav aria-label="Portfolio project tree" className="workspace-tree">
        <p className="text-xs uppercase tracking-wider text-slate-400 mb-3">Portfolio</p>
        <button className="tree-row font-semibold" aria-expanded={portfolioOpen} onClick={()=>setPortfolioOpen(!portfolioOpen)}>{portfolioOpen?<ChevronDown size={15}/>:<ChevronRight size={15}/>}<Folder size={17}/><span>{identity?.orgName||identity?.company||user.company||'My projects'}</span></button>
        {portfolioOpen&&<div className="tree-branch">{projects.map(p=>{const isOpen=expanded.includes(p.id);const versions=p.versions.filter(v=>!v.deletedAt&&!v.archivedAt).slice().sort(compareScheduleVersions);return <div key={p.id}>
          <div className={`tree-row ${project?.id===p.id?'tree-project-active':''}`}><button aria-label={`${isOpen?'Collapse':'Expand'} ${p.projectId||p.name}`} aria-expanded={isOpen} onClick={()=>setExpanded(ids=>isOpen?ids.filter(id=>id!==p.id):[...ids,p.id])}>{isOpen?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button><Folder size={17}/><Link href={'/dashboard/projects?projectId='+encodeURIComponent(p.id)}>{p.projectId||p.name}</Link></div>
          {isOpen&&<div className="tree-branch"><p className="tree-row text-slate-400"><Folder size={15}/>Schedule versions</p><div className="tree-branch">{versions.map(v=><button key={v.id} disabled={navigation.opening} aria-current={project?.id===p.id&&versionId===v.id?'page':undefined} className="tree-row tree-version" title={v.versionLabel||v.fileName} onClick={()=>navigation.request(p.id,v.id,'/dashboard')}><FileText size={15}/><span>{scheduleDataDate(v)?browserDate(scheduleDataDate(v)):'Date unavailable'} · {v.scheduleType||'Schedule'}</span></button>)}{!versions.length&&<p className="text-xs text-slate-400 px-2 py-2">No active versions</p>}</div></div>}
        </div>})}{!projects.length&&<p className="text-sm text-slate-400 p-2">No accessible projects.</p>}</div>}
      </nav>
      {project&&<nav className="space-y-1" aria-label="Project destinations"><p className="px-3 text-[10px] uppercase tracking-[.16em] text-slate-400 mb-2">{project.projectId||project.name} workspace</p>{projectLinks.map(([label,href])=>item(label,href,label==='Project Controls'?controls:label==='Reports'?(pathname==='/dashboard/reports'||pathname.startsWith('/dashboard/reports/')):false))}</nav>}
    </div>
    <nav className="shrink-0 p-3 border-t border-white/10 space-y-1" aria-label="Account tools">{permissions.isPlatformOwner&&item('Platform administration','/dashboard/portfolio',pathname==='/dashboard/portfolio')}{item('Settings & members','/dashboard/settings',pathname==='/dashboard/settings')}{item('Help & support','/dashboard/help',pathname==='/dashboard/help')}</nav>
  </aside>
}

