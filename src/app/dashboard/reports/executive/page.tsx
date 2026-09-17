'use client'

import { useEffect, useState } from 'react'
import { getActiveProject, getActiveVersion } from '@/lib/projectStore'
import { countRiskCategories } from '@/lib/riskDetector'
import { reportNumber } from '@/lib/reports'
import { buildExecutiveSCurve, buildRiskItems, criticalFloatDays, projectedEnd, workCompletePct } from '@/lib/reportData'
import ExecutiveReport from '@/components/reports/ExecutiveReport'
import ReportPageFrame from '@/components/reports/ReportPageFrame'

export default function ExecutiveSummaryReportPage() {
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const p = getActiveProject()
    setProject(p)
    setVersion(getActiveVersion(p))
    setReady(true)
  }, [])

  if (!ready) return <ReportPageFrame><div className="text-sm text-slate-500">Loading report…</div></ReportPageFrame>
  const a = version?.analysis
  if (!project || !version || !a) return <ReportPageFrame><Missing /></ReportPageFrame>

  const riskCounts = countRiskCategories(a)
  const riskItems = buildRiskItems(a)
  const topRisks = riskItems.slice(0, 5).map((r: any) => ({
    severity: r.severity,
    category: r.category,
    activity: r.affectedActivities?.[0] ? `${r.affectedActivities[0].task_code || ''} ${r.affectedActivities[0].task_name || ''}`.trim() : 'Project schedule',
    description: r.description,
  }))

  return (
    <ReportPageFrame>
      <ExecutiveReport
        orgName={(project as any).company || ''}
        reportNo={reportNumber(project.projectId || project.name, 'EXEC')}
        versionLabel={version.versionLabel || version.fileName || 'Active version'}
        project={project}
        healthScore={Number(a.healthScore || 0)}
        healthLabel={a.condition || 'Not rated'}
        healthNarrative={a.communicationSummary || undefined}
        daysBehind={Number(a.delayDays || 0)}
        workCompletePct={workCompletePct(a)}
        criticalFloatDays={criticalFloatDays(a)}
        longLeadAtRisk={Number(a.longLeadAtRisk ?? (a.longLeadItems || []).filter((x: any) => Number(x.floatDays) <= 14 && x.status_code !== 'TK_Complete').length)}
        ntp={project.contractDates?.ntp || a.projectStartDate}
        originalCompletion={project.contractDates?.originalContractCompletion || a.contractEnd}
        revisedCompletion={version.versionDates?.revisedContractCompletion || project.contractDates?.originalContractCompletion || a.contractEnd}
        dataDate={a.dataDate || version.dataDate}
        projectedEnd={projectedEnd(a)}
        risks={{ critical: riskCounts.critical, high: riskCounts.high, medium: riskCounts.medium }}
        sCurve={buildExecutiveSCurve(project)}
        topRisks={topRisks}
        totalActivities={Number(a.totalActivities || 0)}
        constructionActivities={Number(a.constructionActivityCount || 0)}
      />
    </ReportPageFrame>
  )
}

function Missing() {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No active schedule analysis is available for the selected project/version.</div>
}
