'use client';
import { useEffect, useRef } from 'react';
export default function WorkspaceDialog({ title, busy = false, onClose, children }: {
    title: string;
    busy?: boolean;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open)
        dialog.showModal(); return () => { if (dialog?.open)
        dialog.close(); }; }, []);
    return <dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); if (!busy)
        onClose(); }} className="w-[calc(100%-2rem)] max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50"><div className="flex items-start justify-between gap-4 mb-4"><h2 className="font-bold text-lg">{title}</h2><button type="button" aria-label="Close dialog" disabled={busy} onClick={onClose} className="border rounded px-2 py-1">×</button></div>{children}</dialog>;
}
