import type { ContractMilestone, ScheduleRequirementsProfile } from './projectStore'

export interface MilestoneVocabularyEntry {
  name: string
  acronym: string
  aliases: string[]
  profiles?: ScheduleRequirementsProfile[]
}

// Public, cross-industry naming aids only. Client-specific milestones, aliases
// and dependencies must be entered and confirmed in the Project Control Basis.
// They are intentionally never shipped as product defaults.
export const MILESTONE_VOCABULARY: MilestoneVocabularyEntry[] = [
  { name: 'Notice to Proceed', acronym: 'NTP', aliases: ['NOTICE TO PROCEED'] },
  { name: 'Start Work Date', acronym: 'SWD', aliases: ['START WORK', 'START OF WORK'] },
  { name: 'Substantial Completion', acronym: 'SC', aliases: ['SUBSTANTIAL COMPLETE'] },
  { name: 'Final Completion', acronym: 'FC', aliases: ['CONTRACT COMPLETION', 'PROJECT COMPLETION', 'END PROJECT'] },
  { name: 'Project Closeout', acronym: 'PCO', aliases: ['PROJECT CLOSE OUT', 'CLOSEOUT COMPLETE'] },
  { name: 'Beneficial Occupancy', acronym: 'BO', aliases: ['BENEFICIAL USE', 'BENEFICIAL OCCUPANCY DATE'] },
]

export function normalizeMilestoneText(value: unknown): string {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

function entryApplies(entry: MilestoneVocabularyEntry, profile?: ScheduleRequirementsProfile): boolean {
  return !entry.profiles?.length || Boolean(profile && entry.profiles.includes(profile))
}

export function milestoneDisplayName(milestone: Pick<ContractMilestone, 'name' | 'acronym'>): string {
  const name = String(milestone.name || '').trim()
  const acronym = String(milestone.acronym || '').trim().toUpperCase()
  if (!acronym) return name
  const escapedAcronym = acronym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`\\(${escapedAcronym}\\)`, 'i').test(name)) return name
  return `${name} (${acronym})`
}

export function inferMilestoneAcronym(name: string, profile?: ScheduleRequirementsProfile): string {
  const text = normalizeMilestoneText(name)
  const entry = MILESTONE_VOCABULARY.find(item => {
    if (!entryApplies(item, profile)) return false
    return [item.name, item.acronym, ...item.aliases].some(alias => {
      const normalized = normalizeMilestoneText(alias)
      return text === normalized || text.includes(normalized)
    })
  })
  return entry?.acronym || ''
}

export function milestoneSearchTerms(
  milestone: Pick<ContractMilestone, 'name' | 'acronym' | 'aliases'>,
  profile?: ScheduleRequirementsProfile,
): string[] {
  const supplied = [milestone.name, milestone.acronym || '', ...(milestone.aliases || [])]
  const inferredAcronym = milestone.acronym || inferMilestoneAcronym(milestone.name, profile)
  const vocabulary = MILESTONE_VOCABULARY.find(item =>
    entryApplies(item, profile)
    && (normalizeMilestoneText(item.acronym) === normalizeMilestoneText(inferredAcronym)
      || normalizeMilestoneText(item.name) === normalizeMilestoneText(milestone.name)),
  )
  return Array.from(new Set([
    ...supplied,
    ...(vocabulary ? [vocabulary.name, vocabulary.acronym, ...vocabulary.aliases] : []),
  ].map(normalizeMilestoneText).filter(Boolean)))
}

export function taskMatchesContractMilestone(
  task: { task_code?: string; task_name?: string; wbs_path?: string[] },
  milestone: Pick<ContractMilestone, 'name' | 'acronym' | 'aliases' | 'phaseOrArea'>,
  profile?: ScheduleRequirementsProfile,
): boolean {
  const identity = normalizeMilestoneText(`${task.task_code || ''} ${task.task_name || ''}`)
  const terms = milestoneSearchTerms(milestone, profile)
  if (!terms.some(term => identity === term || identity.includes(term))) return false
  const phase = normalizeMilestoneText(milestone.phaseOrArea)
  if (!phase) return true
  const scope = normalizeMilestoneText(`${identity} ${(task.wbs_path || []).join(' ')}`)
  return scope.includes(phase)
}

export function projectIdentityMatches(expected: unknown, submitted: unknown): boolean | null {
  const expectedId = normalizeMilestoneText(expected).replace(/\s+/g, '')
  const submittedId = normalizeMilestoneText(submitted).replace(/\s+/g, '')
  if (!expectedId || !submittedId) return null
  return expectedId === submittedId || submittedId.startsWith(expectedId) || expectedId.startsWith(submittedId)
}
