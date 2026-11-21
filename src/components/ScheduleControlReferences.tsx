'use client'
import {useEffect,useRef,useState} from 'react'
import {usePermissions} from '@/lib/usePermissions'
import {cloudId} from '@/lib/controlWorkflow'
import {referenceCandidates,assignScheduleReference,ReferenceKind} from '@/lib/scheduleReferences'
import {browserDate,scheduleDataDate} from '@/lib/versionBrowser'
import WorkspaceDialog from './WorkspaceDialog'
export default function ScheduleControlReferences({project,workflow}:{project:any;workflow:any}){
 const permissions=usePermissions(),[open,setOpen]=useState(false),[kind,setKind]=useState<ReferenceKind>('baseline'),[choice,setChoice]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expected,setExpected]=useState(0),lock=useRef(false),generation=useRef(0)
 useEffect(()=>()=>{generation.current++},[])
 const versions=(project.versions||[]).filter((v:any)=>!v.deletedAt&&!v.archivedAt),canManage=permissions.isOwner||permissions.isAdmin
 const find=(id:string)=>versions.find((v:any)=>{try{return cloudId(v.id)===id}catch{return false}})
 const baseline=find(workflow.control?.baseline_version_id),update=find(workflow.control?.update_version_id),candidates=referenceCandidates(versions,workflow.reviews,kind)
 const label=(v:any)=>v?.versionLabel||v?.fileName||'Not assigned',current=kind==='baseline'?workflow.control?.baseline_version_id:workflow.control?.update_version_id
 let selectedId='';try{if(choice)selectedId=cloudId(choice)}catch{}
 const changed=(workflow.control?.revision||0)!==expected
 const eligible=candidates.some((v:any)=>v.id===choice)&&selectedId!==current&&(kind==='baseline'||Boolean(baseline))
 function show(){setKind(baseline?'update':'baseline');setChoice('');setReason('');setError('');setExpected(workflow.control?.revision||0);setOpen(true)}
 async function assign(e:React.FormEvent){e.preventDefault();if(lock.current||!canManage||!eligible||changed||workflow.loading||workflow.error)return;const ticket=generation.current;lock.current=true;setBusy(true);setError('');try{
  await assignScheduleReference(project.id,choice,kind,reason,expected)
  if(ticket===generation.current){setOpen(false);window.dispatchEvent(new Event('cpmr:workflow'))}
 }catch(e){if(ticket===generation.current){setError(String((e as any)?.message||e));void workflow.reload()}}finally{lock.current=false;if(ticket===generation.current)setBusy(false)}}
 return <section className="versions-references" aria-label="Approved control references">
  <span>Approved baseline <strong>{workflow.loading?'Loading…':workflow.error?'Unavailable':label(baseline)}</strong></span>
  <span>Active control update <strong>{workflow.loading?'Loading…':workflow.error?'Unavailable':label(update)}</strong></span>
  <button type="button" disabled={workflow.loading||Boolean(workflow.error)} onClick={show}>{canManage?'Manage references':'View references'}</button>
  {open&&<WorkspaceDialog title="Approved control references" busy={busy} onClose={()=>{if(!busy)setOpen(false)}}>
   {canManage?<form onSubmit={assign} className="space-y-4"><label className="block text-sm">Reference type<select disabled={busy} value={kind} onChange={e=>{setKind(e.target.value as ReferenceKind);setChoice('')}} className="block w-full border rounded p-2 mt-1"><option value="baseline">Approved baseline</option><option value="update">Active control update</option></select></label>
    <label className="block text-sm">Eligible submission<select disabled={busy||workflow.loading} value={choice} onChange={e=>setChoice(e.target.value)} className="block w-full border rounded p-2 mt-1"><option value="">Choose a submission</option>{candidates.map((v:any)=><option key={v.id} value={v.id}>{label(v)} · {scheduleDataDate(v)?browserDate(scheduleDataDate(v)):'Date unavailable'}</option>)}</select></label>
    {!candidates.length&&<p className="text-sm text-slate-600">Record the required decision in QC & decisions before assigning a reference.</p>}
    {kind==='update'&&!baseline&&<p className="text-sm text-amber-800">Assign the approved baseline first.</p>}
    {kind==='baseline'&&update&&<p className="text-sm text-amber-800">Assigning a baseline clears the current control update. Assign an accepted update afterward.</p>}
    {selectedId&&selectedId===current&&<p className="text-sm text-slate-600">This submission is already assigned.</p>}
    <label className="block text-sm">Approval letter / authority reference<input disabled={busy} required minLength={5} value={reason} onChange={e=>setReason(e.target.value)} className="block w-full border rounded p-2 mt-1"/></label>
    {(error||changed||workflow.error)&&<p role="alert" className="text-red-700 text-sm">{error||workflow.error||'References changed in another session. Reload before assigning.'}</p>}
    <footer className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} className="border rounded p-2" onClick={()=>{void workflow.reload();setOpen(false)}}>Reload references</button><button disabled={busy||workflow.loading||!!workflow.error||changed||!eligible||reason.trim().length<5} className="bg-blue-600 text-white rounded p-2">{busy?'Assigning…':kind==='baseline'?'Use as approved baseline':'Use as active control update'}</button></footer>
   </form>:<div className="space-y-3 text-sm"><p>Approved baseline: {label(baseline)}</p><p>Active control update: {label(update)}</p><p className="text-slate-600">Organization owners and admins manage these references.</p></div>}
  </WorkspaceDialog>}
 </section>
}
