/**
 * Contract Dates utilities for ControlLens
 * 
 * Implements the contract dates model:
 *   - NTP Date (locked after creation, can be overridden with warning)
 *   - Original Contract Completion (locked after creation, can be overridden with warning)
 *   - Time Extension in calendar days (PM-editable, default 0)
 *   - Revised Contract Completion = Original Completion + Time Extension (DERIVED)
 *   - Original Duration = (Original Completion - NTP) + 1 (FROZEN at creation, calendar days inclusive)
 *   - Revised Duration = Original Duration + Time Extension (DERIVED)
 * 
 * All durations are CALENDAR DAYS, inclusive of start and end (P6 convention).
 */

export interface ContractDates {
  ntpDate: string                       // ISO date string e.g. "2022-09-16"
  originalContractCompletion: string    // ISO date string e.g. "2024-09-30"
  originalDuration: number              // FROZEN at creation, calendar days, inclusive
  timeExtensionDays: number             // default 0, PM-editable
  contractDatesSetAt?: string           // ISO timestamp when first set
}

/**
 * Normalize a date to UTC midnight to avoid timezone drift in day-count math.
 */
function toUTCDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/**
 * Calendar days between two dates, INCLUSIVE of both endpoints.
 * (P6 / DCMA convention: NTP day counts as day 1, completion day counts.)
 */
export function calendarDaysBetween(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0
  const start = toUTCDate(startISO)
  const end = toUTCDate(endISO)
  const ms = end.getTime() - start.getTime()
  const days = Math.round(ms / 86400000) + 1
  return days > 0 ? days : 0
}

/**
 * Add a number of calendar days to a date.
 */
export function addCalendarDays(dateISO: string, days: number): string {
  if (!dateISO) return ''
  const d = toUTCDate(dateISO)
  d.setUTCDate(d.getUTCDate() + days)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Compute the Revised Contract Completion date from Original + Time Extension.
 */
export function computeRevisedCompletion(cd: ContractDates): string {
  return addCalendarDays(cd.originalContractCompletion, cd.timeExtensionDays || 0)
}

/**
 * Compute the Revised Duration = Original Duration + Time Extension.
 */
export function computeRevisedDuration(cd: ContractDates): number {
  return (cd.originalDuration || 0) + (cd.timeExtensionDays || 0)
}

/**
 * Create a new ContractDates object from PM-entered NTP and Original Completion.
 * Freezes the Original Duration at this moment.
 */
export function createContractDates(
  ntpDate: string,
  originalCompletion: string,
  timeExtensionDays: number = 0
): ContractDates {
  return {
    ntpDate,
    originalContractCompletion: originalCompletion,
    originalDuration: calendarDaysBetween(ntpDate, originalCompletion),
    timeExtensionDays: timeExtensionDays || 0,
    contractDatesSetAt: new Date().toISOString(),
  }
}

/**
 * Format an ISO date as MM/DD/YYYY for display.
 */
export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${m}/${d}/${y}`
}

/**
 * Try to pre-fill contract dates from XER analyzer fields when migrating
 * an existing project. Best-effort: returns null if no usable dates.
 */
export function prefillFromAnalyzer(analyzer: any): { ntpDate: string; originalContractCompletion: string } | null {
  if (!analyzer) return null
  const ntp =
    analyzer.planStartDate ||
    analyzer.plan_start_date ||
    analyzer.ntp ||
    analyzer.ntpDate ||
    analyzer.projectStart ||
    analyzer.project_start
  const end =
    analyzer.planEndDate ||
    analyzer.plan_end_date ||
    analyzer.contractCompletion ||
    analyzer.contractEnd ||
    analyzer.contract_end ||
    analyzer.scdEndDate ||
    analyzer.scd_end_date
  if (!ntp || !end) return null
  // Strip time component if present
  const ntpISO = String(ntp).slice(0, 10)
  const endISO = String(end).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ntpISO) || !/^\d{4}-\d{2}-\d{2}$/.test(endISO)) return null
  return { ntpDate: ntpISO, originalContractCompletion: endISO }
}
