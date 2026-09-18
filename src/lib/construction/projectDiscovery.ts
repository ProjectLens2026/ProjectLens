// =============================================================================
// src/lib/construction/projectDiscovery.ts
// Phase 4A - deterministic U.S. project discovery and scaffold selection
// =============================================================================
// This layer answers "what kind of project is this schedule describing?" before
// Control Lens judges sequencing or readiness. It is intentionally:
//   - evidence based: every detected item carries the XER evidence and rule id;
//   - conservative: weak evidence remains POSSIBLE or UNKNOWN;
//   - deterministic: identical input produces identical output;
//   - non-scoring: this result does not add findings or change readiness points.
//
// U.S. codes and contract requirements vary by jurisdiction and owner. Discovery
// selects an applicable reference scaffold; it never declares code compliance.
// =============================================================================

import type { Relationship, TraceTask, WbsNode } from '../xerParser'
import { classifyActivity, type ClassificationResult, type ProjectPhase } from './classify'

export type DiscoveryConfidence = 'high' | 'medium' | 'low' | 'none'
export type DiscoveryStatus = 'DETECTED' | 'POSSIBLE' | 'UNKNOWN'

export type USProjectArchetype =
  | 'DATA_CENTER'
  | 'HEALTHCARE'
  | 'EDUCATION'
  | 'RESIDENTIAL'
  | 'PUBLIC_SAFETY'
  | 'INDUSTRIAL'
  | 'OFFICE_ADMINISTRATION'
  | 'CORRECTIONS'
  | 'WAREHOUSE_LOGISTICS'
  | 'LABORATORY'
  | 'ANIMAL_CARE'
  | 'HOSPITALITY'
  | 'RETAIL'
  | 'TRANSPORTATION'
  | 'GOVERNMENT_CIVIC'
  | 'RECREATION_ASSEMBLY'
  | 'RELIGIOUS'
  | 'PARKING'
  | 'MIXED_USE'
  | 'GENERAL_BUILDING'
  | 'UNKNOWN'

export type OwnerOverlay =
  | 'USACE'
  | 'NAVFAC'
  | 'FEDERAL_DOD'
  | 'STATE_LOCAL_PUBLIC'
  | 'PRIVATE_COMMERCIAL'
  | 'UNKNOWN'

export type ProjectCondition =
  | 'NEW_CONSTRUCTION'
  | 'RENOVATION'
  | 'ADDITION'
  | 'OCCUPIED_RENOVATION'
  | 'PHASED_TURNOVER'
  | 'UNKNOWN'

export interface DiscoveryEvidence {
  source: 'PROJECT_NAME' | 'WBS' | 'ACTIVITY'
  ruleId: string
  matchedText: string
  taskId?: string
  taskCode?: string
  taskName?: string
  wbsPath?: string[]
}

export interface DiscoverySignal<T extends string = string> {
  key: T
  label: string
  status: DiscoveryStatus
  confidence: DiscoveryConfidence
  evidence: DiscoveryEvidence[]
}

export interface DiscoveredLocation extends DiscoverySignal {
  kind: 'BUILDING' | 'LEVEL' | 'AREA' | 'ZONE' | 'PHASE' | 'FACILITY'
}

export interface DiscoveredSystem extends DiscoverySignal {
  discipline: string
  activityCount: number
}

export interface DiscoveredPhase {
  phase: ProjectPhase
  label: string
  activityCount: number
  percentOfClassifiedActivities: number
  evidence: DiscoveryEvidence[]
}

export interface ScaffoldSection {
  id: string
  label: string
  purpose: string
}

export interface ApplicableScaffold {
  id: 'US_CORE' | 'FEDERAL_DOD_CORE' | 'USACE' | 'NAVFAC' | 'DATA_CENTER'
  label: string
  basis: string
  evidence: DiscoveryEvidence[]
  sections: ScaffoldSection[]
}

export interface USProjectDiscoveryResult {
  version: 'US-DISCOVERY-1.0'
  market: 'UNITED_STATES'
  jurisdictionNote: string
  archetype: DiscoverySignal<USProjectArchetype>
  ownerOverlay: DiscoverySignal<OwnerOverlay>
  projectCondition: DiscoverySignal<ProjectCondition>
  locations: DiscoveredLocation[]
  systems: DiscoveredSystem[]
  phases: DiscoveredPhase[]
  procurementPackages: DiscoverySignal[]
  commissioningStates: DiscoverySignal[]
  completionTargets: DiscoverySignal[]
  applicableScaffolds: ApplicableScaffold[]
  unresolved: string[]
  summary: {
    taskCount: number
    wbsNodeCount: number
    classifiedActivityCount: number
    generatedFrom: 'XER'
  }
}

export interface USProjectDiscoveryInput {
  projectName?: string
  traceTasks?: Record<string, TraceTask>
  traceRelationships?: Relationship[]
  wbsNodes?: Record<string, WbsNode>
}

interface ScoredEvidence {
  points: number
  evidence: DiscoveryEvidence[]
}

interface PatternRule {
  id: string
  pattern: RegExp
  points: number
}

const PHASE_LABEL: Record<ProjectPhase, string> = {
  PRECONSTRUCTION: 'Preconstruction',
  DESIGN: 'Design',
  PROCUREMENT: 'Procurement',
  CONSTRUCTION: 'Construction',
  STARTUP_COMMISSIONING: 'Startup / Commissioning',
  CLOSEOUT: 'Closeout / Turnover',
}

const ARCHETYPE_LABEL: Record<USProjectArchetype, string> = {
  DATA_CENTER: 'Data Center / Mission Critical',
  HEALTHCARE: 'Healthcare',
  EDUCATION: 'Education',
  RESIDENTIAL: 'Residential',
  PUBLIC_SAFETY: 'Public Safety / Emergency Services',
  INDUSTRIAL: 'Industrial / Manufacturing',
  OFFICE_ADMINISTRATION: 'Office / Administration',
  CORRECTIONS: 'Corrections / Secure Facility',
  WAREHOUSE_LOGISTICS: 'Warehouse / Logistics',
  LABORATORY: 'Laboratory / Research',
  ANIMAL_CARE: 'Animal Care / Kennel / Veterinary',
  HOSPITALITY: 'Hospitality / Hotel',
  RETAIL: 'Retail / Commercial',
  TRANSPORTATION: 'Transportation Facility',
  GOVERNMENT_CIVIC: 'Government / Civic',
  RECREATION_ASSEMBLY: 'Recreation / Assembly',
  RELIGIOUS: 'Religious / Worship',
  PARKING: 'Parking Structure',
  MIXED_USE: 'Mixed-Use Development',
  GENERAL_BUILDING: 'General Building / Facility',
  UNKNOWN: 'Unknown Project Archetype',
}

const OWNER_LABEL: Record<OwnerOverlay, string> = {
  USACE: 'U.S. Army Corps of Engineers (USACE)',
  NAVFAC: 'Naval Facilities Engineering Systems Command (NAVFAC)',
  FEDERAL_DOD: 'Federal / Department of Defense',
  STATE_LOCAL_PUBLIC: 'State / Local Public Owner',
  PRIVATE_COMMERCIAL: 'Private / Commercial Owner',
  UNKNOWN: 'Unknown Owner / Contract Overlay',
}

const CONDITION_LABEL: Record<ProjectCondition, string> = {
  NEW_CONSTRUCTION: 'New Construction',
  RENOVATION: 'Renovation',
  ADDITION: 'Addition / Expansion',
  OCCUPIED_RENOVATION: 'Occupied-Facility Renovation',
  PHASED_TURNOVER: 'Phased Construction / Turnover',
  UNKNOWN: 'Unknown Project Condition',
}

const ARCHETYPE_RULES: Record<Exclude<USProjectArchetype, 'GENERAL_BUILDING' | 'UNKNOWN'>, PatternRule[]> = {
  DATA_CENTER: [
    { id: 'AR-DC-01', pattern: /\bdata\s*cent(?:er|re)\b|\bmission[- ]critical\b|\bserver\s+(?:room|hall)\b|\bwhite\s+space\b/i, points: 12 },
    { id: 'AR-DC-02', pattern: /\bcrah\b|\bcrac\b|computer room air/i, points: 4 },
    { id: 'AR-DC-03', pattern: /\bups\b|uninterruptible power|\bpdu\b|power distribution unit/i, points: 3 },
    { id: 'AR-DC-04', pattern: /\bepms\b|electrical power monitoring|rack power/i, points: 3 },
    { id: 'AR-DC-05', pattern: /integrated systems? test|\bist\b|ready for service|\brfs\b/i, points: 3 },
  ],
  HEALTHCARE: [
    { id: 'AR-HC-01', pattern: /\bhospital\b|healthcare|medical center|patient care/i, points: 10 },
    { id: 'AR-HC-02', pattern: /medical gas|nurse call|operating room|patient room|infection control/i, points: 4 },
  ],
  EDUCATION: [
    { id: 'AR-ED-01', pattern: /\bschool\b|elementary|middle school|high school|university|college|classroom/i, points: 10 },
    { id: 'AR-ED-02', pattern: /academic|gymnasium|cafeteria|media center/i, points: 3 },
  ],
  RESIDENTIAL: [
    { id: 'AR-RE-01', pattern: /apartment|residential|housing|dormitor|barracks|dwelling|townhome/i, points: 9 },
    { id: 'AR-RE-02', pattern: /unit turnover|residential unit|apartment unit/i, points: 3 },
  ],
  PUBLIC_SAFETY: [
    { id: 'AR-PS-01', pattern: /fire station|engine house|police station|public safety|emergency operations|\bems\b/i, points: 10 },
    { id: 'AR-PS-02', pattern: /apparatus bay|vehicle exhaust capture|dispatch center/i, points: 4 },
  ],
  INDUSTRIAL: [
    { id: 'AR-IN-01', pattern: /manufacturing (?:facility|plant)|industrial (?:facility|plant)|process plant|production line|factory/i, points: 10 },
    { id: 'AR-IN-02', pattern: /process equipment|process piping|production equipment/i, points: 3 },
  ],
  OFFICE_ADMINISTRATION: [
    { id: 'AR-OF-01', pattern: /office building|administration building|administrative building|headquarters/i, points: 9 },
    { id: 'AR-OF-02', pattern: /open office|conference room|office fit[- ]out/i, points: 3 },
  ],
  CORRECTIONS: [
    { id: 'AR-CO-01', pattern: /correctional|detention|jail|prison|secure housing/i, points: 10 },
    { id: 'AR-CO-02', pattern: /cell block|sally port|detention equipment/i, points: 4 },
  ],
  WAREHOUSE_LOGISTICS: [
    { id: 'AR-WH-01', pattern: /warehouse|distribution center|logistics facility|fulfillment center/i, points: 10 },
    { id: 'AR-WH-02', pattern: /loading dock|racking system|conveyor system/i, points: 3 },
  ],
  LABORATORY: [
    { id: 'AR-LB-01', pattern: /laboratory|research facility|cleanroom|vivarium/i, points: 10 },
    { id: 'AR-LB-02', pattern: /fume hood|lab gas|biosafety/i, points: 4 },
  ],
  ANIMAL_CARE: [
    { id: 'AR-AC-01', pattern: /working dog kennel|dog kennel|animal shelter|animal care facility|veterinary (?:clinic|hospital|facility)/i, points: 10 },
    { id: 'AR-AC-02', pattern: /kennel building|quarantine building|animal holding/i, points: 4 },
  ],
  HOSPITALITY: [
    { id: 'AR-HT-01', pattern: /\bhotel\b|hospitality|guest room|resort/i, points: 10 },
    { id: 'AR-HT-02', pattern: /ballroom|hotel lobby|back of house/i, points: 3 },
  ],
  RETAIL: [
    { id: 'AR-RT-01', pattern: /retail (?:store|center|building)|shopping center|shopping mall|grocery store/i, points: 10 },
    { id: 'AR-RT-02', pattern: /sales floor|tenant retail|storefront fit[- ]out/i, points: 3 },
  ],
  TRANSPORTATION: [
    { id: 'AR-TR-01', pattern: /airport terminal|train station|transit station|bus terminal|transportation center/i, points: 10 },
    { id: 'AR-TR-02', pattern: /baggage handling|passenger boarding|platform canopy/i, points: 4 },
  ],
  GOVERNMENT_CIVIC: [
    { id: 'AR-GV-01', pattern: /courthouse|city hall|civic center|government office|public library/i, points: 10 },
    { id: 'AR-GV-02', pattern: /council chamber|courtroom|public service counter/i, points: 3 },
  ],
  RECREATION_ASSEMBLY: [
    { id: 'AR-RC-01', pattern: /recreation center|community center|stadium|arena|auditorium|performing arts|theater/i, points: 10 },
    { id: 'AR-RC-02', pattern: /natatorium|gymnasium|bleachers|locker room/i, points: 3 },
  ],
  RELIGIOUS: [
    { id: 'AR-RL-01', pattern: /church|mosque|synagogue|temple|worship center/i, points: 10 },
    { id: 'AR-RL-02', pattern: /sanctuary|prayer hall|fellowship hall/i, points: 3 },
  ],
  PARKING: [
    { id: 'AR-PK-01', pattern: /parking garage|parking structure|structured parking/i, points: 10 },
    { id: 'AR-PK-02', pattern: /parking deck|vehicle ramp/i, points: 3 },
  ],
  MIXED_USE: [
    { id: 'AR-MX-01', pattern: /mixed[- ]use|residential over retail|retail podium/i, points: 11 },
  ],
}

const OWNER_RULES: Record<Exclude<OwnerOverlay, 'UNKNOWN'>, PatternRule[]> = {
  USACE: [
    { id: 'OW-USACE-01', pattern: /\busace\b|u\.?s\.? army corps|army corps of engineers/i, points: 12 },
    { id: 'OW-USACE-02', pattern: /\brms\b|resident management system|\bqcs\b|quality control system/i, points: 4 },
    { id: 'OW-USACE-03', pattern: /preparatory phase|initial phase|follow[- ]up phase|three[- ]phase control/i, points: 3 },
    { id: 'OW-USACE-04', pattern: /eng form 93|eng form 4025|quality control report/i, points: 3 },
  ],
  NAVFAC: [
    { id: 'OW-NAVFAC-01', pattern: /\bnavfac\b|naval facilities|naval facility/i, points: 12 },
    { id: 'OW-NAVFAC-02', pattern: /\becms\b|n400\d{4,}/i, points: 6 },
    { id: 'OW-NAVFAC-03', pattern: /preparatory phase|initial phase|follow[- ]up phase|three[- ]phase control/i, points: 3 },
  ],
  FEDERAL_DOD: [
    { id: 'OW-DOD-01', pattern: /department of defense|\bdod\b|military|army|navy|air force|marine corps/i, points: 8 },
    { id: 'OW-DOD-02', pattern: /\bufgs\b|government acceptance|contracting officer/i, points: 4 },
  ],
  STATE_LOCAL_PUBLIC: [
    { id: 'OW-PUB-01', pattern: /department of general services|public works|school district|county|municipal|city of|state of/i, points: 8 },
    { id: 'OW-PUB-02', pattern: /government agency|public owner/i, points: 3 },
  ],
  PRIVATE_COMMERCIAL: [
    { id: 'OW-PRV-01', pattern: /private owner|developer|tenant improvement|commercial development/i, points: 7 },
  ],
}

const CONDITION_RULES: Record<Exclude<ProjectCondition, 'UNKNOWN'>, PatternRule[]> = {
  NEW_CONSTRUCTION: [
    { id: 'CN-NEW-01', pattern: /new construction|ground[- ]up/i, points: 9 },
    { id: 'CN-NEW-02', pattern: /clear(?:ing)? and grub|mass excavation|building foundation|structural steel erection/i, points: 2 },
  ],
  RENOVATION: [
    { id: 'CN-REN-01', pattern: /renovation|modernization|rehabilitation|interior upgrade|alteration/i, points: 9 },
    { id: 'CN-REN-02', pattern: /demolition|selective demo|existing to remain/i, points: 2 },
  ],
  ADDITION: [
    { id: 'CN-ADD-01', pattern: /building addition|facility addition|project expansion|facility expansion|new wing/i, points: 9 },
  ],
  OCCUPIED_RENOVATION: [
    { id: 'CN-OCC-01', pattern: /occupied renovation|occupied facility|maintain operations|facility remains operational/i, points: 10 },
    { id: 'CN-OCC-02', pattern: /temporary service|swing space|shutdown window|after hours work/i, points: 3 },
  ],
  PHASED_TURNOVER: [
    { id: 'CN-PHS-01', pattern: /phased turnover|partial turnover|phase \d+ turnover|area turnover/i, points: 9 },
    { id: 'CN-PHS-02', pattern: /partial beneficial occupancy|phased beneficial occupancy|partial occupancy/i, points: 3 },
  ],
}

const PROCUREMENT_RULES: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'SWITCHGEAR', label: 'Switchgear / Electrical Distribution', pattern: /switchgear|switchboard|main distribution|\bmdp\b/i },
  { key: 'TRANSFORMER', label: 'Transformers', pattern: /transformer|\bxfmr\b|unit substation/i },
  { key: 'GENERATOR', label: 'Generators', pattern: /generator|genset/i },
  { key: 'ATS', label: 'Automatic Transfer Switches', pattern: /automatic transfer switch|\bats\b/i },
  { key: 'UPS_PDU', label: 'UPS / PDU Equipment', pattern: /\bups\b|uninterruptible power|\bpdu\b/i },
  { key: 'MECHANICAL_EQUIPMENT', label: 'Major Mechanical Equipment', pattern: /chiller|boiler|cooling tower|\bcrah\b|\bcrac\b|\bahu\b|air handling unit/i },
  { key: 'ELEVATOR', label: 'Elevators', pattern: /elevator|vertical transportation/i },
  { key: 'ENVELOPE', label: 'Building Envelope', pattern: /curtain wall|curtainwall|roofing|glazing|window|exterior panel/i },
  { key: 'STRUCTURAL_STEEL', label: 'Structural Steel / Precast', pattern: /structural steel|steel fabrication|precast/i },
  { key: 'DOORS_HARDWARE', label: 'Doors / Frames / Hardware', pattern: /doors? and hardware|door frames?|hardware submittal/i },
  { key: 'LIFE_SAFETY', label: 'Fire Alarm / Fire Protection', pattern: /fire alarm|sprinkler|fire pump/i },
  { key: 'CONTROLS', label: 'BMS / EPMS / Controls', pattern: /\bbms\b|\bbas\b|\bepms\b|building automation|controls? system/i },
]

const COMMISSIONING_RULES: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'STARTUP', label: 'Equipment Startup', pattern: /start[ -]?up|manufacturer start/i },
  { key: 'PREFUNCTIONAL', label: 'Pre-Functional Checks', pattern: /pre[- ]?functional|prefunctional|commissioning checklist/i },
  { key: 'POINT_TO_POINT', label: 'Controls Point-to-Point', pattern: /point[- ]to[- ]point|\bp2p\b/i },
  { key: 'TAB', label: 'Testing, Adjusting and Balancing', pattern: /testing[,]? adjusting[,]? and balancing|test and balance|\btab\b/i },
  { key: 'FUNCTIONAL_TEST', label: 'Functional Performance Testing', pattern: /functional performance|functional test|\bfpt\b/i },
  { key: 'IST', label: 'Integrated Systems Testing', pattern: /integrated systems? test|integrated testing|\bist\b/i },
  { key: 'DEFICIENCY_RETEST', label: 'Deficiency Correction / Retest', pattern: /deficien(?:cy|cies)|retest|re-test/i },
  { key: 'TRAINING', label: 'Owner Training', pattern: /owner training|operator training|training/i },
  { key: 'OM_DOCUMENTS', label: 'O&M / Record Documents', pattern: /o\s*&\s*m|operation(?:s)? and maintenance|as[- ]built|record document/i },
  { key: 'ACCEPTANCE', label: 'Acceptance / Turnover', pattern: /acceptance|turnover|ready for service|\brfs\b/i },
]

const COMPLETION_RULES: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'NTP', label: 'Notice to Proceed', pattern: /notice to proceed|\bntp\b/i },
  { key: 'DESIGN_COMPLETE', label: 'Design Complete / IFC', pattern: /design complete|issued for construction|\bifc\b/i },
  { key: 'PERMIT', label: 'Permit / Authority Release', pattern: /permit issued|building permit|authority approval/i },
  { key: 'DRY_IN', label: 'Building Dry-In', pattern: /building dry[- ]?in|weather[- ]?tight|water[- ]?tight/i },
  { key: 'PERMANENT_POWER', label: 'Permanent Power Available', pattern: /permanent power|utility power available|normal power available/i },
  { key: 'BENEFICIAL_OCCUPANCY', label: 'Beneficial Occupancy', pattern: /beneficial occupancy/i },
  { key: 'SUBSTANTIAL_COMPLETION', label: 'Substantial Completion', pattern: /substantial completion/i },
  { key: 'READY_FOR_SERVICE', label: 'Ready for Service', pattern: /ready for service|\brfs\b/i },
  { key: 'FINAL_COMPLETION', label: 'Final Completion', pattern: /final completion|contract completion/i },
]

const US_CORE_SECTIONS: ScaffoldSection[] = [
  { id: 'US-01', label: 'Contract Controls and Major Milestones', purpose: 'Contract dates, NTP, completion targets and owner control points.' },
  { id: 'US-02', label: 'Design, Permits and Authority Approvals', purpose: 'Design releases, permits, reviews and jurisdictional approvals.' },
  { id: 'US-03', label: 'Procurement and Long-Lead Equipment', purpose: 'Submittal, approval, fabrication, delivery and release-to-install states.' },
  { id: 'US-04', label: 'Site, Civil and Utilities', purpose: 'Enabling work, earthwork, underground utilities and site completion.' },
  { id: 'US-05', label: 'Structure and Building Enclosure', purpose: 'Foundations, superstructure, envelope and dry-in.' },
  { id: 'US-06', label: 'MEP, Life Safety and Controls', purpose: 'Permanent building systems by area and equipment train.' },
  { id: 'US-07', label: 'Startup, Testing and Commissioning', purpose: 'Startup, balancing, functional tests and integrated readiness.' },
  { id: 'US-08', label: 'Turnover, Occupancy and Closeout', purpose: 'Training, documentation, inspections, acceptance and final completion.' },
]

const FEDERAL_DOD_SECTIONS: ScaffoldSection[] = [
  { id: 'DOD-01', label: 'Federal Contract Milestones', purpose: 'Contractual NTP, phased completion, beneficial occupancy and final acceptance.' },
  { id: 'DOD-02', label: 'Submittal and Government Review Cycle', purpose: 'Government review, approval, resubmission and procurement release.' },
  { id: 'DOD-03', label: 'Contractor Quality Control', purpose: 'Preparatory, initial and follow-up control activities where required.' },
  { id: 'DOD-04', label: 'Government Inspections and Acceptance', purpose: 'Government inspections, punch correction and acceptance states.' },
]

const USACE_SECTIONS: ScaffoldSection[] = [
  { id: 'USACE-01', label: 'RMS/QCS Schedule Administration', purpose: 'RMS/QCS coordination, schedule submission and progress-payment alignment.' },
  { id: 'USACE-02', label: 'Three-Phase Control', purpose: 'Preparatory, initial and follow-up phases linked to definable features of work.' },
  { id: 'USACE-03', label: 'USACE Safety and Quality Deliverables', purpose: 'Required plans, reports, inspections and acceptance documentation.' },
  { id: 'USACE-04', label: 'CLIN / Cost-Loaded Controls', purpose: 'Contract line-item and cost-loading alignment where required by contract.' },
]

const NAVFAC_SECTIONS: ScaffoldSection[] = [
  { id: 'NAVFAC-01', label: 'NAVFAC Submittal and eCMS Controls', purpose: 'Government submittal review and project-control administration.' },
  { id: 'NAVFAC-02', label: 'Three-Phase Control', purpose: 'Preparatory, initial and follow-up phases linked to definable features of work.' },
  { id: 'NAVFAC-03', label: 'NAVFAC Testing and Acceptance', purpose: 'System testing, government witnessing, training and facility acceptance.' },
]

const DATA_CENTER_SECTIONS: ScaffoldSection[] = [
  { id: 'DC-01', label: 'Utility and Campus Power', purpose: 'Utility source, substation, medium-voltage distribution and energization.' },
  { id: 'DC-02', label: 'Building Dry-In and Equipment-Ready Rooms', purpose: 'Environmental readiness before sensitive equipment installation.' },
  { id: 'DC-03', label: 'Normal and Emergency Power Trains', purpose: 'Switchgear, transformers, generators, ATS, UPS, PDU and protection testing.' },
  { id: 'DC-04', label: 'Cooling Production and Distribution', purpose: 'Cooling equipment, piping, flushing, treatment, flow, startup and TAB.' },
  { id: 'DC-05', label: 'BMS / EPMS / Controls Integration', purpose: 'Network readiness, point-to-point checks, alarms, trends and sequences.' },
  { id: 'DC-06', label: 'Commissioning Levels and IST', purpose: 'Component testing, functional testing, integrated testing and retesting.' },
  { id: 'DC-07', label: 'Ready for Service', purpose: 'Converged technical acceptance, operations readiness and service turnover.' },
]

function normalize(value: unknown): string {
  return String(value || '').replace(/[–—_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function confidence(points: number, evidenceCount: number): DiscoveryConfidence {
  if (points >= 10 || (points >= 7 && evidenceCount >= 3)) return 'high'
  if (points >= 5 || (points >= 3 && evidenceCount >= 2)) return 'medium'
  if (points > 0) return 'low'
  return 'none'
}

function statusFor(level: DiscoveryConfidence): DiscoveryStatus {
  if (level === 'high' || level === 'medium') return 'DETECTED'
  if (level === 'low') return 'POSSIBLE'
  return 'UNKNOWN'
}

function evidenceKey(e: DiscoveryEvidence): string {
  return `${e.ruleId}|${e.source}|${e.taskId || ''}|${e.matchedText}`
}

function uniqueEvidence(items: DiscoveryEvidence[], limit = 12): DiscoveryEvidence[] {
  const seen = new Set<string>()
  const out: DiscoveryEvidence[] = []
  for (const item of items) {
    const key = evidenceKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

function taskEvidence(task: TraceTask, ruleId: string, matchedText: string): DiscoveryEvidence {
  return {
    source: 'ACTIVITY', ruleId, matchedText,
    taskId: task.task_id, taskCode: task.task_code, taskName: task.task_name,
    wbsPath: task.wbs_path,
  }
}

function allSources(input: USProjectDiscoveryInput): { text: string; evidence: DiscoveryEvidence }[] {
  const out: { text: string; evidence: DiscoveryEvidence }[] = []
  if (input.projectName) {
    out.push({ text: input.projectName, evidence: { source: 'PROJECT_NAME', ruleId: '', matchedText: input.projectName } })
  }
  const wbs = Object.values(input.wbsNodes || {}).sort((a, b) => a.wbs_id.localeCompare(b.wbs_id))
  for (const node of wbs) {
    const text = node.full_path?.join(' > ') || node.wbs_name
    out.push({ text, evidence: { source: 'WBS', ruleId: '', matchedText: text } })
  }
  const tasks = Object.values(input.traceTasks || {}).sort((a, b) => a.task_id.localeCompare(b.task_id))
  for (const task of tasks) {
    const text = `${task.task_code || ''} ${task.task_name || ''} ${(task.wbs_path || []).join(' ')}`
    out.push({ text, evidence: taskEvidence(task, '', normalize(`${task.task_code} ${task.task_name}`)) })
  }
  return out
}

function scoreRules(sources: { text: string; evidence: DiscoveryEvidence }[], rules: PatternRule[]): ScoredEvidence {
  let points = 0
  const evidence: DiscoveryEvidence[] = []
  for (const rule of rules) {
    const matches = sources.filter(source => rule.pattern.test(source.text)).slice(0, 8)
    if (!matches.length) continue
    // A rule contributes once; repetitions strengthen evidence count but do not
    // inflate the score merely because a large schedule repeats terminology.
    points += rule.points
    for (const source of matches) {
      const exact = source.text.match(rule.pattern)?.[0] || source.text
      evidence.push({ ...source.evidence, ruleId: rule.id, matchedText: normalize(exact) })
    }
  }
  return { points, evidence: uniqueEvidence(evidence) }
}

function strongestSignal<T extends string>(
  scores: { key: T; scored: ScoredEvidence }[],
  labels: Record<T, string>,
  unknown: T,
): DiscoverySignal<T> {
  const ranked = scores.slice().sort((a, b) => b.scored.points - a.scored.points || String(a.key).localeCompare(String(b.key)))
  const best = ranked[0]
  if (!best || best.scored.points === 0) {
    return { key: unknown, label: labels[unknown], status: 'UNKNOWN', confidence: 'none', evidence: [] }
  }
  const level = confidence(best.scored.points, best.scored.evidence.length)
  return { key: best.key, label: labels[best.key], status: statusFor(level), confidence: level, evidence: best.scored.evidence }
}

function discoverArchetype(sources: { text: string; evidence: DiscoveryEvidence }[], taskCount: number): DiscoverySignal<USProjectArchetype> {
  const keys = Object.keys(ARCHETYPE_RULES) as Exclude<USProjectArchetype, 'GENERAL_BUILDING' | 'UNKNOWN'>[]
  const scored = keys.map(key => ({ key, scored: scoreRules(sources, ARCHETYPE_RULES[key]) }))
  const best = strongestSignal(scored, ARCHETYPE_LABEL, 'UNKNOWN')
  if (best.status !== 'UNKNOWN') return best
  if (taskCount > 0) {
    return {
      key: 'GENERAL_BUILDING', label: ARCHETYPE_LABEL.GENERAL_BUILDING,
      status: 'POSSIBLE', confidence: 'low', evidence: [],
    }
  }
  return best
}

function discoverOwner(sources: { text: string; evidence: DiscoveryEvidence }[]): DiscoverySignal<OwnerOverlay> {
  const keys = Object.keys(OWNER_RULES) as Exclude<OwnerOverlay, 'UNKNOWN'>[]
  return strongestSignal(keys.map(key => ({ key, scored: scoreRules(sources, OWNER_RULES[key]) })), OWNER_LABEL, 'UNKNOWN')
}

function discoverCondition(sources: { text: string; evidence: DiscoveryEvidence }[]): DiscoverySignal<ProjectCondition> {
  const keys = Object.keys(CONDITION_RULES) as Exclude<ProjectCondition, 'UNKNOWN'>[]
  const scores = keys.map(key => ({ key, scored: scoreRules(sources, CONDITION_RULES[key]) }))

  // Ground-up work is frequently shown through the schedule structure rather
  // than the literal phrase "new construction." Require three distinct scope
  // groups before treating that structure as strong new-construction evidence.
  const groundUpGroups: PatternRule[] = [
    { id: 'CN-NEW-SITE', pattern: /clear(?:ing)? and grub|clearing|grubbing|mass excavation|site grading|erosion (?:and sediment|control)/i, points: 0 },
    { id: 'CN-NEW-FOUND', pattern: /building foundation|foundation work|footing|pile cap|grade beam/i, points: 0 },
    { id: 'CN-NEW-STRUCT', pattern: /structural steel erection|precast erection|cmu install|building structure/i, points: 0 },
    { id: 'CN-NEW-ENV', pattern: /roof install|roofing|exterior wall|curtain wall|glazing|building dry[- ]?in/i, points: 0 },
  ]
  const groundUpEvidence = groundUpGroups.flatMap(rule => scoreRules(sources, [rule]).evidence.slice(0, 2))
  const groundUpGroupCount = groundUpGroups.filter(rule => sources.some(source => rule.pattern.test(source.text))).length
  if (groundUpGroupCount >= 3) {
    const newScore = scores.find(item => item.key === 'NEW_CONSTRUCTION')!
    newScore.scored.points += 8
    newScore.scored.evidence = uniqueEvidence(newScore.scored.evidence.concat(groundUpEvidence))
  }
  return strongestSignal(scores, CONDITION_LABEL, 'UNKNOWN')
}

function locationKind(text: string): DiscoveredLocation['kind'] | null {
  if (/\b(?:building|bldg|bld)\b/i.test(text)) return 'BUILDING'
  if (/\b(?:level|floor)\b/i.test(text)) return 'LEVEL'
  if (/\barea\b/i.test(text)) return 'AREA'
  if (/\bzone\b/i.test(text)) return 'ZONE'
  if (/\bphase\b/i.test(text)) return 'PHASE'
  if (/\b(?:campus|facility|site)\b/i.test(text)) return 'FACILITY'
  return null
}

function locationLabel(raw: string): string | null {
  const patterns = [
    /\b(admin(?:istration)? building|quarantine building|kennel building|central utility plant|data hall|server hall)\b/i,
    /\b(?:building|bldg|bld)\b\s*[-#. ]*([a-z]?\d+[a-z]?|[a-z])\b/i,
    /\b(?:level|floor)\b\s*[-#. ]*([a-z]?\d+[a-z]?|[a-z])\b/i,
    /\b(?:area|zone|phase)\b\s*[-#. ]*([a-z]?\d+[a-z]?|[a-z])\b/i,
  ]
  for (const pattern of patterns) {
    const match = raw.match(pattern)
    if (match) return normalize(match[0])
  }
  return null
}

function discoverLocations(input: USProjectDiscoveryInput): DiscoveredLocation[] {
  const grouped = new Map<string, { label: string; kind: DiscoveredLocation['kind']; evidence: DiscoveryEvidence[] }>()
  const add = (raw: string, evidence: DiscoveryEvidence) => {
    const label = locationLabel(raw)
    if (!label) return
    const kind = locationKind(label) || 'FACILITY'
    const key = label.toLowerCase()
    const current = grouped.get(key) || { label, kind, evidence: [] }
    current.evidence.push(evidence)
    grouped.set(key, current)
  }
  for (const node of Object.values(input.wbsNodes || {}).sort((a, b) => a.wbs_id.localeCompare(b.wbs_id))) {
    const raw = node.full_path?.join(' > ') || node.wbs_name
    add(raw, { source: 'WBS', ruleId: 'LOC-WBS-01', matchedText: raw })
  }
  for (const task of Object.values(input.traceTasks || {}).sort((a, b) => a.task_id.localeCompare(b.task_id))) {
    const raw = `${(task.wbs_path || []).join(' > ')} ${task.task_name}`
    add(raw, taskEvidence(task, 'LOC-ACT-01', normalize(raw)))
  }
  return Array.from(grouped.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 100)
    .map(item => {
      const evidence = uniqueEvidence(item.evidence, 8)
      const level: DiscoveryConfidence = evidence.length >= 2 ? 'high' : 'medium'
      return { key: item.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_'), label: item.label, kind: item.kind, status: 'DETECTED', confidence: level, evidence }
    })
}

function discoverSystems(tasks: TraceTask[], classifications: Record<string, ClassificationResult>): DiscoveredSystem[] {
  const grouped = new Map<string, { label: string; discipline: string; evidence: DiscoveryEvidence[]; count: number }>()
  for (const task of tasks) {
    const cls = classifications[task.task_id]
    if (!cls?.system || cls.system === 'General') continue
    const key = cls.system.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
    const acronyms = new Set(['HVAC', 'LV', 'MV', 'BMS', 'BAS', 'EPMS', 'UPS', 'ATS', 'AHU', 'CRAH', 'CRAC', 'TAB'])
    const label = cls.system.replace(/_/g, ' ').split(/\s+/).map(part => {
      const upper = part.toUpperCase()
      return acronyms.has(upper) ? upper : part.toLowerCase().replace(/^\w/, char => char.toUpperCase())
    }).join(' ')
    const current = grouped.get(key) || { label, discipline: cls.discipline || 'General', evidence: [], count: 0 }
    current.count++
    current.evidence.push(taskEvidence(task, 'SYS-CLASS-01', `${cls.system}: ${task.task_code} ${task.task_name}`))
    grouped.set(key, current)
  }
  return Array.from(grouped.entries())
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([key, value]) => {
      const level: DiscoveryConfidence = value.count >= 5 ? 'high' : value.count >= 2 ? 'medium' : 'low'
      return {
        key, label: value.label, discipline: value.discipline, activityCount: value.count,
        status: statusFor(level), confidence: level, evidence: uniqueEvidence(value.evidence, 10),
      }
    })
}

function discoverPhases(tasks: TraceTask[], classifications: Record<string, ClassificationResult>): DiscoveredPhase[] {
  const counts = new Map<ProjectPhase, { count: number; evidence: DiscoveryEvidence[] }>()
  for (const task of tasks) {
    const phase = classifications[task.task_id]?.phase
    if (!phase) continue
    const item = counts.get(phase) || { count: 0, evidence: [] }
    item.count++
    item.evidence.push(taskEvidence(task, 'PHS-CLASS-01', `${phase}: ${task.task_code} ${task.task_name}`))
    counts.set(phase, item)
  }
  const classified = Array.from(counts.values()).reduce((sum, item) => sum + item.count, 0)
  const order: ProjectPhase[] = ['PRECONSTRUCTION', 'DESIGN', 'PROCUREMENT', 'CONSTRUCTION', 'STARTUP_COMMISSIONING', 'CLOSEOUT']
  return order.filter(phase => counts.has(phase)).map(phase => {
    const item = counts.get(phase)!
    return {
      phase, label: PHASE_LABEL[phase], activityCount: item.count,
      percentOfClassifiedActivities: classified ? Math.round((item.count / classified) * 100) : 0,
      evidence: uniqueEvidence(item.evidence, 6),
    }
  })
}

function discoverPatternGroups(
  tasks: TraceTask[],
  rules: { key: string; label: string; pattern: RegExp }[],
  rulePrefix: string,
  eligibility?: (task: TraceTask, cls: ClassificationResult | undefined) => boolean,
  classifications: Record<string, ClassificationResult> = {},
): DiscoverySignal[] {
  const results: DiscoverySignal[] = []
  for (const rule of rules) {
    const matches = tasks.filter(task => (!eligibility || eligibility(task, classifications[task.task_id])) && rule.pattern.test(`${task.task_code} ${task.task_name} ${(task.wbs_path || []).join(' ')}`))
    if (!matches.length) continue
    const level: DiscoveryConfidence = matches.length >= 3 ? 'high' : matches.length >= 2 ? 'medium' : 'low'
    results.push({
      key: rule.key, label: rule.label, status: statusFor(level), confidence: level,
      evidence: matches.slice(0, 10).map(task => taskEvidence(task, `${rulePrefix}-${rule.key}`, normalize(`${task.task_code} ${task.task_name}`))),
    })
  }
  return results.sort((a, b) => a.label.localeCompare(b.label))
}

function buildScaffolds(
  archetype: DiscoverySignal<USProjectArchetype>,
  owner: DiscoverySignal<OwnerOverlay>,
): ApplicableScaffold[] {
  const out: ApplicableScaffold[] = [{
    id: 'US_CORE', label: 'U.S. Construction Core',
    basis: 'Base scaffold for U.S. building and facility schedules. Jurisdiction-specific code editions remain project inputs.',
    evidence: [], sections: US_CORE_SECTIONS,
  }]
  if (['USACE', 'NAVFAC', 'FEDERAL_DOD'].includes(owner.key)) {
    out.push({
      id: 'FEDERAL_DOD_CORE', label: 'Federal / DoD Construction Overlay',
      basis: `Selected from ${owner.label} evidence.`, evidence: owner.evidence, sections: FEDERAL_DOD_SECTIONS,
    })
  }
  if (owner.key === 'USACE') out.push({ id: 'USACE', label: 'USACE Project-Control Overlay', basis: 'USACE evidence detected in the submitted XER.', evidence: owner.evidence, sections: USACE_SECTIONS })
  if (owner.key === 'NAVFAC') out.push({ id: 'NAVFAC', label: 'NAVFAC Project-Control Overlay', basis: 'NAVFAC evidence detected in the submitted XER.', evidence: owner.evidence, sections: NAVFAC_SECTIONS })
  if (archetype.key === 'DATA_CENTER') out.push({ id: 'DATA_CENTER', label: 'U.S. Data Center / Mission-Critical Scaffold', basis: 'Data-center or mission-critical evidence detected in the submitted XER.', evidence: archetype.evidence, sections: DATA_CENTER_SECTIONS })
  return out
}

export function discoverUSProject(input: USProjectDiscoveryInput): USProjectDiscoveryResult {
  const tasks = Object.values(input.traceTasks || {}).sort((a, b) => a.task_id.localeCompare(b.task_id))
  const sources = allSources(input)
  const classifications: Record<string, ClassificationResult> = {}
  for (const task of tasks) classifications[task.task_id] = classifyActivity(task)

  const archetype = discoverArchetype(sources, tasks.length)
  const ownerOverlay = discoverOwner(sources)
  const projectCondition = discoverCondition(sources)
  const locations = discoverLocations(input)
  const systems = discoverSystems(tasks, classifications)
  const phases = discoverPhases(tasks, classifications)
  const procurementPackages = discoverPatternGroups(
    tasks, PROCUREMENT_RULES, 'PROC',
    (task, cls) => cls?.phase === 'PROCUREMENT' || /submittal|submit|approv|procure|fabricat|deliver|long[- ]lead/i.test(task.task_name),
    classifications,
  )
  const commissioningStates = discoverPatternGroups(tasks, COMMISSIONING_RULES, 'CX')
  const completionTargets = discoverPatternGroups(
    tasks, COMPLETION_RULES, 'MS',
    task => ['TT_Mile', 'TT_FinMile', 'TT_StartMile'].includes(task.task_type) || /complete|completion|occupancy|ready|available|permit|notice to proceed|\bntp\b/i.test(task.task_name),
  )

  const unresolved: string[] = []
  if (archetype.status === 'UNKNOWN' || archetype.confidence === 'low') unresolved.push('Project archetype is not supported by enough explicit XER evidence.')
  if (ownerOverlay.status === 'UNKNOWN') unresolved.push('Owner/contract overlay is not identified; do not apply USACE, NAVFAC or other owner requirements automatically.')
  if (projectCondition.status === 'UNKNOWN') unresolved.push('New construction, renovation, addition and occupied/phased conditions are not clearly identified.')
  if (!locations.length) unresolved.push('No explicit building, level, area, zone or phase structure was discovered.')
  if (!completionTargets.length) unresolved.push('No recognizable completion or readiness control target was discovered.')

  return {
    version: 'US-DISCOVERY-1.0',
    market: 'UNITED_STATES',
    jurisdictionNote: 'Reference scaffold only. Applicable code editions, amendments, contract clauses and authority requirements must come from the project profile and governing documents.',
    archetype,
    ownerOverlay,
    projectCondition,
    locations,
    systems,
    phases,
    procurementPackages,
    commissioningStates,
    completionTargets,
    applicableScaffolds: buildScaffolds(archetype, ownerOverlay),
    unresolved,
    summary: {
      taskCount: tasks.length,
      wbsNodeCount: Object.keys(input.wbsNodes || {}).length,
      classifiedActivityCount: Object.values(classifications).filter(item => item.phase || item.discipline || item.system || item.stage).length,
      generatedFrom: 'XER',
    },
  }
}
