'use client';
import { useState } from 'react';
import type { ScheduleVersion } from '@/lib/projectStore';
import { cloudId } from '@/lib/controlWorkflow';
import { folderForVersion } from '@/lib/scheduleFolders';
import { FolderEdit, useScheduleFolders } from './ScheduleFoldersProvider';
import ScheduleFolderDialog from './ScheduleFolderDialog';
import WorkspaceMenu from './WorkspaceMenu';
export default function ScheduleVersionActions({ version, compact = false, onDownload, downloadBusy = false }: {
    version: ScheduleVersion;
    compact?: boolean;
    onDownload?: () => void;
    downloadBusy?: boolean;
}) {
    const state = useScheduleFolders(), [edit, setEdit] = useState<FolderEdit | null>(null);
    let id = '';
    try { id = cloudId(version.id); } catch { }
    const canOrganize = state.library.can_edit && !state.loading && !state.error && Boolean(id);
    if (!canOrganize && !onDownload) return null;
    const folder = id ? folderForVersion(state.library, id) : null;
    return <><WorkspaceMenu label={`Actions for ${version.versionLabel || version.fileName}`} trigger={compact ? '⋯' : 'Organize…'} disabled={state.busy} className={compact ? 'shrink-0' : 'mt-1'}>
      {onDownload && <button role="menuitem" type="button" disabled={downloadBusy} onClick={onDownload} className="text-left p-2 text-xs">{downloadBusy ? 'Downloading…' : 'Download original'}</button>}
      {canOrganize && <><button role="menuitem" type="button" onClick={() => setEdit({ action: 'move_version', id, parent: folder })} className="text-left p-2 text-xs">Move to folder…</button>{folder && <button role="menuitem" type="button" onClick={() => setEdit({ action: 'move_version', id, parent: null })} className="text-left p-2 text-xs">Remove from folder</button>}<button role="menuitem" type="button" onClick={() => setEdit({ action: 'archive_version', id })} className="text-left p-2 text-xs">Archive</button><button role="menuitem" type="button" onClick={() => setEdit({ action: 'trash_version', id })} className="text-left p-2 text-xs text-red-700">Delete…</button></>}
    </WorkspaceMenu>{edit && <ScheduleFolderDialog edit={edit} onClose={() => setEdit(null)} label={version.versionLabel || version.fileName}/>}</>;
}
