'use client'
import {useEffect,useRef,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import {directoryParams} from '@/lib/controlWorkflow'
export function useProjectDirectory(orgId:string|null|undefined,size=25){const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[stage,setStage]=useState(''),[sort,setSort]=useState('updated'),[page,setPage]=useState(0),[state,setState]=useState<any>({rows:[],total:0,loading:true,error:''}),ticket=useRef(0)
 useEffect(()=>{setPage(0)},[query,status,stage,sort,orgId])
 useEffect(()=>{const current=++ticket.current,controller=new AbortController();const timer=setTimeout(async()=>{if(!orgId){setState({rows:[],total:0,loading:false,error:''});return}setState({rows:[],total:0,loading:true,error:''});try{const {data,error}=await createClient().rpc('cpmr_project_directory',directoryParams(orgId,query,status,stage,sort,page,size)).abortSignal(controller.signal);if(error)throw error;if(current===ticket.current){if(!data?.length&&page>0){setPage(0);return}setState({rows:data||[],total:Number(data?.[0]?.total_count||0),loading:false,error:''})}}catch(e){if(!controller.signal.aborted&&current===ticket.current)setState({rows:[],total:0,loading:false,error:'Project directory unavailable. Apply the project-controls migration or check access. '+String((e as any)?.message||e)})}},250);return()=>{ticket.current++;clearTimeout(timer);controller.abort()}},[orgId,query,status,stage,sort,page,size])
 return {...state,query,setQuery,status,setStatus,stage,setStage,sort,setSort,page,setPage,size}
}
