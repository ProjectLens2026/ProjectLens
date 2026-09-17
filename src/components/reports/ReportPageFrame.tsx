'use client'

import Link from 'next/link'

export default function ReportPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-slate-50 print:h-auto print:overflow-visible print:bg-white">
      <div className="p-4 md:p-6 max-w-[1180px] mx-auto pb-16 print:p-0 print:max-w-none">
        <div className="print:hidden mb-3">
          <Link href="/dashboard/reports" className="text-[11px] font-semibold text-slate-500 hover:text-slate-900">
            ‹ Reports
          </Link>
        </div>
        {children}
      </div>
    </div>
  )
}
