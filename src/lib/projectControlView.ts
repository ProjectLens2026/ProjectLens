import { displayScheduleDate } from './activityNetwork';
import { scheduleDay, sourceDataDate } from './scheduleStatistics';
/** Source-reported status counts, never weighted physical progress. */
export function projectPulse(analysis: any) {
    const available = !!analysis?.traceTasks && typeof analysis.traceTasks === 'object';
    const tasks = (available ? Object.values(analysis.traceTasks) : []) as any[];
    const complete = tasks.filter(t => t.status_code === 'TK_Complete').length;
    const active = tasks.filter(t => t.status_code === 'TK_Active').length;
    return { available, tasks, total: tasks.length, complete, active,
        remaining: tasks.length - complete, date: sourceDataDate(analysis || {}) };
}
/** The selected XER forecast window, not field commitments or a CPM recalculation. */
export function lookAhead(analysis: any, days = 7) {
    const pulse = projectPulse(analysis);
    if (!pulse.available)
        return { rows: [], from: '', to: '', error: 'Detailed activity data is unavailable.' };
    if (!pulse.date)
        return { rows: [], from: '', to: '', error: 'The source data date is unavailable.' };
    const end = new Date(pulse.date + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + days);
    const to = end.toISOString().slice(0, 10);
    const rows = pulse.tasks.filter(t => {
        if (t.status_code === 'TK_Complete')
            return false;
        const start = scheduleDay(t.early_start_date || (t.status_code === 'TK_Active' ? t.act_start_date : ''));
        const finish = scheduleDay(t.early_end_date);
        return start && finish && start <= finish && start <= to && finish >= pulse.date;
    }).sort((a, b) => String(a.early_end_date || '').localeCompare(String(b.early_end_date || ''))
        || String(a.task_code || '').localeCompare(String(b.task_code || '')));
    return { rows, from: pulse.date, to, error: '' };
}
/** Project longest-path flags alone cannot establish a specific turnover driver. */
export function scheduleAnswer(question: string, analysis: any, file: string) {
    const p = projectPulse(analysis);
    const prefix = `Source: ${file} · DD ${displayScheduleDate(p.date)}. `;
    const text = question.toLowerCase();
    if (!p.available)
        return prefix + 'Activity data is not loaded.';
    if (/progress|complete|status/.test(text)) {
        return prefix + `${p.complete} of ${p.total} activities are reported complete; ${p.active} are in progress. These are activity counts, not weighted physical progress or field verification.`;
    }
    if (/next|week|look.?ahead/.test(text)) {
        const look = lookAhead(analysis);
        return prefix + (look.error || `${look.rows.length} incomplete activities have source forecast dates overlapping the next seven calendar days. Review Weekly Control for their IDs and dates. These are planned activities, not confirmed crew commitments.`);
    }
    if (/pfho|h2c|hold|driv|critical/.test(text)) {
        const candidates = p.tasks.filter(t => t.driving_path_flag === 'Y' && t.status_code !== 'TK_Complete');
        return prefix + (candidates.length
            ? `P6 flags ${candidates.length} incomplete activities on its project longest path, including ${candidates.slice(0, 4).map(t => t.task_code).join(', ')}. `
            : 'No current project longest-path flags are available. ')
            + 'A target-specific driver is not established by these flags alone. Select the turnover in Phase Readiness and inspect its backward relationships and open technical items.';
    }
    return prefix + 'I can answer progress, next-week work and path-evidence questions from the loaded XER. Approval decisions and costs require their recorded sources.';
}
