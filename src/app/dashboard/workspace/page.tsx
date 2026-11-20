'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import PortfolioCreateProject from '@/components/PortfolioCreateProject'
import PortfolioEditProject from '@/components/PortfolioEditProject'
import {setActiveProjectId,setActiveVersionId,ensureWorkspaceProject} from '@/lib/projectStore'
import {usePermissions} from '@/lib/usePermissions'
import {useProjectDirectory} from '@/components/useProjectDirectory'
import DirectoryControls,{DirectoryPager} from '@/components/DirectoryControls'
import {useProjectWorkspace,rememberedProjectVersion} from '@/components/useProjectWorkspace'
import {workspaceVersion} from '@/lib/projectWorkspace'
import {decisionLabel} from '@/lib/controlWorkflow'
import {useVersionNavigation} from '@/components/VersionNavigation'
import './portfolio.css'

function date(value:string){
 const raw=String(value||'').slice(0,10)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return 'Not recorded'
 const [year,month,day]=raw.split('-'),label=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(month)-1]
 return label?`${day}-${label}-${year}`:'Not recorded'
}

export default function PortfolioWorkspace(){
 const permissions=usePermissions(),state=useProjectWorkspace(),directory=useProjectDirectory(permissions.user?.orgId),navigation=useVersionNavigation(),router=useRouter()
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[created,setCreated]=useState(''),generation=useRef(0)
 useEffect(()=>{generation.current++;setBusy(false);setError('');setCreated('');return()=>{generation.current++}},[permissions.user?.orgId])
 async function open(row:any){
  const ticket=++generation.current;setBusy(true);setError('')
  try{
   const project=await ensureWorkspaceProject(row.id)
   if(ticket!==generation.current)return
   const version=workspaceVersion(project,project.id===state.project?.id?state.version?.id:rememberedProjectVersion(project.id))
   if(!version){setActiveProjectId(project.id);setActiveVersionId(null);router.push('/dashboard/schedules');return}
   navigation.request(project.id,version.id,'/dashboard/schedules')
  }catch(e){if(ticket===generation.current)setError(String((e as any)?.message||e))}
  finally{if(ticket===generation.current)setBusy(false)}
 }
 return <main data-navigation-controls className="portfolio-root flex-1 min-h-0 overflow-y-auto">
  <div className="portfolio-heading">
   <h1>Portfolio <span>{directory.total.toLocaleString()} projects</span></h1>
   <div className="portfolio-heading-actions">
    <Link href="/dashboard/projects">Manage projects</Link>
    {permissions.can.createProject&&<PortfolioCreateProject onCreated={id=>{setCreated(id);directory.setQuery('');directory.setStatus('');directory.setStage('');directory.setPage(0);directory.reload()}}/>}
   </div>
  </div>
  <div className="portfolio-filters"><DirectoryControls directory={directory}/></div>
  {created&&<div role="status" className="portfolio-notice">Project saved. <button type="button" disabled={busy||navigation.opening} onClick={()=>open({id:created})}>Open new project</button></div>}
  {directory.error&&<p role="alert" className="portfolio-error">{directory.error}</p>}
  {error&&<p role="alert" className="portfolio-error">{error}</p>}
  <div className="portfolio-results"><span>{directory.total.toLocaleString()} matching projects</span><span>Results {directory.total?directory.page*directory.size+1:0}–{Math.min((directory.page+1)*directory.size,directory.total)}</span></div>
  <div className="portfolio-grid" aria-label="Projects">
   {directory.rows.map((row:any,index:number)=><article key={row.id} className="portfolio-card" aria-label={row.project_code||row.name}>
    <span className="sr-only">Result {directory.page*directory.size+index+1}</span>
    <div className="portfolio-card-heading">
     <h2><button type="button" className="portfolio-project-id" disabled={busy||navigation.opening} onClick={()=>open(row)}>{row.project_code||row.name}</button></h2>
     <span className="portfolio-status" data-status={row.status}>{String(row.status||'Not recorded').replace(/_/g,' ')}</span>
    </div>
    <p className="portfolio-project-name">{row.name}</p>
    <p className="portfolio-address">{row.address||'Address not recorded'}</p>
    <p className="portfolio-stage">Stage: {row.stage||'Not recorded'}</p>
    <div className="portfolio-card-footer">
     <div className="portfolio-data-date"><span>Data date</span>{row.data_date?<time dateTime={String(row.data_date).slice(0,10)}>{date(row.data_date)}</time>:<strong>Not recorded</strong>}</div>
     <div className="portfolio-card-actions">
      <button type="button" className="portfolio-open" disabled={busy||navigation.opening} onClick={()=>open(row)}>Open project</button>
      {permissions.can.renameProject&&<div className="portfolio-edit"><PortfolioEditProject key={row.id} label="Edit" projectId={row.id} onSaved={()=>directory.reload()}/></div>}
     </div>
     <details className="portfolio-schedule-details">
      <summary>Schedule details</summary>
      <dl><div><dt>Uploaded</dt><dd>{date(row.uploaded_at)}</dd></div><div><dt>Reviewed</dt><dd>{date(row.reviewed_at)}</dd></div><div><dt>Decision</dt><dd>{decisionLabel(row.decision)}</dd></div></dl>
     </details>
    </div>
   </article>)}
  </div>
  {directory.loading&&<p role="status" className="portfolio-empty">Loading projects…</p>}
  {!directory.loading&&!directory.rows.length&&!directory.error&&<p className="portfolio-empty">No projects match your filters.</p>}
  <div className="portfolio-pager"><DirectoryPager directory={directory}/></div>
 </main>
}
