'use client'
import {useEffect,useRef,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import {groupDirectoryParams} from '@/lib/portfolioGroups'
export function useProjectDirectory(orgId:string|null|undefined,size=25,scope='all'){
 const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[stage,setStage]=useState(''),[sort,setSort]=useState('updated'),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0),ticket=useRef(0)
 const key=JSON.stringify([orgId||null,scope,query,status,stage,sort,page,size,refresh])
 const [state,setState]=useState<any>({key:'',rows:[],total:0,loading:true,error:''})
 useEffect(()=>{setPage(0)},[query,status,stage,sort,orgId,scope])
 useEffect(()=>{
  const current=++ticket.current,controller=new AbortController()
  if(!orgId){setState({key,rows:[],total:0,loading:false,error:''});return()=>controller.abort()}
  setState({key,rows:[],total:0,loading:true,error:''})
  const timer=setTimeout(async()=>{try{
   const {data,error}=await createClient().rpc('cpmr_group_project_directory',groupDirectoryParams(orgId,scope,query,status,stage,sort,page,size)).abortSignal(controller.signal)
   if(error)throw error
   if(current===ticket.current&&!controller.signal.aborted){if(!data?.length&&page>0){setPage(0);return}setState({key,rows:data||[],total:Number(data?.[0]?.total_count||0),loading:false,error:''})}
  }catch(e){if(!controller.signal.aborted&&current===ticket.current)setState({key,rows:[],total:0,loading:false,error:'Project directory unavailable. Apply the portfolio-groups migration or check access. '+String((e as any)?.message||e)})}},250)
  return()=>{ticket.current++;clearTimeout(timer);controller.abort()}
 },[key])
 const visible=state.key===key?state:{rows:[],total:0,loading:!!orgId,error:''}
 return {...visible,query,setQuery,status,setStatus,stage,setStage,sort,setSort,page,setPage,size,reload:()=>setRefresh(n=>n+1)}
}
