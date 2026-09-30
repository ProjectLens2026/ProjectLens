import type { XERComparison, TIAValidationIssue } from './xerComparator'
import type { Project } from './projectStore'

export interface TIAReportSnapshot {
  schema: 1
  projectId: string
  projectName: string
  createdAt: string
  unimpacted: { id: string; label: string; fileName: string; uploadedAt: string }
  impacted: { id: string; label: string; fileName: string; uploadedAt: string }
  comparison: XERComparison
  validation: TIAValidationIssue[]
  confirmedCodes: string[] | null
  context: { projectName: string; projectNumber: string; owner: string; preparedBy: string; contractCompletionDate: string }
  categorizations: Record<string, { category: string; description: string }>
}
const memory: Record<string, TIAReportSnapshot> = {}
function key(projectId: string) {
  return `cpmreview_tia_report_v1:${localStorage.getItem('pl_last_user_id') || 'session'}:${projectId}`
}
export function saveTIAReportSnapshot(snapshot: TIAReportSnapshot) {
  try {
    const k = key(snapshot.projectId)
    memory[k] = snapshot
    try { sessionStorage.setItem(k, JSON.stringify(snapshot)) } catch { sessionStorage.removeItem(k) }
  } catch { /* Comparison remains available on the TIA page. */ }
}
export function clearTIAReportSnapshot(projectId: string) {
  try { const k = key(projectId); delete memory[k]; sessionStorage.removeItem(k) } catch {}
}
export function loadTIAReportSnapshot(project: Project): TIAReportSnapshot | null {
  try {
    const k = key(project.id)
    const snapshot: TIAReportSnapshot = memory[k] || JSON.parse(sessionStorage.getItem(k) || 'null')
    if (!snapshot || snapshot.schema !== 1 || snapshot.projectId !== project.id) return null
    const matches = [snapshot.unimpacted, snapshot.impacted].every(saved => project.versions.some(v => !v.deletedAt && v.id === saved.id && v.fileName === saved.fileName && v.uploadedAt === saved.uploadedAt))
    return matches ? snapshot : null
  } catch { return null }
}
export function tiaResultHeading(comparison: XERComparison, validation: TIAValidationIssue[]) {
  if (validation.some(issue => issue.severity === 'error')) return 'IMPACT NOT ESTABLISHED — VALIDATION UNRESOLVED'
  if (comparison.totalDelayDays === 0) return 'NO EXPORTED PROJECT FINISH MOVEMENT'
  return `EXPORTED PROJECT FINISH IS ${Math.abs(comparison.totalDelayDays)} CALENDAR DAYS ${comparison.totalDelayDays > 0 ? 'LATER' : 'EARLIER'}`
}
