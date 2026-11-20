'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import useSidebarWidth from './useSidebarWidth'
import {useProjectDirectory} from './useProjectDirectory'
import DirectoryControls,{DirectoryPager} from './DirectoryControls'
import {ensureWorkspaceProject} from '@/lib/projectStore'
import {cloudId} from '@/lib/controlWorkflow'
import {usePathname} from 'next/navigation'
import {usePermissions,roleLabel} from '@/lib/usePermissions'
import {useVersionNavigation} from './VersionNavigation'
import {useProjectWorkspace,rememberedProjectVersion} from './useProjectWorkspace'
import {PROJECT_TABS,workspaceTab,workspaceVersion,workspaceIdentity} from '@/lib/projectWorkspace'
export default function WorkspaceSidebar({user}:{user:{name:string;company:string;initials:string}}){
 const path=usePathname(),permissions=usePermissions(),navigation=useVersionNavigation(),state=useProjectWorkspace(),identity=permissions.user
 const resize=useSidebarWidth()
 const directory=useProjectDirectory(identity?.orgId,20),[openError,setOpenError]=useState(''),[opening,setOpening]=useState(false),request=useRef(0)
 useEffect(()=>{request.current++;setOpening(false);setOpenError('');return()=>{request.current++}},[identity?.orgId])
 async function open(row:any){const ticket=++request.current;setOpening(true);setOpenError('');try{const project=await ensureWorkspaceProject(row.id);if(ticket!==request.current)return;const version=workspaceVersion(project,project.id===state.project?.id?state.version?.id:rememberedProjectVersion(project.id));if(!version)throw Error('This project has no active schedule. Use Manage projects to upload its baseline.');const tab=workspaceTab(path);navigation.request(project.id,version.id,PROJECT_TABS.find(t=>t.label===tab)?.href||'/dashboard/schedules')}catch(e){if(ticket===request.current)setOpenError(String((e as any)?.message||e))}finally{if(ticket===request.current)setOpening(false)}}
 let selectedId='';try{if(state.project)selectedId=cloudId(state.project.id)}catch{}
 return <aside className="workspace-sidebar print:hidden bg-[#0c192e] text-white flex flex-col shrink-0 border-r border-white/5 relative" style={{width:resize.width}} aria-label="Company and project navigation" data-navigation-controls>
 <Link href="/dashboard/workspace" className="workspace-brand p-6 border-b border-white/10 font-extrabold text-xl flex items-center gap-3">{/* CPMR_RESTORED_BRAND */}<svg width="32" height="24" viewBox="0 0 44 32" aria-hidden="true" className="shrink-0"><rect y="0" width="32" height="5" rx="1" fill="#2563eb"/><rect y="9" width="44" height="5" rx="1" fill="#dc2626"/><rect y="18" width="26" height="5" rx="1" fill="#16a34a"/><rect y="27" width="36" height="5" rx="1" fill="#1f2937"/></svg><span>CPM<span className="text-blue-400">review</span></span></Link>
 <div className="px-5 py-4 border-b border-white/10"><p className="text-sm font-semibold">{identity?.orgName||identity?.company||user.company||'Workspace'}</p><p className="text-xs text-slate-300 mt-2">{identity?.displayName||user.name}{identity?' · '+roleLabel(identity.orgRole):''}</p></div>
 <div className="flex-1 min-h-0 overflow-y-auto p-3"><Link href="/dashboard/workspace" aria-current={path==='/dashboard/workspace'?'page':undefined} className={`block rounded-lg px-3 py-3 text-sm font-semibold ${path==='/dashboard/workspace'?'bg-blue-600':'hover:bg-white/10'}`}>Portfolio</Link>
 <p className="px-3 mt-6 mb-2 text-xs text-slate-400 uppercase tracking-wide">Projects</p><DirectoryControls directory={directory} compact />
 {directory.error&&<p role="alert" className="text-xs p-2 text-red-200">{directory.error}</p>}{openError&&<p role="alert" className="text-xs p-2 text-amber-200">{openError} <Link href="/dashboard/projects" className="underline">Manage projects</Link></p>}
 <nav aria-label="Projects" className="space-y-1 mt-3">{directory.rows.map((row:any,index:number)=><button key={row.id} type="button" disabled={opening||navigation.opening} aria-current={selectedId===row.id&&Boolean(workspaceTab(path))?'page':undefined} onClick={()=>open(row)} className={`text-left w-full rounded-lg px-3 py-3 ${selectedId===row.id?'bg-blue-600 text-white':'text-slate-200 hover:bg-white/10'} disabled:opacity-50`}><span className="block font-semibold text-sm">{directory.page*directory.size+index+1}. {row.project_code||row.name}</span><span className="block text-xs mt-1 opacity-80">{row.status.replace(/_/g,' ')}</span><span className="block text-xs mt-1 opacity-80">Latest upload DD: {row.data_date?String(row.data_date).slice(0,10):'Not recorded'}</span><span className="block text-xs mt-1 opacity-80">Uploaded: {row.uploaded_at?String(row.uploaded_at).slice(0,10):'Not recorded'}</span></button>)}</nav>{directory.loading&&<p role="status" className="p-2 text-xs">Loading projects…</p>}{!directory.loading&&!directory.rows.length&&!directory.error&&<p className="p-2 text-xs">No matching projects.</p>}<DirectoryPager directory={directory}/></div>
 <nav aria-label="Account tools" className="p-3 border-t border-white/10 text-sm space-y-1">{permissions.isPlatformOwner&&<Link className="block p-2 text-slate-300" href="/dashboard/portfolio">Platform administration</Link>}<Link className="block p-2 text-slate-300" href="/dashboard/settings">Settings & members</Link><Link className="block p-2 text-slate-300" href="/dashboard/help">Help & support</Link></nav><div role="separator" aria-label="Resize project sidebar" aria-orientation="vertical" aria-valuenow={resize.width} aria-valuemin={220} aria-valuemax={520} tabIndex={0} onPointerDown={resize.start} onKeyDown={resize.key} className="hidden md:block absolute top-0 bottom-0 -right-1 w-2 z-40 cursor-col-resize hover:bg-blue-400/40 focus:bg-blue-400/40" style={{touchAction:'none'}} /></aside>
}
