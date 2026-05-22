// Project storage layer — IndexedDB-backed.
// (header comment unchanged — see prior version for details)

import type { EvmData } from './evm'
import {
  type ScheduleType,
  type DateSnapshot,
  formatNtpForLabel,
  generateVersionLabel,
  getNextSequenceNumber,
  buildDateSnapshot,
  autoGenerateProjectId,
  findDataDateDuplicates,
} from './versionLabeler'

// =============================================================================
// Project status — 5-state model.
// Active (default), Completed, On Hold, Archived, Deleted.
//
// • Active/Completed/On Hold/Archived are user-pickable from the ⋮ menu.
// • "Deleted" is set automatically when the user clicks Delete (soft delete).
//   Restore brings it back to Active. Permanent removal happens from the
//   Deleted Items page via permanentlyDeleteProject().
// =============================================================================

export type ProjectStatus = 'Active' | 'Completed' | 'On Hold' | 'Archived' | 'Deleted'

// =============================================================================
// Contract dates — manual PM entries (added 2026-05-21).
//
// LAYER 1 (project-level, ContractDates):
//   Sticky across versions. PM enters NTP + Original Contract Completion on
//   first upload. On subsequent uploads, these pre-fill from the project
//   but remain editable.
//
// LAYER 2 (version-level, VersionDates):
//   Per-version values. Time Extension defaults to 0, editable each upload.
//   Revised Contract Completion auto-calculates as
//       (Original Contract Completion + Time Extension days)
//   but PM can override to a specific date.
//   manualDataDate is optional — if blank, the XER's data date is used.
//
// Where they flow to:
//   - Executive Dashboard reads these first, falls back to XER analyzer
//     fields when missing (handles legacy projects with no manual dates).
//   - Durations on the dashboard use these as the source of truth.
// =============================================================================
export interface ContractDates {
  ntp?: string                          // ISO date (YYYY-MM-DD)
  originalContractCompletion?: string   // ISO date (YYYY-MM-DD)
  // NEW (Day 5, v2) — manual Substantial Completion date.
  // Displayed on the dashboard alongside the XER-detected Substantial
  // Completion milestone, so PMs can compare what the contract says
  // (manual) vs what the schedule shows (auto-detected from milestone
  // name keywords like SUBSTANTIAL / BENEFICIAL OCCUPANCY).
  // Sticky at the project level — pre-fills on subsequent version uploads.
  substantialCompletion?: string        // ISO date (YYYY-MM-DD)
}

export interface VersionDates {
  timeExtensionDays: number             // default 0
  revisedContractCompletion?: string    // ISO date — calc'd or manually overridden
  manualDataDate?: string               // optional, XER data date used if blank
}

export interface ScheduleVersion {
  id: string
  uploadedAt: string
  dataDate?: string
  fileName: string
  analysis: any
  aiNarrative?: string
  context?: any
  versionLabel?: string
  rawXER?: string
  versionDates?: VersionDates           // NEW — per-version manual entries

  // NEW (Day 6, v14) — structured version labeling.
  // scheduleType drives label format: BL-NTP-NN for baseline/rebaseline,
  // CU-NTP-NN for updates. sequenceNumber is the NN (0 for first baseline,
  // 01..99 for everything else). versionLabel above is now auto-generated
  // from {projectId, ntp, scheduleType, sequenceNumber} — never user-edited.
  scheduleType?: ScheduleType
  sequenceNumber?: number

  // NEW (Day 6, v14) — date snapshot at upload time.
  // Frozen copy of NTP / contract end / revised end / data date taken when
  // this version was saved. Sidebar reads from snapshot when version is
  // active, so clicking an older version shows the project state from back
  // then (not whatever contractDates says today).
  snapshot?: DateSnapshot
}

export interface Project {
  id: string
  projectId?: string
  name: string
  owner?: string
  contractValue?: string
  phase?: string
  createdAt: string
  updatedAt: string
  status?: ProjectStatus
  deletedAt?: string  // ISO timestamp when soft-deleted. Cleared on restore.
  versions: ScheduleVersion[]
  rfis: any[]
  changeOrders: any[]
  contractDates?: ContractDates         // Manual contract dates (NTP, Original Comp, Substantial)
  // EVM data — Day 5, v10. Project-level (sticky across versions). PM enters
  // total budget once; monthly grid auto-spreads using chosen distribution.
  // Per-month earned and actual dollars are PM-entered as work progresses.
  // See src/lib/evm.ts for the EvmData type definition.
  evm?: EvmData
}

// Re-export EvmData so it appears in projectStore's API surface alongside
// the other project-level types.
export type { EvmData, EvmMonth, DistributionMode } from './evm'

// Re-export version labeling types so consumers don't have to import from
// two modules. ScheduleType is the dropdown enum, DateSnapshot the per-version
// frozen dates.
export type { ScheduleType, DateSnapshot } from './versionLabeler'

export interface SaveResult {
  ok: boolean
  error?: string
}

const LEGACY_PROJECTS_KEY = 'pl_projects'
const ACTIVE_PROJECT_KEY = 'pl_active_project_id'
const ACTIVE_VERSION_KEY = 'pl_active_version_id'

const DB_NAME = 'nobelpm'
const DB_VERSION = 1
const PROJECTS_STORE = 'projects'

let _projects: Project[] = []
let _hydrated = false
let _hydrationPromise: Promise<void> | null = null
let _dbPromise: Promise<IDBDatabase> | null = null

type Listener = () => void
const _listeners: Set<Listener> = new Set()

// =============================================================================
// Helpers for contract date math — exported so the upload form and dashboard
// can both use the SAME calculation. Stops "off by one" disagreements.
// =============================================================================

/**
 * Add N calendar days to an ISO date string ("YYYY-MM-DD"). Returns ISO date.
 * Returns undefined for invalid inputs. Uses UTC math so DST does not skew.
 */
export function addCalendarDays(isoDate: string | undefined, days: number): string | undefined {
  if (!isoDate) return undefined
  const d = new Date(isoDate)
  if (isNaN(d.getTime())) return undefined
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const result = new Date(utc + (days || 0) * 24 * 60 * 60 * 1000)
  const yyyy = result.getUTCFullYear()
  const mm = String(result.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(result.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Compute revised contract completion = original + time extension.
 * Returns undefined if original date is missing.
 */
export function computeRevisedCompletion(
  originalContractCompletion: string | undefined,
  timeExtensionDays: number
): string | undefined {
  return addCalendarDays(originalContractCompletion, timeExtensionDays || 0)
}

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available in this browser'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
      }
    }
  })
  return _dbPromise
}

async function idbGetAllProjects(): Promise<Project[]> {
  const db = await openDB()
  return new Promise<Project[]>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readonly')
    const store = tx.objectStore(PROJECTS_STORE)
    const req = store.getAll()
    req.onsuccess = () => resolve((req.result as Project[]) || [])
    req.onerror = () => reject(req.error || new Error('idbGetAll failed'))
  })
}

async function idbPutProject(project: Project): Promise<void> {
  const db = await openDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite')
    const store = tx.objectStore(PROJECTS_STORE)
    const req = store.put(project)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error || new Error('idbPut failed'))
  })
}

async function idbDeleteProject(id: string): Promise<void> {
  const db = await openDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECTS_STORE, 'readwrite')
    const store = tx.objectStore(PROJECTS_STORE)
    const req = store.delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error || new Error('idbDelete failed'))
  })
}

// =============================================================================
// v14 migration — back-fill structured version labels on existing projects.
//
// Mutates `projects` in place. Returns a Set of project IDs that were
// modified (so hydrate() can persist only those, not all).
//
// Rules applied:
//   - Project missing projectId → auto-generate from name (DCDGS-001 style)
//   - For each project, walk versions in CHRONOLOGICAL order (oldest first):
//       • First version → scheduleType = 'baseline', sequenceNumber = 0
//       • Subsequent versions → scheduleType = 'update', sequence 1..N
//   - Each version gets a fresh versionLabel built from {projectId, ntp,
//     scheduleType, sequenceNumber}
//   - Each version gets a snapshot built from project.contractDates +
//     version.dataDate at migration time (best-effort frozen state)
//
// Idempotent — versions/projects that already have all the new fields are
// left alone.
// =============================================================================
function migrateProjectsToV14(projects: Project[]): { changedIds: Set<string> } {
  const changed = new Set<string>()
  const existingIds = projects.map(p => p.projectId).filter(Boolean) as string[]

  for (const project of projects) {
    let touched = false

    // Step 1: ensure projectId
    if (!project.projectId) {
      const auto = autoGenerateProjectId(project.name || 'PROJECT', existingIds)
      project.projectId = auto
      existingIds.push(auto)
      touched = true
    }

    // Step 2: ensure each version has scheduleType, sequenceNumber, label, snapshot.
    // Walk versions chronologically — first becomes baseline-00, rest become updates.
    if (project.versions && project.versions.length > 0) {
      const sorted = [...project.versions].sort((a, b) =>
        new Date(getVersionEffectiveDate(a)).getTime() -
        new Date(getVersionEffectiveDate(b)).getTime()
      )
      let updateCounter = 0
      let baselineAssigned = false
      for (const v of sorted) {
        let vTouched = false

        if (!v.scheduleType) {
          if (!baselineAssigned) {
            v.scheduleType = 'baseline'
            v.sequenceNumber = 0
            baselineAssigned = true
          } else {
            updateCounter += 1
            v.scheduleType = 'update'
            v.sequenceNumber = updateCounter
          }
          vTouched = true
        } else if (typeof v.sequenceNumber !== 'number') {
          // scheduleType set but no sequence — recompute based on type
          if (v.scheduleType === 'baseline') {
            v.sequenceNumber = 0
          } else {
            updateCounter += 1
            v.sequenceNumber = updateCounter
          }
          vTouched = true
        } else if (v.scheduleType === 'update') {
          // Keep track for label sync below
          if (v.sequenceNumber > updateCounter) updateCounter = v.sequenceNumber
        }

        // Build / sync the versionLabel from current fields
        const ntp = project.contractDates?.ntp
        if (project.projectId && v.scheduleType && typeof v.sequenceNumber === 'number') {
          const desiredLabel = generateVersionLabel({
            projectId: project.projectId,
            ntp: ntp || '',
            type: v.scheduleType,
            sequenceNumber: v.sequenceNumber,
          })
          if (v.versionLabel !== desiredLabel) {
            v.versionLabel = desiredLabel
            vTouched = true
          }
        }

        // Build snapshot if missing — uses current project.contractDates as
        // best-effort historical state (we don't have time-travel data for
        // pre-v14 versions, so this is the cleanest fallback).
        if (!v.snapshot) {
          v.snapshot = buildDateSnapshot(project.contractDates, v.dataDate)
          vTouched = true
        }

        if (vTouched) touched = true
      }
    }

    if (touched) changed.add(project.id)
  }

  return { changedIds: changed }
}

// =============================================================================
// Public helpers — used by Sidebar and Upload form for the v14 features.
// =============================================================================

// Returns the IDs of all versions in this project that share a data date
// with at least one other version — used by Sidebar to render the 🔁 flag.
export function findDuplicateVersionIds(project: Project | null | undefined): Set<string> {
  if (!project || !project.versions) return new Set()
  return findDataDateDuplicates(
    project.versions.map(v => ({
      id: v.id,
      scheduleType: v.scheduleType,
      sequenceNumber: v.sequenceNumber,
      dataDate: v.dataDate,
    }))
  )
}

// Returns the snapshot-style dates for a version. If the version has its
// own snapshot (post-v14), returns that. Otherwise builds one on the fly
// from project + version data — keeps Sidebar code clean.
export function getVersionSnapshot(
  project: Project,
  version: ScheduleVersion
): DateSnapshot {
  if (version.snapshot) return version.snapshot
  return buildDateSnapshot(project.contractDates, version.dataDate)
}

// =============================================================================
// Upload-page helpers — preview the next version label and assign labels at
// save time. Wrappers around versionLabeler functions that take the full
// Project type (versionLabeler stays generic so it's testable in isolation).
// =============================================================================

// Returns the label that WOULD be assigned if a new version of the given
// schedule type were uploaded right now. Used by the upload form to render
// the gray preview text under the dropdown. Returns null if the type can't
// be uploaded right now (sequence full, or wrong state).
export function previewNextVersionLabel(
  project: Project | null | undefined,
  type: ScheduleType,
): string | null {
  if (!project || !project.projectId) return null
  const ntp = project.contractDates?.ntp
  if (!ntp) return null

  const next = getNextSequenceNumber(
    project.versions.map(v => ({
      id: v.id,
      scheduleType: v.scheduleType,
      sequenceNumber: v.sequenceNumber,
      dataDate: v.dataDate,
    })),
    type
  )
  if (next === null) return null

  return generateVersionLabel({
    projectId: project.projectId,
    ntp,
    type,
    sequenceNumber: next,
  })
}

// Builds a ScheduleVersion with all v14 labeling fields filled in. Used by
// the upload page to wrap a freshly-parsed XER analysis into a save-ready
// version object. Caller still needs to call addVersionToProject() or
// createProject() to actually persist.
export function buildLabeledVersion(opts: {
  project: Project
  scheduleType: ScheduleType
  fileName: string
  analysis: any
  rawXER?: string
  aiNarrative?: string
}): ScheduleVersion | null {
  const { project, scheduleType, fileName, analysis, rawXER, aiNarrative } = opts

  if (!project.projectId) return null
  const ntp = project.contractDates?.ntp
  if (!ntp) return null

  const next = getNextSequenceNumber(
    project.versions.map(v => ({
      id: v.id,
      scheduleType: v.scheduleType,
      sequenceNumber: v.sequenceNumber,
      dataDate: v.dataDate,
    })),
    scheduleType
  )
  if (next === null) return null

  const versionLabel = generateVersionLabel({
    projectId: project.projectId,
    ntp,
    type: scheduleType,
    sequenceNumber: next,
  })

  const dataDate = analysis?.dataDate
  const snapshot = buildDateSnapshot(project.contractDates, dataDate)

  return {
    id: 'ver_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    uploadedAt: new Date().toISOString(),
    dataDate,
    fileName,
    analysis,
    rawXER,
    aiNarrative,
    scheduleType,
    sequenceNumber: next,
    versionLabel,
    snapshot,
  }
}


async function hydrate(): Promise<void> {
  if (_hydrated) return
  try {
    let projects: Project[] = []
    try {
      projects = await idbGetAllProjects()
    } catch (err) {
      console.error('[ControlLens] IndexedDB read failed during hydration:', err)
    }
    if (projects.length === 0 && typeof localStorage !== 'undefined') {
      try {
        const legacy = localStorage.getItem(LEGACY_PROJECTS_KEY)
        if (legacy) {
          const parsed = JSON.parse(legacy)
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log('[ControlLens] Migrating', parsed.length, 'project(s) from localStorage to IndexedDB')
            for (const p of parsed) {
              try { await idbPutProject(p) } catch (e) {
                console.error('[ControlLens] Migration: failed to write project', p?.id, e)
              }
            }
            projects = await idbGetAllProjects()
            try { localStorage.removeItem(LEGACY_PROJECTS_KEY) } catch {}
          }
        }
      } catch (err) {
        console.error('[ControlLens] Migration check failed (non-fatal):', err)
      }
    }
    projects.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

    // v14 migration — back-fill projectId, version labels, scheduleType,
    // sequenceNumber, and snapshot for projects/versions that pre-date the
    // structured labeling system. Runs once per project on every hydration;
    // it's idempotent (no-ops on fully migrated projects) so it's safe to
    // re-run. Migrated projects get persisted back so we don't migrate again.
    try {
      const migrated = migrateProjectsToV14(projects)
      if (migrated.changedIds.size > 0) {
        console.log('[ControlLens] v14 migration: updated', migrated.changedIds.size, 'project(s)')
        for (const id of Array.from(migrated.changedIds)) {
          const p = projects.find(pp => pp.id === id)
          if (p) {
            try { await idbPutProject(p) } catch (e) {
              console.error('[ControlLens] v14 migration write failed for', id, e)
            }
          }
        }
      }
    } catch (e) {
      console.error('[ControlLens] v14 migration error (non-fatal):', e)
    }

    _projects = projects
    _hydrated = true
    notifyListeners()
  } catch (err) {
    console.error('[ControlLens] Hydration failed:', err)
    _hydrated = true
    notifyListeners()
  }
}

if (typeof window !== 'undefined') {
  _hydrationPromise = hydrate()
}

function notifyListeners() {
  _listeners.forEach(fn => { try { fn() } catch (err) { console.error(err) } })
}

export function subscribeToProjects(listener: Listener): () => void {
  _listeners.add(listener)
  return () => { _listeners.delete(listener) }
}

export function whenHydrated(): Promise<void> {
  return _hydrationPromise || Promise.resolve()
}

export function isHydrated(): boolean {
  return _hydrated
}

export function loadProjects(): Project[] {
  return _projects
}

export function getVersionEffectiveDate(v: ScheduleVersion): string {
  return v.dataDate || v.analysis?.dataDate || v.uploadedAt
}

export function getProjectStatus(project: Project): ProjectStatus {
  return project.status || 'Active'
}

export function getActiveProjectId(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(ACTIVE_PROJECT_KEY) } catch { return null }
}

export function setActiveProjectId(id: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id)
    else localStorage.removeItem(ACTIVE_PROJECT_KEY)
    localStorage.removeItem(ACTIVE_VERSION_KEY)
  } catch (err) {
    console.error('[ControlLens] setActiveProjectId failed:', err)
  }
}

export function getActiveVersionId(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(ACTIVE_VERSION_KEY) } catch { return null }
}

export function setActiveVersionId(id: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (id) localStorage.setItem(ACTIVE_VERSION_KEY, id)
    else localStorage.removeItem(ACTIVE_VERSION_KEY)
  } catch (err) {
    console.error('[ControlLens] setActiveVersionId failed:', err)
  }
}

export function getActiveProject(): Project | null {
  const id = getActiveProjectId()
  if (!id) return null
  return _projects.find(p => p.id === id) || null
}

export function getLatestVersion(project: Project | null): ScheduleVersion | null {
  if (!project || !project.versions || project.versions.length === 0) return null
  return [...project.versions].sort((a, b) =>
    new Date(getVersionEffectiveDate(b)).getTime() -
    new Date(getVersionEffectiveDate(a)).getTime()
  )[0]
}

export function getActiveVersion(project?: Project | null): ScheduleVersion | null {
  const p = project || getActiveProject()
  if (!p) return null
  const versionId = getActiveVersionId()
  if (versionId) {
    const found = p.versions.find(v => v.id === versionId)
    if (found) return found
  }
  return getLatestVersion(p)
}

export function getActiveAnalysis(): any {
  const v = getActiveVersion()
  return v?.analysis || null
}

export function getActiveProjectRFIs(): any[] {
  const p = getActiveProject()
  return p?.rfis || []
}

export function saveProjects(projects: Project[]): SaveResult {
  if (typeof window === 'undefined') return { ok: false, error: 'No window' }
  _projects = [...projects]
  notifyListeners()
  const writePromise = (async () => {
    let oldIds: Set<string> = new Set<string>()
    try {
      const stored = await idbGetAllProjects()
      oldIds = new Set(stored.map(p => p.id))
    } catch (err) {}
    const newIds = new Set(projects.map(p => p.id))
    for (const p of projects) {
      try { await idbPutProject(p) } catch (err) {
        console.error('[ControlLens] IndexedDB write failed for project', p.id, err)
        throw err
      }
    }
    const oldIdArray = Array.from(oldIds)
    for (const oldId of oldIdArray) {
      if (!newIds.has(oldId)) {
        try { await idbDeleteProject(oldId) } catch (err) {
          console.error('[ControlLens] IndexedDB delete failed for project', oldId, err)
        }
      }
    }
  })()
  writePromise.catch(err => {
    console.error('[ControlLens] saveProjects: IndexedDB persist failed:', err)
  })
  return { ok: true }
}

export function createProject(opts: {
  name: string
  projectId?: string
  owner?: string
  contractDates?: ContractDates    // NEW — manual NTP + Original Completion
  version: ScheduleVersion
}): Project {
  const project: Project = {
    id: 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    projectId: opts.projectId,
    name: opts.name,
    owner: opts.owner,
    contractDates: opts.contractDates,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'Active',
    versions: [opts.version],
    rfis: [],
    changeOrders: [],
  }
  _projects = [project, ..._projects]
  notifyListeners()
  idbPutProject(project).catch(err => {
    console.error('[ControlLens] createProject: IndexedDB persist failed:', err)
  })
  setActiveProjectId(project.id)
  setActiveVersionId(opts.version.id)
  return project
}

export function addVersionToProject(projectId: string, version: ScheduleVersion): Project | null {
  const idx = _projects.findIndex(p => p.id === projectId)
  if (idx === -1) return null
  const updated: Project = {
    ..._projects[idx],
    versions: [version, ..._projects[idx].versions],
    updatedAt: new Date().toISOString(),
  }
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] addVersionToProject: IndexedDB persist failed:', err)
  })
  setActiveProjectId(projectId)
  setActiveVersionId(version.id)
  return updated
}

// =============================================================================
// updateProjectContractDates — replace the project's manual NTP + Original
// Contract Completion. Called from the upload flow when the PM edits these
// on an existing project. Bumps updatedAt and persists to IndexedDB.
// =============================================================================
export function updateProjectContractDates(
  projectId: string,
  dates: ContractDates
): Project | null {
  const idx = _projects.findIndex(p => p.id === projectId)
  if (idx === -1) return null
  const updated: Project = {
    ..._projects[idx],
    contractDates: dates,
    updatedAt: new Date().toISOString(),
  }
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] updateProjectContractDates: IndexedDB persist failed:', err)
  })
  return updated
}

// =============================================================================
// updateProjectEvm — Day 5, v10.
// Replace the project's EVM data (total budget, distribution, monthly grid).
// Called from the Project Production tab on every edit. Bumps updatedAt
// and persists to IndexedDB.
//
// Pass `undefined` to clear the EVM block entirely (e.g. PM wants to start
// over from scratch).
// =============================================================================
export function updateProjectEvm(
  projectId: string,
  evm: EvmData | undefined
): Project | null {
  const idx = _projects.findIndex(p => p.id === projectId)
  if (idx === -1) return null
  const updated: Project = {
    ..._projects[idx],
    evm,
    updatedAt: new Date().toISOString(),
  }
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] updateProjectEvm: IndexedDB persist failed:', err)
  })
  return updated
}

export function addRFIToActiveProject(rfi: any): Project | null {
  const id = getActiveProjectId()
  if (!id) return null
  const idx = _projects.findIndex(p => p.id === id)
  if (idx === -1) return null
  const newRfi = {
    id: 'rfi_' + Date.now().toString(36),
    ...rfi,
    addedAt: new Date().toISOString(),
  }
  const updated: Project = {
    ..._projects[idx],
    rfis: [newRfi, ..._projects[idx].rfis],
    updatedAt: new Date().toISOString(),
  }
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] addRFIToActiveProject: IndexedDB persist failed:', err)
  })
  return updated
}

export function deleteRFIFromActiveProject(rfiId: string) {
  const id = getActiveProjectId()
  if (!id) return
  const idx = _projects.findIndex(p => p.id === id)
  if (idx === -1) return
  const updated: Project = {
    ..._projects[idx],
    rfis: _projects[idx].rfis.filter((r: any) => r.id !== rfiId),
  }
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] deleteRFIFromActiveProject: IndexedDB persist failed:', err)
  })
}

export function deleteProject(id: string) {
  const idx = _projects.findIndex(p => p.id === id)
  if (idx === -1) return
  const updated: Project = {
    ..._projects[idx],
    status: 'Deleted',
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] deleteProject: IndexedDB persist failed:', err)
  })
  if (getActiveProjectId() === id) {
    const fallback = _projects.find(p => p.id !== id && getProjectStatus(p) !== 'Deleted' && getProjectStatus(p) !== 'Archived')
    setActiveProjectId(fallback?.id || null)
  }
}

export function restoreProject(id: string) {
  const idx = _projects.findIndex(p => p.id === id)
  if (idx === -1) return
  const updated: Project = {
    ..._projects[idx],
    status: 'Active',
    deletedAt: undefined,
    updatedAt: new Date().toISOString(),
  }
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] restoreProject: IndexedDB persist failed:', err)
  })
}

export function permanentlyDeleteProject(id: string) {
  _projects = _projects.filter(p => p.id !== id)
  notifyListeners()
  idbDeleteProject(id).catch(err => {
    console.error('[ControlLens] permanentlyDeleteProject: IndexedDB delete failed:', err)
  })
  if (getActiveProjectId() === id) {
    const fallback = _projects.find(p => getProjectStatus(p) !== 'Deleted' && getProjectStatus(p) !== 'Archived')
    setActiveProjectId(fallback?.id || null)
  }
}

export function deleteVersion(projectId: string, versionId: string) {
  const idx = _projects.findIndex(p => p.id === projectId)
  if (idx === -1) return
  const updated: Project = {
    ..._projects[idx],
    versions: _projects[idx].versions.filter(v => v.id !== versionId),
    updatedAt: new Date().toISOString(),
  }
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] deleteVersion: IndexedDB persist failed:', err)
  })
  if (getActiveVersionId() === versionId) {
    setActiveVersionId(null)
  }
}

export function moveVersionToProject(sourceProjectId: string, versionId: string, targetProjectId: string): boolean {
  const sourceIdx = _projects.findIndex(p => p.id === sourceProjectId)
  const targetIdx = _projects.findIndex(p => p.id === targetProjectId)
  if (sourceIdx === -1 || targetIdx === -1) return false
  if (sourceProjectId === targetProjectId) return false
  const sourceVersions = _projects[sourceIdx].versions
  const versionIdx = sourceVersions.findIndex(v => v.id === versionId)
  if (versionIdx === -1) return false
  const movedVersion = sourceVersions[versionIdx]
  const newSource: Project = {
    ..._projects[sourceIdx],
    versions: sourceVersions.filter((_, i) => i !== versionIdx),
    updatedAt: new Date().toISOString(),
  }
  const newTarget: Project = {
    ..._projects[targetIdx],
    versions: [movedVersion, ..._projects[targetIdx].versions],
    updatedAt: new Date().toISOString(),
  }
  _projects = _projects.map((p, i) => {
    if (i === sourceIdx) return newSource
    if (i === targetIdx) return newTarget
    return p
  })
  notifyListeners()
  Promise.all([idbPutProject(newSource), idbPutProject(newTarget)]).catch(err => {
    console.error('[ControlLens] moveVersionToProject: IndexedDB persist failed:', err)
  })
  if (getActiveVersionId() === versionId) {
    setActiveVersionId(null)
  }
  return true
}

export function renameProject(id: string, newName: string, projectId?: string) {
  const idx = _projects.findIndex(p => p.id === id)
  if (idx === -1) return
  const updated: Project = {
    ..._projects[idx],
    name: newName,
    updatedAt: new Date().toISOString(),
  }
  if (projectId !== undefined) updated.projectId = projectId
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] renameProject: IndexedDB persist failed:', err)
  })
}

export function setProjectStatus(id: string, status: ProjectStatus) {
  const idx = _projects.findIndex(p => p.id === id)
  if (idx === -1) return
  const updated: Project = {
    ..._projects[idx],
    status,
    updatedAt: new Date().toISOString(),
  }
  if (status !== 'Deleted') {
    updated.deletedAt = undefined
  }
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] setProjectStatus: IndexedDB persist failed:', err)
  })
  if ((status === 'Archived' || status === 'Deleted') && getActiveProjectId() === id) {
    const firstAvailable = _projects.find(p =>
      p.id !== id &&
      getProjectStatus(p) !== 'Archived' &&
      getProjectStatus(p) !== 'Deleted'
    )
    setActiveProjectId(firstAvailable?.id || null)
  }
}

export function updateVersionNarrative(
  projectId: string,
  versionId: string,
  narrative: string
): boolean {
  const idx = _projects.findIndex(p => p.id === projectId)
  if (idx === -1) return false
  const project = _projects[idx]
  const verIdx = project.versions.findIndex(v => v.id === versionId)
  if (verIdx === -1) return false
  const updatedVersions = [...project.versions]
  updatedVersions[verIdx] = {
    ...updatedVersions[verIdx],
    aiNarrative: narrative,
  }
  const updated: Project = {
    ...project,
    versions: updatedVersions,
  }
  _projects = [..._projects.slice(0, idx), updated, ..._projects.slice(idx + 1)]
  notifyListeners()
  idbPutProject(updated).catch(err => {
    console.error('[ControlLens] updateVersionNarrative: IndexedDB persist failed:', err)
  })
  return true
}

export function migrateLegacyData() {
  // No longer needed — hydrate() handles migration.
}
