'use client';
import { useEffect, useRef, useState } from 'react';
import { loadPortfolioProjectDetails, savePortfolioProjectDetails, PortfolioProjectDetails } from '@/lib/portfolioEditing';
import WorkspaceDialog from './WorkspaceDialog';
export default function PortfolioEditProject({ projectId, onSaved, label = 'Edit project' }: {
    projectId: string;
    onSaved: () => void;
    label?: string;
}) {
    const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [original, setOriginal] = useState<PortfolioProjectDetails | null>(null), [form, setForm] = useState<PortfolioProjectDetails | null>(null), sequence = useRef(0), lock = useRef(false);
    useEffect(() => () => { sequence.current++; }, [projectId]);
    async function load() { const ticket = ++sequence.current; setLoading(true); setError(''); setOriginal(null); setForm(null); try {
        const data = await loadPortfolioProjectDetails(projectId);
        if (ticket === sequence.current) {
            setOriginal(data);
            setForm({ ...data });
        }
    }
    catch (e) {
        if (ticket === sequence.current)
            setError(String((e as any)?.message || e));
    }
    finally {
        if (ticket === sequence.current)
            setLoading(false);
    } }
    function close() { if (busy)
        return; sequence.current++; setOpen(false); }
    async function save(e: React.FormEvent) { e.preventDefault(); if (!form || !original || lock.current)
        return; const ticket = sequence.current; lock.current = true; setBusy(true); setError(''); try {
        await savePortfolioProjectDetails(original, form);
        if (ticket === sequence.current) {
            setOpen(false);
            onSaved();
        }
    }
    catch (e) {
        if (ticket === sequence.current)
            setError(String((e as any)?.message || e));
    }
    finally {
        lock.current = false;
        if (ticket === sequence.current)
            setBusy(false);
    } }
    return <><button type="button" className="border rounded-lg px-3 py-2 text-sm text-blue-700" onClick={() => { setOpen(true); void load(); }}>{label}</button>{open && <WorkspaceDialog title="Edit project" busy={busy} onClose={close}>{loading ? <p role="status">Loading project…</p> : form ? <form onSubmit={save} className="space-y-4" data-navigation-controls><fieldset disabled={busy || !original?.can_edit} className="space-y-4">{[['code', 'Project number', 50], ['name', 'Project name', 160], ['address', 'Address', 500], ['stage', 'Stage', 100]].map(([key, label, max]) => <label key={key} className="block text-sm">{label}<input required={key === 'code' || key === 'name'} maxLength={Number(max)} value={String(form[key as keyof PortfolioProjectDetails])} onChange={e => setForm(v => v ? { ...v, [key]: e.target.value } : v)} className="block w-full border rounded-lg p-2 mt-1"/></label>)}<label className="block text-sm">Status<select value={form.status} onChange={e => setForm(v => v ? { ...v, status: e.target.value as PortfolioProjectDetails['status'] } : v)} className="block w-full border rounded-lg p-2 mt-1"><option value="active">Active</option><option value="on_hold">On Hold</option><option value="completed">Completed</option></select></label></fieldset>{!original?.can_edit && <p className="text-sm">You have read-only access to this project.</p>}<p className="text-xs text-slate-500">Changing the project number does not rename existing schedule submissions.</p>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<footer className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} className="border rounded-lg p-2" onClick={() => void load()}>Reload details</button><button type="button" disabled={busy} className="border rounded-lg p-2" onClick={close}>Cancel</button><button disabled={busy || !original?.can_edit} className="bg-blue-600 text-white rounded-lg p-2">{busy ? 'Saving…' : 'Save changes'}</button></footer></form> : <div><p role="alert" className="text-red-700">{error}</p><button type="button" className="border rounded-lg p-2 mt-3" onClick={() => void load()}>Retry loading</button></div>}</WorkspaceDialog>}</>;
}
