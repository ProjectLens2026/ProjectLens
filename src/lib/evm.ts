// =============================================================================
// EVM (Earned Value Management) — helpers for the Project Production tab
// Day 5, v10
//
// All data here is MANUALLY entered by the PM — nothing is derived from XER.
// This module handles:
//   - Month range generation (from project NTP → contract end)
//   - Distribution math (S-curve and Linear) for spreading a budget across
//     months
//   - Type definitions for storage
//
// The S-curve formula uses a sigmoid steepness=6 which produces the typical
// construction cash-flow shape — slow ramp at start, peak velocity around
// mid-project, slow taper at end. PMs can override to Linear or fully
// Manual mode if their project doesn't fit the S.
// =============================================================================

export type DistributionMode = 'scurve' | 'linear' | 'manual'

export interface EvmMonth {
  // Stable identifier for this month — used as React key + dedupe.
  // Format: YYYY-MM (e.g., '2025-03')
  isoMonth: string
  // Display label, e.g., 'Mar 25'
  label: string
  // Percentage of total budget planned for this month (0–100). The sum
  // across all months should be ~100 (rounding may cause tiny drift).
  plannedPct: number
  // Dollar value of physical work actually completed this month.
  // PM-entered. 0 if no work credited yet.
  earnedDollars: number
  // What was billed / paid this month. PM-entered. 0 if not yet billed.
  actualDollars: number
}

export interface EvmData {
  totalBudget: number
  currency: string           // 'USD' default; 'AED' or others later
  distributionMode: DistributionMode
  months: EvmMonth[]
}

// Generate one entry per calendar month spanning [startIso, endIso] inclusive
// at the month level. Both args are ISO date strings — anything new Date()
// can parse. Returns [] if either is missing or end < start.
export function generateMonthRange(startIso: string | undefined, endIso: string | undefined):
  Array<{ isoMonth: string; label: string }> {
  if (!startIso || !endIso) return []
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return []
  if (start.getTime() > end.getTime()) return []
  const result: Array<{ isoMonth: string; label: string }> = []
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMarker = new Date(end.getFullYear(), end.getMonth(), 1)
  // Safety cap — never generate more than 10 years of months even if dates
  // are garbage. Prevents an infinite loop if endIso is malformed enough
  // to slip past the parse check.
  let safety = 0
  while (cursor.getTime() <= endMarker.getTime() && safety < 120) {
    const yy = cursor.getFullYear()
    const mm = String(cursor.getMonth() + 1).padStart(2, '0')
    result.push({
      isoMonth: `${yy}-${mm}`,
      label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    })
    cursor.setMonth(cursor.getMonth() + 1)
    safety++
  }
  return result
}

// S-curve distribution percentages summing to 100.
// Returns ONE percentage per month — these are MONTHLY increments,
// not cumulative.
//
// Implementation: sigmoid normalized so first cumulative point = 0 and last
// cumulative point = 1, then differenced into monthly increments, then
// scaled so the sum is exactly 100.
export function computeScurveDistribution(n: number, steepness = 6): number[] {
  if (n <= 0) return []
  if (n === 1) return [100]
  // Cumulative sigmoid values
  const cumulative: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    cumulative.push(1 / (1 + Math.exp(-steepness * (t - 0.5))))
  }
  // Normalize cumulative to start at 0 and end at 1
  const min = cumulative[0]
  const max = cumulative[cumulative.length - 1]
  const normalized = cumulative.map(c => (c - min) / Math.max(0.0001, max - min))
  // Difference to get monthly increments (percentages * 100)
  const increments: number[] = []
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? 0 : normalized[i - 1]
    increments.push((normalized[i] - prev) * 100)
  }
  // Rounding cleanup — scale so sum is exactly 100
  const sum = increments.reduce((a, b) => a + b, 0)
  if (sum > 0 && Math.abs(sum - 100) > 0.0001) {
    const factor = 100 / sum
    return increments.map(v => +(v * factor).toFixed(4))
  }
  return increments.map(v => +v.toFixed(4))
}

// Linear distribution: equal percentage every month.
export function computeLinearDistribution(n: number): number[] {
  if (n <= 0) return []
  return Array(n).fill(+(100 / n).toFixed(4))
}

// Build a fresh months array given start/end dates and the chosen distribution.
// When distribution is 'manual', all percentages start at 0 — the PM enters
// values per row.
//
// PRESERVES earned/actual dollars from an existing months array (keyed by
// isoMonth). This lets the PM switch distribution modes or re-extend the
// date range without losing the per-month actuals they've already entered.
export function buildEvmMonths(
  startIso: string | undefined,
  endIso: string | undefined,
  distribution: DistributionMode,
  existing?: EvmMonth[],
): EvmMonth[] {
  const range = generateMonthRange(startIso, endIso)
  const n = range.length
  let percentages: number[]
  if (distribution === 'scurve') {
    percentages = computeScurveDistribution(n)
  } else if (distribution === 'linear') {
    percentages = computeLinearDistribution(n)
  } else {
    // 'manual' — leave plannedPct at whatever the existing month had,
    // or 0 if this is a new month.
    percentages = Array(n).fill(0)
  }
  const existingMap = new Map<string, EvmMonth>()
  if (Array.isArray(existing)) {
    for (const m of existing) {
      if (m && m.isoMonth) existingMap.set(m.isoMonth, m)
    }
  }
  return range.map((r, i) => {
    const prior = existingMap.get(r.isoMonth)
    return {
      isoMonth: r.isoMonth,
      label: r.label,
      plannedPct: distribution === 'manual'
        ? (prior?.plannedPct ?? 0)
        : percentages[i] ?? 0,
      earnedDollars: prior?.earnedDollars ?? 0,
      actualDollars: prior?.actualDollars ?? 0,
    }
  })
}

// Single-month CPI = EV ÷ AC. Returns null when AC is zero (undefined ratio).
export function monthCPI(earnedDollars: number, actualDollars: number): number | null {
  if (!actualDollars || actualDollars === 0) return null
  return earnedDollars / actualDollars
}

// Single-month SPI = EV ÷ PV. Returns null when PV is zero.
export function monthSPI(earnedDollars: number, plannedDollars: number): number | null {
  if (!plannedDollars || plannedDollars === 0) return null
  return earnedDollars / plannedDollars
}

// Cumulative summary helper. Pass the months array and the cutoff isoMonth
// (typically the data-date month). Returns cumulative PV/EV/AC up to and
// INCLUDING the cutoff month, plus the to-date CPI and SPI.
export function evmCumulative(
  totalBudget: number,
  months: EvmMonth[],
  cutoffIsoMonth: string | undefined,
) {
  if (!Array.isArray(months) || months.length === 0) {
    return { pv: 0, ev: 0, ac: 0, cpi: null as number | null, spi: null as number | null }
  }
  let pv = 0, ev = 0, ac = 0
  for (const m of months) {
    if (cutoffIsoMonth && m.isoMonth > cutoffIsoMonth) break
    pv += (m.plannedPct / 100) * totalBudget
    ev += m.earnedDollars || 0
    ac += m.actualDollars || 0
  }
  const cpi = ac > 0 ? ev / ac : null
  const spi = pv > 0 ? ev / pv : null
  return { pv, ev, ac, cpi, spi }
}

// Format a dollar amount as "$1,234,567" (no decimals).
// Used for KPI tiles and chart labels — kept simple for readability.
export function fmtDollars(amount: number, currency: string = 'USD'): string {
  if (!isFinite(amount)) return '—'
  const symbol = currency === 'USD' ? '$' : currency === 'AED' ? 'AED ' : `${currency} `
  const rounded = Math.round(amount)
  return symbol + rounded.toLocaleString('en-US')
}

// Format a ratio like CPI/SPI to 2 decimals, or '—' if null.
export function fmtRatio(r: number | null | undefined): string {
  if (r === null || r === undefined || !isFinite(r)) return '—'
  return r.toFixed(2)
}
