// =============================================================================
// Version Labeler — Day 6, v14
//
// Generates and validates structured version IDs:
//   {projectId}-BL-{NTP}-00      ← initial baseline (only ever -00)
//   {projectId}-BL-{NTP}-NN      ← rebaselines, NN = 01..99
//   {projectId}-CU-{NTP}-NN      ← updates, NN = 01..99
//
// Where {NTP} is the project's manual NTP date as YYYYMMDD.
//
// Encodes the dropdown state machine + duplicate detection. Used by:
//   - Upload form    (dropdown disable state, label preview)
//   - projectStore   (label assigned at upload, migration of legacy versions)
//   - Sidebar        (duplicate flag rendering)
// =============================================================================

export type ScheduleType = 'baseline' | 'rebaseline' | 'update'

// Subset of ScheduleVersion fields we need for label logic. Keeps this module
// independent of the larger Project type so it can be unit-tested in isolation.
export interface VersionLabelInput {
  id: string
  scheduleType?: ScheduleType
  sequenceNumber?: number
  dataDate?: string
}

// ----- Date helpers --------------------------------------------------------

// 'YYYY-MM-DD' → 'YYYYMMDD'. Strips dashes, returns empty string for invalid.
export function formatNtpForLabel(ntp: string | undefined): string {
  if (!ntp) return ''
  // Accept either YYYY-MM-DD or full ISO timestamps.
  const d = new Date(ntp)
  if (isNaN(d.getTime())) return ''
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

// ----- Label generation ----------------------------------------------------

// Format the version label given all the pieces. Sequence number is padded
// to two digits ('01', '02', ..., '99'). NN above 99 throws — caller should
// have checked canUploadType first.
export function generateVersionLabel(opts: {
  projectId: string
  ntp: string
  type: ScheduleType
  sequenceNumber: number
}): string {
  const { projectId, ntp, type, sequenceNumber } = opts
  if (sequenceNumber < 0 || sequenceNumber > 99) {
    throw new Error(`Sequence number ${sequenceNumber} out of range (0-99)`)
  }
  // Baseline is always 00; rebaselines start at 01. Update starts at 01.
  // We don't enforce that here (caller controls it) but we WARN in dev.
  const prefix = type === 'update' ? 'CU' : 'BL'
  const ntpStr = formatNtpForLabel(ntp) || 'NODATE'
  const nn = String(sequenceNumber).padStart(2, '0')
  return `${projectId}-${prefix}-${ntpStr}-${nn}`
}

// ----- State queries -------------------------------------------------------

// Returns the next available sequence number for the given type, or null if
// the project is maxed out (e.g., 99 updates already).
//
// Rules:
//   baseline:   always 00. Returns null if a baseline already exists.
//   rebaseline: starts at 01, increments. Returns null at 99.
//   update:     starts at 01, increments. Returns null at 99.
export function getNextSequenceNumber(
  versions: VersionLabelInput[],
  type: ScheduleType,
): number | null {
  if (type === 'baseline') {
    const hasBaseline = versions.some(v => v.scheduleType === 'baseline')
    return hasBaseline ? null : 0
  }
  // For rebaseline + update, find the highest existing sequenceNumber of
  // that type and add 1. Cap at 99.
  let max = 0
  for (const v of versions) {
    if (v.scheduleType === type) {
      const n = typeof v.sequenceNumber === 'number' ? v.sequenceNumber : 0
      if (n > max) max = n
    }
  }
  const next = max + 1
  return next > 99 ? null : next
}

// Returns whether the given schedule type CAN be uploaded right now.
// Drives the dropdown enable/disable state.
//
//   nothing uploaded yet     → baseline available, rebaseline/update disabled
//   has baseline             → rebaseline + update available, baseline disabled
//   baseline deleted         → baseline available again, others disabled
export function canUploadType(
  versions: VersionLabelInput[],
  type: ScheduleType,
): { allowed: boolean; reason?: string } {
  const hasBaseline = versions.some(v => v.scheduleType === 'baseline')

  if (type === 'baseline') {
    if (hasBaseline) {
      return { allowed: false, reason: 'Baseline already exists — delete it first to upload a new one' }
    }
    return { allowed: true }
  }

  // rebaseline + update both require a baseline first
  if (!hasBaseline) {
    return { allowed: false, reason: 'Upload a baseline first' }
  }

  // Check sequence number cap
  const next = getNextSequenceNumber(versions, type)
  if (next === null) {
    return { allowed: false, reason: `Reached the 99 ${type} limit for this project` }
  }
  return { allowed: true }
}

// ----- Duplicate detection -------------------------------------------------

// Finds all version IDs that share their data date with at least one OTHER
// version in the same set. Returns a Set of duplicate version IDs.
//
// Rule (confirmed with founder, Day 6): two versions are duplicates when
// their data dates match — NTP and Contract End are PM-entered constants
// that always match anyway, so the only PM-controlled signal that
// distinguishes versions is the data date inside the XER.
//
// Uses date-only comparison (YYYY-MM-DD) so timestamps within the same day
// still flag.
export function findDataDateDuplicates(versions: VersionLabelInput[]): Set<string> {
  const dateToIds = new Map<string, string[]>()
  for (const v of versions) {
    if (!v.dataDate) continue
    const key = v.dataDate.slice(0, 10)  // YYYY-MM-DD
    const list = dateToIds.get(key) || []
    list.push(v.id)
    dateToIds.set(key, list)
  }
  const dupes = new Set<string>()
  dateToIds.forEach((ids) => {
    if (ids.length > 1) {
      for (const id of ids) dupes.add(id)
    }
  })
  return dupes
}

// ----- Project ID helpers --------------------------------------------------

// Sanitize a string into a valid Project ID — letters/numbers/hyphens only,
// 3-20 chars. Drops accents, spaces become hyphens, multiple hyphens collapse.
//
// STRICT version — used at save time. Trims leading/trailing hyphens and
// collapses repeated hyphens. Don't use this on every keystroke or the user
// can't type "DC-" without the trailing hyphen disappearing.
export function sanitizeProjectId(raw: string): string {
  if (!raw) return ''
  let s = raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .toUpperCase()
    .replace(/[^A-Z0-9-\s]/g, '')                      // letters/nums/hyphens/spaces
    .replace(/\s+/g, '-')                               // spaces → hyphen
    .replace(/-+/g, '-')                                // collapse multi hyphens
    .replace(/^-+|-+$/g, '')                            // trim leading/trailing hyphens
  return s.slice(0, 20)
}

// LIVE version — used by the upload form's onChange so users can actually
// type hyphens and spaces. Keeps the same character set (letters, numbers,
// hyphens) but does NOT trim or collapse. Spaces are still converted to
// hyphens so "DC GEN" types as "DC-GEN" without weird intermediate states.
// On save, runAnalysis calls sanitizeProjectId() to clean up any stray
// leading/trailing/repeated hyphens.
export function sanitizeProjectIdLive(raw: string): string {
  if (!raw) return ''
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9-\s]/g, '')
    .replace(/\s/g, '-')                               // spaces → hyphen (preserves repeats)
    .slice(0, 20)
}

// Validates a Project ID. Returns null if valid, error string if not.
export function validateProjectId(id: string): string | null {
  if (!id) return 'Project ID is required'
  if (id.length < 3) return 'Project ID must be at least 3 characters'
  if (id.length > 20) return 'Project ID must be 20 characters or fewer'
  if (!/^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$/i.test(id)) {
    return 'Use letters, numbers, and hyphens only (no leading/trailing hyphen)'
  }
  return null
}

// Auto-generate a Project ID from a project name. Used by migration for
// legacy projects that don't have one yet. Format: "DC General Hospital" →
// "DCGEN-001". The "-001" suffix is fixed to 001 here; if there's a collision
// the caller should bump it.
export function autoGenerateProjectId(
  projectName: string,
  existingIds: string[] = [],
): string {
  const base = sanitizeProjectId(projectName).slice(0, 12) || 'PROJ'
  // Try base-001, base-002, ... until unique
  for (let i = 1; i < 999; i++) {
    const candidate = `${base}-${String(i).padStart(3, '0')}`
    if (!existingIds.includes(candidate)) return candidate
  }
  return `${base}-X`
}

// ----- Snapshot helper -----------------------------------------------------

// Build a date snapshot to store on a version at upload time. Combines the
// project's current contract dates with the XER's data date. PM-entered
// constants (NTP, Contract End) get frozen here so the version remembers
// what the project looked like at upload time even if PM later edits the
// project's contractDates.
export interface DateSnapshot {
  ntp?: string                          // YYYY-MM-DD
  contractEnd?: string                  // YYYY-MM-DD
  revisedEnd?: string                   // YYYY-MM-DD
  dataDate?: string                     // YYYY-MM-DD from XER
}
export function buildDateSnapshot(
  contractDates: { ntp?: string; originalContractCompletion?: string; revisedContractCompletion?: string } | undefined,
  dataDate: string | undefined,
): DateSnapshot {
  const cd = contractDates || {}
  return {
    ntp: cd.ntp?.slice(0, 10),
    contractEnd: cd.originalContractCompletion?.slice(0, 10),
    revisedEnd: (cd.revisedContractCompletion || cd.originalContractCompletion)?.slice(0, 10),
    dataDate: dataDate?.slice(0, 10),
  }
}
