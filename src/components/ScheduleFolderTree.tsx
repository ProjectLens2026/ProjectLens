'use client';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Folder, Files, Inbox, ChevronDown, ChevronRight } from 'lucide-react';
import { cloudId } from '@/lib/controlWorkflow';
import { filterFolderVersions, folderForVersion, orderedFolders, descendants } from '@/lib/scheduleFolders';
import { browserDate, scheduleDataDate } from '@/lib/versionBrowser';
import { PROJECT_TABS, workspaceTab } from '@/lib/projectWorkspace';
import { useProjectWorkspace } from './useProjectWorkspace';
import { useVersionNavigation } from './VersionNavigation';
import { FolderEdit, useScheduleFolders } from './ScheduleFoldersProvider';
import ScheduleFolderDialog from './ScheduleFolderDialog';
export default function ScheduleFolderTree({ dark = false }: {
    dark?: boolean;
}) {
    const { project, version } = useProjectWorkspace(), state = useScheduleFolders(), navigation = useVersionNavigation(), path = usePathname(), router = useRouter();
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set()), [edit, setEdit] = useState<FolderEdit | null>(null), [error, setError] = useState('');
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
    const row = (id: string, label: string, count: number, icon: React.ReactNode) => <button type="button" aria-current={state.scope === id ? 'page' : undefined} disabled={state.busy || navigation.opening} onClick={() => chooseFolder(id)} className={`flex items-center gap-2 w-full text-left rounded-lg p-2 pr-7 text-sm ${state.scope === id ? (dark ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-900') : (dark ? 'hover:bg-white/10' : 'hover:bg-slate-100')}`}>{icon}<span className="flex-1 min-w-0 break-words">{label}</span><small>{count}</small></button>;
    function branch(parent: string | null, seen = new Set<string>()): React.ReactNode {
        return orderedFolders(state.library.folders, parent).filter(f => !seen.has(f.id)).map(f => {
            const children = descendants(state.library.folders, f.id), count = versions.filter(v => children.has(versionFolder(v.id) || '')).length;
            if (state.query.trim() && !count)
                return null;
            const nested = new Set([...Array.from(seen), f.id]), closed = collapsed.has(f.id);
            return <div key={f.id}><div className="flex items-start gap-1"><button type="button" className="p-1 mt-1" aria-label={`${closed ? 'Expand' : 'Collapse'} ${f.name}`} aria-expanded={!closed} onClick={() => setCollapsed(prev => { const next = new Set(prev); next.has(f.id) ? next.delete(f.id) : next.add(f.id); return next; })}>{closed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}</button><div className="flex-1 min-w-0 relative">{row(f.id, f.name, count, <Folder size={15} className="shrink-0"/>)}{canEdit && <details className="absolute top-1 right-0 text-xs"><summary className="cursor-pointer list-none px-1 py-1 opacity-80" aria-label={`Actions for ${f.name}`}>⋯</summary><div className="absolute z-50 right-0 top-full w-44 flex flex-col gap-2 bg-white text-slate-800 border rounded p-2 my-1 shadow-lg">{[['create', 'New subfolder'], ['rename', 'Rename'], ['move_folder', 'Move…'], ['delete_folder', 'Delete folder']].map(([action, label]) => <button key={action} type="button" disabled={state.busy} className="p-1 hover:underline" onClick={() => setEdit(action === 'create' ? { action: 'create', parent: f.id } : { action: action as FolderEdit['action'], id: f.id })}>{label}</button>)}<button type="button" disabled={state.busy} onClick={() => void reorder(f.id, -1)} className="p-1">Move up</button><button type="button" disabled={state.busy} onClick={() => void reorder(f.id, 1)} className="p-1">Move down</button></div></details>}</div></div>{!closed && <div className={`ml-4 pl-2 border-l ${dark ? 'border-slate-600' : 'border-slate-200'}`}>{branch(f.id, nested)}{versions.filter(v => versionFolder(v.id) === f.id).map(v => <button key={v.id} type="button" aria-current={version?.id === v.id ? 'page' : undefined} disabled={navigation.opening || state.busy} onClick={() => openVersion(v.id)} className={`block w-full text-left p-2 rounded text-xs ${version?.id === v.id ? (dark ? 'bg-slate-700' : 'bg-blue-50') : ''}`}><span className="block break-words">{v.versionLabel || v.fileName}</span><span className="block opacity-75 mt-1">DD {scheduleDataDate(v) ? browserDate(scheduleDataDate(v)) : 'Not recorded'}</span><span className="block opacity-75 mt-1">Uploaded {v.uploadedAt ? browserDate(v.uploadedAt) : 'Not recorded'}</span></button>)}</div>}</div>;
        });
    }
    return <section data-navigation-controls aria-label="Project schedule folders"><label className="block text-xs mb-4">Find a schedule<input type="search" value={state.query} onChange={e => state.setQuery(e.target.value)} placeholder="Version, filename or data date" className="block w-full bg-white text-slate-900 rounded border p-2 mt-1"/></label><div className="flex justify-between items-center gap-2 mb-2"><h2 className="text-xs uppercase tracking-wide">Schedule folders</h2>{canEdit && <button aria-label="New schedule folder" type="button" disabled={state.busy} className="border rounded px-2 py-1" onClick={() => setEdit({ action: 'create', parent: !['all', 'unfiled'].includes(state.scope) ? state.scope : null })}>＋</button>}</div>{state.loading && <p role="status" className="text-xs my-2">Loading folders…</p>}{state.error && <div role="alert" className="text-xs my-2"><p>{state.error}</p><button type="button" className="underline mt-1" onClick={() => void state.reload()}>Reload folders</button></div>}{row('all', 'All schedules', versions.length, <Files size={15}/>)}{branch(null)}{row('unfiled', 'Unfiled', versions.filter(v => !versionFolder(v.id)).length, <Inbox size={15}/>)}<div className="ml-4 pl-2">{versions.filter(v => !versionFolder(v.id)).map(v => <button key={v.id} type="button" disabled={navigation.opening || state.busy} aria-current={version?.id === v.id ? 'page' : undefined} onClick={() => openVersion(v.id)} className={`block w-full text-left p-2 rounded text-xs ${version?.id === v.id ? (dark ? 'bg-slate-700' : 'bg-blue-50') : ''}`}><span className="block break-words">{v.versionLabel || v.fileName}</span><span className="block opacity-75 mt-1">DD {scheduleDataDate(v) ? browserDate(scheduleDataDate(v)) : 'Not recorded'}</span><span className="block opacity-75 mt-1">Uploaded {v.uploadedAt ? browserDate(v.uploadedAt) : 'Not recorded'}</span></button>)}</div>{!state.loading && !state.error && canEdit && <div className="space-y-2 mt-4"><button type="button" className="border rounded p-2 text-xs" disabled={state.busy} onClick={() => setEdit({ action: 'create' })}>＋ New folder</button>{!state.library.folders.length && <button type="button" className="block underline text-xs" onClick={() => setEdit({ action: 'initialize' })}>Create starter folders</button>}</div>}{error && <p role="alert" className="text-xs mt-3">{error}</p>}{edit && <ScheduleFolderDialog edit={edit} onClose={() => setEdit(null)}/>}</section>;
}
