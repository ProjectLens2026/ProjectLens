'use client';
import { useState } from 'react';
import type { ScheduleVersion } from '@/lib/projectStore';
import { cloudId } from '@/lib/controlWorkflow';
import { folderForVersion } from '@/lib/scheduleFolders';
import { FolderEdit, useScheduleFolders } from './ScheduleFoldersProvider';
import ScheduleFolderDialog from './ScheduleFolderDialog';
import WorkspaceMenu from './WorkspaceMenu';
export default function ScheduleVersionActions({ version, compact = false }: {
    version: ScheduleVersion;
    compact?: boolean;
}) {
    const state = useScheduleFolders(), [edit, setEdit] = useState<FolderEdit | null>(null);
    if (!state.library.can_edit || state.loading || state.error)
        return null;
    let id = '';
    try {
        id = cloudId(version.id);
    }
    catch {
        return null;
    }
    const folder = folderForVersion(state.library, id);
    return <><WorkspaceMenu label={`Actions for ${version.versionLabel || version.fileName}`} trigger={compact ? '⋯' : 'Organize…'} disabled={state.busy} className={compact ? 'shrink-0' : 'mt-1'}><button role="menuitem" type="button" onClick={() => setEdit({ action: 'move_version', id, parent: folder })} className="text-left p-2 text-xs">Move to folder…</button>{folder && <button role="menuitem" type="button" onClick={() => setEdit({ action: 'move_version', id, parent: null })} className="text-left p-2 text-xs">Remove from folder</button>}<button role="menuitem" type="button" onClick={() => setEdit({ action: 'archive_version', id })} className="text-left p-2 text-xs">Archive</button><button role="menuitem" type="button" onClick={() => setEdit({ action: 'trash_version', id })} className="text-left p-2 text-xs text-red-700">Delete…</button></WorkspaceMenu>{edit && <ScheduleFolderDialog edit={edit} onClose={() => setEdit(null)} label={version.versionLabel || version.fileName}/>}</>;
}
