'use client';
import { useState } from 'react';
import type { ScheduleVersion } from '@/lib/projectStore';
import { cloudId } from '@/lib/controlWorkflow';
import { folderForVersion } from '@/lib/scheduleFolders';
import { FolderEdit, useScheduleFolders } from './ScheduleFoldersProvider';
import ScheduleFolderDialog from './ScheduleFolderDialog';
export default function ScheduleVersionActions({ version }: {
    version: ScheduleVersion;
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
    return <><details className="text-xs mt-2"><summary className="cursor-pointer text-blue-700">Organize…</summary><div className="flex flex-col gap-2 p-2 border rounded bg-white mt-1">{[['move_version', 'Move to folder…'], ['archive_version', 'Archive'], ['trash_version', 'Delete…']].map(([action, label]) => <button key={action} type="button" disabled={state.busy} onClick={() => setEdit({ action: action as FolderEdit['action'], id, parent: folderForVersion(state.library, id) })} className="text-left">{label}</button>)}</div></details>{edit && <ScheduleFolderDialog edit={edit} onClose={() => setEdit(null)} label={version.versionLabel || version.fileName}/>}</>;
}
