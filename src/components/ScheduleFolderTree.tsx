'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Folder, Files, Inbox, ChevronDown, ChevronRight } from 'lucide-react';
import { cloudId } from '@/lib/controlWorkflow';
import type { ScheduleVersion } from '@/lib/projectStore';
import { filterFolderVersions, folderForVersion, orderedFolders, descendants } from '@/lib/scheduleFolders';
import { browserDate, scheduleDataDate } from '@/lib/versionBrowser';
import { PROJECT_TABS, workspaceTab } from '@/lib/projectWorkspace';
import { useProjectWorkspace } from './useProjectWorkspace';
import { useVersionNavigation } from './VersionNavigation';
import { FolderEdit, useScheduleFolders } from './ScheduleFoldersProvider';
import ScheduleFolderDialog from './ScheduleFolderDialog';
import ScheduleVersionActions from './ScheduleVersionActions';
import WorkspaceMenu from './WorkspaceMenu';
export default function ScheduleFolderTree({ dark = false }: {
    dark?: boolean;
}) {
    const { project, version } = useProjectWorkspace(), state = useScheduleFolders(), navigation = useVersionNavigation(), path = usePathname(), router = useRouter();
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set()), [edit, setEdit] = useState<FolderEdit | null>(null), [error, setError] = useState('');
    useEffect(() => { if (['all', 'unfiled'].includes(state.scope))
        return; setCollapsed(previous => { const next = new Set(previous), seen = new Set<string>(); let current = state.library.folders.find(f => f.id === state.scope); while (current && !seen.has(current.id)) {
        seen.add(current.id);
        next.delete(current.id);
        current = state.library.folders.find(f => f.id === current?.parent_id);
    } return next.size === previous.size ? previous : next; }); }, [state.scope, state.library.folders]);
    if (!project)
        return <p className="p-3 text-sm">Choose a project from Portfolio.</p>;
    const versions = filterFolderVersions(project.versions || [], state.library, 'all', state.query, state.sort, cloudId);
    const versionFolder = (id: string) => { try {
        return folderForVersion(state.library, cloudId(id));
    }
    catch {
        return null;
    } };
    const canEdit = state.library.can_edit && !state.loading && !state.error;
    function chooseFolder(id: string) { state.setScope(id); if (path !== '/dashboard/schedules') {
        if (version)
            navigation.request(project.id, version.id, '/dashboard/schedules');
        else
            router.push('/dashboard/schedules');
    } }
    function openVersion(id: string) { const tab = workspaceTab(path); navigation.request(project.id, id, PROJECT_TABS.find(t => t.label === tab)?.href || '/dashboard/schedules'); }
    async function reorder(id: string, direction: number) { setError(''); try {
        await state.mutate({ action: 'reorder', id, direction });
    }
    catch (e) {
        setError(String((e as any)?.message || e));
    } }
    const row = (id: string, label: string, count: number, icon: React.ReactNode) => <button type="button" aria-current={state.scope === id ? 'page' : undefined} disabled={state.busy || navigation.opening} onClick={() => chooseFolder(id)} className={`flex items-center gap-2 w-full text-left rounded-lg p-2 text-sm ${state.scope === id ? (dark ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-900') : (dark ? 'hover:bg-white/10' : 'hover:bg-slate-100')}`}>{icon}<span className="flex-1 min-w-0 break-words">{label}</span><small>{count}</small></button>;
    const versionRow = (v: ScheduleVersion) => <div key={v.id} className={`flex items-start rounded ${version?.id === v.id ? (dark ? 'bg-slate-700' : 'bg-blue-50') : ''}`}><button type="button" aria-current={version?.id === v.id ? 'page' : undefined} disabled={navigation.opening || state.busy} onClick={() => openVersion(v.id)} className="flex-1 min-w-0 text-left p-2 text-xs"><span className="block break-words">{v.versionLabel || v.fileName}</span><span className="block opacity-75 mt-1">DD {scheduleDataDate(v) ? browserDate(scheduleDataDate(v)) : 'Not recorded'}</span><span className="block opacity-75 mt-1">Uploaded {v.uploadedAt ? browserDate(v.uploadedAt) : 'Not recorded'}</span></button><ScheduleVersionActions version={v} compact/></div>;
    function branch(parent: string | null, seen = new Set<string>()): React.ReactNode {
        return orderedFolders(state.library.folders, parent).filter(f => !seen.has(f.id)).map(f => {
            const children = descendants(state.library.folders, f.id), count = versions.filter(v => children.has(versionFolder(v.id) || '')).length;
            if (state.query.trim() && !count)
                return null;
            const nested = new Set([...Array.from(seen), f.id]), closed = collapsed.has(f.id);
            return <div key={f.id}><div className="flex items-start gap-1"><button type="button" className="p-1 mt-1" aria-label={`${closed ? 'Expand' : 'Collapse'} ${f.name}`} aria-expanded={!closed} onClick={() => setCollapsed(prev => { const next = new Set(prev); next.has(f.id) ? next.delete(f.id) : next.add(f.id); return next; })}>{closed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}</button><div className="flex-1 min-w-0">{row(f.id, f.name, count, <Folder size={15} className="shrink-0"/>)}</div>{canEdit && <WorkspaceMenu label={`Actions for ${f.name}`} disabled={state.busy}><button role="menuitem" type="button" onClick={() => setEdit({ action: 'create', parent: f.id })} className="text-left p-2 text-xs">New subfolder</button>{[['rename', 'Rename'], ['move_folder', 'Move…'], ['delete_folder', 'Delete folder']].map(([action, label]) => <button role="menuitem" key={action} type="button" onClick={() => setEdit({ action: action as FolderEdit['action'], id: f.id })} className="text-left p-2 text-xs">{label}</button>)}<button role="menuitem" type="button" onClick={() => void reorder(f.id, -1)} className="text-left p-2 text-xs">Move up</button><button role="menuitem" type="button" onClick={() => void reorder(f.id, 1)} className="text-left p-2 text-xs">Move down</button></WorkspaceMenu>}</div>{!closed && <div className={`ml-4 pl-2 border-l ${dark ? 'border-slate-600' : 'border-slate-200'}`}>{branch(f.id, nested)}{versions.filter(v => versionFolder(v.id) === f.id).map(versionRow)}</div>}</div>;
        });
    }
    return <section data-navigation-controls aria-label="Project schedule folders"><label className="block text-xs mb-4">Find a schedule<input type="search" value={state.query} onChange={e => state.setQuery(e.target.value)} placeholder="Version, filename or data date" className="block w-full bg-white text-slate-900 rounded border p-2 mt-1"/></label><div className="flex justify-between items-center gap-2 mb-2"><h2 className="text-xs uppercase tracking-wide">Schedule folders</h2>{canEdit && <button aria-label="New schedule folder" type="button" disabled={state.busy} className="border rounded px-2 py-1" onClick={() => setEdit({ action: 'create', parent: !['all', 'unfiled'].includes(state.scope) ? state.scope : null })}>＋</button>}</div>{state.loading && <p role="status" className="text-xs my-2">Loading folders…</p>}{state.error && <p role="alert" className="text-xs my-2">{state.error}</p>}{row('all', 'All schedules', versions.length, <Files size={15}/>)}{branch(null)}{!state.loading && !state.error && <>{row('unfiled', 'Unfiled', versions.filter(v => !versionFolder(v.id)).length, <Inbox size={15}/>)}<div className="ml-4 pl-2">{versions.filter(v => !versionFolder(v.id)).map(versionRow)}</div></>}{canEdit && <div className="space-y-2 mt-4"><button type="button" className="border rounded p-2 text-xs" disabled={state.busy} onClick={() => setEdit({ action: 'create' })}>＋ New folder</button>{!state.library.folders.length && <button type="button" className="block underline text-xs" onClick={() => setEdit({ action: 'initialize' })}>Create starter folders</button>}</div>}<button type="button" className="text-xs underline mt-3" disabled={state.loading || state.busy} onClick={() => void state.reload()}>Reload folders</button>{error && <p role="alert" className="text-xs mt-3">{error}</p>}{edit && <ScheduleFolderDialog edit={edit} onClose={() => setEdit(null)}/>}</section>;
}
