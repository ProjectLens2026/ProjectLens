// =============================================================================
// src/lib/approval-readiness/gates.ts   (Phase 1)
// =============================================================================
// Evaluates the configurable critical gates against the consolidated findings.
// A schedule can score high yet still be REVISE & RESUBMIT if a gate fails.
// Gate definitions + project applicability live in framework.ts.
// =============================================================================

import type { ApprovalFinding } from './types'
import { activeGates, type ProjectTypeKey } from './framework'

export interface GateResult {
  passed: boolean
  failed: { gateId: string; label: string; reason: string }[]
}

export function evaluateGates(
  findings: ApprovalFinding[],
  projectType: ProjectTypeKey = 'ALL',
): GateResult {
  const failed: GateResult['failed'] = []
  for (const gate of activeGates(projectType)) {
    const tripped = findings.some(f =>
      f.kind !== 'RECOMMENDATION' &&
      (f.criticalGate || gate.triggerDomains.includes(f.primaryDomain)) &&
      gate.triggerDomains.includes(f.primaryDomain) &&
      f.severity >= gate.minSeverity,
    )
    if (tripped) {
      failed.push({ gateId: gate.id, label: gate.label, reason: gate.reason })
    }
  }
  return { passed: failed.length === 0, failed }
}
