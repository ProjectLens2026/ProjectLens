'use client'
import {useEffect,useState} from 'react'
import {getActiveProject,getActiveVersion,loadProjects,subscribeToProjects,whenHydrated} from '@/lib/projectStore'
import {visibleWorkspaceProjects} from '@/lib/projectWorkspace'
export function useProjectWorkspace(){
 const [state,setState]=useState<any>({projects:[],project:null,version:null,ready:false})
 useEffect(()=>{let alive=true;const sync=()=>{if(!alive)return;const project=getActiveProject(),version=getActiveVersion(project);if(project&&version)try{sessionStorage.setItem('cpmr:workspace:version:'+project.id,version.id)}catch{};setState({projects:visibleWorkspaceProjects(loadProjects()),project,version,ready:true})};sync();const unsubscribe=subscribeToProjects(sync);void whenHydrated().then(sync);return()=>{alive=false;unsubscribe()}},[])
 return state
}
export function rememberedProjectVersion(projectId:string){try{return sessionStorage.getItem('cpmr:workspace:version:'+projectId)||''}catch{return ''}}
