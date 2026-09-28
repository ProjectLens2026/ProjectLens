'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getActiveProject, getActiveVersion, loadProjects, loadVersionAnalysis, setActiveProjectId, setActiveVersionId } from '@/lib/projectStore'

type Destination = { projectId: string; versionId: string; projectName: string; label: string; date: string; fromLabel: string; fromDate: string }
type Navigation = { request: (projectId: string, versionId: string) => void; opening: boolean; revision: number; finished: () => void }
const Context = createContext<Navigation | null>(null)
export function useVersionNavigation() {
  const value = useContext(Context)
  if (!value) throw new Error('Version navigation must be inside its provider.')
  return value
}
const label = (v: any) => v?.versionLabel || v?.fileName || 'No schedule selected'
const date = (v: any) => v?.versionDates?.manualDataDate || v?.analysis?.dataDate || v?.dataDate || 'Not reported'

export default function VersionNavigation({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [destination, setDestination] = useState<Destination | null>(null)
  const [phase, setPhase] = useState<'confirm' | 'loading' | 'opening'>('confirm')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const locked = useRef(false)
  const generation = useRef(0)
  const dialog = useRef<HTMLDivElement>(null)
  const background = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const finished = () => { locked.current = false; setDestination(null) }

  function request(projectId: string, versionId: string) {
    if (locked.current || destination) return
    const currentProject = getActiveProject(), current = getActiveVersion(currentProject)
    if (currentProject?.id === projectId && current?.id === versionId) { router.push('/dashboard'); return }
    const project = loadProjects().find(p => p.id === projectId)
    const version = project?.versions.find(v => v.id === versionId)
    if (!project || !version) return
    previousFocus.current = document.activeElement as HTMLElement
    setError(''); setPhase('confirm')
    setDestination({ projectId, versionId, projectName: project.name, label: label(version), date: date(version), fromLabel: label(current), fromDate: date(current) })
  }
  function cancel() {
    if (phase === 'opening') return
    generation.current++
    locked.current = false
    setDestination(null)
    previousFocus.current?.focus()
  }
  async function confirm() {
    if (!destination || locked.current) return
    const attempt = ++generation.current
    locked.current = true; setError(''); setPhase('loading')
    const before = getActiveVersion(getActiveProject())
    try {
      // Preload without changing the current selection; retain the old analysis
      // so a failed download leaves the current page usable.
      const loaded = await loadVersionAnalysis(destination.versionId, { retainWith: before ? [before.id] : [] })
      if (attempt !== generation.current) return
      if (!loaded || loaded.analysisState !== 'loaded' || !loaded.analysis) throw new Error('The selected schedule could not be loaded. Your current version is still selected.')
      setPhase('opening')
      setActiveProjectId(destination.projectId)
      setActiveVersionId(destination.versionId)
      setRevision(n => n + 1)
      router.push('/dashboard')
    } catch (e) {
      if (attempt !== generation.current) return
      locked.current = false; setPhase('confirm')
      setError(e instanceof Error ? e.message : 'Unable to load this schedule. Please retry.')
    }
  }
  useEffect(() => {
    if (destination) { background.current?.setAttribute('inert', ''); dialog.current?.focus() }
    else background.current?.removeAttribute('inert')
  }, [destination])

  return <Context.Provider value={{ request, opening: Boolean(destination && phase === 'opening'), revision, finished }}>
    <div ref={background} className="version-navigation-background contents" aria-hidden={destination ? true : undefined}>{children}</div>
    <style>{`@media print { .version-navigation-background[aria-hidden="true"] { display: none !important; } }`}</style>
    {destination && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); cancel() }
      if (event.key === 'Tab') {
        const controls = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        if (!controls?.length) { event.preventDefault(); return }
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus() }
      }
    }}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="version-switch-title" aria-describedby="version-switch-description" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl outline-none">
        <h2 id="version-switch-title" className="text-lg font-bold text-slate-900">{phase === 'confirm' ? 'Switch schedule version?' : 'Switching schedule version…'}</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs font-semibold uppercase text-slate-500">Leaving</div><div className="break-words font-semibold">{destination.fromLabel}</div><div className="text-xs text-slate-500">Data date: {destination.fromDate}</div></div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3"><div className="text-xs font-semibold uppercase text-blue-700">Opening · {destination.projectName}</div><div className="break-words font-semibold text-blue-900">{destination.label}</div><div className="text-xs text-blue-700">Data date: {destination.date}</div></div>
        </div>
        <p id="version-switch-description" className="mt-4 text-sm text-slate-600">{phase === 'confirm' ? 'You will open this version’s Overview. Save any unsaved edits before switching.' : 'Loading the selected schedule. Review and print actions are unavailable until it is ready.'}</p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {phase === 'confirm' ? <div className="mt-5 flex justify-end gap-3"><button onClick={cancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Stay on current version</button><button onClick={confirm} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{error ? 'Retry switch' : 'Switch version'}</button></div> : <div role="status" aria-live="polite" className="mt-5 text-sm font-semibold text-blue-700">{phase === 'opening' ? 'Opening Overview…' : 'Loading schedule evidence…'}{phase === 'loading' && <button onClick={cancel} className="ml-4 rounded-lg border border-slate-300 px-3 py-2 text-slate-700">Cancel switch</button>}</div>}
      </div>
    </div>}
  </Context.Provider>
}

// Remount version-specific page state after committing the selection. Do not
// expose the old page beneath the new version name while routing to Overview.
export function VersionContent({ children }: { children: React.ReactNode }) {
  const { opening, revision, finished } = useVersionNavigation()
  const pathname = usePathname()
  useEffect(() => {
    if (!opening || pathname !== '/dashboard') return
    let next = 0
    const frame = requestAnimationFrame(() => { next = requestAnimationFrame(finished) })
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(next) }
  }, [opening, revision, pathname])
  if (opening && pathname !== '/dashboard') return <div className="p-6 text-sm text-slate-500">Opening the selected version…</div>
  return <div key={revision} className="contents">{children}</div>
}
