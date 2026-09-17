'use client'

import { fmtReportDate } from '@/lib/reports'

export interface ReviewerReportHeaderProps {
  title: string
  reportNo: string
  versionLabel: string
  orgName?: string
  project: {
    name: string
    projectId?: string | null
    project_code?: string | null
    owner?: string | null
    location?: string | null
  }
}

export default function ReviewerReportHeader({
  title,
  reportNo,
  versionLabel,
  orgName,
  project,
}: ReviewerReportHeaderProps) {
  const projectCode = project.projectId || project.project_code || '—'

  return (
    <div className="mb-6 print:break-inside-avoid">
      <div className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Schedule Control Review
          </div>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-tight text-slate-900">{title}</h1>
          <div className="mt-1 text-[12px] text-slate-500">{project.name}</div>
        </div>
        <div className="text-right text-[10px] leading-relaxed text-slate-500 flex-shrink-0">
          <div className="font-mono font-bold text-slate-800">{reportNo}</div>
          <div>{fmtReportDate(new Date())}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 border-b border-slate-200 py-3 text-[10.5px]">
        <Meta label="Project / Contract" value={projectCode} mono />
        <Meta label="Schedule Version" value={versionLabel || '—'} mono />
        <Meta label="Owner" value={project.owner || '—'} />
        <Meta label="Location" value={project.location || '—'} />
      </div>

      {orgName ? (
        <div className="mt-2 text-[9.5px] text-slate-400">
          Review organization: <span className="font-semibold text-slate-600">{orgName}</span>
        </div>
      ) : null}
    </div>
  )
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="uppercase tracking-wide text-[8px] font-bold text-slate-400">{label}</div>
      <div className={`mt-0.5 truncate font-semibold text-slate-700 ${mono ? 'font-mono' : ''}`} title={value}>{value}</div>
    </div>
  )
}
