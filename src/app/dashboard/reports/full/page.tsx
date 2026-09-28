'use client'

import { useEffect, useState } from 'react'
import { getActiveProject, getActiveVersion, subscribeToProjects, loadVersionAnalysis } from '@/lib/projectStore'
import { reportNumber } from '@/lib/reports'
import { buildFloatBuckets, floatDays, milestoneRisks, workCompletePct } from '@/lib/reportData'
import FullAnalysisReport from '@/components/reports/FullAnalysisReport'
import CurrentProjectSummary from '@/components/reports/CurrentProjectSummary'
import ReportPageFrame from '@/components/reports/ReportPageFrame'

export default function FullScheduleReviewReportPage() {
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const refresh = () => { const p = getActiveProject(); setProject(p); setVersion(getActiveVersion(p)); setReady(true) }
    refresh()
    return subscribeToProjects(refresh)
  }, [])
  useEffect(() => {
    if (version?.id && version.analysisState !== 'loaded' && version.analysisState !== 'loading' && version.analysisState !== 'error') void loadVersionAnalysis(version.id)
  }, [version?.id, version?.analysisState])
  if (version && version.analysisState && version.analysisState !== 'loaded') return <ReportPageFrame><div className="text-sm text-slate-500">{version.analysisState === 'error' ? 'Schedule evidence could not be loaded. Reopen the version before printing.' : 'Loading selected schedule evidence…'}</div></ReportPageFrame>
  if (!ready) return <ReportPageFrame><div className="text-sm text-slate-500">Loading report…</div></ReportPageFrame>
  const a = version?.analysis
  if (!project || !version || !a) return <ReportPageFrame><Missing /></ReportPageFrame>

  const longLead = Array.isArray(a.longLeadItems) ? a.longLeadItems : []
  const critical = Array.isArray(a.criticalDrivers) ? a.criticalDrivers : []
  const longest = Array.isArray(a.longestPathActivities) ? a.longestPathActivities : []
  const oos = Array.isArray(a.outOfSequence) ? a.outOfSequence : []
  const noTies = Array.isArray(a.noTies) ? a.noTies : []

  return <ReportPageFrame>
    <FullAnalysisReport
        currentSummary={<CurrentProjectSummary project={project} version={version} />}
      orgName={(project as any).company || ''}
      reportNo={reportNumber(project.projectId || project.name, 'FULL')}
      versionLabel={version.versionLabel || version.fileName || 'Active version'}
      project={project}
      healthScore={Number(a.healthScore || 0)}
      healthLabel={a.condition || 'Not rated'}
      daysBehind={Number(a.delayDays || 0)}
      workCompletePct={workCompletePct(a)}
      totalActivities={Number(a.totalActivities || 0)}
      completedCount={Number(a.complete || 0)}
      inProgressCount={Number(a.inProgress || 0)}
      notStartedCount={Number(a.notStarted || 0)}
      negativeFloatCount={Number(a.negativeFloat || 0)}
      dataDate={version.versionDates?.manualDataDate || a.dataDate || version.dataDate}
      criticalDriversCount={critical.length}
      criticalDriversTop={critical.slice(0, 10)}
      longestPathCount={longest.length}
      longestPathTop={longest.slice(0, 10)}
      floatBuckets={buildFloatBuckets(a)}
      oosCount={oos.length}
      oosTop={oos.slice(0, 10)}
      noTiesCount={noTies.length}
      noTiesTop={noTies.slice(0, 10)}
      longLeadTotal={longLead.length}
      longLeadAtRisk={Number(a.longLeadAtRisk ?? longLead.filter((x: any) => x.status_code !== 'TK_Complete' && floatDays(x) <= 14).length)}
      longLeadTop={longLead.slice().sort((x: any, y: any) => floatDays(x) - floatDays(y)).slice(0, 10)}
      milestonesAtRisk={milestoneRisks(a)}
    />
  </ReportPageFrame>
}
function Missing(){ return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No active schedule analysis is available for the selected project/version.</div> }
