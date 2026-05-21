'use client'

import { useState, useEffect } from 'react'
import {
  ContractDates,
  computeRevisedCompletion,
  computeRevisedDuration,
  calendarDaysBetween,
  formatDate,
} from '@/lib/contractDates'

interface Props {
  // Initial values (e.g., when editing an existing project)
  initial?: Partial<ContractDates>
  // If true, NTP and Original Completion show 🔒 visual indicators and require confirmation to edit
  showLockIndicators?: boolean
  // Called when any field changes; parent decides what to do with it
  onChange: (cd: ContractDates) => void
  // If true, hides the "edit lock" override (used in fresh new-project wizard)
  alwaysEditable?: boolean
}

export default function ContractDatesForm({
  initial,
  showLockIndicators = false,
  onChange,
  alwaysEditable = false,
}: Props) {
  const [ntpDate, setNtpDate] = useState(initial?.ntpDate || '')
  const [originalCompletion, setOriginalCompletion] = useState(
    initial?.originalContractCompletion || ''
  )
  const [timeExtensionDays, setTimeExtensionDays] = useState(
    initial?.timeExtensionDays ?? 0
  )
  // When showLockIndicators is true, NTP and Original are locked behind an "unlock" toggle
  const [ntpUnlocked, setNtpUnlocked] = useState(alwaysEditable || !showLockIndicators)
  const [origUnlocked, setOrigUnlocked] = useState(alwaysEditable || !showLockIndicators)

  const originalDuration = calendarDaysBetween(ntpDate, originalCompletion)
  const revisedDuration = originalDuration + (Number(timeExtensionDays) || 0)
  // Compute revised completion on the fly
  const tempCD: ContractDates = {
    ntpDate,
    originalContractCompletion: originalCompletion,
    originalDuration,
    timeExtensionDays: Number(timeExtensionDays) || 0,
  }
  const revisedCompletion = ntpDate && originalCompletion ? computeRevisedCompletion(tempCD) : ''

  useEffect(() => {
    if (ntpDate && originalCompletion) {
      onChange({
        ntpDate,
        originalContractCompletion: originalCompletion,
        originalDuration,
        timeExtensionDays: Number(timeExtensionDays) || 0,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ntpDate, originalCompletion, timeExtensionDays])

  const handleUnlockNTP = () => {
    if (confirm(
      '⚠️ This is a locked historical field.\n\n' +
      'NTP is the legal start date of the contract and should not change unless it was entered incorrectly. ' +
      'Are you sure you want to edit it?'
    )) {
      setNtpUnlocked(true)
    }
  }

  const handleUnlockOriginal = () => {
    if (confirm(
      '⚠️ This is a locked historical field.\n\n' +
      'Original Contract Completion is the baseline date and should not change unless it was entered incorrectly. ' +
      'For approved time extensions, use the Time Extension field instead. ' +
      'Are you sure you want to edit it?'
    )) {
      setOrigUnlocked(true)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">Contract Dates</h3>
        <span className="text-xs text-slate-500">
          ⓘ All durations are <strong>calendar days</strong> (inclusive)
        </span>
      </div>

      <div className="space-y-4">
        {/* NTP DATE */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
            Notice to Proceed (NTP)
            {showLockIndicators && !ntpUnlocked && <span title="Locked historical field">🔒</span>}
            {showLockIndicators && ntpUnlocked && (
              <span className="text-xs text-amber-600">(unlocked for edit)</span>
            )}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={ntpDate}
              disabled={showLockIndicators && !ntpUnlocked}
              onChange={(e) => setNtpDate(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
            />
            {showLockIndicators && !ntpUnlocked && (
              <button
                type="button"
                onClick={handleUnlockNTP}
                className="text-xs text-blue-600 hover:underline"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* ORIGINAL CONTRACT COMPLETION */}
        <div>
          <label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
            Original Contract Completion
            {showLockIndicators && !origUnlocked && <span title="Locked historical field">🔒</span>}
            {showLockIndicators && origUnlocked && (
              <span className="text-xs text-amber-600">(unlocked for edit)</span>
            )}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={originalCompletion}
              disabled={showLockIndicators && !origUnlocked}
              onChange={(e) => setOriginalCompletion(e.target.value)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500"
            />
            {showLockIndicators && !origUnlocked && (
              <button
                type="button"
                onClick={handleUnlockOriginal}
                className="text-xs text-blue-600 hover:underline"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        <div className="my-4 border-t border-slate-200" />

        {/* TIME EXTENSION */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Time Extension <span className="text-xs font-normal text-slate-500">(calendar days, default 0)</span>
          </label>
          <input
            type="number"
            min="0"
            value={timeExtensionDays}
            onChange={(e) => setTimeExtensionDays(Number(e.target.value) || 0)}
            className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="0"
          />
          <p className="mt-1 text-xs text-slate-500">
            Enter total calendar days granted through approved contract modifications (e.g., 30 for a 30-day extension).
          </p>
        </div>

        {/* DERIVED: REVISED COMPLETION */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Revised Contract Completion <span className="text-xs font-normal text-slate-500">(auto-calculated)</span>
          </label>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {revisedCompletion ? formatDate(revisedCompletion) : '—'}
          </div>
        </div>

        {/* DURATION SUMMARY */}
        {ntpDate && originalCompletion && (
          <div className="mt-4 rounded-md bg-slate-50 p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Original Duration</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {originalDuration} <span className="text-xs font-normal text-slate-500">calendar days</span>
                </div>
                <div className="text-xs text-slate-500">🔒 frozen at creation</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Revised Duration</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {revisedDuration} <span className="text-xs font-normal text-slate-500">calendar days</span>
                </div>
                <div className="text-xs text-slate-500">
                  {timeExtensionDays > 0 ? `+${timeExtensionDays} days extension` : 'no time extensions'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
