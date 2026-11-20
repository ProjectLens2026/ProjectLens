import type { ScheduleVersion } from './projectStore';
import { compareScheduleVersions, scheduleDataDate } from './versionBrowser';
export interface ScheduleFolder {
    id: string;
    project_id: string;
    parent_id: string | null;
    name: string;
    sort_order: number;
}
export interface ScheduleFiling {
    version_id: string;
    project_id: string;
    folder_id: string | null;
}
export interface ScheduleLibrary {
    revision: number;
    can_edit: boolean;
    folders: ScheduleFolder[];
    filing: ScheduleFiling[];
}
export type LibraryAction = 'initialize' | 'create' | 'rename' | 'move_folder' | 'delete_folder' | 'reorder' | 'move_version' | 'trash_version' | 'archive_version';
export type FolderSort = 'newest' | 'oldest' | 'name';
export const emptyLibrary = (): ScheduleLibrary => ({ revision: 0, can_edit: false, folders: [], filing: [] });
export function descendants(folders: ScheduleFolder[], id: string): Set<string> {
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const f of folders)
            if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
                ids.add(f.id);
                changed = true;
            }
    }
    return ids;
}
export function folderPath(folders: ScheduleFolder[], id: string | null | undefined): string {
    if (!id)
        return 'Unfiled';
    const names: string[] = [], seen = new Set<string>();
    let current = folders.find(f => f.id === id);
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        names.unshift(current.name);
        current = folders.find(f => f.id === current?.parent_id);
    }
    return names.join(' / ') || 'Unfiled';
}
export function orderedFolders(folders: ScheduleFolder[], parent: string | null): ScheduleFolder[] { return folders.filter(f => f.parent_id === parent).sort((a, b) => a.sort_order - b.sort_order || a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id)); }
export function folderForVersion(library: ScheduleLibrary, versionId: string): string | null { return library.filing.find(f => f.version_id === versionId)?.folder_id || null; }
export function filterFolderVersions(versions: ScheduleVersion[], library: ScheduleLibrary, scope: string, query: string, sort: FolderSort, idFor: (id: string) => string): ScheduleVersion[] {
    const ids = scope === 'all' ? null : scope === 'unfiled' ? new Set<string | null>([null]) : descendants(library.folders, scope);
    return versions.filter(v => !v.deletedAt && !v.archivedAt).filter(v => {
        let id = '';
        try {
            id = idFor(v.id);
        }
        catch { }
        return (!ids || ids.has(folderForVersion(library, id))) && `${v.fileName} ${v.versionLabel || ''} ${v.scheduleType || ''} ${scheduleDataDate(v)}`.toLowerCase().includes(query.trim().toLowerCase());
    }).sort((a, b) => sort === 'name' ? (a.versionLabel || a.fileName).localeCompare(b.versionLabel || b.fileName) : sort === 'oldest' ? (scheduleDataDate(a) && scheduleDataDate(b) ? compareScheduleVersions(b, a) : compareScheduleVersions(a, b)) : compareScheduleVersions(a, b));
}
export function validLibrary(value: any): value is ScheduleLibrary {
    return !!value && Number.isInteger(value.revision) && Array.isArray(value.folders) && Array.isArray(value.filing) && typeof value.can_edit === 'boolean';
}
