'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import {cloudId} from '@/lib/controlWorkflow'
export function useControlWorkflow(projectId?:string){const [state,setState]=useState<any>({loading:true,reviews:[],control:null,events:[],error:''}),sequence=useRef(0)
 const reload=useCallback(async()=>{const ticket=++sequence.current;if(!projectId){setState({loading:false,reviews:[],control:null,events:[],error:''});return}setState((s:any)=>s.scope===projectId?{...s,loading:true,error:''}:{scope:projectId,loading:true,reviews:[],control:null,events:[],error:''});try{const {data,error}=await createClient().rpc('cpmr_workflow_state',{p_project:cloudId(projectId)});if(error)throw error;if(ticket===sequence.current)setState({scope:projectId,loading:false,reviews:data?.reviews||[],control:data?.control||null,events:data?.events||[],error:''})}catch(e){if(ticket===sequence.current)setState({scope:projectId,loading:false,reviews:[],control:null,events:[],error:'Control records unavailable. Check the project-controls migration and access permissions. '+(e instanceof Error?e.message:String((e as any)?.message||e))})}},[projectId])
 useEffect(()=>{void reload();const changed=()=>void reload();window.addEventListener('cpmr:workflow',changed);return()=>{sequence.current++;window.removeEventListener('cpmr:workflow',changed)}},[reload])
 return state.scope!==projectId&&projectId?{loading:true,reviews:[],control:null,events:[],error:'',reload}:{...state,reload}
}
