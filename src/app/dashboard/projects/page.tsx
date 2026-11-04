'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import ProjectVersionBrowser from '@/components/ProjectVersionBrowser'
import { loadProjects, subscribeToProjects, Project } from '@/lib/projectStore'
export default function ProjectsPage() {
  const [projects,setProjects]=useState<Project[]>([])
  useEffect(()=>{setProjects(loadProjects());return subscribeToProjects(()=>setProjects(loadProjects()))},[])
  return <div className="flex flex-col h-full"><header className="bg-white border-b px-6 py-4 flex justify-between"><h1 className="text-lg font-bold">Projects & Schedule Versions</h1><Link href="/dashboard/enterprise" className="text-blue-600">Enterprise →</Link></header><Suspense fallback={<p>Loading projects…</p>}><ProjectVersionBrowser projects={projects}/></Suspense></div>
}
