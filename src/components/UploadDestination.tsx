'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cloudId } from '@/lib/controlWorkflow';
import { folderPath, ScheduleFolder, validLibrary } from '@/lib/scheduleFolders';
export interface UploadFolderChoice {
    projectId: string;
    folderId: string | null;
    ready: boolean;
}
export default function UploadDestination({ projectId, requestedProject = '', requestedFolder = '', onChange }: {
    projectId: string;
    requestedProject?: string;
    requestedFolder?: string;
    onChange: (value: UploadFolderChoice) => void;
}) {
    const [state, setState] = useState<{
        scope: string;
        folders: ScheduleFolder[];
        selected: string;
        loading: boolean;
        error: string;
    }>({ scope: '', folders: [], selected: '', loading: true, error: '' }), [reload, setReload] = useState(0), callback = useRef(onChange);
    callback.current = onChange;
    useEffect(() => { let alive = true; callback.current({ projectId, folderId: null, ready: false }); setState({ scope: projectId, folders: [], selected: '', loading: true, error: '' }); void (async () => { try {
        const { data, error } = await createClient().rpc('cpmr_schedule_library_state', { p_project: cloudId(projectId) });
        if (error)
            throw Error(error.message);
        if (!validLibrary(data) || !data.can_edit)
            throw Error('Folder access is unavailable for this project.');
        let same = false;
        try {
            same = cloudId(projectId) === cloudId(requestedProject);
        }
        catch { }
        ;
        const target = same ? requestedFolder : '';
        const invalid = !!target && !data.folders.some(f => f.id === target);
        if (alive) {
            setState({ scope: projectId, folders: data.folders, selected: invalid ? '__missing__' : target, loading: false, error: invalid ? 'The requested folder no longer exists. Choose a destination.' : '' });
            callback.current({ projectId, folderId: target || null, ready: !invalid });
        }
    }
    catch (e) {
        if (alive)
            setState({ scope: projectId, folders: [], selected: '', loading: false, error: String((e as any)?.message || e) });
    } })(); return () => { alive = false; }; }, [projectId, requestedProject, requestedFolder, reload]);
    const current = state.scope === projectId ? state : { scope: projectId, folders: [], selected: '', loading: true, error: '' };
    return <section className="border rounded-xl bg-white p-4 my-4" data-navigation-controls><label className="block text-sm font-semibold">Upload destination<select aria-label="Upload destination folder" value={current.selected} disabled={current.loading || (!current.folders.length && !!current.error && current.selected !== '__missing__')} onChange={e => { setState(s => ({ ...s, selected: e.target.value, error: '' })); callback.current({ projectId, folderId: e.target.value || null, ready: true }); }} className="block w-full border rounded-lg p-2 mt-2"><option value="">Unfiled</option>{current.selected === '__missing__' && <option value="__missing__" disabled>Choose a destination</option>}{current.folders.map(f => <option key={f.id} value={f.id}>{folderPath(current.folders, f.id)}</option>)}</select></label>{current.loading && <p className="text-xs mt-2" role="status">Loading folders…</p>}{current.error && <p role="alert" className="text-sm text-red-700 mt-2">{current.error}</p>}<button type="button" disabled={current.loading} className="text-xs underline text-blue-700 mt-2" onClick={() => setReload(v => v + 1)}>Reload folders</button></section>;
}
