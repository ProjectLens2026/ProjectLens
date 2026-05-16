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

export function saveProjects(projects: Project[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
  } catch (err) {
    console.error('Failed to save projects:', err)
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

// Resolve a version's effective date for sorting/comparison.
// Falls back through dataDate (best) → analysis.dataDate (some early versions) → uploadedAt (legacy)
export function getVersionEffectiveDate(v: ScheduleVersion): string {
  return v.dataDate || v.analysis?.dataDate || v.uploadedAt
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

// Create a new project from an XER upload
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
  saveProjects(projects)
  setActiveProjectId(project.id)
  setActiveVersionId(opts.version.id)
  return project
}

// Add a new schedule version to an existing project
export function addVersionToProject(projectId: string, version: ScheduleVersion): Project | null {
  const projects = loadProjects()
  const idx = projects.findIndex(p => p.id === projectId)
  if (idx === -1) return null
  projects[idx].versions.unshift(version)
  projects[idx].updatedAt = new Date().toISOString()
  saveProjects(projects)
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
