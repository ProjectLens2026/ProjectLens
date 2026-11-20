'use client';
import { useEffect, useId, useRef, useState } from 'react';
/** A single-use action menu: selecting, clicking away, leaving with Tab or Escape closes it. */
export default function WorkspaceMenu({ label, trigger = '⋯', disabled = false, children, className = '' }: {
    label: string;
    trigger?: string;
    disabled?: boolean;
    children: React.ReactNode;
    className?: string;
}) {
    const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), id = useId();
    useEffect(() => {
        if (!open)
            return;
        const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node))
            setOpen(false); };
        const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            button.current?.focus();
        } };
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', escape);
        root.current?.querySelector<HTMLButtonElement>('[role="menu"] button:not(:disabled)')?.focus();
        return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape); };
    }, [open]);
    useEffect(() => { if (disabled)
        setOpen(false); }, [disabled]);
    return <div ref={root} className={`relative ${className}`} onBlur={e => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node))
        setOpen(false); }}><button ref={button} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={() => setOpen(v => !v)} onKeyDown={e => { if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
    } }} className="rounded px-2 py-1 text-xs">{trigger}</button>{open && <div id={id} role="menu" aria-label={label} className="absolute z-50 right-0 top-full w-48 flex flex-col gap-1 bg-white text-slate-900 border border-slate-200 rounded-lg p-2 mt-1 shadow-lg" onClick={e => { if ((e.target as HTMLElement).closest('button,a')) {
        setOpen(false);
        button.current?.focus();
    } }} onKeyDown={e => { const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')); const index = controls.indexOf(document.activeElement as HTMLElement); let next = -1; if (e.key === 'ArrowDown')
        next = (index + 1) % controls.length; if (e.key === 'ArrowUp')
        next = (index - 1 + controls.length) % controls.length; if (e.key === 'Home')
        next = 0; if (e.key === 'End')
        next = controls.length - 1; if (next >= 0 && controls.length) {
        e.preventDefault();
        controls[next].focus();
    } }}>{children}</div>}</div>;
}
