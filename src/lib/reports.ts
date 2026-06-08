// =============================================================================
// src/lib/reports.ts
// =============================================================================
// Reporting helpers for ControlLens. Mirrors EstimateLens conventions so the
// two products share a visual + naming language.
//
// Report number format: CL-{PROJECT_CODE}-{KIND}-{YYYYMMDD}
//   e.g.  CL-040ADV-26-R-EXEC-20260607
// =============================================================================

/**
 * The set of report kinds in the ControlLens library.
 * Keep this in sync with the cards in src/app/dashboard/reports/page.tsx
 */
export type ReportKind =
  | 'EXEC'    // Executive Summary
  | 'FULL'    // Full Analysis
  | 'RISK'    // Risk Register
  | 'OOS'     // Out-of-Sequence
  | 'TIA'     // Time Impact Analysis
  | 'TREND'   // Trend & Variance
  | 'LEAD'    // Long-Lead & Procurement
  | 'EVM'     // Earned Value
  | 'SUB'     // Submittals & RFI Impact
  | 'BOOK'    // Complete ControlLens Report

/**
 * Generate the report number shown in the header and footer of every report.
 * Federal customers expect this convention — a stable, dated identifier they
 * can attach to project files.
 *
 * @param projectCode  The project's external code (e.g., "040ADV-26-R")
 * @param kind         One of the report kinds above
 * @param date         Optional date override (default: today)
 */
export function reportNumber(
  projectCode: string | null | undefined,
  kind: ReportKind,
  date?: Date
): string {
  const code = (projectCode || 'PRJ')
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 14)
  const d = date ?? new Date()
  const ymd =
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, '0')}` +
    `${String(d.getDate()).padStart(2, '0')}`
  return `CL-${code}-${kind}-${ymd}`
}

/**
 * Human-friendly label for each report kind. Used in the hub cards and
 * the report headers.
 */
export const REPORT_TITLES: Record<ReportKind, string> = {
  EXEC:  'Executive Summary',
  FULL:  'Full Analysis Report',
  RISK:  'Risk Register',
  OOS:   'Out-of-Sequence Report',
  TIA:   'Time Impact Analysis',
  TREND: 'Trend & Variance Report',
  LEAD:  'Long-Lead & Procurement',
  EVM:   'Earned Value Report',
  SUB:   'Submittals & RFI Impact',
  BOOK:  'Complete ControlLens Report',
}

/**
 * Short tagline shown in the cover sheet — mirrors EstimateLens convention
 * of having a one-line product positioning under the wordmark.
 */
export const REPORT_TAGLINE = 'CONSTRUCTION SCHEDULE INTELLIGENCE'

/**
 * Format a date for display in report headers and footers.
 * Always renders as "Jun 07, 2026" — short, unambiguous, no locale surprises.
 */
export function fmtReportDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

/**
 * Format a date as MM/DD/YYYY for compact use in tables and KPI tiles.
 */
export function fmtShortDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}
