'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getActiveProject, getActiveVersion, loadProjects, subscribeToProjects, getProjectStatus, Project } from '@/lib/projectStore'
import { compareScheduleVersions, scheduleDataDate, browserDate } from '@/lib/versionBrowser'
import { useVersionNavigation } from './VersionNavigation'
import { createClient } from '@/lib/supabase/client'

const tabs = [['Overview','/dashboard'],['Changes','/dashboard/changes'],['Review Schedule','/dashboard/approval'],['CPM Analysis','/dashboard/lens'],['Project Controls','/dashboard/controls'],['Reports','/dashboard/reports']]
export default function WorkspaceHeader({user}:{user:{name:string;company:string;initials:string}}) {
  const pathname=usePathname(), router=useRouter(), navigation=useVersionNavigation()
  const [projects,setProjects]=useState<Project[]>([])
  const [selection,setSelection]=useState({projectId:'',versionId:''})
  const [error,setError]=useState('')
  useEffect(()=>{const refresh=()=>{setProjects(loadProjects());const p=getActiveProject();setSelection({projectId:p?.id||'',versionId:getActiveVersion(p)?.id||''})};refresh();return subscribeToProjects(refresh)},[])
  const project=projects.find(p=>p.id===selection.projectId)
  const versions=(project?.versions||[]).filter(v=>!v.deletedAt&&!v.archivedAt).slice().sort(compareScheduleVersions)
  const projectPage=pathname==='/dashboard'||!['/dashboard/projects','/dashboard/enterprise','/dashboard/settings','/dashboard/help','/dashboard/profile','/dashboard/upload','/dashboard/archive','/dashboard/deleted','/dashboard/portfolio'].includes(pathname)
  async function signOut(){setError('');try{const {error}=await createClient().auth.signOut();if(error)throw error;router.replace('/login')}catch{setError('Sign out failed. Please retry.')}}
  return <header className="workspace-header shrink-0 bg-white border-b border-slate-200 print:hidden" data-navigation-controls>
    <div className="flex items-center gap-6 px-5 py-3 flex-wrap">
      <Link href="/dashboard/projects" className="flex items-center gap-2.5" aria-label="CPMreview projects">
        <svg width="28" height="20" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-label="CPMreview mark"><rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/><rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/><rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/><rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/></svg>
        <div><div className="font-extrabold text-slate-900 tracking-tight">CPM<span className="text-blue-500">review</span></div><div className="text-[9px] text-slate-500">Construction Schedule Review</div></div>
      </Link>
      <nav className="flex gap-2 text-sm" aria-label="Workspace">{[['Enterprise','/dashboard/enterprise'],['Projects','/dashboard/projects']].map(([label,href])=><Link key={href} href={href} aria-current={pathname===href?'page':undefined} className={`rounded-lg px-3 py-2 ${pathname===href?'bg-blue-50 text-blue-700 font-semibold':'text-slate-600 hover:bg-slate-50'}`}>{label}</Link>)}</nav>
      <span className="hidden lg:block text-sm text-slate-500 border-l pl-6 truncate max-w-sm">{user.company}</span>
      <details className="relative ml-auto text-sm"><summary className="cursor-pointer list-none flex items-center gap-2"><span className="rounded-full bg-teal-50 text-teal-800 px-3 py-2 font-semibold">{user.initials}</span><span className="hidden sm:inline">{user.name}</span><span>⌄</span></summary><div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border bg-white shadow-lg p-2">{[['Profile','/dashboard/profile'],['Settings','/dashboard/settings'],['Help & Support','/dashboard/help'],['Archived items','/dashboard/projects?view=archived'],['Deleted items','/dashboard/projects?view=deleted']].map(([label,href])=><Link key={href} className="block rounded px-3 py-2 hover:bg-blue-50" href={href}>{label}</Link>)}<button className="text-left w-full px-3 py-2 text-red-700" onClick={signOut}>Sign out</button>{error&&<p role="alert" className="text-red-700 p-2">{error}</p>}</div></details>
    </div>
    {projectPage&&<><div className="border-t border-slate-100 flex flex-wrap items-center gap-4 px-5 py-3 text-sm"><Link href="/dashboard/projects" className="text-blue-700 font-semibold">← All projects</Link><label className="flex items-center gap-2 text-slate-500">Project<select aria-label="Select project" className="border rounded-lg p-2 text-slate-900 max-w-[240px]" value={selection.projectId} onChange={e=>router.push('/dashboard/projects?projectId='+encodeURIComponent(e.target.value))}><option value="">Choose project</option>{projects.filter(p=>!['Archived','Deleted'].includes(getProjectStatus(p))).map(p=><option key={p.id} value={p.id}>{p.projectId||p.name}</option>)}</select></label><label className="flex items-center gap-2 text-slate-500 min-w-0">Showing<select aria-label="Showing schedule version" disabled={navigation.opening||!project} className="border rounded-lg p-2 text-slate-900 max-w-[min(65vw,520px)]" value={selection.versionId} onChange={e=>project&&navigation.request(project.id,e.target.value,pathname)}><option value="">Choose version</option>{versions.map(v=><option key={v.id} value={v.id}>{scheduleDataDate(v)?browserDate(scheduleDataDate(v)):'Data date not reported'} · {v.versionLabel||v.fileName} · {v.fileName}</option>)}</select></label></div><nav className="flex overflow-x-auto gap-1 px-5" aria-label="Project workspace">{tabs.map(([label,href])=>{const active=pathname===href||(href!=='/dashboard'&&pathname.startsWith(href+'/'));return <Link key={href} href={href} aria-current={active?'page':undefined} className={`whitespace-nowrap px-4 py-3 text-sm border-b-2 ${active?'border-blue-600 text-blue-700 font-semibold':'border-transparent text-slate-500 hover:text-blue-700'}`}>{label}</Link>})}</nav></>}
  </header>
}
