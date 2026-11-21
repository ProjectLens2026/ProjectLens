'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import PortfolioCreateProject from '@/components/PortfolioCreateProject'
import PortfolioEditProject from '@/components/PortfolioEditProject'
import PortfolioGroupEditor from '@/components/PortfolioGroupEditor'
import PortfolioAssignments from '@/components/PortfolioAssignments'
import {usePortfolioGroups} from '@/components/usePortfolioGroups'
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
 const permissions=usePermissions(),state=useProjectWorkspace(),orgId=permissions.user?.orgId,groups=usePortfolioGroups(orgId),navigation=useVersionNavigation(),router=useRouter()
 const [selection,setSelection]=useState<{orgId:string;scope:string}|null>(null)
 const scope=selection?.orgId===orgId?selection?.scope:null
 const directory=useProjectDirectory(groups.ready&&scope?orgId:null,25,scope||'all')
 const selectedGroup=groups.groups.find(g=>g.id===scope)||null
 useEffect(()=>{if(orgId&&groups.ready&&!scope)setSelection({orgId,scope:groups.groups[0]?.id||'unassigned'})},[orgId,groups.ready,scope,groups.groups])
 function chooseScope(value:string){if(orgId)setSelection({orgId,scope:value});directory.setQuery('');directory.setPage(0)}
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[created,setCreated]=useState(''),generation=useRef(0)
 useEffect(()=>{generation.current++;setBusy(false);setError('');setCreated('');return()=>{generation.current++}},[orgId,scope])
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
   <h1>Portfolio <span>{Number(groups.total_count).toLocaleString()} projects</span></h1>
   <div className="portfolio-heading-actions">
    <Link href="/dashboard/projects">Manage projects</Link>
   </div>
  </div>
  <section className="portfolio-group-section" aria-label="Companies and programs">
   <p className="portfolio-group-label">Companies / Programs</p>
   <nav className="portfolio-group-list" aria-label="Select company or program">
    {groups.ready&&<button type="button" aria-pressed={scope==='all'} disabled={busy||navigation.opening} onClick={()=>chooseScope('all')}>All projects <span>{Number(groups.total_count).toLocaleString()}</span></button>}
    {groups.groups.map(g=><button key={g.id} type="button" aria-pressed={scope===g.id} disabled={busy||navigation.opening} onClick={()=>chooseScope(g.id)}>{g.name}<span>{Number(g.project_count).toLocaleString()} projects</span></button>)}
    {groups.ready&&<button type="button" aria-pressed={scope==='unassigned'} disabled={busy||navigation.opening} onClick={()=>chooseScope('unassigned')}>Unassigned <span>{Number(groups.unassigned_count).toLocaleString()} projects</span></button>}
    {orgId&&groups.can_manage&&<PortfolioGroupEditor key={orgId} orgId={orgId} onSaved={g=>{setSelection({orgId,scope:g.id});groups.reload()}}/>}
   </nav>
   {groups.loading&&!groups.ready&&<p role="status">Loading companies/programs…</p>}
   {groups.error&&<p role="alert" className="portfolio-error">{groups.error} <button type="button" onClick={groups.reload}>Reload groups</button></p>}
  </section>
  {groups.ready&&scope&&<div className="portfolio-group-heading">
   <h2>{selectedGroup?selectedGroup.name+' projects':scope==='all'?'All projects':scope==='unassigned'?'Unassigned projects':'Company / program projects'}</h2>
   <div className="portfolio-group-actions" key={orgId}>
    {orgId&&groups.can_manage&&selectedGroup&&<PortfolioGroupEditor key={selectedGroup.id} orgId={orgId} group={selectedGroup} onSaved={()=>groups.reload()}/>}
    {orgId&&groups.can_manage&&<PortfolioAssignments orgId={orgId} groups={groups.groups} onSaved={()=>{groups.reload();directory.reload()}}/>}
    {permissions.can.createProject&&<PortfolioCreateProject group={selectedGroup} onCreated={id=>{setCreated(id);directory.setQuery('');directory.setStatus('');directory.setStage('');directory.setPage(0);directory.reload();groups.reload()}}/>}
   </div>
  </div>}
  {groups.ready&&scope&&<div className="portfolio-filters"><DirectoryControls directory={directory}/></div>}
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
      {permissions.can.renameProject&&<div className="portfolio-edit"><PortfolioEditProject key={row.id} label="Edit" projectId={row.id} onSaved={()=>{directory.reload();groups.reload()}}/></div>}
     </div>
     <details className="portfolio-schedule-details">
      <summary>Schedule details</summary>
      <dl><div><dt>Uploaded</dt><dd>{date(row.uploaded_at)}</dd></div><div><dt>Reviewed</dt><dd>{date(row.reviewed_at)}</dd></div><div><dt>Decision</dt><dd>{decisionLabel(row.decision)}</dd></div></dl>
     </details>
    </div>
   </article>)}
  </div>
  {directory.loading&&<p role="status" className="portfolio-empty">Loading projects…</p>}
  {groups.ready&&scope&&!directory.loading&&!directory.rows.length&&!directory.error&&<p className="portfolio-empty">No projects match your filters in this company/program. Use Assign projects to organize existing projects, or Create project to add one.</p>}
  <div className="portfolio-pager">{groups.ready&&scope&&<DirectoryPager directory={directory}/>}</div>
 </main>
}
