// =============================================================================
// src/lib/construction/referencePaths.ts
// Step 3 — reference-path presence + suggested key milestones
// =============================================================================
// This layer is intentionally advisory. It answers:
//   "Given the systems that actually appear in this XER, which useful control
//    milestones would improve schedule visibility?"
//
// It does NOT declare a milestone contractual. Contract / owner requirements
// belong to a separate profile layer and can later elevate a suggested milestone
// to REQUIRED when the governing documents say so.
// =============================================================================

import type { ActivityClass } from './types'

export interface ReferenceControlMilestone {
  id: string
  name: string
  aliases: string[]
  discipline: string
  system: string
  /** At least one of these classes must exist before this suggestion is applicable. */
  appliesIfAnyClass: ActivityClass[]
  /** Optional stronger project signature; every group requires at least one match. */
  appliesIfAllGroups?: ActivityClass[][]
  /** Suggested sequence shown to the reviewer. */
  referencePath: string[]
  rationale: string
  recommendedWbs: string
  /** Commissioning/readiness suggestions route to AR-06; others to AR-01. */
  approvalArea: 'MILESTONE' | 'COMMISSIONING'
}

export const REFERENCE_CONTROL_MILESTONES: ReferenceControlMilestone[] = [
  {
    id: 'RCM-001',
    name: 'Building Dry-In',
    aliases: ['building dry-in', 'building dry in', 'dry-in', 'dry in', 'watertight', 'weather-tight', 'weather tight'],
    discipline: 'Envelope',
    system: 'Building Dry-In',
    appliesIfAnyClass: ['EXTERIOR_ENVELOPE', 'ROOFING', 'GLAZING', 'SENSITIVE_ELEC_EQUIP'],
    referencePath: ['Structure / Envelope Progress', 'Weather-Tight', 'Building Dry-In'],
    rationale: 'A visible dry-in control point helps reviewers understand when interior finishes and sensitive equipment can proceed under controlled environmental conditions.',
    recommendedWbs: 'Key Milestones',
    approvalArea: 'MILESTONE',
  },
  {
    id: 'RCM-002',
    name: 'Permanent Power Available',
    aliases: ['permanent power available', 'permanent power', 'normal power available', 'main power available', 'utility power available'],
    discipline: 'Electrical',
    system: 'Permanent Power',
    appliesIfAnyClass: ['MV_SWITCHGEAR', 'LV_SWITCHGEAR', 'TRANSFORMER', 'MV_CABLE', 'NORMAL_SOURCE'],
    referencePath: ['Utility / Source Available', 'Distribution Ready', 'Protection / Testing Complete', 'Permanent Power Available'],
    rationale: 'A permanent-power milestone creates a clear convergence point for source availability, distribution readiness, testing, and downstream startup work.',
    recommendedWbs: 'Key Milestones',
    approvalArea: 'MILESTONE',
  },
  {
    id: 'RCM-003',
    name: 'Emergency Power Ready',
    aliases: ['emergency power ready', 'generator system ready', 'standby power ready', 'emergency power available'],
    discipline: 'Electrical',
    system: 'Emergency Power',
    appliesIfAnyClass: ['GENERATOR', 'ATS', 'EMERGENCY_SOURCE'],
    referencePath: ['Generator / Emergency Source Ready', 'ATS / Transfer Controls Ready', 'Emergency Power Functional Testing', 'Emergency Power Ready'],
    rationale: 'A dedicated emergency-power readiness milestone makes the generator, transfer, controls, and functional-test path visible to the project team.',
    recommendedWbs: 'Key Milestones',
    approvalArea: 'MILESTONE',
  },
  {
    id: 'RCM-004',
    name: 'Cooling System Ready',
    aliases: ['cooling system ready', 'mechanical systems ready', 'cooling ready', 'chilled water ready', 'chw flow available', 'mechanical ready'],
    discipline: 'Mechanical',
    system: 'Cooling',
    appliesIfAnyClass: ['CHILLER', 'CHW_PIPE', 'CHW_SYSTEM', 'PUMP', 'CRAH', 'AHU'],
    referencePath: ['Mechanical Installation Complete', 'Flush / Test / Balance / Startup', 'Controls Available', 'Cooling System Ready'],
    rationale: 'A cooling-readiness milestone helps the schedule show the convergence of mechanical completion, startup, controls, and testing before higher-level commissioning.',
    recommendedWbs: 'Key Milestones',
    approvalArea: 'MILESTONE',
  },
  {
    id: 'RCM-005',
    name: 'Controls Integration Ready',
    aliases: ['controls integration ready', 'bms integration ready', 'epms integration ready', 'controls ready'],
    discipline: 'Controls',
    system: 'Controls Integration',
    appliesIfAnyClass: ['BMS', 'EPMS'],
    referencePath: ['Controls Installation', 'Point-to-Point', 'Equipment Integration', 'Alarm / Trending Verification', 'Controls Integration Ready'],
    rationale: 'A controls-integration milestone gives the reviewer a clear checkpoint before functional and integrated testing begins.',
    recommendedWbs: 'Key Milestones',
    approvalArea: 'COMMISSIONING',
  },
  {
    id: 'RCM-006',
    name: 'Ready for IST',
    aliases: ['ready for ist', 'ist ready', 'ready for integrated systems test', 'ready for integrated systems testing', 'integrated testing readiness'],
    discipline: 'Commissioning',
    system: 'IST Readiness',
    appliesIfAnyClass: ['IST'],
    // When IST is not explicitly classified yet, this signature also makes the
    // recommendation applicable on a mission-critical style schedule.
    appliesIfAllGroups: [
      ['GENERATOR', 'ATS', 'UPS'],
      ['BMS', 'EPMS'],
      ['CHILLER', 'CHW_SYSTEM', 'CRAH', 'AHU'],
    ],
    referencePath: ['Electrical FPT Complete', 'Mechanical FPT Complete', 'Controls FPT Complete', 'Life-Safety Readiness as Applicable', 'Ready for IST'],
    rationale: 'Ready for IST should be a visible convergence point so the schedule does not jump from individual startup activities directly into integrated testing.',
    recommendedWbs: 'Key Milestones / Commissioning',
    approvalArea: 'COMMISSIONING',
  },
  {
    id: 'RCM-007',
    name: 'IST Complete',
    aliases: ['ist complete', 'integrated systems testing complete', 'integrated systems test complete', 'integrated testing complete'],
    discipline: 'Commissioning',
    system: 'IST',
    appliesIfAnyClass: ['IST'],
    referencePath: ['Ready for IST', 'Integrated Systems Testing', 'Deficiency Correction / Retest', 'IST Complete'],
    rationale: 'An IST-complete milestone separates execution of integrated testing from acceptance of the completed integrated-test sequence.',
    recommendedWbs: 'Key Milestones / Commissioning',
    approvalArea: 'COMMISSIONING',
  },
  {
    id: 'RCM-008',
    name: 'Ready for Service',
    aliases: ['ready for service', 'rfs', 'service ready', 'operational readiness', 'operations ready'],
    discipline: 'Commissioning',
    system: 'Ready for Service',
    appliesIfAnyClass: ['IST'],
    referencePath: ['Electrical Acceptance', 'Mechanical Acceptance', 'Controls Acceptance', 'IST Acceptance', 'Critical Deficiency Closure', 'Operations Readiness', 'Ready for Service'],
    rationale: 'Ready for Service is a useful owner control point between technical commissioning completion and broader contractual completion/turnover.',
    recommendedWbs: 'Key Milestones / Turnover',
    approvalArea: 'COMMISSIONING',
  },
]
