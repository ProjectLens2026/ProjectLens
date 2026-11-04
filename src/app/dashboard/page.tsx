'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion, subscribeToProjects, Project, ScheduleVersion } from '@/lib/projectStore'
import ScheduleOverview from '@/components/ScheduleOverview'
export default function OverviewPage() {
  const [selection,setSelection]=useState<{project:Project;version:ScheduleVersion}|null>(null)
  useEffect(()=>{
    const refresh=()=>{ const project=getActiveProject(); const version=project&&getActiveVersion(project); setSelection(project&&version?{project,version}:null) }
    refresh(); return subscribeToProjects(refresh)
  },[])
  if(!selection) return <div className="p-8"><h1 className="text-xl font-bold">Overview</h1><p className="my-4">Open a schedule version to view its submission details and statistics.</p><Link href="/dashboard/projects" className="text-blue-600">Projects &amp; Versions →</Link></div>
  return <ScheduleOverview key={selection.version.id} {...selection}/>
}
