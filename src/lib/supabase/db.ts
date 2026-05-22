// =============================================================================
// ControlLens — Supabase data layer (v15, Session A)
//
// All cloud reads/writes for projects + schedule_versions. Keeps
// projectStore.ts free of Supabase SDK calls so the rest of the app can
// continue using its synchronous API.
//
// Data model mapping (Supabase schema ←→ ControlLens types):
//   projects.project_code         ←→ Project.projectId
//   projects.owner_party          ←→ Project.owner
//   projects.contractor           ←→ Project.gc
//   projects.contract_dates jsonb ←→ Project.contractDates
//   projects.evm jsonb            ←→ Project.evm
//
//   schedule_versions.schedule_type  ←→ ScheduleVersion.scheduleType
//   schedule_versions.sequence_number ←→ ScheduleVersion.sequenceNumber
//   schedule_versions.snapshot jsonb ←→ ScheduleVersion.snapshot
//   schedule_versions.context jsonb  ←→ wraps {fullAnalysis, versionDates, projectContext}
//   schedule_versions.raw_xer_path   ←→ path to file in schedule-artifacts bucket
//   Flat columns (total_activities, complete, condition, ...) ←→ derived
//     from ScheduleVersion.analysis for fast listing without full payload
//
// File storage:
//   Raw XER text →  schedule-artifacts/{orgId}/{projectId}/{versionId}.xer
//   Analysis JSON  → stored INLINE in context.fullAnalysis (jsonb).
//                    Skips a network round-trip for typical-size analyses.
//                    If row sizes become a problem we'll move to storage too.
// =============================================================================

import { createClient } from './client'
import type { Project, ScheduleVersion, ContractDates, ProjectStatus } from '../projectStore'
import type { EvmData } from '../evm'
import type { ScheduleType } from '../versionLabeler'

const BUCKET = 'schedule-artifacts'

// =============================================================================
// Auth + org bootstrap
// =============================================================================

// Returns the current user's primary organization ID, creating one if they
// don't have one yet. Called once on app load (via projectStore.hydrate).
//
// The existing schema has a multi-tenant org model — every project belongs
// to an org, and users are members of one or more orgs. For now ControlLens
// just creates a single personal workspace per new user, but the data model
// supports multi-org teams whenever you're ready.
export async function ensureUserHasOrg(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Existing membership?
  const { data: members, error: memberErr } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)

  if (memberErr) {
    console.error('[db.ensureUserHasOrg] read failed:', memberErr.message)
    return null
  }
  if (members && members.length > 0) {
    return members[0].org_id
  }

  // Create personal workspace
  const displayName = (user.user_metadata as any)?.name
    || user.email?.split('@')[0]
    || 'user'
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({
      name: `${displayName}'s workspace`,
      account_type: 'personal',
      created_by: user.id,
      status: 'active',
    })
    .select('id')
    .single()
  if (orgErr || !org) {
    console.error('[db.ensureUserHasOrg] org insert failed:', orgErr?.message)
    return null
  }
  const { error: insertErr } = await supabase
    .from('organization_members')
    .insert({
      org_id: org.id,
      user_id: user.id,
      role: 'admin',
      invited_by: user.id,
    })
  if (insertErr) {
    console.error('[db.ensureUserHasOrg] member insert failed:', insertErr.message)
  }
  console.log('[db] created personal workspace', org.id, 'for', user.email)
  return org.id
}

// =============================================================================
// READ — fetch all projects + versions for current user
// =============================================================================

export async function loadProjectsFromSupabase(): Promise<Project[] | null> {
  const supabase = createClient()
  const orgId = await ensureUserHasOrg()
  if (!orgId) return null  // Not signed in or org bootstrap failed

  const { data: rows, error } = await supabase
    .from('projects')
    .select('*, schedule_versions(*)')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[db.loadProjects] failed:', error.message)
    return null
  }
  if (!rows) return []

  return rows.map(rowToProject)
}

function rowToProject(row: any): Project {
  const versions: ScheduleVersion[] = (row.schedule_versions || []).map(rowToVersion)
  versions.sort((a, b) =>
    new Date(b.dataDate || b.uploadedAt).getTime() -
    new Date(a.dataDate || a.uploadedAt).getTime()
  )
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_code || undefined,
    owner: row.owner_party || undefined,
    gc: row.contractor || undefined,
    contractValue: row.contract_value || undefined,
    phase: row.phase || undefined,
    status: (row.status as ProjectStatus) || 'Active',
    contractDates: row.contract_dates || undefined,
    evm: row.evm || undefined,
    versions,
    rfis: [],  // Session B will fetch from rfis table
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToVersion(row: any): ScheduleVersion {
  const context = row.context || {}
  // Prefer the full saved analysis if present, else reconstruct a stub from
  // the flat columns (covers the listing view when full analysis is not loaded).
  const analysis = context.fullAnalysis || {
    totalActivities: row.total_activities ?? 0,
    complete: row.complete ?? 0,
    inProgress: row.in_progress ?? 0,
    notStarted: row.not_started ?? 0,
    healthScore: row.health_score ?? 0,
    condition: row.condition || undefined,
    delayDays: row.delay_days ?? 0,
    negativeFloat: row.negative_float ?? 0,
    contractEnd: row.contract_end || undefined,
    projectedEnd: row.projected_end || undefined,
    dataDate: row.data_date || undefined,
    fileType: 'Primavera P6 XER',
  }
  return {
    id: row.id,
    uploadedAt: row.uploaded_at,
    dataDate: row.data_date || undefined,
    fileName: row.file_name || '',
    versionLabel: row.version_label || undefined,
    scheduleType: (row.schedule_type as ScheduleType) || undefined,
    sequenceNumber: row.sequence_number ?? undefined,
    snapshot: row.snapshot || undefined,
    aiNarrative: row.ai_narrative || undefined,
    context: context.projectContext || {},
    versionDates: context.versionDates || undefined,
    analysis,
    // rawXER lives in storage now; we don't pull it eagerly.
    // analysis_path and raw_xer_path retained as references.
    rawXER: undefined,
  }
}

// =============================================================================
// WRITE — insert project (with first version) on createProject()
// =============================================================================

export async function insertProjectToSupabase(project: Project): Promise<boolean> {
  const supabase = createClient()
  const orgId = await ensureUserHasOrg()
  if (!orgId) return false
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // Insert the project row
  const { error: projErr } = await supabase
    .from('projects')
    .insert({
      id: project.id,
      org_id: orgId,
      project_code: project.projectId || null,
      name: project.name,
      created_by: user.id,
      owner_party: project.owner || null,
      contractor: project.gc || null,
      contract_value: project.contractValue || null,
      phase: project.phase || null,
      status: project.status || 'Active',
      contract_dates: project.contractDates || null,
      evm: project.evm || null,
    })

  if (projErr) {
    console.error('[db.insertProject] project row failed:', projErr.message)
    return false
  }
  console.log('[db] inserted project', project.id, project.projectId)

  // Insert each version
  for (const v of project.versions) {
    const ok = await insertVersionToSupabase(project.id, v, orgId, user.id)
    if (!ok) return false
  }
  return true
}

// =============================================================================
// WRITE — add a single version to an existing project
// =============================================================================

export async function addVersionToSupabase(
  projectId: string,
  version: ScheduleVersion,
): Promise<boolean> {
  const supabase = createClient()
  const orgId = await ensureUserHasOrg()
  if (!orgId) return false
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  return insertVersionToSupabase(projectId, version, orgId, user.id)
}

// Internal — handles the actual version insert + raw XER upload
async function insertVersionToSupabase(
  projectId: string,
  version: ScheduleVersion,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const supabase = createClient()

  // 1. Upload raw XER to storage if present
  let rawXerPath: string | null = null
  if (version.rawXER && version.rawXER.length > 0) {
    rawXerPath = `${orgId}/${projectId}/${version.id}.xer`
    const blob = new Blob([version.rawXER], { type: 'text/plain' })
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(rawXerPath, blob, { upsert: true, contentType: 'text/plain' })
    if (upErr) {
      console.error('[db.addVersion] raw XER upload failed:', upErr.message)
      // Non-fatal — continue with row insert, just without the raw file
      rawXerPath = null
    } else {
      console.log('[db] uploaded raw XER to storage', rawXerPath, `(${(version.rawXER.length / 1024).toFixed(0)} KB)`)
    }
  }

  // 2. Build context bundle (full analysis + PM context + per-version dates)
  const contextBundle = {
    fullAnalysis: version.analysis || null,
    projectContext: version.context || null,
    versionDates: version.versionDates || null,
  }
  const a = version.analysis || {}

  // 3. Insert the schedule_versions row
  const { error: rowErr } = await supabase
    .from('schedule_versions')
    .insert({
      id: version.id,
      project_id: projectId,
      org_id: orgId,
      uploaded_by: userId,
      file_name: version.fileName,
      version_label: version.versionLabel || null,
      data_date: version.dataDate || null,
      contract_end: a.contractEnd || null,
      projected_end: a.projectedEnd || null,
      uploaded_at: version.uploadedAt,
      total_activities: a.totalActivities ?? 0,
      complete: a.complete ?? 0,
      in_progress: a.inProgress ?? 0,
      not_started: a.notStarted ?? 0,
      health_score: a.healthScore ?? 0,
      condition: a.condition || null,
      delay_days: a.delayDays ?? 0,
      negative_float: a.negativeFloat ?? 0,
      out_of_sequence: Array.isArray(a.outOfSequence) ? a.outOfSequence.length : 0,
      ai_narrative: version.aiNarrative || null,
      raw_xer_path: rawXerPath,
      context: contextBundle,
      schedule_type: version.scheduleType || null,
      sequence_number: typeof version.sequenceNumber === 'number' ? version.sequenceNumber : null,
      snapshot: version.snapshot || null,
      is_baseline: version.scheduleType === 'baseline' || version.scheduleType === 'rebaseline',
    })

  if (rowErr) {
    console.error('[db.addVersion] row insert failed:', rowErr.message)
    return false
  }
  console.log('[db] inserted version', version.versionLabel || version.id)
  return true
}

// =============================================================================
// WRITE — update project-level fields (contract dates, EVM, etc.)
// =============================================================================

export async function updateProjectContractDatesInSupabase(
  projectId: string,
  dates: ContractDates,
): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('projects')
    .update({ contract_dates: dates, updated_at: new Date().toISOString() })
    .eq('id', projectId)
  if (error) {
    console.error('[db.updateContractDates] failed:', error.message)
    return false
  }
  return true
}

export async function updateProjectEvmInSupabase(
  projectId: string,
  evm: EvmData,
): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('projects')
    .update({ evm, updated_at: new Date().toISOString() })
    .eq('id', projectId)
  if (error) {
    console.error('[db.updateEvm] failed:', error.message)
    return false
  }
  return true
}

// =============================================================================
// WRITE — soft delete (status changes)
// =============================================================================

export async function updateProjectStatusInSupabase(
  projectId: string,
  status: ProjectStatus,
): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('projects')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', projectId)
  if (error) {
    console.error('[db.updateStatus] failed:', error.message)
    return false
  }
  return true
}
