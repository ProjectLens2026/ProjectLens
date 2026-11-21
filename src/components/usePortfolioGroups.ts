'use client'
import {useEffect,useRef,useState} from 'react'
import {createClient} from '@/lib/supabase/client'
import {EMPTY_GROUPS,PortfolioGroupsState,validGroupsState} from '@/lib/portfolioGroups'
export function usePortfolioGroups(orgId:string|null|undefined){
 const [refresh,setRefresh]=useState(0),ticket=useRef(0)
 const [state,setState]=useState<{orgId:string|null;data:PortfolioGroupsState;ready:boolean;loading:boolean;error:string}>({orgId:null,data:EMPTY_GROUPS,ready:false,loading:true,error:''})
 useEffect(()=>{
  const current=++ticket.current,controller=new AbortController()
  if(!orgId){setState({orgId:null,data:EMPTY_GROUPS,ready:false,loading:false,error:''});return()=>controller.abort()}
  setState(v=>({orgId,data:v.orgId===orgId?v.data:EMPTY_GROUPS,ready:v.orgId===orgId&&v.ready,loading:true,error:''}))
  void (async()=>{try{
   const {data,error}=await createClient().rpc('cpmr_portfolio_groups_state',{p_org:orgId}).abortSignal(controller.signal)
   if(error)throw Error(error.message)
   if(!validGroupsState(data))throw Error('Company/program data is unavailable for this organization.')
   if(current===ticket.current&&!controller.signal.aborted)setState({orgId,data,ready:true,loading:false,error:''})
  }catch(e){if(current===ticket.current&&!controller.signal.aborted)setState(v=>({...v,loading:false,error:'Could not load companies/programs. Apply 20261121_portfolio_groups.sql or check your connection. '+String((e as any)?.message||e)}))}})()
  return()=>{ticket.current++;controller.abort()}
 },[orgId,refresh])
 const current=state.orgId===orgId?state:{orgId:orgId||null,data:EMPTY_GROUPS,ready:false,loading:!!orgId,error:''}
 return {...current.data,ready:current.ready,loading:current.loading,error:current.error,reload:()=>setRefresh(n=>n+1)}
}
