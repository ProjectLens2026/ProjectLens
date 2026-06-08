'use client'

// =============================================================================
// src/components/ReportHeader.tsx
// =============================================================================
// The "cover sheet" block at the top of every ControlLens report.
//
// Layout (mirrors EstimateLens for visual consistency):
//   ┌─────────────────────────────────────────────────────────────────────┐
//   │ [LOGO MARK]  CONTROLLENS                Report Title                │
//   │              CONSTRUCTION SCHEDULE INT.  CL-XXX-EXEC-YYYY · ver · dt │
//   │ ─────────────────────────────────────────────────────────────────── │
//   │  PROJECT          CODE / OWNER     LOCATION         PREPARED BY     │
//   │  Project Name     040ADV-26-R      Washington, DC   Org Name        │
//   └─────────────────────────────────────────────────────────────────────┘
//
// The 4-bar logo mark is the canonical ControlLens identity from
// public/controllens-final.svg, inlined here as small rectangles.
// =============================================================================

import { REPORT_TAGLINE, fmtReportDate } from '@/lib/reports'

interface ReportHeaderProps {
  /** The report's display title — e.g. "Executive Summary" */
  title: string
  /** The generated report number — e.g. "CL-040ADV-26-R-EXEC-20260607" */
  reportNo: string
  /** Schedule version label — e.g. "v3 · CU-NTP-02" */
  versionLabel: string
  /** Org name that prepared the report — shown in PREPARED BY column */
  orgName: string
  /** Project info shown in the 4-column strip */
  project: {
    name: string
    project_code?: string | null
    projectId?: string | null    // CL legacy field name
    owner?: string | null
    location?: string | null
  }
  /** Optional date override (default: today) */
  date?: Date
}

export default function ReportHeader({
  title,
  reportNo,
  versionLabel,
  orgName,
  project,
  date,
}: ReportHeaderProps) {
  const code = project.project_code ?? project.projectId ?? '—'
  const owner = project.owner || '—'
  const location = project.location || '—'
  const reportDate = fmtReportDate(date ?? new Date())

  return (
    <div className="mb-6">
      {/* Top row — logo + wordmark on the left, report title on the right */}
      <div className="flex items-start justify-between gap-6 pb-4 border-b-2" style={{ borderColor: '#13202e' }}>
        <div className="flex items-start gap-3">
          {/* 4-bar logo mark — canonical ControlLens identity */}
          <div className="flex flex-col gap-[3px] mt-1.5">
            <span className="block h-[5px] rounded-[1px]" style={{ width: '22px', background: '#2563eb' }} />
            <span className="block h-[5px] rounded-[1px]" style={{ width: '30px', background: '#dc2626' }} />
            <span className="block h-[5px] rounded-[1px]" style={{ width: '18px', background: '#16a34a' }} />
            <span className="block h-[5px] rounded-[1px]" style={{ width: '25px', background: '#1f2937' }} />
          </div>
          <div>
            <div className="text-[20px] font-extrabold leading-tight tracking-tight" style={{ color: '#13202e' }}>
              CONTROL<span style={{ color: '#2563eb' }}>LENS</span>
            </div>
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 mt-0.5">
              {REPORT_TAGLINE}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[16px] font-extrabold" style={{ color: '#13202e' }}>{title}</div>
          <div className="font-mono text-[10px] text-slate-500 mt-0.5 leading-relaxed">
            {reportNo} <span className="text-slate-400">·</span> {versionLabel} <span className="text-slate-400">·</span> {reportDate}
          </div>
        </div>
      </div>

      {/* 4-column project info strip */}
      <div className="grid grid-cols-4 gap-6 mt-4 mb-2">
        <InfoCol label="Project" value={project.name} />
        <InfoCol label="Code / Owner" value={`${code}  ·  ${owner}`} mono />
        <InfoCol label="Location" value={location} />
        <InfoCol label="Prepared by" value={orgName} />
      </div>
    </div>
  )
}

function InfoCol({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 mb-1">
        {label}
      </div>
      <div className={`text-[12px] font-semibold leading-snug ${mono ? 'font-mono' : ''}`} style={{ color: '#13202e' }}>
        {value}
      </div>
    </div>
  )
}
