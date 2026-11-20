'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cloudId } from '@/lib/controlWorkflow';
import { ensureWorkspaceProject, getActiveVersion, loadVersionAnalysis } from '@/lib/projectStore';
import { emptyLibrary, validLibrary, ScheduleLibrary, LibraryAction, FolderSort } from '@/lib/scheduleFolders';
import { useProjectWorkspace } from './useProjectWorkspace';
export interface FolderEdit {
    action: LibraryAction;
    id?: string;
    parent?: string | null;
    name?: string;
    direction?: number;
}
interface ContextValue {
    library: ScheduleLibrary;
    loading: boolean;
    busy: boolean;
    error: string;
    scope: string;
    query: string;
    sort: FolderSort;
    setScope: (v: string) => void;
    setQuery: (v: string) => void;
    setSort: (v: FolderSort) => void;
    reload: () => Promise<void>;
    mutate: (edit: FolderEdit) => Promise<void>;
}
const Context = createContext<ContextValue | null>(null);
export function useScheduleFolders() { const v = useContext(Context); if (!v)
    throw Error('Schedule folder provider missing'); return v; }
export default function ScheduleFoldersProvider({ children }: {
    children: React.ReactNode;
}) {
    const { project } = useProjectWorkspace(), path = usePathname(), projectId = path === '/dashboard/workspace' ? undefined : project?.id;
    const [state, setState] = useState<{
        projectId?: string;
        library: ScheduleLibrary;
        loading: boolean;
        error: string;
    }>({ library: emptyLibrary(), loading: false, error: '' });
    const [busy, setBusy] = useState(false), [view, setView] = useState<{
        projectId?: string;
        scope: string;
        query: string;
        sort: FolderSort;
    }>({ scope: 'all', query: '', sort: 'newest' });
    const generation = useRef(0), writeLock = useRef(false), active = useRef(projectId);
    active.current = projectId;
    const epoch = useRef({ projectId, value: 0 });
    if (epoch.current.projectId !== projectId)
        epoch.current = { projectId, value: epoch.current.value + 1 };
    const reload = useCallback(async () => {
        const ticket = ++generation.current;
        if (!projectId) {
            setState({ library: emptyLibrary(), loading: false, error: '' });
            return;
        }
        setState(s => ({ projectId, library: s.projectId === projectId ? s.library : emptyLibrary(), loading: true, error: '' }));
        try {
            const { data, error } = await createClient().rpc('cpmr_schedule_library_state', { p_project: cloudId(projectId) });
            if (error)
                throw Error(error.message || 'The server rejected the folder operation.');
            if (!validLibrary(data))
                throw Error('Project folder records are unavailable or access was denied.');
            if (ticket === generation.current && active.current === projectId)
                setState({ projectId, library: data, loading: false, error: '' });
        }
        catch (e) {
            if (ticket === generation.current && active.current === projectId)
                setState({ projectId, library: emptyLibrary(), loading: false, error: 'Folders could not be loaded. Apply the schedule-folders migration or check project access. ' + String((e as any)?.message || e) });
        }
    }, [projectId]);
    useEffect(() => { writeLock.current = false; setBusy(false); setView({ projectId, scope: 'all', query: '', sort: 'newest' }); void reload(); return () => { generation.current++; }; }, [projectId, reload]);
    const current = state.projectId === projectId ? state : { projectId, library: emptyLibrary(), loading: !!projectId, error: '' };
    const visibleView = view.projectId === projectId ? view : { projectId, scope: 'all', query: '', sort: 'newest' as FolderSort };
    const changeView = (patch: Partial<typeof view>) => setView(v => ({ ...((v.projectId === projectId) ? v : { projectId, scope: 'all', query: '', sort: 'newest' }), ...patch }));
    async function mutate(edit: FolderEdit) {
        if (!projectId || current.loading || current.error || !current.library.can_edit)
            throw Error('Folder editing is unavailable for this project.');
        if (writeLock.current)
            throw Error('A folder change is already being saved.');
        writeLock.current = true;
        setBusy(true);
        const source = projectId, sourceEpoch = epoch.current.value;
        try {
            const { data, error } = await createClient().rpc('cpmr_schedule_library_action', { p_project: cloudId(source), p_action: edit.action, p_id: edit.id || null, p_parent: edit.parent || null, p_name: edit.name || '', p_direction: edit.direction || 0, p_expected: current.library.revision });
            if (error)
                throw Error(error.message || 'The server rejected the folder operation.');
            if (!validLibrary(data))
                throw Error('The folder change could not be verified. Reload before retrying.');
            if (active.current !== source || epoch.current.value !== sourceEpoch)
                return;
            generation.current++;
            setState({ projectId: source, library: data, loading: false, error: '' });
            if (edit.action === 'create') {
                const added = data.folders.find(f => !current.library.folders.some(old => old.id === f.id));
                if (added)
                    changeView({ scope: added.id, query: '' });
            }
            if (edit.action === 'delete_folder' && visibleView.scope === edit.id)
                changeView({ scope: 'all' });
            if (edit.action === 'trash_version' || edit.action === 'archive_version') {
                try {
                    const refreshed = await ensureWorkspaceProject(cloudId(source));
                    if (active.current === source && epoch.current.value === sourceEpoch) {
                        const next = getActiveVersion(refreshed);
                        if (next && next.analysisState !== 'loaded' && !await loadVersionAnalysis(next.id)) throw Error('Next schedule could not be loaded.');
                    }
                }
                catch {
                    if (active.current === source && epoch.current.value === sourceEpoch)
                        setState(s => ({ ...s, error: 'The change was saved. Reload the page to refresh schedule data.' }));
                }
            }
        }
        finally {
            if (active.current === source && epoch.current.value === sourceEpoch) {
                writeLock.current = false;
                setBusy(false);
            }
        }
    }
    return <Context.Provider value={{ ...current, ...visibleView, busy, scope: visibleView.scope, query: visibleView.query, sort: visibleView.sort, setScope: scope => changeView({ scope }), setQuery: query => changeView({ query }), setSort: sort => changeView({ sort }), reload, mutate }}>{children}</Context.Provider>;
}
