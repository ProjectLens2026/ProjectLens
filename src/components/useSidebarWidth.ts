'use client';
import { useEffect, useRef, useState } from 'react';
export const clampSidebarWidth = (width: number, max = 520) => Math.round(Math.max(220, Math.min(max, Number.isFinite(width) ? width : 272)));
export default function useSidebarWidth() {
    const [width, setWidth] = useState(272), [ready, setReady] = useState(false), cleanup = useRef<(() => void) | null>(null);
    useEffect(() => { try {
        const stored = localStorage.getItem('pl_sidebar_width');
        if (stored)
            setWidth(clampSidebarWidth(Number(stored)));
    }
    catch { } ; setReady(true); return () => cleanup.current?.(); }, []);
    useEffect(() => { if (ready)
        try {
            localStorage.setItem('pl_sidebar_width', String(width));
        }
        catch { } }, [width, ready]);
    const maximum = () => Math.min(520, Math.max(220, window.innerWidth - 480));
    function start(event: React.PointerEvent) {
        if (event.button !== 0)
            return;
        event.preventDefault();
        cleanup.current?.();
        const startX = event.clientX, startWidth = width, pointer = event.pointerId, previousCursor = document.body.style.cursor, previousSelect = document.body.style.userSelect;
        const move = (e: PointerEvent) => { if (e.pointerId === pointer)
            setWidth(clampSidebarWidth(startWidth + e.clientX - startX, maximum())); };
        const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', stop); document.body.style.cursor = previousCursor; document.body.style.userSelect = previousSelect; cleanup.current = null; };
        const up = (e: PointerEvent) => { if (e.pointerId === pointer)
            stop(); };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        window.addEventListener('blur', stop);
        cleanup.current = stop;
    }
    function key(event: React.KeyboardEvent) { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
        return; event.preventDefault(); setWidth(clampSidebarWidth(event.key === 'Home' ? 220 : event.key === 'End' ? maximum() : width + (event.key === 'ArrowRight' ? 16 : -16), maximum())); }
    return { width, start, key };
}
