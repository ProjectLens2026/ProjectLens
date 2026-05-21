// Project storage layer — IndexedDB-backed.
// (header comment unchanged — see prior version for details)

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
  contractDates?: ContractDates         // NEW — project-level manual dates
}

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
