'use client';
import { useRef, useState } from 'react';
import { createPortfolioProject, NewPortfolioProject } from '@/lib/portfolioCreation';
import WorkspaceDialog from './WorkspaceDialog';
export default function PortfolioCreateProject({ onCreated, group }: {
    group?: {id: string; name: string} | null;
    onCreated: (id: string) => void;
}) {
    const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), lock = useRef(false);
    const [form, setForm] = useState<NewPortfolioProject>({ code: '', name: '', address: '', stage: '', status: 'Active' });
    async function save(e: React.FormEvent) { e.preventDefault(); if (lock.current)
        return; lock.current = true; setBusy(true); setError(''); try {
        const id = await createPortfolioProject({...form, groupId: group?.id || null});
        setOpen(false);
        setForm({ code: '', name: '', address: '', stage: '', status: 'Active' });
        onCreated(id);
    }
    catch (e) {
        setError(String((e as any)?.message || e));
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    return <><button type="button" onClick={() => { setOpen(true); setError(''); }} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm">＋ Create project</button>{open && <WorkspaceDialog title="Create project" busy={busy} onClose={() => setOpen(false)}><form onSubmit={save} className="space-y-4"><p className="rounded border bg-slate-50 p-3 text-sm">Company / Program: <strong>{group?.name || 'Unassigned'}</strong></p>{[['code', 'Project number', 50], ['name', 'Project name', 160], ['address', 'Address', 500], ['stage', 'Stage', 100]].map(([key, label, max]) => <label key={key} className="block text-sm">{label}<input autoFocus={key === 'code'} required={key === 'code' || key === 'name'} maxLength={Number(max)} value={String(form[key as keyof NewPortfolioProject] || '')} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="block w-full border rounded p-2 mt-1"/></label>)}<label className="block text-sm">Status<select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as NewPortfolioProject['status'] }))} className="block w-full border rounded p-2 mt-1"><option>Active</option><option>On Hold</option><option>Completed</option></select></label>{error && <p role="alert" className="text-red-700 text-sm">{error}</p>}<footer className="flex justify-end gap-3"><button type="button" disabled={busy} className="border rounded p-2" onClick={() => setOpen(false)}>Cancel</button><button disabled={busy} className="bg-blue-600 text-white rounded p-2">{busy ? 'Creating…' : 'Create project'}</button></footer></form></WorkspaceDialog>}</>;
}
