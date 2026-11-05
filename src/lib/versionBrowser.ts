import type { ScheduleVersion } from './projectStore'
import { versionDataDate } from './sourceScheduleDate'

// Schedule dates are calendar dates, not upload timestamps or UTC instants.
export function scheduleDataDate(v: ScheduleVersion): string {
  const raw = versionDataDate(v)
  const match = typeof raw === 'string' ? raw.match(/^(\d{4}-\d{2}-\d{2})/) : null
  if (!match) return ''
  const date = new Date(`${match[1]}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1] ? match[1] : ''
}

export function compareScheduleVersions(a: ScheduleVersion, b: ScheduleVersion): number {
  const ad = scheduleDataDate(a), bd = scheduleDataDate(b)
  if (ad !== bd) return ad ? (bd ? bd.localeCompare(ad) : -1) : 1
  return (b.sequenceNumber || 0) - (a.sequenceNumber || 0)
    || (b.uploadedAt || '').localeCompare(a.uploadedAt || '')
    || a.id.localeCompare(b.id)
}

export function browserDate(value?: string): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return '—'
  return `${match[2]}-${match[3]}-${match[1].slice(-2)}`
}
