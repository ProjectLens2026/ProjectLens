// =============================================================================
// src/lib/construction/types.ts   (Step 1 — canonical type system)
// =============================================================================
// The construction-logic engine reasons over CLASSIFIED CONSTRUCTION MEANING,
// never literal activity text. An activity becomes:
//
//   text -> Classification -> { discipline, system, activityClass, stage,
//                               location } -> rule evaluation
//
// A rule's prerequisite like "Foundations Complete" is NOT "find an activity
// named Foundations Complete." It is: activityClass ∈ {FOOTING, FOUNDATION_WALL,
// PILE_CAP, GRADE_BEAM, MAT_FOUNDATION, EQUIPMENT_FOUNDATION} at stage COMPLETE,
// within the same building/area — so "F/R/P new footings" satisfies it.
//
// These enums are authored from construction engineering knowledge and are the
// stable vocabulary the generated library (library.ts) and the engine share.
// =============================================================================

// ------------------------------------------------------------------ DISCIPLINE
export type Discipline =
  | 'ProjectControls' | 'Design' | 'Procurement' | 'GeneralConditions'
  | 'Civil' | 'Structural' | 'Architectural' | 'Envelope'
  | 'Electrical' | 'LowVoltage' | 'Mechanical' | 'Plumbing'
  | 'FireProtection' | 'FireAlarm' | 'Controls' | 'Commissioning'
  | 'QAQC' | 'Closeout' | 'Specialty' | 'MEP' | 'IT'

// --------------------------------------------------------------- ACTIVITY CLASS
// Canonical work/equipment classes. A rule triggers on one; prerequisites
// require one or more. Grows as the library grows.
export type ActivityClass =
  // civil / structural
  | 'SITE_EARTHWORK' | 'UNDERGROUND_UTILITY' | 'DUCTBANK'
  | 'FOUNDATION' | 'FOOTING' | 'FOUNDATION_WALL' | 'PILE_CAP' | 'GRADE_BEAM'
  | 'MAT_FOUNDATION' | 'EQUIPMENT_FOUNDATION' | 'SLAB_ON_GRADE'
  | 'ANCHOR_BOLTS' | 'STRUCTURAL_STEEL' | 'PRECAST' | 'METAL_DECK'
  // envelope / architectural
  | 'ROOFING' | 'EXTERIOR_ENVELOPE' | 'GLAZING'
  | 'INTERIOR_DRYWALL' | 'CEILING' | 'MEP_ROUGHIN' | 'LV_ROUGHIN' | 'INSPECTION'
  // electrical
  | 'SENSITIVE_ELEC_EQUIP' | 'MV_SWITCHGEAR' | 'LV_SWITCHGEAR' | 'MV_CABLE'
  | 'CABLE_PULL' | 'TRANSFORMER' | 'GENERATOR' | 'ATS' | 'UPS' | 'BATTERY'
  | 'EPMS' | 'PANEL' | 'NORMAL_SOURCE' | 'EMERGENCY_SOURCE' | 'FUEL_GAS'
  // mechanical / controls
  | 'CHILLER' | 'CHW_PIPE' | 'CHW_SYSTEM' | 'PUMP' | 'CRAH' | 'AHU'
  | 'BMS' | 'TAB'
  // fire / life safety
  | 'SPRINKLER' | 'FIRE_ALARM' | 'SMOKE_CONTROL' | 'FIRE_MARSHAL'
  // commissioning / closeout
  | 'ELECTRICAL_FPT' | 'MECHANICAL_FPT' | 'CONTROLS_FPT' | 'LIFE_SAFETY_FPT'
  | 'IST' | 'COMMISSIONING' | 'PUNCH' | 'TRAINING_OM' | 'CO'
  | 'GENERIC'

// ---------------------------------------------------------------------- STAGE
// The construction state of a class. This is what turns "both activities are
// about switchgear" into "ENERGIZE happens before TEST" — the real signal.
export type ActivityStage =
  | 'PROCURE' | 'SUBMIT' | 'APPROVE' | 'FABRICATE' | 'FAT' | 'DELIVER'
  | 'SITEPREP' | 'LAYOUT' | 'EXCAVATE' | 'SUBGRADE' | 'FORMWORK' | 'REINFORCE'
  | 'EMBED' | 'INSPECT' | 'PLACE' | 'POUR' | 'CURE' | 'STRIP'
  | 'ROUGH_IN' | 'ERECT' | 'DECK' | 'FIREPROOF'
  | 'SET' | 'ANCHOR' | 'GROUND' | 'CONNECT' | 'TERMINATE'
  | 'PRESSURE_TEST' | 'FLUSH_CLEAN' | 'TREAT' | 'FILL_CIRCULATE' | 'FLOW'
  | 'CONTROLS' | 'PROGRAM' | 'POINT_TO_POINT'
  | 'STARTUP' | 'TEST' | 'ENERGIZE' | 'TRANSFER' | 'LOAD_BANK' | 'TAB'
  | 'FUNCTIONAL_TEST' | 'IST' | 'DEFICIENCY' | 'RETEST'
  | 'ACCEPT' | 'CLOSE' | 'TURNOVER' | 'COMPLETE' | 'MILESTONE'

// ------------------------------------------------------------- MILESTONE CLASS
export type MilestoneClass =
  | 'BASELINE_APPROVED' | 'FOUNDATIONS_COMPLETE' | 'STRUCTURE_COMPLETE'
  | 'WEATHER_TIGHT' | 'DRY_IN' | 'UTILITY_SERVICE' | 'PERMANENT_POWER'
  | 'CHW_FLOW' | 'ELECTRICAL_FPT' | 'MECHANICAL_FPT' | 'LIFE_SAFETY_ACCEPTED'
  | 'READY_FOR_IST' | 'IST_COMPLETE' | 'CX_ACCEPTED' | 'CERT_OCCUPANCY'
  | 'SUBSTANTIAL_COMPLETION' | 'FINAL_COMPLETION' | 'ARCHITECTURAL_COMPLETE'
  | 'STRUCTURE_COMPLETE_ARCH'

// ------------------------------------------------------------------ PROJECT TYPE
export type ProjectType =
  | 'ALL' | 'DATA_CENTER' | 'MISSION_CRITICAL' | 'HOSPITAL' | 'FIRE_STATION'
  | 'SCHOOL' | 'ADMIN' | 'RENOVATION'

// -------------------------------------------------------------------- STRENGTH
export type RuleType = 'HARD' | 'EXPECTED' | 'REVIEW'
export type Severity = 1 | 2 | 3 | 4 | 5

// -------------------------------------------------------------- LOCATION SCOPE
// The matcher prefers the tightest scope first and only widens if the rule
// allows. Building A's foundation must never satisfy Building B's steel.
//   SAME_EQUIPMENT_TRAIN  Generator-1 chain, not Generator-2
//   SAME_SYSTEM           same electrical/mechanical system
//   SAME_AREA             same floor / zone / room
//   SAME_BUILDING         same building
//   SAME_WBS_BRANCH       same WBS parent
//   PROJECT_WIDE          anywhere (only when the rule permits)
export type ScopeLevel =
  | 'SAME_EQUIPMENT_TRAIN' | 'SAME_SYSTEM' | 'SAME_AREA'
  | 'SAME_BUILDING' | 'SAME_WBS_BRANCH' | 'PROJECT_WIDE'

// --------------------------------------------------------------- REQUIREMENT MODE
// How the prerequisite set must be satisfied.
export type RequirementMode = 'ANY' | 'ALL' | 'ONE_OF' | 'MILESTONE_STATE'

// ------------------------------------------------------------------ FINDING TYPE
// Distinguishing these is what makes the report intelligent — "the activities
// exist but aren't tied together" is very different from "the prerequisite
// activity isn't in the schedule at all."
export type FindingType =
  | 'MISSING_ACTIVITY'         // required prerequisite class not found in scope
  | 'MISSING_RELATIONSHIP'     // prerequisite exists but isn't logically tied
  | 'WRONG_SEQUENCE'           // prerequisite is downstream of the trigger
  | 'REVERSED_LOGIC'           // relationship direction is inverted
  | 'OUT_OF_SEQUENCE_PROGRESS' // actual dates violate accepted predecessor logic
  | 'UNSUPPORTED_MILESTONE'    // a milestone lacks an expected driving branch
  | 'UNUSUAL_SEQUENCE'         // nonstandard but possibly valid (Review)
  | 'LOGIC_CHANGE'             // relationship changed vs prior version
  | 'CALENDAR_CHANGE'          // calendar changed vs prior version
  | 'CONSTRAINT_OVERRIDE'      // hard constraint driving dates

export type Confidence = 'HIGH' | 'MEDIUM' | 'REVIEW'

// =============================================================================
// Interfaces
// =============================================================================

/** One prerequisite the trigger activity should be driven by. */
export interface PrerequisiteRequirement {
  /** Canonical class(es) that satisfy this prerequisite. */
  activityClass: ActivityClass | ActivityClass[]
  /** Required stage/state of that class (omit = any stage). */
  stage?: ActivityStage | ActivityStage[]
  /** Where the prerequisite must live relative to the trigger. */
  scope: ScopeLevel[]
  /** How the set is satisfied. */
  mode: RequirementMode
  /** If true, absence is a soft note, not a failure. */
  optional?: boolean
  /** Human label as authored in the library (for display + traceability). */
  label: string
}

/** A step in the recommended (corrected) logic chain. */
export interface RecommendedStep {
  order: number
  label: string
  activityClass?: ActivityClass
  stage?: ActivityStage
}

/** A normalized construction-logic rule. */
export interface ConstructionRule {
  id: string
  trigger: {
    discipline?: Discipline
    system?: string
    activityClass: ActivityClass
    stage: ActivityStage
  }
  prerequisites: PrerequisiteRequirement[]
  recommendedChain: RecommendedStep[]
  targetMilestone: MilestoneClass | string
  ruleType: RuleType
  severity: Severity
  applicability: ProjectType[]
  findingText: string
}

/** How raw activity text is recognized as a class + likely stages. */
export interface ClassificationEntry {
  activityClass: ActivityClass
  discipline: Discipline
  system: string
  /** Lowercased keyword/alias fragments; any match assigns the class. */
  keywords: string[]
  /** Stage keyword hints, mapping stage -> fragments. */
  stageHints: Partial<Record<ActivityStage, string[]>>
}

/** A critical milestone and how to trace it. */
export interface MilestoneDef {
  id: string
  milestoneClass: MilestoneClass | string
  name: string
  aliases: string[]
  drivingDisciplines: string[]
  backwardFocus: string
  forwardFocus: string
  applicability: string
}

/** A project-type module: which extra systems/milestones it enables. */
export interface ProjectTypeModule {
  projectType: ProjectType | string
  additionalSystems: string
  extraMilestones: string
  notes: string
}

/** A finding produced by the engine (Phase 1 — detect + recommend). */
export interface LogicFinding {
  ruleId: string
  findingType: FindingType
  discipline?: Discipline
  system?: string
  activityId: string
  activityCode: string
  activityName: string
  currentLogic: string        // the XER's current predecessors, summarized
  issue: string               // rule findingText
  severity: Severity
  ruleType: RuleType
  recommendedLogic: string    // the corrected chain, as an arrow string
  targetMilestone: string
  confidence: Confidence
  suggestedAction: string
}
