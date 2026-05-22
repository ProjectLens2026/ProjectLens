// =============================================================================
// EVM (Earned Value Management) — helpers for the Project Production tab
// Day 5, v12 (final model)
//
// PERCENTAGE-BASED INPUT MODEL:
//
//   Per-month, PM enters:
//     - Earned %    (always; this is what physical work was completed)
//     - Actual Cost (OPTIONAL; in dollars; what was actually spent that month)
//
//   Planned % is auto-distributed from total budget across the project months
//   (S-curve / Linear / Manual). Total Budget is set once per project.
//
//   Everything else is derived:
//     - Planned $   = budget × planned% / 100
//     - Earned $    = budget × earned% / 100         ← Earned Value
//     - CPI         = Earned $ ÷ Actual Cost          ← standard EVM CPI
//                     (null if PM hasn't entered actual cost)
//     - SPI         = Earned % ÷ Planned %            ← schedule performance
//
// ControlLens emphasizes SCHEDULE performance (SPI). Cost performance (CPI)
// is optional — PM only sees it if they choose to record monthly actual cost
// (we don't pull that from the XER; it's accounting data outside our scope).
//
// CHANGES FROM v11 (don't carry forward):
//   - retainagePct REMOVED from EvmData
//   - Cash-CPI formula REMOVED — back to standard EV/AC
//   - actualCost added per-month as optional manual input
// =============================================================================

export type DistributionMode = 'scurve' | 'linear' | 'manual'

export interface EvmMonth {
  isoMonth: string
  label: string
  plannedPct: number
  earnedPct: number
  // OPTIONAL: actual cost in dollars for this month. PM enters manually if
  // they want CPI computed. Leave undefined / 0 to skip cost tracking.
  // ControlLens does not derive this — it's accounting data.
  actualCost?: number
}

export interface EvmData {
  totalBudget: number
  currency: string
  distributionMode: DistributionMode
  months: EvmMonth[]
}

// ----- Month generation ----------------------------------------------------

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

// ----- Distribution math ---------------------------------------------------

export function computeScurveDistribution(n: number, steepness = 6): number[] {
  if (n <= 0) return []
  if (n === 1) return [100]
  const cumulative: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    cumulative.push(1 / (1 + Math.exp(-steepness * (t - 0.5))))
  }
  const min = cumulative[0]
  const max = cumulative[cumulative.length - 1]
  const normalized = cumulative.map(c => (c - min) / Math.max(0.0001, max - min))
  const increments: number[] = []
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? 0 : normalized[i - 1]
    increments.push((normalized[i] - prev) * 100)
  }
  const sum = increments.reduce((a, b) => a + b, 0)
  if (sum > 0 && Math.abs(sum - 100) > 0.0001) {
    const factor = 100 / sum
    return increments.map(v => +(v * factor).toFixed(4))
  }
  return increments.map(v => +v.toFixed(4))
}

export function computeLinearDistribution(n: number): number[] {
  if (n <= 0) return []
  return Array(n).fill(+(100 / n).toFixed(4))
}

// Build a fresh months array — preserves earnedPct AND actualCost from
// existing months (keyed by isoMonth) so switching distribution mode never
// loses PM-entered data.
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
      earnedPct: prior?.earnedPct ?? 0,
      actualCost: prior?.actualCost,
    }
  })
}

// ----- Per-month derived values --------------------------------------------

export function monthPlanned(plannedPct: number, totalBudget: number): number {
  return (plannedPct / 100) * (totalBudget || 0)
}
export function monthEarned(earnedPct: number, totalBudget: number): number {
  return (earnedPct / 100) * (totalBudget || 0)
}

// Standard CPI = Earned $ ÷ Actual Cost.
// Returns null if PM hasn't entered actual cost (we don't fabricate it).
//   CPI > 1 → under budget (earned more than spent)
//   CPI = 1 → on budget
//   CPI < 1 → over budget (spent more than earned)
export function monthCPI(earnedPct: number, totalBudget: number, actualCost: number | undefined): number | null {
  if (!actualCost || actualCost <= 0) return null
  const ev = monthEarned(earnedPct, totalBudget)
  if (ev === 0) return null
  return ev / actualCost
}

// SPI = Earned % ÷ Planned %.
//   SPI > 1 → ahead of schedule
//   SPI = 1 → on schedule
//   SPI < 1 → behind schedule
export function monthSPI(earnedPct: number, plannedPct: number): number | null {
  if (!plannedPct || plannedPct === 0) return null
  return earnedPct / plannedPct
}

// Cost / Schedule Variance — useful as $ amounts alongside the ratios.
//   CV = EV − AC  (positive = under budget)
//   SV = EV − PV  (positive = ahead of schedule)
export function monthCV(earnedPct: number, totalBudget: number, actualCost: number | undefined): number | null {
  if (!actualCost || actualCost <= 0) return null
  return monthEarned(earnedPct, totalBudget) - actualCost
}
export function monthSV(earnedPct: number, plannedPct: number, totalBudget: number): number {
  return monthEarned(earnedPct, totalBudget) - monthPlanned(plannedPct, totalBudget)
}

// ----- Cumulative summary --------------------------------------------------

export function evmCumulative(
  totalBudget: number,
  months: EvmMonth[],
  cutoffIsoMonth: string | undefined,
) {
  const empty = {
    pv: 0, ev: 0, ac: 0,
    cpi: null as number | null,
    spi: null as number | null,
    cv: null as number | null,
    sv: 0,
    plannedPct: 0, earnedPct: 0,
    hasAnyActualCost: false,
  }
  if (!Array.isArray(months) || months.length === 0 || totalBudget === 0) return empty
  let plannedPctSum = 0, earnedPctSum = 0, acSum = 0, anyAc = false
  for (const m of months) {
    if (cutoffIsoMonth && m.isoMonth > cutoffIsoMonth) break
    plannedPctSum += m.plannedPct || 0
    earnedPctSum += m.earnedPct || 0
    if (m.actualCost && m.actualCost > 0) {
      acSum += m.actualCost
      anyAc = true
    }
  }
  const pv = (plannedPctSum / 100) * totalBudget
  const ev = (earnedPctSum / 100) * totalBudget
  const cpi = anyAc && ev > 0 ? ev / acSum : null
  const spi = plannedPctSum > 0 ? earnedPctSum / plannedPctSum : null
  const cv = anyAc ? ev - acSum : null
  const sv = ev - pv
  return {
    pv, ev, ac: acSum, cpi, spi, cv, sv,
    plannedPct: plannedPctSum, earnedPct: earnedPctSum,
    hasAnyActualCost: anyAc,
  }
}

// ----- Plain-English meaning helpers --------------------------------------

export function spiMeaning(spi: number | null): string {
  if (spi === null) return 'Enter Earned % to compute'
  if (Math.abs(spi - 1) < 0.005) return 'On schedule'
  if (spi > 1) return 'Ahead of schedule'
  return 'Behind schedule'
}

export function cpiMeaning(cpi: number | null): string {
  if (cpi === null) return 'Enter Actual Cost to compute'
  if (Math.abs(cpi - 1) < 0.005) return 'On budget'
  if (cpi > 1) return 'Under budget'
  return 'Over budget'
}

// ----- Format helpers -----------------------------------------------------

export function fmtDollars(amount: number, currency: string = 'USD'): string {
  if (!isFinite(amount)) return '—'
  const symbol = currency === 'USD' ? '$' : currency === 'AED' ? 'AED ' : `${currency} `
  const rounded = Math.round(amount)
  return symbol + rounded.toLocaleString('en-US')
}
export function fmtRatio(r: number | null | undefined): string {
  if (r === null || r === undefined || !isFinite(r)) return '—'
  return r.toFixed(2)
}
export function fmtPct(p: number): string {
  if (!isFinite(p)) return '—'
  return p.toFixed(2) + '%'
}

// =============================================================================
// Migration — handle v10 (earnedDollars/actualDollars dollar schema) and v11
// (retainagePct schema) to the current v12 model.
// =============================================================================
export function migrateEvmData(raw: any): EvmData | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const totalBudget = Number(raw.totalBudget) || 0
  const distributionMode: DistributionMode = ['scurve', 'linear', 'manual'].includes(raw.distributionMode)
    ? raw.distributionMode : 'scurve'
  const currency = raw.currency || 'USD'
  const months: EvmMonth[] = Array.isArray(raw.months) ? raw.months.map((m: any) => {
    if (typeof m.earnedPct === 'number') {
      return {
        isoMonth: m.isoMonth,
        label: m.label,
        plannedPct: Number(m.plannedPct) || 0,
        earnedPct: Number(m.earnedPct) || 0,
        actualCost: typeof m.actualCost === 'number' ? m.actualCost : undefined,
      }
    }
    const earnedDollars = Number(m.earnedDollars) || 0
    const earnedPct = totalBudget > 0 ? (earnedDollars / totalBudget) * 100 : 0
    const actualDollars = Number(m.actualDollars) || 0
    return {
      isoMonth: m.isoMonth,
      label: m.label,
      plannedPct: Number(m.plannedPct) || 0,
      earnedPct,
      actualCost: actualDollars > 0 ? actualDollars : undefined,
    }
  }) : []
  return { totalBudget, currency, distributionMode, months }
}
