// =============================================================================
// Control Lens — project review workspace
// =============================================================================
// The review workspace is project-level. Comments keep one permanent number
// across schedule versions; narratives and automated checks remain tied to the
// version that produced them.
// =============================================================================

export type ReviewItemSource =
  | 'CL_DETECTED'
  | 'REVIEWER_ADDED'
  | 'CONVERTED_FROM_CL_FINDING'

export type ReviewItemClass = 'REQUIRED' | 'ADVISORY' | 'OBSERVATION'

export type ReviewApprovalImpact = 'BLOCKS_APPROVAL' | 'NON_BLOCKING'

export type ReviewItemStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'CORRECTED_PENDING_VERIFICATION'
  | 'PARTIALLY_CORRECTED'
  | 'NOT_CORRECTED'
  | 'NEEDS_REVIEWER_DECISION'
  | 'CLOSED'
  | 'REOPENED'
  | 'WITHDRAWN'
  | 'VOID'

export type ReviewVerificationOutcome =
  | 'PASSED'
  | 'PARTIAL'
  | 'FAILED'
  | 'MANUAL_REVIEW_REQUIRED'

export type NarrativeSectionKey =
  | 'EXECUTIVE_SUMMARY'
  | 'CONTRACT_MILESTONES'
  | 'PROGRESS_THIS_PERIOD'
  | 'NEXT_PERIOD_WORK'
  | 'CHANGES_FROM_PRIOR_VERSION'
  | 'LONGEST_AND_CRITICAL_PATHS'
  | 'DELAYS_AND_CONSTRAINTS'
  | 'PROCUREMENT_AND_LONG_LEAD'
  | 'SUBMITTALS_RFIS_APPROVALS'
  | 'TESTING_COMMISSIONING_TURNOVER'
  | 'CORRECTIVE_ACTIONS'
  | 'OWNER_COMMENT_RESPONSES'
  | 'ASSUMPTIONS_AND_SUPPORT'

export type NarrativeSectionState =
  | 'CURRENT'
  | 'AUTO_UPDATED'
  | 'CARRIED_CONFIRMATION_REQUIRED'
  | 'SCHEDULER_UPDATED'
  | 'NO_LONGER_SUPPORTED'

export interface ReviewActivityReference {
  activityId: string
  activityCode?: string
  activityName?: string
}

export interface ReviewAttachmentReference {
  id: string
  name: string
  path?: string
  url?: string
  addedAt: string
  addedBy?: string
}

export interface ContractorResponse {
  id: string
  versionId: string
  response: string
  correctionMade?: string
  affectedActivities: ReviewActivityReference[]
  attachments: ReviewAttachmentReference[]
  submittedAt: string
  submittedBy?: string
}

export interface AutomatedVerification {
  id: string
  versionId: string
  outcome: ReviewVerificationOutcome
  checkedAt: string
  summary: string
  correctedCount?: number
  remainingCount?: number
  evidenceFindingIds?: string[]
}

export interface ReviewStatusEvent {
  id: string
  status: ReviewItemStatus
  at: string
  by?: string
  note?: string
  versionId?: string
}

export interface ReviewComment {
  id: string
  sequence: number
  commentNumber: string
  source: ReviewItemSource
  sourceFindingIds?: string[]
  title: string
  concern: string
  requirementReference?: string
  requiredCorrection?: string
  classification: ReviewItemClass
  approvalImpact: ReviewApprovalImpact
  responsibleParty?: string
  firstVersionId: string
  requiredResponseVersionId?: string
  affectedActivities: ReviewActivityReference[]
  attachments: ReviewAttachmentReference[]
  status: ReviewItemStatus
  responses: ContractorResponse[]
  verifications: AutomatedVerification[]
  history: ReviewStatusEvent[]
  createdAt: string
  createdBy?: string
  issuedAt?: string
  issuedBy?: string
  closedAt?: string
  closedBy?: string
  withdrawnReason?: string
  voidReason?: string
}

export interface NarrativeAutomatedFact {
  id: string
  label: string
  currentValue: string
  priorValue?: string
  change?: string
  source: 'XER' | 'PROJECT_BASIS' | 'COMMENT_REGISTER'
}

export interface ScheduleNarrativeSection {
  key: NarrativeSectionKey
  title: string
  state: NarrativeSectionState
  schedulerText: string
  automatedFacts: NarrativeAutomatedFact[]
  carriedFromVersionId?: string
  updatedAt: string
  updatedBy?: string
}

export interface ScheduleNarrative {
  versionId: string
  reviewPurpose: string
  priorVersionId?: string
  sections: ScheduleNarrativeSection[]
  createdAt: string
  updatedAt: string
  issuedAt?: string
  issuedBy?: string
}

export interface ReviewWorkspace {
  schemaVersion: 1
  comments: ReviewComment[]
  narratives: Record<string, ScheduleNarrative>
  createdAt: string
  updatedAt: string
}

export interface NewReviewCommentInput {
  source: ReviewItemSource
  sourceFindingIds?: string[]
  title: string
  concern: string
  requirementReference?: string
  requiredCorrection?: string
  classification: ReviewItemClass
  approvalImpact: ReviewApprovalImpact
  responsibleParty?: string
  firstVersionId: string
  requiredResponseVersionId?: string
  affectedActivities?: ReviewActivityReference[]
  attachments?: ReviewAttachmentReference[]
  createdBy?: string
  issueImmediately?: boolean
}

export const NARRATIVE_SECTION_TITLES: Record<NarrativeSectionKey, string> = {
  EXECUTIVE_SUMMARY: 'Executive summary',
  CONTRACT_MILESTONES: 'Contract dates and milestone status',
  PROGRESS_THIS_PERIOD: 'Progress completed this period',
  NEXT_PERIOD_WORK: 'Planned work for the next period',
  CHANGES_FROM_PRIOR_VERSION: 'Changes from the previous XER',
  LONGEST_AND_CRITICAL_PATHS: 'Current longest path and critical path',
  DELAYS_AND_CONSTRAINTS: 'Delays, constraints and unresolved issues',
  PROCUREMENT_AND_LONG_LEAD: 'Procurement and long-lead items',
  SUBMITTALS_RFIS_APPROVALS: 'Submittals, RFIs and owner approvals',
  TESTING_COMMISSIONING_TURNOVER: 'Testing, commissioning and turnover',
  CORRECTIVE_ACTIONS: 'Corrective actions and recovery measures',
  OWNER_COMMENT_RESPONSES: 'Owner comments and contractor responses',
  ASSUMPTIONS_AND_SUPPORT: 'Assumptions and supporting documents',
}

const NARRATIVE_SECTION_ORDER = Object.keys(NARRATIVE_SECTION_TITLES) as NarrativeSectionKey[]

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function createEmptyReviewWorkspace(now = new Date().toISOString()): ReviewWorkspace {
  return {
    schemaVersion: 1,
    comments: [],
    narratives: {},
    createdAt: now,
    updatedAt: now,
  }
}

export function nextReviewCommentNumber(comments: ReviewComment[]): { sequence: number; commentNumber: string } {
  const sequence = comments.reduce((max, comment) => Math.max(max, comment.sequence || 0), 0) + 1
  return { sequence, commentNumber: `C-${String(sequence).padStart(3, '0')}` }
}

export function addReviewComment(
  workspace: ReviewWorkspace,
  input: NewReviewCommentInput,
  now = new Date().toISOString(),
): ReviewWorkspace {
  const numbered = nextReviewCommentNumber(workspace.comments)
  const status: ReviewItemStatus = input.issueImmediately ? 'OPEN' : 'DRAFT'
  const comment: ReviewComment = {
    id: makeId('comment'),
    ...numbered,
    source: input.source,
    sourceFindingIds: input.sourceFindingIds,
    title: input.title.trim(),
    concern: input.concern.trim(),
    requirementReference: input.requirementReference?.trim() || undefined,
    requiredCorrection: input.requiredCorrection?.trim() || undefined,
    classification: input.classification,
    approvalImpact: input.approvalImpact,
    responsibleParty: input.responsibleParty?.trim() || undefined,
    firstVersionId: input.firstVersionId,
    requiredResponseVersionId: input.requiredResponseVersionId,
    affectedActivities: input.affectedActivities || [],
    attachments: input.attachments || [],
    status,
    responses: [],
    verifications: [],
    history: [{
      id: makeId('event'),
      status,
      at: now,
      by: input.createdBy,
      versionId: input.firstVersionId,
      note: input.issueImmediately ? 'Comment issued' : 'Draft created',
    }],
    createdAt: now,
    createdBy: input.createdBy,
    issuedAt: input.issueImmediately ? now : undefined,
    issuedBy: input.issueImmediately ? input.createdBy : undefined,
  }
  return {
    ...workspace,
    comments: [...workspace.comments, comment],
    updatedAt: now,
  }
}

export function isReviewCommentOpen(status: ReviewItemStatus): boolean {
  return !['CLOSED', 'WITHDRAWN', 'VOID'].includes(status)
}

export function commentBlocksApproval(comment: ReviewComment): boolean {
  return comment.approvalImpact === 'BLOCKS_APPROVAL' && isReviewCommentOpen(comment.status) && comment.status !== 'DRAFT'
}

export function summarizeReviewComments(comments: ReviewComment[]) {
  return {
    issued: comments.filter(comment => comment.status !== 'DRAFT').length,
    drafts: comments.filter(comment => comment.status === 'DRAFT').length,
    open: comments.filter(comment => isReviewCommentOpen(comment.status) && comment.status !== 'DRAFT').length,
    closed: comments.filter(comment => comment.status === 'CLOSED').length,
    pendingVerification: comments.filter(comment => comment.status === 'CORRECTED_PENDING_VERIFICATION').length,
    partiallyCorrected: comments.filter(comment => comment.status === 'PARTIALLY_CORRECTED').length,
    notCorrected: comments.filter(comment => ['OPEN', 'NOT_CORRECTED', 'REOPENED'].includes(comment.status)).length,
    needsReviewerDecision: comments.filter(comment => comment.status === 'NEEDS_REVIEWER_DECISION').length,
    blocking: comments.filter(commentBlocksApproval).length,
  }
}

export function statusFromVerification(outcome: ReviewVerificationOutcome): ReviewItemStatus {
  if (outcome === 'PASSED') return 'CORRECTED_PENDING_VERIFICATION'
  if (outcome === 'PARTIAL') return 'PARTIALLY_CORRECTED'
  if (outcome === 'FAILED') return 'NOT_CORRECTED'
  return 'NEEDS_REVIEWER_DECISION'
}

// Automated verification can advance a comment to pending verification, but
// it can never close an owner's comment. Closure is an explicit reviewer act.
export function applyAutomatedVerification(
  workspace: ReviewWorkspace,
  commentId: string,
  verification: Omit<AutomatedVerification, 'id' | 'checkedAt'>,
  now = new Date().toISOString(),
): ReviewWorkspace {
  const comments = workspace.comments.map(comment => {
    if (comment.id !== commentId || ['WITHDRAWN', 'VOID'].includes(comment.status)) return comment
    const status = statusFromVerification(verification.outcome)
    return {
      ...comment,
      status,
      verifications: [...comment.verifications, { ...verification, id: makeId('verification'), checkedAt: now }],
      history: [...comment.history, {
        id: makeId('event'),
        status,
        at: now,
        versionId: verification.versionId,
        note: verification.summary,
      }],
    }
  })
  return { ...workspace, comments, updatedAt: now }
}

export function createScheduleNarrative(
  versionId: string,
  reviewPurpose: string,
  prior?: ScheduleNarrative,
  now = new Date().toISOString(),
): ScheduleNarrative {
  const priorByKey = new Map((prior?.sections || []).map(section => [section.key, section]))
  const sections = NARRATIVE_SECTION_ORDER.map((key): ScheduleNarrativeSection => {
    const carried = priorByKey.get(key)
    return {
      key,
      title: NARRATIVE_SECTION_TITLES[key],
      state: carried?.schedulerText ? 'CARRIED_CONFIRMATION_REQUIRED' : 'CURRENT',
      schedulerText: carried?.schedulerText || '',
      automatedFacts: [],
      carriedFromVersionId: carried?.schedulerText ? prior?.versionId : undefined,
      updatedAt: now,
    }
  })
  return {
    versionId,
    reviewPurpose,
    priorVersionId: prior?.versionId,
    sections,
    createdAt: now,
    updatedAt: now,
  }
}

export function upsertScheduleNarrative(
  workspace: ReviewWorkspace,
  narrative: ScheduleNarrative,
  now = new Date().toISOString(),
): ReviewWorkspace {
  return {
    ...workspace,
    narratives: { ...workspace.narratives, [narrative.versionId]: { ...narrative, updatedAt: now } },
    updatedAt: now,
  }
}

