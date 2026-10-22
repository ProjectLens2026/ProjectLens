const normalized = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

export function taskIdentity(task: any): string {
  return String(task?.task_id || task?.id || task?.task_code || '')
}

export function taskFinishDate(task: any): string | undefined {
  const complete = String(task?.status_code || '') === 'TK_Complete'
  return (complete ? task?.act_end_date : undefined)
    || task?.early_end_date
    || task?.target_end_date
    || task?.late_end_date
    || task?.act_end_date
    || undefined
}

export function isScheduleMilestone(task: any): boolean {
  return /MILE/.test(normalized(task?.task_type))
}

function completionRank(task: any): number {
  if (!isScheduleMilestone(task)) return 0
  const text = normalized(`${task?.task_code || ''} ${task?.task_name || task?.name || ''}`)
  if (/FINAL COMPLETION/.test(text)) return 100
  if (/END PROJECT|PROJECT END|PROJECT COMPLETE|PROJECT COMPLETION/.test(text)) return 90
  if (/CONTRACT COMPLETION/.test(text)) return 80
  if (/FINAL ACCEPTANCE/.test(text)) return 70
  return 0
}

/**
 * Finds the explicit milestone that closes the construction CPM network.
 * Administrative term, retainage, final-payment and document-closeout dates
 * are deliberately excluded from the project completion target.
 */
export function detectFinalCompletionTarget(tasks: any[]): { task: any; date?: string } | null {
  const ranked = tasks
    .map(task => ({ task, rank: completionRank(task), date: taskFinishDate(task) }))
    .filter(item => item.rank > 0)
    .sort((a, b) => b.rank - a.rank || String(b.date || '').localeCompare(String(a.date || '')))
  return ranked[0] ? { task: ranked[0].task, date: ranked[0].date } : null
}

export function isAdministrativeTermMilestone(task: any): boolean {
  if (!isScheduleMilestone(task)) return false
  const text = normalized(`${task?.task_code || ''} ${task?.task_name || task?.name || ''}`)
  return /ADMINISTRATIVE TERM|ADMIN TERM|CONTRACT ADMINISTRATION END/.test(text)
}

export function isPostCompletionAdministrativeWork(task: any): boolean {
  const text = normalized(`${task?.task_code || ''} ${task?.task_name || task?.name || ''} ${(task?.wbs_path || []).join(' ')}`)
  return /ADMINISTRATIVE TERM|ADMIN TERM|FINAL INVOICE|FINAL BILL|FINAL PAYMENT|RELEASE (OF )?RETAINAGE|RETAINAGE RELEASE|CLOSEOUT DOCUMENT|CLOSE OUT DOCUMENT|FINAL CLOSEOUT DOCUMENT|DOCUMENT REVIEW|DOCUMENT ACCEPTANCE/.test(text)
}
