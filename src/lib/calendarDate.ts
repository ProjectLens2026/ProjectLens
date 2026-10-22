// Project schedule and contract dates are calendar dates, not instants in
// time. Parsing YYYY-MM-DD with new Date() treats it as UTC midnight and can
// display the prior day in US time zones. These helpers preserve the literal
// date exported by P6 or entered in the Project Control Basis.

export interface CalendarDateParts {
  year: number
  month: number
  day: number
}

export function calendarDateParts(value?: string | null): CalendarDateParts | null {
  if (!value) return null
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const utc = new Date(Date.UTC(year, month - 1, day))
    if (utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day) {
      return { year, month, day }
    }
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() }
}

export function calendarDateUtcMs(value?: string | null): number | null {
  const parts = calendarDateParts(value)
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) : null
}

export function calendarDayDifference(start?: string | null, end?: string | null): number | null {
  const startMs = calendarDateUtcMs(start)
  const endMs = calendarDateUtcMs(end)
  if (startMs === null || endMs === null) return null
  return Math.round((endMs - startMs) / 86_400_000)
}

export function formatCalendarDate(
  value?: string | null,
  style: 'numeric' | 'short' | 'numeric-2' = 'numeric',
): string {
  const parts = calendarDateParts(value)
  if (!parts) return '—'
  const mm = String(parts.month).padStart(2, '0')
  const dd = String(parts.day).padStart(2, '0')
  if (style === 'numeric') return `${mm}/${dd}/${parts.year}`
  if (style === 'numeric-2') return `${parts.month}/${parts.day}/${String(parts.year).slice(-2)}`
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parts.month - 1]} ${dd}, ${parts.year}`
}
