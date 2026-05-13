// Project storage layer — uses localStorage for now, will migrate to Supabase in Phase 3

export interface ScheduleVersion {
  id: string
  uploadedAt: string
  fileName: string
  analysis: any
  aiNarrative?: string
  context?: any
}

export interface Project {
  id: string
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

// Backward compat — read older keys if new ones don't exist yet
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
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY)
  } catch { return null }
}

export function setActiveProjectId(id: string | null) {
  if (typeof window === 'undefined') return
  if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id)
  else localStorage.removeItem(ACTIVE_PROJECT_KEY)
}

export function getActiveProject(): Project | null {
  const id = getActiveProjectId()
  if (!id) return null
  const projects = loadProjects()
  return projects.find(p => p.id === id) || null
}

export function getActiveVersion(project: Project | null): ScheduleVersion | null {
  if (!project || !project.versions || project.versions.length === 0) return null
  // Latest version (most recent uploadedAt)
  return [...project.versions].sort((a, b) =>
    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )[0]
}

export function getActiveAnalysis(): any {
  const project = getActiveProject()
  const version = getActiveVersion(project)
  return version?.analysis || null
}

// Create a new project from an XER upload
export function createProject(name: string, version: ScheduleVersion, owner?: string): Project {
  const project: Project = {
    id: 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    owner,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    versions: [version],
    rfis: [],
    changeOrders: [],
  }

  const projects = loadProjects()
  projects.unshift(project)
  saveProjects(projects)
  setActiveProjectId(project.id)
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
    ...rfi,
    addedAt: new Date().toISOString(),
  })
  projects[idx].updatedAt = new Date().toISOString()
  saveProjects(projects)
  return projects[idx]
}

export function deleteProject(id: string) {
  let projects = loadProjects()
  projects = projects.filter(p => p.id !== id)
  saveProjects(projects)
  if (getActiveProjectId() === id) {
    setActiveProjectId(projects[0]?.id || null)
  }
}

export function renameProject(id: string, newName: string) {
  const projects = loadProjects()
  const idx = projects.findIndex(p => p.id === id)
  if (idx === -1) return
  projects[idx].name = newName
  projects[idx].updatedAt = new Date().toISOString()
  saveProjects(projects)
}

// Migrate from old localStorage schema (pl_last_analysis + pl_rfis) to new project-based one
// Called once on app load. Safe to run multiple times.
export function migrateLegacyData() {
  if (typeof window === 'undefined') return
  const projects = loadProjects()
  if (projects.length > 0) return // already migrated

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
