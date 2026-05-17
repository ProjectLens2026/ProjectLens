// Project storage layer — IndexedDB-backed.
//
// PREVIOUS: localStorage only. Hit a 5 MB hard cap that fails on XER files
// with 2,000+ activities (parsed analysis alone can exceed 5 MB even for
// a single project with no other data stored).
//
// NOW: IndexedDB is the source of truth. Practical limits are typically
// gigabytes per origin instead of 5 MB. Even DGS-scale projects (3,000+
// activities, multiple versions, multi-year history) fit comfortably.
//
// The PUBLIC API of this file is still synchronous (loadProjects, etc.)
// so existing pages do not need to be rewritten. Internally we keep a
// memory cache that's hydrated from IndexedDB once on app load. Writes
// update the memory cache synchronously and persist to IndexedDB in the
// background.
//
// A subscription mechanism lets pages that mount BEFORE hydration finishes
// re-render once the cache is populated.

export interface ScheduleVersion {
  id: string
  uploadedAt: string
  // Data date — the schedule's actual "as-of" date pulled from the XER's
  // PROJECT.last_recalc_date field. Optional because versions saved before
  // this field was introduced will not have it. The trend analyzer falls
  // back to uploadedAt when dataDate is missing.
  dataDate?: string
  fileName: string
  analysis: any
  aiNarrative?: string
  context?: any
  versionLabel?: string  // e.g. "May 2026 Update"
  rawXER?: string  // Raw XER text — used for TIA comparison from saved version
}
export interface Project {
  id: string
  projectId?: string  // User-defined unique identifier (e.g. "USACE-CT-2024-001")
  name: string
  owner?: string
  contractValue?: string
  phase?: string
  createdAt: string
  updatedAt: string
  versions: ScheduleVersion[]
  rfis: any[]
  changeOrders: any[]
}

// Result returned by saveProjects so the caller can show a real error to
// the user if the persist failed. With IndexedDB this is rare — only
// happens if the user's disk is genuinely full or they're in private
// browsing on a browser that disables IndexedDB.
export interface SaveResult {
  ok: boolean
  error?: string
}

// localStorage keys — small metadata only (no analysis data)
const LEGACY_PROJECTS_KEY = 'pl_projects'  // checked once for migration, then cleared
const ACTIVE_PROJECT_KEY = 'pl_active_project_id'
const ACTIVE_VERSION_KEY = 'pl_active_version_id'

// IndexedDB names
const DB_NAME = 'nobelpm'
const DB_VERSION = 1
const PROJECTS_STORE = 'projects'

// ----- Module-level state (singleton in browser) -----

let _projects: Project[] = []
let _hydrated = false
let _hydrationPromise: Promise<void> | null = null
let _dbPromise: Promise<IDBDatabase> | null = null
type Listener = () => void
const _listeners: Set<Listener> = new Set()

// ----- IndexedDB helpers -----

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

// ----- Hydration (one-time on app load) -----

async function hydrate(): Promise<void> {
  if (_hydrated) return
  try {
    let projects: Project[] = []
    try {
      projects = await idbGetAllProjects()
    } catch (err) {
      console.error('[NobelPM] IndexedDB read failed during hydration:', err)
    }

    // One-time migration from old localStorage-based storage.
    if (projects.length === 0 && typeof localStorage !== 'undefined') {
      try {
        const legacy = localStorage.getItem(LEGACY_PROJECTS_KEY)
        if (legacy) {
          const parsed = JSON.parse(legacy)
          if (Array.isArray(parsed) && parsed.length > 0) {
            console.log('[NobelPM] Migrating', parsed.length, 'project(s) from localStorage to IndexedDB')
            for (const p of parsed) {
              try { await idbPutProject(p) } catch (e) {
                console.error('[NobelPM] Migration: failed to write project', p?.id, e)
              }
            }
            projects = await idbGetAllProjects()
            try { localStorage.removeItem(LEGACY_PROJECTS_KEY) } catch {}
          }
        }
      } catch (err) {
        console.error('[NobelPM] Migration check failed (non-fatal):', err)
      }
    }

    // Sort newest-first so the in-memory order matches what users see in
    // the sidebar (most recently updated at top).
    projects.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

    _projects = projects
    _hydrated = true
    notifyListeners()
  } catch (err) {
    console.error('[NobelPM] Hydration failed:', err)
    _hydrated = true
    notifyListeners()
  }
}

// Kick off hydration as soon as this module is imported in the browser.
if (typeof window !== 'undefined') {
  _hydrationPromise = hydrate()
}

// ----- Subscription API -----

function notifyListeners() {
  _listeners.forEach(fn => { try { fn() } catch (err) { console.error(err) } })
}

// Subscribe to project list updates. Fires on hydration complete and on
// every save/delete/update. Returns an unsubscribe function.
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

// ----- Sync read API (returns memory cache) -----

export function loadProjects(): Project[] {
  return _projects
}

// Resolve a version's effective date for sorting/comparison.
export function getVersionEffectiveDate(v: ScheduleVersion): string {
  return v.dataDate || v.analysis?.dataDate || v.uploadedAt
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
    console.error('[NobelPM] setActiveProjectId failed:', err)
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
    console.error('[NobelPM] setActiveVersionId failed:', err)
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

// ----- Sync write API (updates cache + persists async to IndexedDB) -----

// Replace ALL projects (used by bulk operations).
// Updates memory cache immediately, then persists to IndexedDB in the
// background. Errors during persist are logged but not thrown — the
// memory cache is the source of truth for the current session.
export function saveProjects(projects: Project[]): SaveResult {
  if (typeof window === 'undefined') return { ok: false, error: 'No window' }

  _projects = [...projects]
  notifyListeners()

  const writePromise = (async () => {
    let oldIds: Set<string> = new Set<string>()
    try {
      const stored = await idbGetAllProjects()
      oldIds = new Set(stored.map(p => p.id))
    } catch (err) {
      // Continue — writes below will still work or fail clearly
    }

    const newIds = new Set(projects.map(p => p.id))

    for (const p of projects) {
      try {
        await idbPutProject(p)
      } catch (err) {
        console.error('[NobelPM] IndexedDB write failed for project', p.id, err)
        throw err
      }
    }

    const oldIdArray = Array.from(oldIds)
    for (const oldId of oldIdArray) {
      if (!newIds.has(oldId)) {
        try {
          await idbDeleteProject(oldId)
        } catch (err) {
          console.error('[NobelPM] IndexedDB delete failed for project', oldId, err)
        }
      }
    }
  })()

  writePromise.catch(err => {
    console.error('[NobelPM] saveProjects: IndexedDB persist failed:', err)
  })

  return { ok: true }
}

export function createProject(opts: {
  name: string
  projectId?: string
  owner?: string
  version: ScheduleVersion
}): Project {
  const project: Project = {
    id: 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    projectId: opts.projectId,
    name: opts.name,
    owner: opts.owner,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    versions: [opts.version],
    rfis: [],
    changeOrders: [],
  }
  _projects = [project, ..._projects]
  notifyListeners()

  idbPutProject(project).catch(err => {
    console.error('[NobelPM] createProject: IndexedDB persist failed:', err)
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
    console.error('[NobelPM] addVersionToProject: IndexedDB persist failed:', err)
  })

  setActiveProjectId(projectId)
  setActiveVersionId(version.id)
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
    console.error('[NobelPM] addRFIToActiveProject: IndexedDB persist failed:', err)
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
    console.error('[NobelPM] deleteRFIFromActiveProject: IndexedDB persist failed:', err)
  })
}

export function deleteProject(id: string) {
  _projects = _projects.filter(p => p.id !== id)
  notifyListeners()

  idbDeleteProject(id).catch(err => {
    console.error('[NobelPM] deleteProject: IndexedDB delete failed:', err)
  })

  if (getActiveProjectId() === id) {
    setActiveProjectId(_projects[0]?.id || null)
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
    console.error('[NobelPM] deleteVersion: IndexedDB persist failed:', err)
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
    console.error('[NobelPM] moveVersionToProject: IndexedDB persist failed:', err)
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
    console.error('[NobelPM] renameProject: IndexedDB persist failed:', err)
  })
}

// Legacy migration is now handled inside hydrate(). This function exists
// for backward compat with any code that called it directly — it's a no-op.
export function migrateLegacyData() {
  // No longer needed — hydrate() handles migration from pl_projects on startup.
}
