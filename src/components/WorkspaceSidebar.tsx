'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getActiveProject, getActiveVersion, loadProjects, subscribeToProjects, getProjectStatus, Project } from '@/lib/projectStore'
import { usePermissions, roleLabel } from '@/lib/usePermissions'
import { browserDate, scheduleDataDate, compareScheduleVersions } from '@/lib/versionBrowser'
import { useVersionNavigation } from './VersionNavigation'

export default function WorkspaceSidebar({user}:{user:{name:string;company:string;initials:string}}) {
  const pathname=usePathname(), permissions=usePermissions(), navigation=useVersionNavigation()
  const [projects,setProjects]=useState<Project[]>([])
  const [active,setActive]=useState({project:'',version:''})
  const [expanded,setExpanded]=useState<Record<string,boolean>>({})
  useEffect(()=>{const sync=()=>{setProjects(loadProjects());const p=getActiveProject();setActive({project:p?.id||'',version:getActiveVersion(p)?.id||''})};sync();return subscribeToProjects(sync)},[])
  const identity=permissions.user
  const links=[['Portfolio overview','/dashboard/enterprise'],['Projects & versions','/dashboard/projects']]
  const projectLinks=[['Schedule versions','/dashboard/projects?projectId='+encodeURIComponent(active.project)],['Project Controls','/dashboard/controls'],['Reports','/dashboard/reports']]
  const controls=['controls','changes','tia','risks','procurement','submittals','evm','trend'].some(x=>pathname==='/dashboard/'+x)
  const item=(label:string,href:string,selected:boolean)=><Link key={href} href={href} aria-current={selected?'page':undefined} className={`block rounded-xl px-3 py-2.5 text-sm transition-colors ${selected?'bg-blue-600 text-white shadow-lg shadow-blue-950/20':'text-slate-300 hover:bg-white/10 hover:text-white'}`}>{label}</Link>
  return <aside className="workspace-sidebar print:hidden bg-[#0c192e] text-white flex flex-col w-[272px] shrink-0 border-r border-white/5" aria-label="Company and project navigation" data-navigation-controls>
    <Link href="/dashboard/projects" className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
      <svg width="32" height="24" viewBox="0 0 44 32" aria-label="CPMreview mark"><rect y="0" width="32" height="5" rx="1" fill="#2563eb"/><rect y="9" width="44" height="5" rx="1" fill="#dc2626"/><rect y="18" width="26" height="5" rx="1" fill="#16a34a"/><rect y="27" width="36" height="5" rx="1" fill="#1f2937"/></svg>
      <div><div className="font-extrabold text-xl tracking-tight">CPM<span className="text-blue-400">review</span></div><div className="text-[9px] text-slate-400">Construction Schedule Review</div></div>
    </Link>
    <div className="px-5 py-5 border-b border-white/10">
      <p className="text-[10px] tracking-[.16em] uppercase text-slate-400 mb-2">Your company</p>
      <p className="font-semibold text-sm leading-6">{identity?.orgName||identity?.company||user.company||'Workspace'}</p>
      <div className="flex items-center gap-3 mt-4"><span className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-200 grid place-items-center font-bold">{identity?.initials||user.initials}</span><div className="min-w-0"><p className="text-sm truncate">{identity?.displayName||user.name}</p><p className="text-xs text-teal-300 mt-1">{identity?roleLabel(identity.orgRole):'Loading role…'}</p></div></div>
    </div>
    <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      <nav className="space-y-1" aria-label="Workspace">{links.map(([label,href])=>item(label,href,pathname===href))}</nav>
      <section><div className="px-3 text-[10px] uppercase tracking-[.16em] text-slate-400 mb-3">Accessible projects</div>
        {!projects.length&&<p className="px-3 text-xs text-slate-400">No projects available.</p>}
        {projects.filter(p=>!['Archived','Deleted'].includes(getProjectStatus(p))).map(p=>{
          const open=expanded[p.id]??p.id===active.project
          return <div key={p.id} className="mb-1"><button aria-expanded={open} onClick={()=>setExpanded(s=>({...s,[p.id]:!open}))} className={`w-full text-left rounded-lg px-3 py-2 text-sm flex gap-2 ${p.id===active.project?'bg-white/10 text-white':'text-slate-300 hover:bg-white/5'}`}><span>{open?'⌄':'›'}</span><span className="truncate">{p.projectId||p.name}</span><span className="ml-auto text-slate-400 text-xs">{p.versions.filter(v=>!v.deletedAt&&!v.archivedAt).length}</span></button>
            {open&&<div className="ml-5 pl-3 border-l border-slate-700 my-2 space-y-1"><Link href={'/dashboard/projects?projectId='+encodeURIComponent(p.id)} className="block py-2 text-xs text-teal-300">Manage project →</Link>{p.versions.filter(v=>!v.deletedAt&&!v.archivedAt).slice().sort(compareScheduleVersions).map(v=><button key={v.id} disabled={navigation.opening} onClick={()=>navigation.request(p.id,v.id,'/dashboard')} aria-current={v.id===active.version&&p.id===active.project?'page':undefined} className={`block text-left w-full rounded-lg px-2 py-2 text-xs disabled:opacity-50 ${v.id===active.version&&p.id===active.project?'bg-blue-600 text-white':'text-slate-400 hover:bg-white/5 hover:text-white'}`}><span className="block">{scheduleDataDate(v)?browserDate(scheduleDataDate(v)):'Date not reported'}</span><span className="block truncate opacity-70 mt-1" title={v.versionLabel||v.fileName}>{v.versionLabel||v.fileName}</span></button>)}</div>}
          </div>
        })}
      </section>
      {active.project&&<nav className="space-y-1" aria-label="Project destinations"><p className="px-3 text-[10px] uppercase tracking-[.16em] text-slate-400 mb-2">Project workspace</p>{projectLinks.map(([label,href])=>item(label,href,label==='Project Controls'?controls:pathname===href))}</nav>}
    </div>
    <nav className="p-3 border-t border-white/10 space-y-1" aria-label="Account tools">{permissions.isPlatformOwner&&item('Platform administration','/dashboard/portfolio',pathname==='/dashboard/portfolio')}{item('Settings & members','/dashboard/settings',pathname==='/dashboard/settings')}{item('Help & support','/dashboard/help',pathname==='/dashboard/help')}</nav>
  </aside>
}

