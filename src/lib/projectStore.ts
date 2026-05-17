// Project storage layer — uses localStorage. Will migrate to Supabase later.
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
  rawXER?: string  // Raw XER text content — used for TIA comparison from saved version
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

// Result returned by saveProjects() so callers know whether the save
// actually persisted or whether the user needs to see an error message.
// Previously saveProjects() returned void and swallowed errors silently,
// which masked localStorage quota failures — the symptom we saw with
// 1,040-activity XERs (analysis displayed correctly on-screen but the
// project never appeared in the projects list because the underlying
// save threw QuotaExceededError and was discarded).
export interface SaveResult {
  ok: boolean
  error?: string
  pruned?: boolean  // true if older versions' rawXER was dropped to fit
}

const PROJECTS_KEY = 'pl_projects'
const ACTIVE_PROJECT_KEY = 'pl_active_project_id'
const ACTIVE_VERSION_KEY = 'pl_active_version_id'
const LEGACY_ANALYSIS_KEY = 'pl_last_analysis'
const LEGACY_RFIS_KEY = 'pl_rfis'

export function loadProjects(): Project[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(PROJECTS_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return []
}

// Resolve a version's effective date for sorting/comparison.
// Falls back through dataDate (best) → analysis.dataDate (some early versions) → uploadedAt (legacy)
export function getVersionEffectiveDate(v: ScheduleVersion): string {
  return v.dataDate || v.analysis?.dataDate || v.uploadedAt
}

// Strip `rawXER` from all but the LATEST version of each project.
//
// rawXER is the full XER file content as text — typically 500 KB to a
// few MB per file. It's only used for TIA comparison, which always
// compares the latest two versions. Older versions don't need it, so
// when localStorage is under pressure we drop it from anything that's
// not the most recent. Returns a fresh project array (does not mutate).
function pruneRawXERFromOlderVersions(projects: Project[]): Project[] {
  return projects.map(p => {
    if (!p.versions || p.versions.length === 0) return p

    // Find the LATEST version by effective date (data date when available,
    // upload time as fallback). Only this version keeps rawXER.
    const sorted = [...p.versions].sort((a, b) =>
      new Date(getVersionEffectiveDate(b)).getTime() -
      new Date(getVersionEffectiveDate(a)).getTime()
    )
    const latestId = sorted[0].id

    const cleanedVersions = p.versions.map(v => {
      if (v.id === latestId) return v        // keep rawXER on latest
      if (!v.rawXER) return v                // already pruned, nothing to do
      // Strip rawXER but keep everything else (parsed analysis stays intact)
      const { rawXER, ...rest } = v
      return rest as ScheduleVersion
    })

    return { ...p, versions: cleanedVersions }
  })
}

// Save projects to localStorage with quota-aware retry.
//
// If the first attempt throws QuotaExceededError, we prune `rawXER` from
// all older versions (only the latest version of each project keeps it)
// and retry. If it still fails, returns ok:false with a user-readable
// error message so the upload page can show an alert.
//
// On success, mutates the input array if pruning happened, so the in-memory
// project list matches what was persisted.
export function saveProjects(projects: Project[]): SaveResult {
  if (typeof window === 'undefined') return { ok: false, error: 'No window' }

  // First attempt — try the save as-is.
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
    return { ok: true }
  } catch (err: any) {
    // Detect quota errors across browser quirks. Firefox uses code 1014,
    // Chrome/Safari use code 22, all use DOMException name "QuotaExceededError".
    const isQuota =
      err?.name === 'QuotaExceededError' ||
      err?.code === 22 ||
      err?.code === 1014 ||
      /quota/i.test(err?.message || '')

    if (!isQuota) {
      // Not a quota error — log and surface the message.
      console.error('[NobelPM] Failed to save projects:', err)
      return { ok: false, error: err?.message || 'Save failed' }
    }

    // Quota exceeded — try pruning rawXER from older versions and retry.
    console.warn('[NobelPM] localStorage quota exceeded. Pruning rawXER from older versions and retrying...')
    const pruned = pruneRawXERFromOlderVersions(projects)
    try {
      localStorage.setItem(PROJECTS_KEY, JSON.stringify(pruned))
      // Mutate the input array so callers see the pruned state in memory.
      projects.length = 0
      for (const p of pruned) projects.push(p)
      console.log('[NobelPM] Save succeeded after pruning rawXER from older versions')
      return { ok: true, pruned: true }
    } catch (err2: any) {
      console.error('[NobelPM] Save still failed after pruning:', err2)
      return {
        ok: false,
        error:
          'Browser storage is full. Please delete one or more old projects or schedule versions to free up space. (We are migrating storage to the cloud in the next update which will remove this limit.)'
      }
    }
  }
}

export function getActiveProjectId(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(ACTIVE_PROJECT_KEY) } catch { return null }
}
export function setActiveProjectId(id: string | null) {
  if (typeof window === 'undefined') return
  if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id)
  else localStorage.removeItem(ACTIVE_PROJECT_KEY)
  // Reset active version when switching projects
  localStorage.removeItem(ACTIVE_VERSION_KEY)
}
export function getActiveVersionId(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(ACTIVE_VERSION_KEY) } catch { return null }
}
export function setActiveVersionId(id: string | null) {
  if (typeof window === 'undefined') return
  if (id) localStorage.setItem(ACTIVE_VERSION_KEY, id)
  else localStorage.removeItem(ACTIVE_VERSION_KEY)
}
export function getActiveProject(): Project | null {
  const id = getActiveProjectId()
  if (!id) return null
  const projects = loadProjects()
  return projects.find(p => p.id === id) || null
}
// Get latest version of project (sorted by data date when available, falling
// back to upload time for older versions that pre-date the data date field).
export function getLatestVersion(project: Project | null): ScheduleVersion | null {
  if (!project || !project.versions || project.versions.length === 0) return null
  return [...project.versions].sort((a, b) =>
    new Date(getVersionEffectiveDate(b)).getTime() -
    new Date(getVersionEffectiveDate(a)).getTime()
  )[0]
}
// Get currently selected version (either explicitly chosen OR latest)
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
// Get the analysis from the currently active project + version
export function getActiveAnalysis(): any {
  const v = getActiveVersion()
  return v?.analysis || null
}
// Get RFIs for the active project
export function getActiveProjectRFIs(): any[] {
  const p = getActiveProject()
  return p?.rfis || []
}
// Create a new project from an XER upload.
//
// Throws if the save fails (typically QuotaExceededError even after the
// pruning retry inside saveProjects). The upload page catches this and
// shows the user an actionable error message rather than silently
// dropping the project.
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
  const projects = loadProjects()
  projects.unshift(project)
  const result = saveProjects(projects)
  if (!result.ok) {
    throw new Error(result.error || 'Failed to save project')
  }
  setActiveProjectId(project.id)
  setActiveVersionId(opts.version.id)
  return project
}

// Add a new schedule version to an existing project.
// Throws on save failure for the same reason as createProject.
export function addVersionToProject(projectId: string, version: ScheduleVersion): Project | null {
  const projects = loadProjects()
  const idx = projects.findIndex(p => p.id === projectId)
  if (idx === -1) return null
  projects[idx].versions.unshift(version)
  projects[idx].updatedAt = new Date().toISOString()
  const result = saveProjects(projects)
  if (!result.ok) {
    throw new Error(result.error || 'Failed to save schedule version')
  }
  setActiveProjectId(projectId)
  setActiveVersionId(version.id)
  return projects[idx]
}
// Add an RFI evaluation to the active project
export function addRFIToActiveProject(rfi: any): Project | null {
  const id = getActiveProjectId()
  if (!id) return null
  const projects = loadProjects()
  const idx = projects.findIndex(p => p.id === id)
  if (idx === -1) return null
  projects[idx].rfis.unshift({
    id: 'rfi_' + Date.now().toString(36),
    ...rfi,
    addedAt: new Date().toISOString(),
  })
  projects[idx].updatedAt = new Date().toISOString()
  saveProjects(projects)
  return projects[idx]
}
export function deleteRFIFromActiveProject(rfiId: string) {
  const id = getActiveProjectId()
  if (!id) return
  const projects = loadProjects()
  const idx = projects.findIndex(p => p.id === id)
  if (idx === -1) return
  projects[idx].rfis = projects[idx].rfis.filter((r: any) => r.id !== rfiId)
  saveProjects(projects)
}
export function deleteProject(id: string) {
  let projects = loadProjects()
  projects = projects.filter(p => p.id !== id)
  saveProjects(projects)
  if (getActiveProjectId() === id) {
    setActiveProjectId(projects[0]?.id || null)
  }
}
export function deleteVersion(projectId: string, versionId: string) {
  const projects = loadProjects()
  const idx = projects.findIndex(p => p.id === projectId)
  if (idx === -1) return
  projects[idx].versions = projects[idx].versions.filter(v => v.id !== versionId)
  projects[idx].updatedAt = new Date().toISOString()
  saveProjects(projects)
  if (getActiveVersionId() === versionId) {
    setActiveVersionId(null)
  }
}
// Move a version from one project to another (P6 EPS-style)
export function moveVersionToProject(sourceProjectId: string, versionId: string, targetProjectId: string): boolean {
  const projects = loadProjects()
  const sourceIdx = projects.findIndex(p => p.id === sourceProjectId)
  const targetIdx = projects.findIndex(p => p.id === targetProjectId)
  if (sourceIdx === -1 || targetIdx === -1) return false
  if (sourceProjectId === targetProjectId) return false
  const versionIdx = projects[sourceIdx].versions.findIndex(v => v.id === versionId)
  if (versionIdx === -1) return false
  // Pull version out of source
  const [movedVersion] = projects[sourceIdx].versions.splice(versionIdx, 1)
  projects[sourceIdx].updatedAt = new Date().toISOString()
  // Add to target (at top so it becomes most recent)
  projects[targetIdx].versions.unshift(movedVersion)
  projects[targetIdx].updatedAt = new Date().toISOString()
  saveProjects(projects)
  // If the moved version was the active version, reset source's active to latest remaining
  if (getActiveVersionId() === versionId) {
    setActiveVersionId(null)  // will fall back to latest of whichever project is active
  }
  return true
}
export function renameProject(id: string, newName: string, projectId?: string) {
  const projects = loadProjects()
  const idx = projects.findIndex(p => p.id === id)
  if (idx === -1) return
  projects[idx].name = newName
  if (projectId !== undefined) projects[idx].projectId = projectId
  projects[idx].updatedAt = new Date().toISOString()
  saveProjects(projects)
}
// Migrate from old localStorage schema to new project-based one
export function migrateLegacyData() {
  if (typeof window === 'undefined') return
  const projects = loadProjects()
  if (projects.length > 0) return
  try {
    const legacyAnalysis = localStorage.getItem(LEGACY_ANALYSIS_KEY)
    if (!legacyAnalysis) return
    const analysis = JSON.parse(legacyAnalysis)
    if (!analysis) return
    const legacyRfisStr = localStorage.getItem(LEGACY_RFIS_KEY)
    const legacyRfis = legacyRfisStr ? JSON.parse(legacyRfisStr) : []
    const version: ScheduleVersion = {
      id: 'ver_' + Date.now().toString(36),
      uploadedAt: new Date().toISOString(),
      fileName: analysis.projectName ? `${analysis.projectName}.xer` : 'imported.xer',
      analysis,
    }
    const project: Project = {
      id: 'proj_' + Date.now().toString(36),
      name: analysis.projectName || 'Imported Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      versions: [version],
      rfis: legacyRfis,
      changeOrders: [],
    }
    saveProjects([project])
    setActiveProjectId(project.id)
  } catch (err) {
    console.error('Legacy migration failed:', err)
  }
}
