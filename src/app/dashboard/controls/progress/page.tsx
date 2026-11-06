'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ScheduleOverview from '@/components/ScheduleOverview'
import { getActiveProject, getActiveVersion, subscribeToProjects, Project, ScheduleVersion } from '@/lib/projectStore'

export default function PeriodProgressPage(){
  const [selection,setSelection]=useState<{project:Project;version:ScheduleVersion}|null>(null)
  useEffect(()=>{const sync=()=>{const project=getActiveProject(),version=getActiveVersion(project);setSelection(project&&version?{project,version}:null)};sync();return subscribeToProjects(sync)},[])
  return <><div className="px-6 py-3 border-b bg-white"><Link href="/dashboard/controls" className="text-blue-700">← Project Controls</Link><span className="ml-4 text-sm text-slate-500">Period progress · selected schedule evidence</span></div>{selection?<ScheduleOverview key={selection.version.id} {...selection} initialSection={3}/>:<div className="p-8"><p>Select a schedule version to compare reporting periods.</p><Link href="/dashboard/projects" className="text-blue-700">Open schedule versions →</Link></div>}</>
}
