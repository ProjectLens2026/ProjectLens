import { createClient } from './supabase/client';
import { cloudId } from './controlWorkflow';
import { validLibrary } from './scheduleFolders';
export interface UploadTarget {
    projectId: string;
    versionId: string;
    folderId: string | null;
}
export function scheduleUploadUrl(projectId: string, scope: string): string { return '/dashboard/upload?' + new URLSearchParams({ mode: 'existing', project: projectId, folder: scope === 'all' || scope === 'unfiled' ? '' : scope }).toString(); }
export function uploadReturnPath(projectId: string, folderId: string | null): string { return '/dashboard/schedules?' + new URLSearchParams({ project: cloudId(projectId), folder: folderId || 'unfiled' }).toString(); }
/** Called after cloud saving, or to retry filing the SAME version. Never inserts another version. */
export async function completeUploadDestination(target: UploadTarget): Promise<string> {
    const db = createClient(), project = cloudId(target.projectId), version = cloudId(target.versionId);
    const { data: row, error: readError } = await db.from('schedule_versions').select('id,project_id,raw_xer_path,analysis_path').eq('id', version).eq('project_id', project).maybeSingle();
    if (readError)
        throw Error(readError.message);
    if (!row?.raw_xer_path || !row.analysis_path)
        throw Error('The original source and analysis have not both finished saving. The schedule has not been filed. Keep this page open and retry verification.');
    const { data: state, error: stateError } = await db.rpc('cpmr_schedule_library_state', { p_project: project });
    if (stateError)
        throw Error(stateError.message);
    if (!validLibrary(state))
        throw Error('Folder records are unavailable. The schedule is saved; retry filing when folder access is restored.');
    if (target.folderId && !state.folders.some(f => f.id === target.folderId))
        throw Error('The destination folder no longer exists. Choose another folder and retry filing.');
    const { data, error } = await db.rpc('cpmr_schedule_library_action', { p_project: project, p_action: 'move_version', p_id: version, p_parent: target.folderId, p_name: '', p_direction: 0, p_expected: state.revision });
    if (error)
        throw Error(error.message);
    if (!validLibrary(data) || !data.filing.some(f => f.version_id === version && f.folder_id === target.folderId))
        throw Error('Folder placement could not be verified. Retry filing this submission; do not upload another copy.');
    return uploadReturnPath(target.projectId, target.folderId);
}
