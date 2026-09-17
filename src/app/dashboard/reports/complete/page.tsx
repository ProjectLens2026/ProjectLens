import { redirect } from 'next/navigation'

// The legacy complete-book renderer remains the source of truth for the optional
// full package. Keep it intact for stability while the Reports hub makes focused
// reports the normal workflow.
export default function CompleteReportPackagePage() {
  redirect('/dashboard/report')
}
