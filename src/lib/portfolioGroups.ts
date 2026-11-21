import {createClient} from './supabase/client'
import {cloudId,directoryParams} from './controlWorkflow'
export interface PortfolioGroup {id:string;name:string;kind:'company'|'program';revision:number;project_count:number}
export interface PortfolioGroupsState {can_manage:boolean;groups:PortfolioGroup[];unassigned_count:number;total_count:number}
export const EMPTY_GROUPS:PortfolioGroupsState={can_manage:false,groups:[],unassigned_count:0,total_count:0}
export function validGroupsState(value:any):value is PortfolioGroupsState {
 return !!value&&typeof value.can_manage==='boolean'&&Array.isArray(value.groups)&&value.groups.every((g:any)=>typeof g.id==='string'&&typeof g.name==='string'&&['company','program'].includes(g.kind)&&Number.isInteger(g.revision)&&Number.isFinite(Number(g.project_count)))&&Number.isFinite(Number(value.unassigned_count))&&Number.isFinite(Number(value.total_count))
}
export function groupDirectoryParams(org:string,scope:string,query:string,status:string,stage:string,sort:string,page:number,size:number){
 return {...directoryParams(org,query,status,stage,sort,page,size),p_group:scope==='all'||scope==='unassigned'?null:cloudId(scope),p_unassigned:scope==='unassigned'}
}
export async function savePortfolioGroup(org:string,original:PortfolioGroup|null,name:string,kind:'company'|'program'):Promise<PortfolioGroup>{
 const trimmed=name.trim()
 if(!trimmed||trimmed.length>80)throw Error('Enter a name between 1 and 80 characters.')
 if(['unassigned','all projects'].includes(trimmed.toLowerCase()))throw Error('Choose another name; this label is reserved.')
 const {data,error}=await createClient().rpc('cpmr_save_portfolio_group',{p_org:org,p_id:original?cloudId(original.id):null,p_name:trimmed,p_kind:kind,p_expected:original?.revision??null})
 if(error)throw Error(error.message)
 if(!data?.id||data.org_id!==org)throw Error('The saved company/program could not be verified. Reload before retrying.')
 return {...data,project_count:original?.project_count||0}
}
export async function assignPortfolioProject(row:{id:string;project_updated_at:string},groupId:string|null){
 if(!row.project_updated_at)throw Error('Reload the project list before assigning a group.')
 const {data,error}=await createClient().rpc('cpmr_assign_portfolio_project',{p_project:cloudId(row.id),p_group:groupId?cloudId(groupId):null,p_expected:row.project_updated_at})
 if(error)throw Error(error.message)
 if(data?.project_id!==cloudId(row.id)||(data.group_id||null)!==(groupId?cloudId(groupId):null))throw Error('Project assignment could not be verified. Reload before retrying.')
 return data
}
