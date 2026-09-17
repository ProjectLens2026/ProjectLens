'use client'

export default function NeutralReportFooter({ reportNo }: { reportNo: string }) {
  return (
    <div className="flex items-center justify-between gap-4 pt-3 mt-6 border-t-2 border-slate-900 text-[10px] text-slate-400 print:break-inside-avoid">
      <span>Schedule review output — the schedule of record and governing contract documents control.</span>
      <span className="font-mono flex-shrink-0">{reportNo}</span>
    </div>
  )
}
