'use client'

import Link from 'next/link'
import {
  ContractDates,
  computeRevisedCompletion,
  computeRevisedDuration,
  formatDate,
} from '@/lib/contractDates'

interface Props {
  projectId: string
  contractDates?: ContractDates
  // XER-derived dates for comparison
  xerNTP?: string
  xerProjectedCompletion?: string
}

export default function ContractDatesBlock({
  projectId,
  contractDates,
  xerNTP,
  xerProjectedCompletion,
}: Props) {
  // Existing project without contract dates — show banner
  if (!contractDates || !contractDates.ntpDate || !contractDates.originalContractCompletion) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-amber-900">
              ⚠️ Contract dates not set
            </h3>
            <p className="mt-1 text-sm text-amber-800">
              Add NTP and Original Contract Completion to unlock accurate duration metrics, schedule
              variance, and time-impact analysis.
            </p>
          </div>
          <Link
            href={`/dashboard/settings?project=${projectId}&tab=contract`}
            className="shrink-0 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Add Contract Dates
          </Link>
        </div>
      </div>
    )
  }

  const revisedCompletion = computeRevisedCompletion(contractDates)
  const revisedDuration = computeRevisedDuration(contractDates)
  const timeExt = contractDates.timeExtensionDays || 0

  // Schedule variance: compare XER projected completion vs Revised Contract Completion
  let scheduleVariance: number | null = null
  if (xerProjectedCompletion && revisedCompletion) {
    const xerEnd = new Date(xerProjectedCompletion.slice(0, 10) + 'T00:00:00Z').getTime()
    const revEnd = new Date(revisedCompletion + 'T00:00:00Z').getTime()
    scheduleVariance = Math.round((xerEnd - revEnd) / 86400000)
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">Contract & Schedule Dates</h3>
        <Link
          href={`/dashboard/settings?project=${projectId}&tab=contract`}
          className="text-xs text-blue-600 hover:underline"
        >
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* CONTRACT DATES COLUMN */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Contract
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">
                Notice to Proceed <span title="Locked">🔒</span>
              </dt>
              <dd className="font-medium text-slate-900">{formatDate(contractDates.ntpDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">
                Original Contract Completion <span title="Locked">🔒</span>
              </dt>
              <dd className="font-medium text-slate-900">
                {formatDate(contractDates.originalContractCompletion)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Time Extension</dt>
              <dd className="font-medium text-slate-900">
                {timeExt > 0 ? `+${timeExt}` : '0'} calendar days
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <dt className="text-slate-600">Revised Contract Completion</dt>
              <dd className="font-semibold text-slate-900">{formatDate(revisedCompletion)}</dd>
            </div>
          </dl>
        </div>

        {/* XER DATES COLUMN */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Current XER
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">XER NTP</dt>
              <dd className="font-medium text-slate-900">{formatDate(xerNTP)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">XER Projected Completion</dt>
              <dd className="font-medium text-slate-900">
                {formatDate(xerProjectedCompletion)}
              </dd>
            </div>
            {scheduleVariance !== null && (
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <dt className="text-slate-600">Schedule Variance</dt>
                <dd
                  className={`font-semibold ${
                    scheduleVariance > 0
                      ? 'text-red-600'
                      : scheduleVariance < 0
                      ? 'text-green-600'
                      : 'text-slate-900'
                  }`}
                >
                  {scheduleVariance > 0
                    ? `${scheduleVariance} days behind`
                    : scheduleVariance < 0
                    ? `${Math.abs(scheduleVariance)} days ahead`
                    : 'on schedule'}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* DURATION SUMMARY */}
      <div className="mt-5 grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-4 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Original Duration</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {contractDates.originalDuration}{' '}
            <span className="text-xs font-normal text-slate-500">calendar days</span>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Revised Duration</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {revisedDuration}{' '}
            <span className="text-xs font-normal text-slate-500">calendar days</span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        ⓘ All durations are <strong>calendar days</strong> (inclusive of start and end), per P6 / DCMA
        convention.
      </p>
    </div>
  )
}
