'use client'

import { useState } from 'react'
import {
  ContractDates,
  computeRevisedCompletion,
  computeRevisedDuration,
  formatDate,
} from '@/lib/contractDates'

interface Props {
  // Contract dates carried forward from the previous version
  previousContractDates: ContractDates
  // Called when PM confirms (either kept as-is or updated)
  onConfirm: (cd: ContractDates) => void
  // Called when PM cancels the upload
  onCancel?: () => void
}

/**
 * Shown on every NEW VERSION upload (not the first project creation).
 * Auto-populates from the previous version's contract dates and asks the PM
 * whether anything has changed since last update.
 */
export default function ContractDatesVersionPrompt({
  previousContractDates,
  onConfirm,
  onCancel,
}: Props) {
  // 'review' = initial state showing carried-forward dates with two buttons
  // 'edit'   = PM clicked "Update Time Extension" — show editable Time Ext field
  // 'unlock' = PM clicked "Override locked fields" — show NTP/Original editable
  const [mode, setMode] = useState<'review' | 'edit' | 'unlock'>('review')
  const [timeExt, setTimeExt] = useState(previousContractDates.timeExtensionDays || 0)
  const [ntpDate, setNtpDate] = useState(previousContractDates.ntpDate)
  const [originalCompletion, setOriginalCompletion] = useState(
    previousContractDates.originalContractCompletion
  )

  // Compute current revised dates based on current input state
  const currentCD: ContractDates = {
    ntpDate,
    originalContractCompletion: originalCompletion,
    originalDuration: previousContractDates.originalDuration, // frozen, doesn't change
    timeExtensionDays: timeExt,
  }
  const revisedCompletion = computeRevisedCompletion(currentCD)
  const revisedDuration = computeRevisedDuration(currentCD)

  const handleKeepAsIs = () => {
    onConfirm(previousContractDates)
  }

  const handleSaveChanges = () => {
    onConfirm(currentCD)
  }

  const handleUnlockOriginal = () => {
    if (
      confirm(
        '⚠️ NTP and Original Contract Completion are locked historical fields.\n\n' +
          'These should only change if they were entered incorrectly originally. ' +
          'For approved contract modifications (time extensions), use the Time Extension field instead.\n\n' +
          'Are you sure you want to override these locked fields?'
      )
    ) {
      setMode('unlock')
    }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-blue-900">
            📋 Contract Dates — Carried Forward
          </h3>
          <p className="mt-1 text-sm text-blue-800">
            Contract dates from the previous version are auto-populated below. Has anything changed
            since the last update?
          </p>
        </div>
      </div>

      {/* Current contract dates display */}
      <div className="mb-4 rounded-md border border-blue-100 bg-white p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">NTP</div>
            <div className="mt-1 font-medium text-slate-900">
              {mode === 'unlock' ? (
                <input
                  type="date"
                  value={ntpDate}
                  onChange={(e) => setNtpDate(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              ) : (
                <>
                  {formatDate(ntpDate)} <span title="Locked">🔒</span>
                </>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Original Contract Completion
            </div>
            <div className="mt-1 font-medium text-slate-900">
              {mode === 'unlock' ? (
                <input
                  type="date"
                  value={originalCompletion}
                  onChange={(e) => setOriginalCompletion(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              ) : (
                <>
                  {formatDate(originalCompletion)} <span title="Locked">🔒</span>
                </>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Time Extension</div>
            <div className="mt-1 font-medium text-slate-900">
              {mode === 'edit' || mode === 'unlock' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={timeExt}
                    onChange={(e) => setTimeExt(Number(e.target.value) || 0)}
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                    autoFocus={mode === 'edit'}
                  />
                  <span className="text-xs text-slate-500">calendar days</span>
                </div>
              ) : (
                <>
                  {timeExt > 0 ? `+${timeExt}` : '0'} calendar days
                </>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Revised Contract Completion
            </div>
            <div className="mt-1 font-semibold text-slate-900">
              {formatDate(revisedCompletion)}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
          <div>
            <span className="text-slate-500">Original Duration: </span>
            <span className="font-semibold text-slate-900">
              {previousContractDates.originalDuration}
            </span>
            <span className="text-xs text-slate-500"> calendar days</span>
          </div>
          <div>
            <span className="text-slate-500">Revised Duration: </span>
            <span className="font-semibold text-slate-900">{revisedDuration}</span>
            <span className="text-xs text-slate-500"> calendar days</span>
          </div>
        </div>
      </div>

      {/* Action buttons - vary by mode */}
      {mode === 'review' && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleKeepAsIs}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            ✓ Keep as-is
          </button>
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Update Time Extension
          </button>
          <button
            type="button"
            onClick={handleUnlockOriginal}
            className="ml-auto text-xs text-slate-500 hover:text-slate-700 hover:underline"
          >
            Override locked fields…
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {(mode === 'edit' || mode === 'unlock') && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSaveChanges}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            ✓ Save & Continue Upload
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('review')
              setTimeExt(previousContractDates.timeExtensionDays || 0)
              setNtpDate(previousContractDates.ntpDate)
              setOriginalCompletion(previousContractDates.originalContractCompletion)
            }}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel changes
          </button>
        </div>
      )}
    </div>
  )
}
