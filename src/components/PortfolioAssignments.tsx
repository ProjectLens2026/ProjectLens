'use client'
import {useEffect,useRef,useState} from 'react'
import WorkspaceDialog from './WorkspaceDialog'
import {PortfolioGroup,assignPortfolioProject} from '@/lib/portfolioGroups'
import {useProjectDirectory} from './useProjectDirectory'
import {DirectoryPager} from './DirectoryControls'
export default function PortfolioAssignments({orgId,groups,onSaved}:{orgId:string;groups:PortfolioGroup[];onSaved:()=>void}){
 const [open,setOpen]=useState(false)
 return <><button type="button" onClick={()=>setOpen(true)}>Assign projects</button>{open&&<AssignmentDialog orgId={orgId} groups={groups} onSaved={onSaved} onClose={()=>setOpen(false)}/>}</>
}
function AssignmentDialog({orgId,groups,onSaved,onClose}:{orgId:string;groups:PortfolioGroup[];onSaved:()=>void;onClose:()=>void}){
 const directory=useProjectDirectory(orgId,10,'all'),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false),generation=useRef(0)
 useEffect(()=>()=>{generation.current++},[])
 async function assign(row:any,value:string){if(lock.current)return;lock.current=true;setBusy(true);setError('');const ticket=generation.current;try{await assignPortfolioProject(row,value||null);if(ticket===generation.current){directory.reload();onSaved()}}catch(e){if(ticket===generation.current)setError(String((e as any)?.message||e))}finally{lock.current=false;if(ticket===generation.current)setBusy(false)}}
 return <WorkspaceDialog title="Assign projects to companies / programs" busy={busy} onClose={onClose}><label className="block text-sm">Search projects<input value={directory.query} disabled={busy} onChange={e=>directory.setQuery(e.target.value)} placeholder="Project number or name" className="block w-full border rounded p-2 mt-1"/></label><p className="text-xs text-slate-500 my-3">Choose a group for each project. Each assignment is saved when confirmed by the server.</p>{(directory.error||error)&&<p role="alert" className="text-red-700 text-sm my-3">{error||directory.error}</p>}<div className="space-y-3">{directory.rows.map((row:any)=><label key={row.id} className="block rounded border p-3 text-sm"><span className="font-semibold">{row.project_code||row.name}</span><span className="block text-xs text-slate-600 mb-2">{row.name}</span><select aria-label={'Company or program for '+(row.project_code||row.name)} disabled={busy||directory.loading} value={row.group_id||''} onChange={e=>void assign(row,e.target.value)} className="block border rounded p-2 w-full"><option value="">Unassigned</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>)}</div>{directory.loading&&<p role="status" className="p-3">Loading projects…</p>}{!directory.loading&&!directory.rows.length&&!directory.error&&<p className="p-3">No projects match your search.</p>}<fieldset disabled={busy}><DirectoryPager directory={directory}/></fieldset><footer className="flex justify-between flex-wrap gap-3 mt-4"><button type="button" disabled={busy} className="border rounded p-2" onClick={()=>directory.reload()}>Reload projects</button><button type="button" disabled={busy} className="bg-blue-600 text-white rounded p-2" onClick={onClose}>Done</button></footer></WorkspaceDialog>
}
