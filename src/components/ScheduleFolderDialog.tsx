'use client';
import { useState } from 'react';
import { descendants, folderPath } from '@/lib/scheduleFolders';
import WorkspaceDialog from './WorkspaceDialog';
import { FolderEdit, useScheduleFolders } from './ScheduleFoldersProvider';
export default function ScheduleFolderDialog({ edit, onClose, label }: {
    edit: FolderEdit;
    onClose: () => void;
    label?: string;
}) {
    const folders = useScheduleFolders(), target = folders.library.folders.find(f => f.id === edit.id);
    const [name, setName] = useState(edit.name || target?.name || ''), [parent, setParent] = useState(edit.parent ?? target?.parent_id ?? ''), [error, setError] = useState('');
    const excluded = edit.action === 'move_folder' && edit.id ? descendants(folders.library.folders, edit.id) : new Set<string>();
    const title = ({ create: 'Create schedule folder', rename: 'Rename folder', move_folder: 'Move folder', delete_folder: 'Delete folder', move_version: 'Move schedule', trash_version: 'Delete schedule', archive_version: 'Archive schedule', initialize: 'Create starter folders', reorder: 'Reorder folder' })[edit.action];
    const deleting = ['delete_folder', 'trash_version', 'archive_version'].includes(edit.action);
    async function save(e: React.FormEvent) { e.preventDefault(); setError(''); try {
        await folders.mutate({ ...edit, name, parent: parent || null });
        onClose();
    }
    catch (e) {
        setError(String((e as any)?.message || e));
    } }
    return <WorkspaceDialog title={title} busy={folders.busy} onClose={onClose}><form onSubmit={save} className="space-y-4" data-navigation-controls>{label && <p className="text-sm break-all">{label}</p>}{['create', 'rename'].includes(edit.action) && <label className="block text-sm">Folder name<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"/></label>}{['create', 'move_folder', 'move_version'].includes(edit.action) && <label className="block text-sm">{edit.action === 'move_version' ? 'Destination folder' : 'Under'}<select aria-label="Destination folder" value={parent} onChange={e => setParent(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"><option value="">{edit.action === 'move_version' ? 'Unfiled' : 'Project root'}</option>{folders.library.folders.filter(f => !excluded.has(f.id)).map(f => <option key={f.id} value={f.id}>{folderPath(folders.library.folders, f.id)}</option>)}</select></label>}{edit.action === 'delete_folder' && <p className="text-sm text-slate-600">Schedules and subfolders will move to the parent folder. No XER files will be deleted. Conflicting folder names must be resolved first.</p>}{edit.action === 'trash_version' && <p className="text-sm text-slate-600">This moves the submission to Deleted items. Its source XER and history are retained. An assigned baseline or control update cannot be deleted.</p>}{edit.action === 'archive_version' && <p className="text-sm text-slate-600">The submission will be retained in Archive and can be restored. Assigned control references cannot be archived.</p>}{edit.action === 'move_version' && <p className="text-sm text-slate-600">This changes filing only. The source file, data date, review history and control assignments stay unchanged.</p>}{edit.action === 'initialize' && <p className="text-sm text-slate-600">Create Baseline Schedules, Update Schedules and Recovery / Revisions. Existing active versions will be filed by their recorded submission type. Unspecified types stay Unfiled.</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<footer className="flex justify-end gap-3"><button type="button" disabled={folders.busy} onClick={onClose} className="border rounded-lg p-2">Cancel</button><button type="submit" disabled={folders.busy || (['create', 'rename'].includes(edit.action) && !name.trim())} className={`rounded-lg p-2 text-white disabled:opacity-50 ${deleting ? 'bg-red-700' : 'bg-blue-600'}`}>{folders.busy ? 'Saving…' : deleting ? 'Confirm' : edit.action === 'initialize' ? 'Create starter folders' : 'Save'}</button></footer></form></WorkspaceDialog>;
}
