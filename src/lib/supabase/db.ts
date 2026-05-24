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

// Translate ControlLens status values ('Active', 'On Hold', etc.) to the
// lowercase/snake_case format the Supabase CHECK constraint accepts.
function toDbStatus(s?: ProjectStatus): string {
  switch (s) {
    case 'Active': return 'active'
    case 'On Hold': return 'on_hold'
    case 'Completed': return 'completed'
    case 'Archived': return 'archived'
    case 'Deleted': return 'deleted'
    default: return 'active'
  }
}

// Reverse — translate DB status back to ControlLens format on load
function fromDbStatus(s?: string): ProjectStatus {
  switch (s) {
    case 'active': return 'Active'
    case 'on_hold': return 'On Hold'
    case 'completed': return 'Completed'
    case 'archived': return 'Archived'
    case 'deleted': return 'Deleted'
    default: return 'Active'
  }
}

// =============================================================================
// ID translation — local store uses 'proj_xxx' / 'ver_xxx' strings, Supabase
// uses UUIDs. Maintain a translation map in localStorage so the same local
// project always maps to the same cloud UUID across reloads.
// =============================================================================

function getLocalIdMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('pl_id_map')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function setLocalIdMap(map: Record<string, string>) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem('pl_id_map', JSON.stringify(map)) } catch {}
}

// Return a stable UUID for the given local id. Creates one the first time
// it's seen and persists the mapping. If the input already looks like a
// UUID, returns it unchanged.
function toUuid(localId: string): string {
  // UUID regex (any version, dashed form)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localId)) {
    return localId
  }
  const map = getLocalIdMap()
  if (map[localId]) return map[localId]
  // crypto.randomUUID is available in all modern browsers
  const newUuid: string = typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : `${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 6)}-4${Math.random().toString(16).slice(2, 5)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${Math.random().toString(16).slice(2, 5)}-${Math.random().toString(16).slice(2, 14)}`
  map[localId] = newUuid
  setLocalIdMap(map)
  return newUuid
}



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

  // For each project, hydrate the full analysis for each version from
  // storage (analyses are stored as files, not inline in jsonb, since
  // they can be multi-megabyte). Done in parallel for speed.
  const projects: Project[] = []
  for (const row of rows) {
    const project = rowToProject(row)
    if (project.versions.length > 0) {
      await Promise.all(project.versions.map(async (v, idx) => {
        const versionRow = row.schedule_versions?.[idx]
        const path = versionRow?.analysis_path
        if (!path) return
        try {
          const { data: blob, error: dlErr } = await supabase.storage
            .from(BUCKET)
            .download(path)
          if (dlErr || !blob) return
          const text = await blob.text()
          v.analysis = JSON.parse(text)
        } catch (e) {
          console.warn('[db] could not load analysis for', v.versionLabel, e)
        }
      }))
    }
    projects.push(project)
  }
  return projects
}

function getLocalIdForUuid(cloudUuid: string, prefix: 'proj' | 'ver'): string {
  // Reverse lookup in the id map. If we have a local→cloud entry whose
  // value matches this UUID, return the local key. Otherwise create a
  // fresh local id and store the mapping (so subsequent loads are stable).
  const map = getLocalIdMap()
  for (const [localId, mappedUuid] of Object.entries(map)) {
    if (mappedUuid === cloudUuid) return localId
  }
  // First time seeing this cloud row — mint a local id and persist mapping
  const localId = `${prefix}_${cloudUuid.replace(/-/g, '').slice(0, 12)}`
  map[localId] = cloudUuid
  setLocalIdMap(map)
  return localId
}

function rowToProject(row: any): Project {
  const versions: ScheduleVersion[] = (row.schedule_versions || []).map(rowToVersion)
  versions.sort((a, b) =>
    new Date(b.dataDate || b.uploadedAt).getTime() -
    new Date(a.dataDate || a.uploadedAt).getTime()
  )
  return {
    id: getLocalIdForUuid(row.id, 'proj'),
    name: row.name,
    projectId: row.project_code || undefined,
    owner: row.owner_party || undefined,
    contractValue: row.contract_value || undefined,
    phase: row.phase || undefined,
    status: fromDbStatus(row.status),
    contractDates: row.contract_dates || undefined,
    evm: row.evm || undefined,
    versions,
    rfis: [],  // Session B will fetch from rfis table
    changeOrders: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToVersion(row: any): ScheduleVersion {
  const context = row.context || {}
  // v15 — full analysis lives in Storage (loaded async by loadProjectsFromSupabase).
  // For the initial row mapping, build a stub from the flat columns so the
  // listing renders immediately, then the storage load swaps in the full data.
  const analysis = {
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
    id: getLocalIdForUuid(row.id, 'ver'),
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

  // Pull GC name from the project's first version context (PM enters it in
  // the upload form; lives at the version level, not project level).
  const gcFromContext = project.versions?.[0]?.context?.gc || null

  // Convert local 'proj_xxx' id to a stable UUID for Postgres
  const cloudProjectId = toUuid(project.id)

  // Insert the project row
  const { error: projErr } = await supabase
    .from('projects')
    .insert({
      id: cloudProjectId,
      org_id: orgId,
      project_code: project.projectId || null,
      name: project.name,
      created_by: user.id,
      owner_party: project.owner || null,
      contractor: gcFromContext,
      contract_value: project.contractValue || null,
      phase: project.phase || null,
      status: toDbStatus(project.status),
      contract_dates: project.contractDates || null,
      evm: project.evm || null,
    })

  if (projErr) {
    console.error('[db.insertProject] project row failed:', {
      message: projErr.message,
      code: (projErr as any).code,
      details: (projErr as any).details,
      hint: (projErr as any).hint,
      full: projErr,
      attempted: {
        id: cloudProjectId,
        org_id: orgId,
        project_code: project.projectId,
        name: project.name,
        status: toDbStatus(project.status),
        contract_dates: project.contractDates,
      },
    })
    return false
  }
  console.log('[db] inserted project', cloudProjectId, project.projectId)

  // Insert each version (uses the cloud UUID for project_id linkage)
  for (const v of project.versions) {
    const ok = await insertVersionToSupabase(cloudProjectId, v, orgId, user.id)
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
  // Translate the local project id to its cloud UUID
  const cloudProjectId = toUuid(projectId)
  return insertVersionToSupabase(cloudProjectId, version, orgId, user.id)
}

// Internal — handles the actual version insert + raw XER upload + analysis upload
async function insertVersionToSupabase(
  projectId: string,
  version: ScheduleVersion,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const supabase = createClient()
  const cloudVersionId = toUuid(version.id)

  // 1. Upload raw XER to storage if present
  let rawXerPath: string | null = null
  if (version.rawXER && version.rawXER.length > 0) {
    rawXerPath = `${orgId}/${projectId}/${cloudVersionId}.xer`
    const blob = new Blob([version.rawXER], { type: 'text/plain' })
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(rawXerPath, blob, { upsert: true, contentType: 'text/plain' })
    if (upErr) {
      console.error('[db.addVersion] raw XER upload failed:', upErr.message)
      rawXerPath = null
    } else {
      console.log('[db] uploaded raw XER to storage', rawXerPath, `(${(version.rawXER.length / 1024).toFixed(0)} KB)`)
    }
  }

  // 2. Upload the FULL analysis JSON to storage (was inline jsonb — caused
  //    silent failures on large analyses). Now stored as a file just like
  //    the raw XER, with a path reference in analysis_path.
  let analysisPath: string | null = null
  if (version.analysis) {
    analysisPath = `${orgId}/${projectId}/${cloudVersionId}.analysis.json`
    try {
      const json = JSON.stringify(version.analysis)
      const blob = new Blob([json], { type: 'application/json' })
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(analysisPath, blob, { upsert: true, contentType: 'application/json' })
      if (upErr) {
        console.error('[db.addVersion] analysis upload failed:', upErr.message)
        analysisPath = null
      } else {
        console.log('[db] uploaded analysis JSON to storage', analysisPath, `(${(json.length / 1024).toFixed(0)} KB)`)
      }
    } catch (e) {
      console.error('[db.addVersion] analysis stringify/upload failed:', e)
    }
  }

  // 3. Build a SMALL context bundle (no full analysis) — PM context + per-version dates only
  const contextBundle = {
    projectContext: version.context || null,
    versionDates: version.versionDates || null,
  }
  const a = version.analysis || {}

  // 4. Insert the schedule_versions row (slim — heavy analysis is in storage now)
  const { error: rowErr } = await supabase
    .from('schedule_versions')
    .insert({
      id: cloudVersionId,
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
      analysis_path: analysisPath,
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
  console.log('[db] inserted version', version.versionLabel || cloudVersionId)
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
    .eq('id', toUuid(projectId))
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
    .eq('id', toUuid(projectId))
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
    .update({ status: toDbStatus(status), updated_at: new Date().toISOString() })
    .eq('id', toUuid(projectId))
  if (error) {
    console.error('[db.updateStatus] failed:', error.message)
    return false
  }
  console.log('[db] updated status', projectId, '→', toDbStatus(status))
  return true
}

// =============================================================================
// WRITE — hard delete project (with cascade + storage cleanup)
// =============================================================================

export async function deleteProjectFromSupabase(projectId: string): Promise<boolean> {
  const supabase = createClient()
  const orgId = await ensureUserHasOrg()
  if (!orgId) return false
  const cloudId = toUuid(projectId)

  // Best-effort: remove all storage files under this project's folder so
  // we don't orphan raw XER + analysis JSON blobs in the bucket.
  try {
    const folder = `${orgId}/${cloudId}/`
    const { data: files } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000 })
    if (files && files.length > 0) {
      const paths = files.map(f => folder + f.name)
      await supabase.storage.from(BUCKET).remove(paths)
      console.log('[db] removed', paths.length, 'storage file(s) for project', cloudId)
    }
  } catch (e) {
    console.warn('[db.deleteProject] storage cleanup skipped:', e)
  }

  // Delete the project row. Foreign key cascade on schedule_versions / rfis
  // /change_orders should drop those automatically.
  const { error } = await supabase.from('projects').delete().eq('id', cloudId)
  if (error) {
    console.error('[db.deleteProject] failed:', error.message)
    return false
  }
  console.log('[db] permanently deleted project', cloudId)
  return true
}

// =============================================================================
// WRITE — delete a single version (with its storage files)
// =============================================================================

export async function deleteVersionFromSupabase(
  projectIdLocal: string,
  versionIdLocal: string,
): Promise<boolean> {
  const supabase = createClient()
  const orgId = await ensureUserHasOrg()
  if (!orgId) return false
  const cloudProjectId = toUuid(projectIdLocal)
  const cloudVersionId = toUuid(versionIdLocal)

  // Best-effort cleanup of storage files for this version
  try {
    const paths = [
      `${orgId}/${cloudProjectId}/${cloudVersionId}.xer`,
      `${orgId}/${cloudProjectId}/${cloudVersionId}.analysis.json`,
    ]
    await supabase.storage.from(BUCKET).remove(paths)
  } catch (e) {
    console.warn('[db.deleteVersion] storage cleanup skipped:', e)
  }

  const { error } = await supabase.from('schedule_versions').delete().eq('id', cloudVersionId)
  if (error) {
    console.error('[db.deleteVersion] failed:', error.message)
    return false
  }
  console.log('[db] deleted version', cloudVersionId)
  return true
}

// =============================================================================
// WRITE — rename project + update project_code
// =============================================================================

export async function renameProjectInSupabase(
  projectId: string,
  newName: string,
  newProjectCode?: string,
): Promise<boolean> {
  const supabase = createClient()
  const update: any = { name: newName, updated_at: new Date().toISOString() }
  if (newProjectCode !== undefined) update.project_code = newProjectCode
  const { error } = await supabase.from('projects').update(update).eq('id', toUuid(projectId))
  if (error) {
    console.error('[db.rename] failed:', error.message)
    return false
  }
  console.log('[db] renamed project', projectId, '→', newName)
  return true
}

// =============================================================================
// WRITE — move version to a different project
// =============================================================================

export async function moveVersionInSupabase(
  versionIdLocal: string,
  newProjectIdLocal: string,
): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('schedule_versions')
    .update({ project_id: toUuid(newProjectIdLocal) })
    .eq('id', toUuid(versionIdLocal))
  if (error) {
    console.error('[db.moveVersion] failed:', error.message)
    return false
  }
  console.log('[db] moved version', versionIdLocal, '→ project', newProjectIdLocal)
  return true
}

// =============================================================================
// Phase 3C — Members + Invitations helpers
// =============================================================================

export interface OrgMember {
  user_id: string
  email: string
  name: string
  role: string
  joined_at: string
  is_self: boolean
}

export interface Invitation {
  id: string
  email: string
  role: string
  token: string
  expires_at: string
  created_at: string
  invited_by_email: string
}

/**
 * loadOrgMembers — list everyone in the user's primary org. Used by the
 * Settings → Members tab.
 */
export async function loadOrgMembers(): Promise<OrgMember[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const orgId = await ensureUserHasOrg()
  if (!orgId) return []

  const { data: members, error } = await supabase
    .from('organization_members')
    .select('user_id, role, joined_at')
    .eq('org_id', orgId)
    .order('joined_at', { ascending: true })

  if (error || !members) {
    console.error('[db.loadOrgMembers] failed:', error?.message)
    return []
  }

  // Fetch profile data for each member
  const ids = members.map(m => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, name')
    .in('id', ids)

  const profileMap = new Map<string, { email: string; name: string }>()
  for (const p of (profiles || [])) {
    profileMap.set(p.id, { email: p.email || '', name: p.name || '' })
  }

  return members.map(m => {
    const profile = profileMap.get(m.user_id) || { email: '', name: '' }
    return {
      user_id: m.user_id,
      email: profile.email,
      name: profile.name || profile.email.split('@')[0] || 'Unknown',
      role: m.role,
      joined_at: m.joined_at,
      is_self: m.user_id === user.id,
    }
  })
}

/**
 * loadPendingInvitations — invitations that haven't been accepted or revoked,
 * and haven't expired yet. Shown in Settings → Invitations.
 */
export async function loadPendingInvitations(): Promise<Invitation[]> {
  const supabase = createClient()
  const orgId = await ensureUserHasOrg()
  if (!orgId) return []

  const { data: invitations, error } = await supabase
    .from('invitations')
    .select('id, email, role, token, expires_at, created_at, invited_by')
    .eq('org_id', orgId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error || !invitations) {
    console.error('[db.loadPendingInvitations] failed:', error?.message)
    return []
  }

  // Map inviter user_id → email
  const inviterIds = Array.from(new Set(invitations.map(i => i.invited_by).filter(Boolean)))
  const { data: inviters } = inviterIds.length > 0
    ? await supabase.from('profiles').select('id, email').in('id', inviterIds)
    : { data: [] }
  const inviterMap = new Map<string, string>()
  for (const i of (inviters || [])) inviterMap.set(i.id, i.email || '')

  return invitations.map(i => ({
    id: i.id,
    email: i.email,
    role: i.role,
    token: i.token,
    expires_at: i.expires_at,
    created_at: i.created_at,
    invited_by_email: inviterMap.get(i.invited_by) || '',
  }))
}

/**
 * createInvitation — admin generates a fresh invitation. Returns the
 * acceptance URL (https://app.control-lens.com/auth/accept-invite?token=...)
 * which the admin pastes into an email/Slack/WhatsApp to the recipient.
 *
 * Default expiry: 7 days.
 */
export async function createInvitation(opts: {
  email: string
  role: string
}): Promise<{ ok: boolean; token?: string; acceptUrl?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }

  const orgId = await ensureUserHasOrg()
  if (!orgId) return { ok: false, error: 'No active org' }

  const normalizedEmail = opts.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { ok: false, error: 'Invalid email address' }
  }

  // Generate a 36-char UUID token
  const token = typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase
    .from('invitations')
    .insert({
      org_id: orgId,
      email: normalizedEmail,
      role: opts.role,
      token,
      invited_by: user.id,
      expires_at: expiresAt,
    })

  if (error) {
    console.error('[db.createInvitation] failed:', error)
    return { ok: false, error: error.message }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.control-lens.com'
  return {
    ok: true,
    token,
    acceptUrl: `${origin}/auth/accept-invite?token=${encodeURIComponent(token)}`,
  }
}

/**
 * revokeInvitation — admin cancels a pending invitation by marking it revoked.
 */
export async function revokeInvitation(invitationId: string): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
  if (error) {
    console.error('[db.revokeInvitation] failed:', error.message)
    return false
  }
  return true
}

/**
 * lookupInvitationByToken — used by /auth/accept-invite to validate a token
 * BEFORE the user signs up. This must work without authentication, so the
 * RLS policy on invitations must allow anonymous SELECT (filtered by token
 * means it's a no-op lookup if the token is invalid).
 */
export interface InvitationLookup {
  id: string
  email: string
  role: string
  org_id: string
  org_name: string
}

export async function lookupInvitationByToken(token: string): Promise<InvitationLookup | null> {
  const supabase = createClient()

  const { data: inv, error } = await supabase
    .from('invitations')
    .select('id, email, role, org_id')
    .eq('token', token)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !inv) {
    if (error) console.error('[db.lookupInvitation] failed:', error.message)
    return null
  }

  // Get org name
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', inv.org_id)
    .maybeSingle()

  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    org_id: inv.org_id,
    org_name: org?.name || 'Unknown Organization',
  }
}

/**
 * acceptInvitation — called from the accept-invite page after the user has
 * been signed up. Creates the profile row + organization_members row, then
 * marks the invitation accepted.
 */
export async function acceptInvitation(opts: {
  invitationId: string
  orgId: string
  role: string
  userId: string
  email: string
  fullName: string
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient()

  // 1. Create profile (upsert in case it already exists from auto-trigger)
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert({
      id: opts.userId,
      email: opts.email,
      name: opts.fullName,
    }, { onConflict: 'id' })

  if (profileErr) {
    console.error('[db.acceptInvitation] profile insert failed:', profileErr)
    return { ok: false, error: `Profile failed: ${profileErr.message}` }
  }

  // 2. Join the org
  const { error: memberErr } = await supabase
    .from('organization_members')
    .insert({
      org_id: opts.orgId,
      user_id: opts.userId,
      role: opts.role,
      invited_by: null,
    })

  if (memberErr) {
    // If they're already a member, that's fine
    if (memberErr.code !== '23505') { // 23505 = unique constraint violation
      console.error('[db.acceptInvitation] org_member insert failed:', memberErr)
      return { ok: false, error: `Org join failed: ${memberErr.message}` }
    }
  }

  // 3. Mark invitation as accepted
  const { error: updateErr } = await supabase
    .from('invitations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: opts.userId,
    })
    .eq('id', opts.invitationId)

  if (updateErr) {
    console.error('[db.acceptInvitation] mark accepted failed:', updateErr)
    // Don't fail — the join succeeded, this is just metadata
  }

  return { ok: true }
}
