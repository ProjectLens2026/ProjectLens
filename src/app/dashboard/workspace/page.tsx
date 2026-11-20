'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {usePermissions} from '@/lib/usePermissions'
import {useProjectDirectory} from '@/components/useProjectDirectory'
import DirectoryControls,{DirectoryPager} from '@/components/DirectoryControls'
import {ensureWorkspaceProject} from '@/lib/projectStore'
import {useProjectWorkspace,rememberedProjectVersion} from '@/components/useProjectWorkspace'
import {workspaceVersion} from '@/lib/projectWorkspace'
import {decisionLabel} from '@/lib/controlWorkflow'
import {useVersionNavigation} from '@/components/VersionNavigation'
export default function PortfolioWorkspace(){const permissions=usePermissions(),state=useProjectWorkspace(),directory=useProjectDirectory(permissions.user?.orgId),navigation=useVersionNavigation(),[error,setError]=useState(''),[busy,setBusy]=useState(false),generation=useRef(0)
 useEffect(()=>{generation.current++;setBusy(false);setError('');return()=>{generation.current++}},[permissions.user?.orgId])
 async function open(row:any){const ticket=++generation.current;setBusy(true);setError('');try{const project=await ensureWorkspaceProject(row.id);if(ticket!==generation.current)return;const version=workspaceVersion(project,project.id===state.project?.id?state.version?.id:rememberedProjectVersion(project.id));if(!version)throw Error('This project has no schedule. Use Manage projects to upload its baseline.');navigation.request(project.id,version.id,'/dashboard/schedules')}catch(e){if(ticket===generation.current)setError(String((e as any)?.message||e))}finally{if(ticket===generation.current)setBusy(false)}}
 const date=(s:string)=>s?String(s).slice(0,10):'Not recorded'
 return <main className="flex-1 min-h-0 overflow-y-auto p-5"><div className="flex flex-wrap gap-4 items-center mb-5"><h1 className="text-2xl font-bold">Portfolio</h1><Link href="/dashboard/projects" className="ml-auto text-blue-700 text-sm">Manage projects</Link></div><DirectoryControls directory={directory}/>{directory.error&&<p role="alert" className="text-red-700 my-3">{directory.error}</p>}{error&&<p role="alert" className="text-red-700 my-3">{error}</p>}<div className="overflow-x-auto bg-white border rounded-lg mt-4"><table className="w-full text-sm"><thead><tr>{['Project','Address','Stage','Status','Latest submission DD','Uploaded','Reviewed / decision',''].map((h,i)=><th key={i} className="p-3 text-left border-b">{h}</th>)}</tr></thead><tbody>{directory.rows.map((row:any)=><tr key={row.id} className="border-b"><td className="p-3"><b>{row.project_code||row.name}</b><p className="text-xs text-slate-500">{row.name}</p></td><td className="p-3">{row.address||'Not recorded'}</td><td className="p-3">{row.stage||'Not recorded'}</td><td className="p-3">{row.status.replace(/_/g,' ')}</td><td className="p-3">{date(row.data_date)}</td><td className="p-3">{date(row.uploaded_at)}</td><td className="p-3">{date(row.reviewed_at)}<p>{decisionLabel(row.decision)}</p></td><td className="p-3"><button className="text-blue-700" disabled={busy||navigation.opening} onClick={()=>open(row)}>Open project</button></td></tr>)}</tbody></table>{directory.loading&&<p role="status" className="p-5">Loading projects…</p>}{!directory.loading&&!directory.rows.length&&!directory.error&&<p className="p-5">No projects match your filters.</p>}</div><DirectoryPager directory={directory}/></main>
}
