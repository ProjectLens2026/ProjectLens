// =============================================================================
// src/lib/construction/classify.ts   (Brick 2 — activity classifier)
// =============================================================================
// Classifies each raw XER activity along the construction backbone:
//
//   Phase → Discipline → System → Stage      (+ per-dimension confidence)
//
// Phase is the top spine (Preconstruction → Design → Procurement →
// Construction → Startup/Commissioning → Closeout). Milestones are NOT a phase;
// they are cross-phase checkpoints handled elsewhere.
//
// Design rules honored here:
//  - Classification is an ANNOTATION layer. It never gates graph traversal —
//    an unclassified activity (e.g. "Crane Mobilization") still belongs in the
//    raw path; it just carries phase=undefined.
//  - Confidence is PER DIMENSION, never a single global score. A finding can be
//    confidently Construction/Electrical/Energize while its exact system/area
//    is still uncertain.
//  - An activity has a PRIMARY phase and an optional SUPPORTING phase, because
//    real schedules blur boundaries ("Shop Drawing Approval" = Procurement,
//    supporting Design).
//  - Location/area scope is derived in the engine (deriveScope), not here.
//
// Calibrated against a real 1,040-activity federal schedule:
//   phase ~86% · stage ~80% · discipline ~58% · unresolved ~13%
// Dictionaries grow iteratively; this is the first validated pass.
// =============================================================================

import type { Discipline, ActivityStage, ActivityClass } from './types'
import { CLASSIFICATION } from './library'

// The six-phase project spine.
export type ProjectPhase =
  | 'PRECONSTRUCTION'
  | 'DESIGN'
  | 'PROCUREMENT'
  | 'CONSTRUCTION'
  | 'STARTUP_COMMISSIONING'
  | 'CLOSEOUT'

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none'

export interface ClassificationResult {
  phase?: ProjectPhase
  supportingPhase?: ProjectPhase
  discipline?: Discipline
  system?: string
  stage?: ActivityStage
  /** Canonical construction class from the generated reference library. */
  activityClass?: ActivityClass
  confidence: {
    phase: ConfidenceLevel
    discipline: ConfidenceLevel
    system: ConfidenceLevel
    stage: ConfidenceLevel
  }
}

// A minimal task shape — matches the TraceTask fields the engine has.
export interface ClassifiableTask {
  task_id: string
  task_code: string
  task_name: string
  task_type?: string
  wbs_path?: string[]
}

// -----------------------------------------------------------------------------
// Dictionaries (keyword → category). Longest match wins. Tuned against the
// real schedule; extend freely — this is data, not logic.
// -----------------------------------------------------------------------------

const PHASE_KW: Record<ProjectPhase, string[]> = {
  PRECONSTRUCTION: [
    'ntp', 'notice to proceed', 'mobiliz', 'pre-con', 'precon', 'preconstruction',
    'baseline schedule', 'permit', 'erosion', 'sediment', 'e&s', 'clear and grub',
    'clearing', 'grubbing', 'survey', 'layout', 'temporary', 'construction fence',
    'fence', 'gate', 'signage', 'sign ', 'limits of disturbance',
  ],
  DESIGN: ['design', 'ifc ', 'shop drawing', 'engineering calc'],
  PROCUREMENT: [
    'procure', 'submittal', 'submit ', 'fabricat', ' fat', 'deliver', 'long lead',
    'long-lead', 'release for', 'mix design', 'shop fabricat',
  ],
  STARTUP_COMMISSIONING: [
    'startup', 'start up', 'start-up', 'commission', 'functional test', 'fpt',
    ' ist', 'integrated system', ' tab', 'test adjust', 'balanc', 'energize', 'energiz',
  ],
  CLOSEOUT: [
    'punch', 'deficiency', 'final inspection', 'certificate of occ', ' c of o',
    'substantial complete', 'substantial completion', 'final completion', 'training',
    'o&m', 'as-built', 'record document', 'closeout', 'turnover', 'warranty', 'landscap',
  ],
  CONSTRUCTION: [], // default for physical work when nothing stronger matches
}

const DISC_KW: Record<string, string[]> = {
  CIVIL: [
    'excavat', 'grading', 'sitework', 'site work', 'backfill', 'utilit', 'duct bank',
    'storm', 'sanitary', 'sewer', 'water main', 'paving', 'asphalt', 'curb', 'erosion',
    'sediment', 'clear and grub', 'clearing', 'grubbing', 'bioretention', 'earthwork',
    'landscap', 'stormwater', 'swm',
  ],
  STRUCTURAL: [
    'steel', 'erect', 'footing', 'foundation', 'precast', 'double t', 'deck', 'column',
    'rebar', 'f/r/p', 'frp', 'pile', 'grade beam', 'concrete', 'slab', 'shear wall',
    'cmu', 'diamond', 'somd',
  ],
  ARCHITECTURAL: [
    'drywall', 'gypsum', 'partition', 'ceiling', 'flooring', 'floor ', 'tile', 'paint',
    'door', 'frame', 'hardware', 'millwork', 'casework', 'finish', 'insulation', 'masonry',
    'wall ', 'stair', 'elevator', 'roof', 'glazing', 'curtain', 'window', 'louver',
  ],
  ELECTRICAL: [
    'switchgear', 'transformer', 'xfmr', 'feeder', 'energiz', 'cable', 'conduit', 'panel',
    'electrical', 'generator', 'genset', ' ats', 'transfer switch', 'ups', 'busway', 'pdu',
    'gear', 'relay', 'lighting', 'power', 'mv ', 'lv ', 'electric ', 'handhole', ' hh ',
  ],
  MECHANICAL: [
    'hvac', 'chiller', 'chilled', 'crah', 'crac', 'ahu', 'ductwork', 'pump', 'vav',
    'mechanical', 'cooling', 'boiler', 'rtu', 'fan', 'fcu', 'heating', 'mep',
  ],
  PLUMBING: ['plumb', 'domestic water', 'waste', 'vent piping', 'fixture'],
  FIRE_PROTECTION: ['sprinkler', 'fire protection', 'standpipe', 'fire pump'],
  FireAlarm: ['fire alarm', 'smoke detect', 'smoke control'],
  LowVoltage: ['low voltage', 'security', 'access control', 'cctv', 'data cabl', 'telecom', 'av ', 'nurse call'],
  Controls: ['bms', 'building management', 'building automation', 'ddc', 'bas '],
  GeneralConditions: [
    'ntp', 'mobiliz', 'permit', 'baseline', 'temporary', 'fence', 'gate', 'sign', 'survey',
    'layout', 'punch', 'closeout', 'training', 'o&m', 'as-built', 'record document',
  ],
}

const SYS_KW: Record<string, string[]> = {
  EROSION_CONTROL: ['erosion', 'sediment', 'e&s', 'silt'],
  EARTHWORK: ['excavat', 'grading', 'backfill', 'earthwork', 'grade '],
  WATER: ['water main', 'domestic water', 'waterline'],
  SANITARY: ['sewer', 'sanitary', 'storm'],
  FOUNDATION: ['footing', 'foundation', 'pile', 'grade beam', 'f/r/p', 'frp'],
  STRUCTURAL_STEEL: ['steel', 'erect', 'column', 'beam', 'joist'],
  PRECAST: ['precast', 'double t', 'hollow core'],
  SLAB: ['slab', 'sog', 'deck'],
  BUILDING_ENVELOPE: ['roof', 'glazing', 'curtain', 'window', 'facade', 'cladding', 'masonry', 'waterproof', 'weather'],
  MV_DISTRIBUTION: ['mv ', 'medium voltage', 'switchgear', 'feeder'],
  TRANSFORMER: ['transformer', 'xfmr'],
  GENERATOR: ['generator', 'genset'],
  UPS: ['ups', 'uninterrupt'],
  ATS: [' ats', 'transfer switch'],
  LV_DISTRIBUTION: ['panel', 'lv ', 'busway', 'pdu', 'branch circuit'],
  CHILLED_WATER: ['chiller', 'chilled', 'chw'],
  HVAC: ['ahu', 'crah', 'crac', 'rtu', 'vav', 'fan', 'ductwork', 'air handl'],
  BMS: ['bms', 'building management', 'ddc'],
  FIRE_ALARM: ['fire alarm', 'smoke'],
  SPRINKLER: ['sprinkler', 'standpipe', 'fire pump'],
}

const STAGE_KW: Partial<Record<ActivityStage, string[]>> = {
  SUBMIT: ['submittal', 'submit ', 'shop drawing'],
  APPROVE: ['approv', 'review'],
  DELIVER: ['deliver', ' fat', 'ship', 'fabricat'],
  SET: ['install', 'erect', 'set ', 'f/r/p', 'place', 'pour', 'pull', 'rough', 'deck'],
  TERMINATE: ['terminat', 'splice'],
  GROUND: ['grounding', 'grounded', 'bonding', 'bonded'],
  CONNECT: ['connect', 'connection'],
  POINT_TO_POINT: ['point-to-point', 'point to point', 'p2p'],
  LOAD_BANK: ['load bank', 'load-bank'],
  PRESSURE_TEST: ['pressure test', 'hydrostatic test'],
  FLUSH_CLEAN: ['flush', 'cleaning'],
  TREAT: ['water treatment', 'chemical treatment', 'treatment'],
  FILL_CIRCULATE: ['fill and circulate', 'fill/circulate', 'circulate'],
  FLOW: ['design flow', 'flow verification', 'flow test'],
  CONTROLS: ['controls wiring', 'control wiring', 'controls complete'],
  PROGRAM: ['programming', 'program '],
  TAB: ['testing adjusting balancing', 'testing, adjusting', 'air balance', 'water balance', ' tab'],
  TEST: ['test', 'balanc', 'hi-pot', 'megger'],
  ENERGIZE: ['energiz'],
  STARTUP: ['startup', 'start up', 'start-up'],
  FUNCTIONAL_TEST: ['functional', 'fpt', 'commission'],
  IST: [' ist', 'integrated system'],
  INSPECT: ['inspect'],
  EXCAVATE: ['excavat'],
  CURE: ['cure'],
  ACCEPT: ['accept', 'turnover', 'substantial', 'final completion'],
  COMPLETE: ['complete'],
  MILESTONE: ['milestone'],
}


/** Focused inference for canonical classes already defined in types.ts but not yet
 * emitted by the generated 19-class library. These are narrow construction terms,
 * not broad guesses; they exist only so authored RULES can consume the vocabulary
 * they already reference. The generated library remains the primary classifier. */
function supplementalActivityClass(name: string): { activityClass?: ActivityClass; matchLen: number } {
  const n = ' ' + (name || '').toLowerCase() + ' '
  const rules: { cls: ActivityClass; terms: string[] }[] = [
    { cls: 'ELECTRICAL_FPT', terms: ['electrical functional test', 'electrical fpt'] },
    { cls: 'MECHANICAL_FPT', terms: ['mechanical functional test', 'mechanical fpt'] },
    { cls: 'CONTROLS_FPT', terms: ['controls functional test', 'controls fpt', 'bms functional test'] },
    { cls: 'LIFE_SAFETY_FPT', terms: ['life safety functional test', 'life-safety functional test', 'life safety fpt'] },
    { cls: 'IST', terms: ['integrated systems test', 'integrated system test', ' ist '] },
    { cls: 'MV_CABLE', terms: ['mv cable', 'medium voltage cable', '15kv cable', '13.8kv cable'] },
    { cls: 'BATTERY', terms: ['battery system', 'battery cabinet', 'battery string', 'batteries'] },
    { cls: 'FUEL_GAS', terms: ['fuel gas', 'natural gas', 'generator gas', 'fuel system'] },
    { cls: 'NORMAL_SOURCE', terms: ['normal source', 'utility source'] },
    { cls: 'EMERGENCY_SOURCE', terms: ['emergency source', 'generator source'] },
    { cls: 'CHW_PIPE', terms: ['chilled water piping', 'chw piping', 'chilled water pipe', 'chw pipe'] },
    { cls: 'SPRINKLER', terms: ['sprinkler', 'standpipe', 'fire pump'] },
    { cls: 'FIRE_ALARM', terms: ['fire alarm'] },
    { cls: 'SMOKE_CONTROL', terms: ['smoke control'] },
    { cls: 'FIRE_MARSHAL', terms: ['fire marshal', 'ahj inspection', 'life safety inspection'] },
    { cls: 'SLAB_ON_GRADE', terms: ['slab on grade', 'slab-on-grade', ' sog '] },
    { cls: 'DUCTBANK', terms: ['duct bank', 'ductbank'] },
    { cls: 'CABLE_PULL', terms: ['cable pull', 'pull cable', 'cable pulling'] },
    { cls: 'MEP_ROUGHIN', terms: ['mep rough-in', 'mep rough in', 'underslab mep', 'under slab mep'] },
    { cls: 'LV_ROUGHIN', terms: ['low voltage rough-in', 'low voltage rough in', 'lv rough-in'] },
    { cls: 'INTERIOR_DRYWALL', terms: ['drywall', 'gypsum board', 'gwb'] },
    { cls: 'CEILING', terms: ['ceiling grid', 'acoustical ceiling', 'act ceiling', 'ceiling close'] },
    { cls: 'INSPECTION', terms: ['pre-pour inspection', 'pre pour inspection', 'above-ceiling inspection', 'above ceiling inspection'] },
    { cls: 'ROOFING', terms: ['roofing', 'roof install', 'roof complete'] },
    { cls: 'GLAZING', terms: ['glazing', 'window install', 'curtainwall', 'curtain wall'] },
    { cls: 'SENSITIVE_ELEC_EQUIP', terms: ['switchgear', 'switchboard', 'ups', 'transformer', 'pdu'] },
    { cls: 'FOOTING', terms: ['footing'] },
    { cls: 'FOUNDATION_WALL', terms: ['foundation wall'] },
    { cls: 'PILE_CAP', terms: ['pile cap'] },
    { cls: 'GRADE_BEAM', terms: ['grade beam'] },
    { cls: 'MAT_FOUNDATION', terms: ['mat foundation', 'raft foundation'] },
    { cls: 'EQUIPMENT_FOUNDATION', terms: ['equipment foundation', 'equipment pad'] },
    { cls: 'TRAINING_OM', terms: ['owner training', 'o&m manual', 'o&m manuals', 'operations and maintenance manual'] },
    { cls: 'CO', terms: ['certificate of occupancy', ' c of o ', 'occupancy permit'] },
  ]

  let activityClass: ActivityClass | undefined
  let matchLen = 0
  for (const rule of rules) {
    for (const term of rule.terms) {
      if (n.includes(term) && term.length > matchLen) {
        activityClass = rule.cls
        matchLen = term.length
      }
    }
  }
  return { activityClass, matchLen }
}

/**
 * Resolve the canonical construction activity class from the generated reference
 * library. Longest keyword wins, matching the existing conservative classifier.
 * This is annotation only: unresolved activities remain in the raw XER graph.
 */
function canonicalKeywordMatches(haystack: string, rawKeyword: string): boolean {
  const kw = (rawKeyword || '').toLowerCase().trim()
  if (!kw) return false
  if (/^[a-z0-9]{2,4}$/.test(kw)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack)
  }
  return haystack.includes(kw)
}

function classifyActivityClass(name: string): {
  activityClass?: ActivityClass
  matchLen: number
  libraryStage?: ActivityStage
  stageMatchLen: number
} {
  const n = ' ' + (name || '').toLowerCase() + ' '
  let activityClass: ActivityClass | undefined
  let matchLen = 0
  let matchedEntry: (typeof CLASSIFICATION)[number] | undefined

  for (const entry of CLASSIFICATION) {
    for (const raw of entry.keywords || []) {
      const kw = (raw || '').toLowerCase()
      if (kw && canonicalKeywordMatches(n, kw) && kw.trim().length > matchLen) {
        activityClass = entry.activityClass
        matchLen = kw.trim().length
        matchedEntry = entry
      }
    }
  }

  // Once the activity class is known, use that class's authored stage hints as a
  // more specific secondary signal. This lets phrases such as "load bank",
  // "point-to-point", "pressure test" and "flow" resolve to their canonical
  // stages without disturbing the existing general stage dictionary.
  let libraryStage: ActivityStage | undefined
  let stageMatchLen = 0
  if (matchedEntry) {
    for (const [stage, hints] of Object.entries(matchedEntry.stageHints || {})) {
      for (const raw of hints || []) {
        const kw = (raw || '').toLowerCase()
        if (kw && n.includes(kw) && kw.length > stageMatchLen) {
          libraryStage = stage as ActivityStage
          stageMatchLen = kw.length
        }
      }
    }
  }

  const supplemental = supplementalActivityClass(name)
  if (supplemental.activityClass && supplemental.matchLen > matchLen) {
    activityClass = supplemental.activityClass
    matchLen = supplemental.matchLen
  }

  return { activityClass, matchLen, libraryStage, stageMatchLen }
}

// -----------------------------------------------------------------------------
// Matching
// -----------------------------------------------------------------------------

function bestMatch(name: string, table: Record<string, string[]>): { key: string | null; len: number } {
  const n = ' ' + name.toLowerCase() + ' '
  let key: string | null = null
  let len = 0
  for (const k of Object.keys(table)) {
    for (const kw of table[k]) {
      if (kw && n.includes(kw) && kw.length > len) { key = k; len = kw.length }
    }
  }
  return { key, len }
}

// confidence from match strength: longer/for-purpose keyword = higher confidence
function conf(matchLen: number): ConfidenceLevel {
  if (matchLen >= 8) return 'high'
  if (matchLen >= 5) return 'medium'
  if (matchLen >= 1) return 'low'
  return 'none'
}

/**
 * Classify a single activity into Phase → Discipline → System → Stage with
 * per-dimension confidence. Never throws; unresolved dimensions are undefined.
 */
export function classifyActivity(task: ClassifiableTask): ClassificationResult {
  const name = task.task_name || ''
  const isMilestone = task.task_type === 'TT_Mile' || task.task_type === 'TT_FinMile' || task.task_type === 'TT_StartMile'

  const dm = bestMatch(name, DISC_KW)
  const sm = bestMatch(name, SYS_KW)
  const stm = bestMatch(name, STAGE_KW as Record<string, string[]>)
  const pm = bestMatch(name, PHASE_KW as Record<string, string[]>)
  const acm = classifyActivityClass(name)

  // Preserve the existing general stage classifier, but allow a longer/more
  // specific class-authored hint to win (e.g. LOAD_BANK over generic TEST).
  let stage = (stm.key as ActivityStage | null) || undefined
  if (acm.libraryStage && acm.stageMatchLen > stm.len) stage = acm.libraryStage
  if (isMilestone && !stage) stage = 'MILESTONE'

  // Phase: strong keyword wins; else infer from stage/discipline (supporting).
  let phase = (pm.key as ProjectPhase | null) || undefined
  let supportingPhase: ProjectPhase | undefined
  let phaseConf = conf(pm.len)

  if (!phase) {
    if (stage && ['SUBMIT', 'APPROVE', 'DELIVER'].includes(stage)) { phase = 'PROCUREMENT'; phaseConf = 'medium' }
    else if (stage && ['STARTUP', 'ENERGIZE', 'FUNCTIONAL_TEST', 'IST'].includes(stage)) { phase = 'STARTUP_COMMISSIONING'; phaseConf = 'medium' }
    else if (dm.key && ['CIVIL', 'STRUCTURAL', 'ARCHITECTURAL', 'ELECTRICAL', 'MECHANICAL', 'PLUMBING', 'FIRE_PROTECTION'].includes(dm.key)) { phase = 'CONSTRUCTION'; phaseConf = 'low' }
  }

  // Supporting phase — capture the common blur cases.
  if (phase === 'PROCUREMENT' && dm.key && dm.key !== 'GeneralConditions') supportingPhase = 'DESIGN'
  if (phase === 'STARTUP_COMMISSIONING' && dm.key) supportingPhase = 'CONSTRUCTION'

  return {
    phase,
    supportingPhase,
    discipline: (dm.key as Discipline | null) || undefined,
    system: sm.key || undefined,
    stage,
    activityClass: acm.activityClass,
    confidence: {
      phase: phaseConf,
      discipline: conf(dm.len),
      system: conf(sm.len),
      stage: conf(Math.max(stm.len, acm.stageMatchLen, isMilestone ? 4 : 0)),
    },
  }
}

/** Batch helper. */
export function classifyAll(tasks: Record<string, ClassifiableTask>): Record<string, ClassificationResult> {
  const out: Record<string, ClassificationResult> = {}
  for (const id of Object.keys(tasks)) out[id] = classifyActivity(tasks[id])
  return out
}

export const PHASE_ORDER: ProjectPhase[] = [
  'PRECONSTRUCTION', 'DESIGN', 'PROCUREMENT', 'CONSTRUCTION', 'STARTUP_COMMISSIONING', 'CLOSEOUT',
]
export const PHASE_LABEL: Record<ProjectPhase, string> = {
  PRECONSTRUCTION: 'Preconstruction',
  DESIGN: 'Design',
  PROCUREMENT: 'Procurement',
  CONSTRUCTION: 'Construction',
  STARTUP_COMMISSIONING: 'Startup / Commissioning',
  CLOSEOUT: 'Closeout / Turnover',
}
