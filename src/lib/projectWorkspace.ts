import {compareScheduleVersions} from './versionBrowser'
/** Shared navigation rules. Opening a version does not assign/approve a baseline. */
export const PROJECT_TABS=[{label:'Versions & uploads',href:'/dashboard/schedules'},{label:'QC & decisions',href:'/dashboard/approval'},{label:'Project Controls',href:'/dashboard'},{label:'Compare & revisions',href:'/dashboard/changes'}]
export function workspaceTab(path:string):string|null {
 if(path==='/dashboard/schedules')return 'Versions & uploads'
 if(path==='/dashboard/approval'||path.startsWith('/dashboard/approval/'))return 'QC & decisions'
 if(path==='/dashboard/changes')return 'Compare & revisions'
 if(path==='/dashboard'||['lens','controls','reports','report','trace','risks','procurement','submittals','evm','trend','tia','project-setup'].some(s=>path==='/dashboard/'+s||path.startsWith('/dashboard/'+s+'/')))return 'Project Controls'
 return null
}
export const visibleWorkspaceProjects=(projects:any[])=>projects.filter(p=>!p.deletedAt&&!['Deleted','Archived'].includes(p.status))
export function workspaceVersion(project:any,rememberedId?:string){const versions=(project?.versions||[]).filter((v:any)=>!v.deletedAt&&!v.archivedAt);return versions.find((v:any)=>v.id===rememberedId)||versions.slice().sort(compareScheduleVersions)[0]||null}
export function workspaceIdentity(project:any){return {name:project.projectId||project.name,address:project.controlBasis?.projectProfile?.address||(typeof project.address==='string'?project.address:'Not recorded'),stage:project.controlBasis?.projectProfile?.stage||project.phase||'Not recorded',status:project.status||'Active'}}
export function versionReviewFields(version:any){const r=version.reviewRecord;return {reviewedAt:r?.reviewedAt||version.reviewedAt||'',decisionAt:r?.decidedAt||version.decidedAt||'',approvedAt:r?.approvedAt||version.approvedAt||'',decision:r?.disposition||version.reviewDisposition||'Not recorded'}}
