// Deterministic Phase 4A fixture checks. This file has no test-runner dependency
// so it can be executed from any project script or imported by the chosen test
// framework once the repository-level package configuration is available.

import type { TraceTask } from '../xerParser'
import { discoverUSProject } from './projectDiscovery'

function task(id: string, code: string, name: string, wbsPath: string[] = []): TraceTask {
  return {
    task_id: id,
    task_code: code,
    task_name: name,
    task_type: '',
    status_code: 'TK_NotStart',
    total_float_hr_cnt: '0',
    early_start_date: '',
    early_end_date: '',
    act_start_date: '',
    act_end_date: '',
    target_start_date: '',
    target_end_date: '',
    wbs_path: wbsPath,
  }
}

function requireFixture(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Project discovery fixture failed: ${message}`)
}

export function runProjectDiscoveryFixtureChecks(): { passed: 3; cases: string[] } {
  const usace = discoverUSProject({
    projectName: 'USACE New Administration Building',
    traceTasks: {
      '1': task('1', 'QC-100', 'Three-Phase Control Preparatory Meeting', ['Administration Building']),
      '2': task('2', 'PRO-100', 'Prepare and Submit Structural Steel Submittal', ['Procurement']),
      '3': task('3', 'MS-900', 'Substantial Completion', ['Key Milestones']),
    },
  })
  requireFixture(usace.ownerOverlay.key === 'USACE', 'USACE owner overlay was not detected')
  requireFixture(usace.applicableScaffolds.some(item => item.id === 'USACE'), 'USACE scaffold was not selected')
  requireFixture(!usace.applicableScaffolds.some(item => item.id === 'DATA_CENTER'), 'USACE building received a false data-center scaffold')

  const dataCenter = discoverUSProject({
    projectName: 'Virginia Mission Critical Data Center',
    traceTasks: {
      '1': task('1', 'ELEC-100', 'Install UPS and PDU', ['Building 1', 'Data Hall 1']),
      '2': task('2', 'MECH-100', 'CRAH Startup', ['Building 1', 'Data Hall 1']),
      '3': task('3', 'CTRL-100', 'EPMS Point-to-Point Testing', ['Building 1', 'Data Hall 1']),
      '4': task('4', 'CX-100', 'Integrated Systems Test', ['Building 1', 'Commissioning']),
      '5': task('5', 'MS-100', 'Ready for Service', ['Key Milestones']),
    },
  })
  requireFixture(dataCenter.archetype.key === 'DATA_CENTER', 'data-center archetype was not detected')
  requireFixture(dataCenter.applicableScaffolds.some(item => item.id === 'DATA_CENTER'), 'data-center scaffold was not selected')
  requireFixture(dataCenter.ownerOverlay.key === 'UNKNOWN', 'unknown data-center owner was guessed')

  const generic = discoverUSProject({
    projectName: 'Project Alpha',
    traceTasks: { '1': task('1', 'A100', 'Install Interior Partitions') },
  })
  requireFixture(generic.archetype.key === 'GENERAL_BUILDING', 'generic building fallback failed')
  requireFixture(generic.ownerOverlay.key === 'UNKNOWN', 'generic building owner was guessed')
  requireFixture(generic.applicableScaffolds.length === 1 && generic.applicableScaffolds[0].id === 'US_CORE', 'generic building should receive only the U.S. core scaffold')

  return { passed: 3, cases: ['USACE administration building', 'U.S. data center', 'ambiguous general building'] }
}

