// =============================================================================
// Control Lens — Supabase review workspace data layer
// =============================================================================
// Isolated from db.ts so numbered review comments and schedule narratives can
// evolve without disturbing the existing project/version persistence layer.
// =============================================================================

import { createClient } from './client'
import type {
  AutomatedVerification,
  ContractorResponse,
  NewReviewCommentInput,
  ReviewActivityReference,
  ReviewAttachmentReference,
  ReviewComment,
  ReviewItemStatus,
  ReviewStatusEvent,
  ReviewVerificationOutcome,
  ScheduleNarrative,
} from '../reviewWorkspace'
import { statusFromVerification } from '../reviewWorkspace'

export interface ReviewWorkspaceCloudData {
  comments: ReviewComment[]
  narratives: Record<string, ScheduleNarrative>
}

export interface ReviewWriteResult<T = undefined> {
  ok: boolean
  data?: T
  error?: string
}

export interface ContractorResponseInput {
  commentId: string
  versionId: string
  response: string
  correctionMade?: string
  affectedActivities?: ReviewActivityReference[]
  attachments?: ReviewAttachmentReference[]
}

export interface VerificationInput {
  commentId: string
  versionId: string
  outcome: ReviewVerificationOutcome
  summary: string
  correctedCount?: number
  remainingCount?: number
  evidenceFindingIds?: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function localIdMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem('pl_id_map')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// Unlike db.ts, this module never invents a UUID. A review can only attach to
// a project/version that already exists in Supabase.
function toCloudId(id: string | undefined): string | null {
  if (!id) return null
  if (UUID_RE.test(id)) return id
  return localIdMap()[id] || null
}

function toLocalId(id: string | null | undefined): string | undefined {
  if (!id) return undefined
  const map = localIdMap()
  const match = Object.entries(map).find(([, cloudId]) => cloudId === id)
  return match?.[0] || id
}

function message(error: any): string {
  return error?.message || error?.details || String(error || 'Unknown review workspace error')
}

function eventToResponse(row: any): ContractorResponse | null {
  if (row.event_type !== 'CONTRACTOR_RESPONSE') return null
  const payload = row.payload || {}
  return {
    id: row.id,
    versionId: toLocalId(row.version_id) || '',
    response: payload.response || '',
    correctionMade: payload.correctionMade || undefined,
    affectedActivities: Array.isArray(payload.affectedActivities) ? payload.affectedActivities : [],
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    submittedAt: row.created_at,
    submittedBy: row.created_by || undefined,
  }
}

function eventToVerification(row: any): AutomatedVerification | null {
  if (row.event_type !== 'AUTOMATED_VERIFICATION') return null
  const payload = row.payload || {}
  return {
    id: row.id,
    versionId: toLocalId(row.version_id) || '',
    outcome: payload.outcome as ReviewVerificationOutcome,
    checkedAt: row.created_at,
    summary: payload.summary || '',
    correctedCount: typeof payload.correctedCount === 'number' ? payload.correctedCount : undefined,
    remainingCount: typeof payload.remainingCount === 'number' ? payload.remainingCount : undefined,
    evidenceFindingIds: Array.isArray(payload.evidenceFindingIds) ? payload.evidenceFindingIds : undefined,
  }
}

function eventToHistory(row: any): ReviewStatusEvent | null {
  if (!['CREATED', 'ISSUED', 'STATUS_CHANGED'].includes(row.event_type)) return null
  return {
    id: row.id,
    status: row.status as ReviewItemStatus,
    at: row.created_at,
    by: row.created_by || undefined,
    note: row.payload?.note || row.payload?.summary || undefined,
    versionId: toLocalId(row.version_id),
  }
}

function rowToComment(row: any, events: any[]): ReviewComment {
  return {
    id: row.id,
    sequence: row.sequence,
    commentNumber: row.comment_number,
    source: row.source,
    sourceFindingIds: row.source_finding_ids || [],
    title: row.title,
    concern: row.concern,
    requirementReference: row.requirement_reference || undefined,
    requiredCorrection: row.required_correction || undefined,
    classification: row.classification,
    approvalImpact: row.approval_impact,
    responsibleParty: row.responsible_party || undefined,
    firstVersionId: toLocalId(row.first_version_id) || '',
    requiredResponseVersionId: toLocalId(row.required_response_version_id),
    affectedActivities: Array.isArray(row.affected_activities) ? row.affected_activities : [],
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    status: row.status,
    responses: events.map(eventToResponse).filter(Boolean) as ContractorResponse[],
    verifications: events.map(eventToVerification).filter(Boolean) as AutomatedVerification[],
    history: events.map(eventToHistory).filter(Boolean) as ReviewStatusEvent[],
    createdAt: row.created_at,
    createdBy: row.created_by || undefined,
    issuedAt: row.issued_at || undefined,
    issuedBy: row.issued_by || undefined,
    closedAt: row.closed_at || undefined,
    closedBy: row.closed_by || undefined,
    withdrawnReason: row.withdrawn_reason || undefined,
    voidReason: row.void_reason || undefined,
  }
}

function rowToNarrative(row: any): ScheduleNarrative {
  return {
    versionId: toLocalId(row.version_id) || row.version_id,
    priorVersionId: toLocalId(row.prior_version_id),
    reviewPurpose: row.review_purpose,
    sections: Array.isArray(row.sections) ? row.sections : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    issuedAt: row.issued_at || undefined,
    issuedBy: row.issued_by || undefined,
  }
}

export async function loadReviewWorkspaceFromSupabase(projectId: string): Promise<ReviewWriteResult<ReviewWorkspaceCloudData>> {
  const cloudProjectId = toCloudId(projectId)
  if (!cloudProjectId) return { ok: false, error: 'Project is not mapped to Supabase.' }
  const supabase = createClient()

  const [{ data: commentRows, error: commentError }, { data: narrativeRows, error: narrativeError }] = await Promise.all([
    supabase.from('review_comments').select('*').eq('project_id', cloudProjectId).order('sequence'),
    supabase.from('schedule_narratives').select('*').eq('project_id', cloudProjectId).order('updated_at'),
  ])
  if (commentError) return { ok: false, error: message(commentError) }
  if (narrativeError) return { ok: false, error: message(narrativeError) }

  const ids = (commentRows || []).map(row => row.id)
  let eventRows: any[] = []
  if (ids.length) {
    const { data, error } = await supabase
      .from('review_comment_events')
      .select('*')
      .in('comment_id', ids)
      .order('created_at')
    if (error) return { ok: false, error: message(error) }
    eventRows = data || []
  }

  const eventsByComment = new Map<string, any[]>()
  for (const event of eventRows) {
    eventsByComment.set(event.comment_id, [...(eventsByComment.get(event.comment_id) || []), event])
  }
  const comments = (commentRows || []).map(row => rowToComment(row, eventsByComment.get(row.id) || []))
  const narratives: Record<string, ScheduleNarrative> = {}
  for (const row of narrativeRows || []) {
    const narrative = rowToNarrative(row)
    narratives[narrative.versionId] = narrative
  }
  return { ok: true, data: { comments, narratives } }
}

export async function createReviewCommentInSupabase(
  projectId: string,
  input: NewReviewCommentInput,
): Promise<ReviewWriteResult<ReviewComment>> {
  const cloudProjectId = toCloudId(projectId)
  const firstVersionId = toCloudId(input.firstVersionId)
  const requiredResponseVersionId = toCloudId(input.requiredResponseVersionId)
  if (!cloudProjectId || !firstVersionId) {
    return { ok: false, error: 'The project or originating schedule version is not mapped to Supabase.' }
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('review_comments')
    .insert({
      project_id: cloudProjectId,
      source: input.source,
      source_finding_ids: input.sourceFindingIds || [],
      title: input.title.trim(),
      concern: input.concern.trim(),
      requirement_reference: input.requirementReference?.trim() || null,
      required_correction: input.requiredCorrection?.trim() || null,
      classification: input.classification,
      approval_impact: input.approvalImpact,
      responsible_party: input.responsibleParty?.trim() || null,
      first_version_id: firstVersionId,
      required_response_version_id: requiredResponseVersionId,
      affected_activities: input.affectedActivities || [],
      attachments: input.attachments || [],
      status: input.issueImmediately ? 'OPEN' : 'DRAFT',
    })
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: message(error) }
  return { ok: true, data: rowToComment(data, []) }
}

export async function updateReviewCommentStatusInSupabase(
  commentId: string,
  status: ReviewItemStatus,
  options?: { withdrawnReason?: string; voidReason?: string },
): Promise<ReviewWriteResult> {
  const supabase = createClient()
  const { error } = await supabase
    .from('review_comments')
    .update({
      status,
      withdrawn_reason: options?.withdrawnReason?.trim() || null,
      void_reason: options?.voidReason?.trim() || null,
    })
    .eq('id', commentId)
  return error ? { ok: false, error: message(error) } : { ok: true }
}

export async function addContractorResponseInSupabase(
  input: ContractorResponseInput,
): Promise<ReviewWriteResult> {
  const cloudVersionId = toCloudId(input.versionId)
  if (!cloudVersionId) return { ok: false, error: 'Schedule version is not mapped to Supabase.' }
  if (!input.response.trim()) return { ok: false, error: 'A contractor response is required.' }

  const supabase = createClient()
  const { error: eventError } = await supabase.from('review_comment_events').insert({
    comment_id: input.commentId,
    version_id: cloudVersionId,
    event_type: 'CONTRACTOR_RESPONSE',
    actor_perspective: 'CONTRACTOR',
    payload: {
      response: input.response.trim(),
      correctionMade: input.correctionMade?.trim() || null,
      affectedActivities: input.affectedActivities || [],
      attachments: input.attachments || [],
    },
  })
  if (eventError) return { ok: false, error: message(eventError) }

  // A response is a claim, not proof of correction. Keep it awaiting review
  // until a deterministic check or an authorized reviewer evaluates it.
  return updateReviewCommentStatusInSupabase(input.commentId, 'NEEDS_REVIEWER_DECISION')
}

export async function addAutomatedVerificationInSupabase(
  input: VerificationInput,
): Promise<ReviewWriteResult> {
  const cloudVersionId = toCloudId(input.versionId)
  if (!cloudVersionId) return { ok: false, error: 'Schedule version is not mapped to Supabase.' }
  const supabase = createClient()
  const { error: eventError } = await supabase.from('review_comment_events').insert({
    comment_id: input.commentId,
    version_id: cloudVersionId,
    event_type: 'AUTOMATED_VERIFICATION',
    actor_perspective: 'SYSTEM',
    status: statusFromVerification(input.outcome),
    payload: {
      outcome: input.outcome,
      summary: input.summary,
      correctedCount: input.correctedCount,
      remainingCount: input.remainingCount,
      evidenceFindingIds: input.evidenceFindingIds || [],
    },
  })
  if (eventError) return { ok: false, error: message(eventError) }

  // Never closes the comment. PASSED means corrected pending owner verification.
  return updateReviewCommentStatusInSupabase(input.commentId, statusFromVerification(input.outcome))
}

export async function addReviewerNoteInSupabase(
  commentId: string,
  versionId: string | undefined,
  note: string,
): Promise<ReviewWriteResult> {
  const cloudVersionId = versionId ? toCloudId(versionId) : null
  if (versionId && !cloudVersionId) return { ok: false, error: 'Schedule version is not mapped to Supabase.' }
  const supabase = createClient()
  const { error } = await supabase.from('review_comment_events').insert({
    comment_id: commentId,
    version_id: cloudVersionId,
    event_type: 'REVIEWER_NOTE',
    actor_perspective: 'REVIEWER',
    payload: { note: note.trim() },
  })
  return error ? { ok: false, error: message(error) } : { ok: true }
}

export async function upsertScheduleNarrativeInSupabase(
  projectId: string,
  narrative: ScheduleNarrative,
  issue = false,
): Promise<ReviewWriteResult<ScheduleNarrative>> {
  const cloudProjectId = toCloudId(projectId)
  const cloudVersionId = toCloudId(narrative.versionId)
  const cloudPriorVersionId = toCloudId(narrative.priorVersionId)
  if (!cloudProjectId || !cloudVersionId) {
    return { ok: false, error: 'The project or narrative schedule version is not mapped to Supabase.' }
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('schedule_narratives')
    .upsert({
      project_id: cloudProjectId,
      version_id: cloudVersionId,
      prior_version_id: cloudPriorVersionId,
      review_purpose: narrative.reviewPurpose,
      sections: narrative.sections,
      status: issue ? 'ISSUED' : 'DRAFT',
    }, { onConflict: 'version_id' })
    .select('*')
    .single()
  if (error || !data) return { ok: false, error: message(error) }
  return { ok: true, data: rowToNarrative(data) }
}

