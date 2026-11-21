'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useScheduleFolders,FolderEdit} from '@/components/ScheduleFoldersProvider'
import ScheduleFolderTree from '@/components/ScheduleFolderTree'
import ScheduleFolderDialog from '@/components/ScheduleFolderDialog'
import ScheduleVersionActions from '@/components/ScheduleVersionActions'
import ScheduleControlReferences from '@/components/ScheduleControlReferences'
import {filterFolderVersions,folderPath,folderForVersion,FolderSort} from '@/lib/scheduleFolders'
import {useProjectWorkspace} from '@/components/useProjectWorkspace'
import {useControlWorkflow} from '@/components/useControlWorkflow'
import {cloudId,decisionLabel} from '@/lib/controlWorkflow'
import {useVersionNavigation} from '@/components/VersionNavigation'
import {compareScheduleVersions,browserDate,scheduleDataDate} from '@/lib/versionBrowser'
import {getSavedVersionXerSignedUrl} from '@/lib/supabase/db'
import './versions.css'
export default function ProjectSchedules(){
 const {project,version,ready}=useProjectWorkspace(),navigation=useVersionNavigation(),workflow=useControlWorkflow(project?.id),folders=useScheduleFolders()
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[decision,setDecision]=useState('all'),[folderEdit,setFolderEdit]=useState<FolderEdit|null>(null),request=useRef<AbortController|null>(null)
 useEffect(()=>{setError('');setBusy('');setFolderEdit(null);return()=>{request.current?.abort();request.current=null}},[project?.id,version?.id])
 useEffect(()=>{setDecision('all')},[project?.id])
 async function download(v:any){
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(v.id);setError('')
  try{
   const signed=await getSavedVersionXerSignedUrl(v.id)
   if(controller.signal.aborted)return
   if(!signed.ok||!signed.signedUrl)throw Error('The original source file is unavailable for '+v.fileName+'. Re-upload that submission to restore source download.')
   const response=await fetch(signed.signedUrl,{signal:controller.signal});if(!response.ok)throw Error('The stored source could not be downloaded.')
   const blob=await response.blob();if(controller.signal.aborted)return
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=v.fileName||'schedule.xer';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Download failed.')}
  finally{if(request.current===controller){request.current=null;setBusy('')}}
 }
 if(!ready)return <main className="versions-root flex-1 p-5">Loading schedules…</main>
 if(!project)return <main className="versions-root flex-1 p-5"><Link href="/dashboard/workspace">Select a project from Portfolio.</Link></main>
 const mapped=(v:any)=>{try{return cloudId(v.id)}catch{return ''}}
 const reviewFor=(v:any)=>workflow.reviews.find((r:any)=>r.version_id===mapped(v))
 const folderScope=folders.error?'all':folders.scope
 const scoped=filterFolderVersions(project.versions||[],folders.library,folderScope,folders.query,folders.sort,cloudId)
 const versions=workflow.loading||workflow.error?scoped:scoped.filter((v:any)=>decision==='all'||(reviewFor(v)?.disposition||'NOT_RECORDED')===decision)
 const available=(project.versions||[]).filter((v:any)=>!v.deletedAt&&!v.archivedAt).slice().sort(compareScheduleVersions)
 const date=(d?:string)=>d?browserDate(d):'Not recorded'
 const reviewDate=(d?:string)=>workflow.loading?'Loading…':workflow.error?'Unavailable':date(d)
 const path=folderScope==='all'?'All schedules':folderScope==='unfiled'?'Unfiled':folderPath(folders.library.folders,folderScope)
 return <main className="versions-root flex-1 min-h-0 overflow-y-auto" data-navigation-controls>
  <div className="versions-heading"><h2>Versions & uploads</h2><Link href={'/dashboard/projects?projectId='+encodeURIComponent(project.id)}>Manage versions</Link></div>
  <ScheduleControlReferences key={project.id} project={project} workflow={workflow}/>
  <div className="versions-viewing"><label htmlFor="versions-view-select">Viewing XER</label><select id="versions-view-select" aria-label="Viewing schedule version" disabled={navigation.opening} value={version?.id||''} onChange={e=>navigation.request(project.id,e.target.value,'/dashboard/schedules')}><option value="">Choose a version</option>{available.map((v:any)=><option key={v.id} value={v.id}>{scheduleDataDate(v)?browserDate(scheduleDataDate(v)):'Date unavailable'} · {v.versionLabel||v.scheduleType||v.fileName}</option>)}</select><span>Viewing a file keeps your control references in place.</span></div>
  <details className="versions-mobile-folders"><summary>Schedule folders</summary><ScheduleFolderTree key={project.id}/></details>
  <div className="versions-toolbar"><input aria-label="Find a schedule submission" placeholder="Find a submission or file" value={folders.query} onChange={e=>folders.setQuery(e.target.value)}/><select aria-label="Filter schedule review decision" value={decision} disabled={workflow.loading||!!workflow.error} onChange={e=>setDecision(e.target.value)}><option value="all">All decisions</option><option value="APPROVED">Approved</option><option value="ACCEPTED_WITH_COMMENTS">Accepted with comments</option><option value="RETURNED_FOR_REVISION">Returned for revision</option><option value="NOT_RECORDED">Not recorded</option></select><select aria-label="Sort schedule submissions" value={folders.sort} onChange={e=>folders.setSort(e.target.value as FolderSort)}><option value="newest">Newest data date</option><option value="oldest">Oldest data date</option><option value="name">Submission name</option></select>{folders.library.can_edit&&!folders.error&&<button type="button" disabled={folders.busy} onClick={()=>setFolderEdit({action:'create',parent:!['all','unfiled'].includes(folders.scope)?folders.scope:null})}>+ New folder</button>}</div>
  <p className="versions-scope" aria-live="polite">{project.projectId||project.name} / <span>{path}</span> · {versions.length} submissions</p>
  {folders.error&&<p role="alert" className="versions-error">{folders.error}</p>}
  {workflow.error&&<p role="alert" className="versions-error">{workflow.error}</p>}
  {error&&<p role="alert" className="versions-error">{error}</p>}
  <div className="versions-table-shell"><table className="versions-table"><caption className="sr-only">Schedule submissions for {project.projectId||project.name}</caption><thead><tr>{['Submission / original file','Data date','Uploaded','Reviewed','Review decision','Approved','Control role','Actions'].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{versions.map((v:any)=>{
   const id=mapped(v),review=reviewFor(v),disposition=review?.disposition||'NOT_RECORDED'
   const role=workflow.loading?'Loading…':workflow.error?'Unavailable':id===workflow.control?.baseline_version_id?'Approved baseline':id===workflow.control?.update_version_id?'Active control update':'History / analysis only'
   return <tr key={v.id} className={version?.id===v.id?'versions-selected':''}>
    <td data-label="Submission"><button type="button" className="versions-submission" disabled={navigation.opening} onClick={()=>navigation.request(project.id,v.id,'/dashboard/schedules')}>{v.versionLabel||v.scheduleType||'Schedule'}</button><p className="versions-filename">{v.fileName}</p><p className="versions-filename">{folders.loading?'Loading folder…':folders.error?'Folder unavailable':folderPath(folders.library.folders,folderForVersion(folders.library,id))}</p></td>
    <td data-label="Data date">{date(scheduleDataDate(v))}</td><td data-label="Uploaded">{date(v.uploadedAt)}</td><td data-label="Reviewed">{reviewDate(review?.reviewed_at)}</td>
    <td data-label="Review decision"><span className="versions-decision" data-decision={workflow.loading||workflow.error?'UNKNOWN':disposition}>{workflow.loading?'Loading…':workflow.error?'Unavailable':decisionLabel(review?.disposition)}</span>{review?.decided_at&&!workflow.loading&&!workflow.error&&<p className="versions-decision-date">{date(review.decided_at)}</p>}</td>
    <td data-label="Approved">{reviewDate(review?.approved_at)}</td><td data-label="Control role">{role}</td>
    <td data-label="Actions"><div className="versions-row-actions"><button type="button" className="versions-evaluate" disabled={navigation.opening} onClick={()=>navigation.request(project.id,v.id,'/dashboard/approval')}>Evaluate</button><ScheduleVersionActions key={v.id} version={v} compact onDownload={()=>download(v)} downloadBusy={Boolean(busy)}/></div></td>
   </tr>
  })}</tbody></table>{!versions.length&&<p className="versions-empty">No active submissions match this folder and filter.</p>}</div>
  <p className="versions-note">Review and approval are recorded in QC & decisions. Every original XER remains available from its submission.</p>
  {folderEdit&&<ScheduleFolderDialog key={project.id} edit={folderEdit} onClose={()=>setFolderEdit(null)}/>}
 </main>
}
