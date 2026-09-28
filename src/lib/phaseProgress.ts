import { classifyActivity } from './construction/classify'

export const PHASES = [
  ['DESIGN', 'Design'], ['PRECONSTRUCTION', 'Preconstruction'],
  ['PROCUREMENT', 'Procurement'], ['CONSTRUCTION', 'Construction'],
  ['STARTUP_COMMISSIONING', 'Commissioning & turnover'],
] as const
export interface PhaseActivity {
  id: string; code: string; name: string; percent: number | null
  start: string | null; finish: string | null; delivery: boolean
  deliveryStatus: 'Delivered' | 'Forecast' | 'Requires confirmation'
}
export interface PhaseProgress {
  id: string; label: string; activities: PhaseActivity[]; deliveries: PhaseActivity[]
  eligible: number; reported: number; percent: number | null
  start: string | null; finish: string | null
}

// Read date-only values without timezone shifts.
export function phaseDate(value: unknown): string | null {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const date = match[0]
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date ? date : null
}

export function buildPhaseProgress(analysis: any) {
  const phases: PhaseProgress[] = PHASES.map(([id, label]) => ({
    id, label, activities: [], deliveries: [], eligible: 0, reported: 0,
    percent: null, start: null, finish: null,
  }))
  let unclassified = 0, excluded = 0, baselineProgress = 0, uncertain = 0
  const tasks: any[] = Object.values(analysis?.traceTasks || {})
  // The classifier uses name and milestone type. Repeated floor/unit activities
  // share those inputs, so classify them once per calculation.
  const classifications = new Map<string, ReturnType<typeof classifyActivity>>()
  const assignments = analysis?.projectDiscovery?.phaseAssignments
  const lowConfidence = new Set<string>(analysis?.projectDiscovery?.lowConfidencePhaseIds || [])
  const longLeadIds = new Set((analysis?.longLeadItems || []).map((t: any) => String(t.task_id)))
  for (const task of tasks) {
    const raw = task.phys_complete_pct
    const physicalSupported = analysis?.sourceFormat !== 'MS_PROJECT_XML' || task.complete_pct_type === 'Physical'
    const numeric = raw !== null && raw !== undefined && String(raw).trim() !== '' ? Number(raw) : NaN
    const percent = physicalSupported && Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null
    const actualStart = phaseDate(task.act_start_date), actualFinish = phaseDate(task.act_end_date)
    if ((percent !== null && percent > 0) || actualStart || actualFinish || ['TK_Active', 'TK_Complete'].includes(task.status_code)) baselineProgress++
    const classificationKey = JSON.stringify([task.task_name, task.task_type])
    let classification: Pick<ReturnType<typeof classifyActivity>, 'phase' | 'confidence'> | undefined = assignments && Object.prototype.hasOwnProperty.call(assignments, task.task_id)
      ? { phase: assignments[task.task_id] || undefined, confidence: { phase: lowConfidence.has(task.task_id) ? 'low' : 'high', discipline: 'none', system: 'none', stage: 'none' } }
      : classifications.get(classificationKey)
    if (!classification) {
      const computed = classifyActivity(task)
      classifications.set(classificationKey, computed)
      classification = computed
    }
    const phaseId = classification.phase === 'CLOSEOUT' ? 'STARTUP_COMMISSIONING' : classification.phase
    const phase = phases.find(p => p.id === phaseId)
    const name = String(task.task_name || '')
    const delivery = /deliver|delivery|receiv|shipment|ship to/i.test(name) &&
      (longLeadIds.has(String(task.task_id)) || phaseId === 'PROCUREMENT')
    const explicitSite = /(?:deliver\w*|receiv\w*)[^.]{0,35}(?:on[ -]?site|to (?:the )?site|at (?:the )?site)|(?:on[ -]?site|site)\s+delivery/i.test(name)
    const combined = /fabricat|manufactur|install|approv|submittal/i.test(name)
    const item: PhaseActivity = {
      id: String(task.task_id), code: String(task.task_code || task.task_id), name, percent,
      start: actualStart || phaseDate(task.early_start_date) || phaseDate(task.target_start_date),
      finish: actualFinish || phaseDate(task.early_end_date) || phaseDate(task.target_end_date),
      delivery, deliveryStatus: explicitSite && !combined ? actualFinish ? 'Delivered' : 'Forecast' : 'Requires confirmation',
    }
    if (delivery) (phase || phases[2]).deliveries.push(item)
    if (['TT_Mile', 'TT_FinMile', 'TT_StartMile', 'TT_LOE', 'TT_WBS', 'TT_Summary'].includes(task.task_type)) { excluded++; continue }
    if (!phase) { unclassified++; continue }
    if (classification.confidence.phase === 'low') uncertain++
    phase.activities.push(item)
    phase.eligible++
    if (percent !== null) phase.reported++
    if (item.start && (!phase.start || item.start < phase.start)) phase.start = item.start
    if (item.finish && (!phase.finish || item.finish > phase.finish)) phase.finish = item.finish
  }
  for (const phase of phases) {
    if (phase.reported) phase.percent = phase.activities.reduce((sum, t) => sum + (t.percent ?? 0), 0) / phase.reported
    phase.deliveries.sort((a, b) => (a.finish || '9999').localeCompare(b.finish || '9999'))
  }
  return { phases, unclassified, excluded, baselineProgress, uncertain, hasEvidence: tasks.length > 0 }
}
