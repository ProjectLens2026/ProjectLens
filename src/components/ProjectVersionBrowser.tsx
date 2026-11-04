'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Project, ScheduleVersion, getVisibleVersions, manageProjectItem, getProjectStatus } from '@/lib/projectStore'
import { browserDate, compareScheduleVersions, scheduleDataDate } from '@/lib/versionBrowser'
import { useVersionNavigation } from './VersionNavigation'
import { usePermissions } from '@/lib/usePermissions'

const optionalColumns = ['Type', 'Activities', 'Original filename', 'Uploaded'] as const
type Column = typeof optionalColumns[number]
const defaults: Column[] = ['Type', 'Activities']

export default function ProjectVersionBrowser({ projects }: { projects: Project[] }) {
  const navigation = useVersionNavigation()
  const permissions = usePermissions()
  const params = useSearchParams()
  const focusProject = params.get('projectId')
  const [scope, setScope] = useState<'active' | 'archived' | 'deleted'>('active')
  const requestedView = params.get('view')
  useEffect(()=>{setScope(requestedView==='archived'||requestedView==='deleted'?requestedView:'active')},[requestedView])
  const [pending, setPending] = useState<{ projectId: string; versionId?: string; action: 'delete' | 'restore' | 'archive' | 'unarchive' | 'move' | 'rename' } | null>(null)
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function ask(projectId: string, action: NonNullable<typeof pending>['action'], versionId?: string) { setPending({projectId,action,versionId}); setTarget(''); setError('') }
  async function commit() {
    if (!pending || busy) return
    const allowed = pending.versionId ? permissions.can.deleteVersion : pending.action === 'rename' ? permissions.can.renameProject : pending.action === 'delete' ? permissions.can.softDeleteProject : pending.action === 'restore' ? permissions.can.restoreProject : permissions.can.archiveProject
    if (!allowed) { setError('You do not have permission for this action.'); return }
    setBusy(true);setError('')
    try { await manageProjectItem(pending.projectId,pending.action,pending.versionId,target);setSelected(null);setPending(null) }
    catch(e:any) { setError(e.message || 'Save failed. No local changes were made.') }
    finally { setBusy(false) }
  }
  function actions(p: Project, v?: ScheduleVersion) {
    if (v && ['Deleted','Archived'].includes(getProjectStatus(p))) return null
    const deleted = v ? !!v.deletedAt : getProjectStatus(p) === 'Deleted'
    const archived = v ? !!v.archivedAt : getProjectStatus(p) === 'Archived'
    const canEdit = v ? permissions.can.deleteVersion : permissions.can.archiveProject
    return <details className="inline-block ml-3" onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}><summary className="cursor-pointer list-none border border-slate-200 rounded-lg px-2 py-1 text-slate-600" aria-label={`Actions for ${v?.versionLabel||v?.fileName||p.name}`}>•••</summary><span className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-3 mt-2 text-xs">
      {deleted ? (v ? canEdit : permissions.can.restoreProject) && <button onClick={()=>ask(p.id,'restore',v?.id)}>Restore</button> : <>
      {!v && permissions.can.renameProject && <button onClick={()=>ask(p.id,'rename')}>Rename</button>}
      {canEdit && <button onClick={()=>ask(p.id,archived?'unarchive':'archive',v?.id)}>{archived?'Unarchive':'Archive'}</button>}
      {v && canEdit && <button onClick={()=>ask(p.id,'move',v.id)}>Move…</button>}
      {(v ? canEdit : permissions.can.softDeleteProject) && <button className="text-red-700" onClick={()=>ask(p.id,'delete',v?.id)}>Delete</button>}
      </>}
    </span></details>
  }
  const [expanded, setExpanded] = useState<string[]>([])
  const [selected, setSelected] = useState<{ projectId: string; versionId: string } | null>(null)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [newest, setNewest] = useState(true)
  const [showColumns, setShowColumns] = useState(false)
  const [columns, setColumns] = useState<Column[]>(defaults)
  const [collapsed, setCollapsed] = useState(false)
  const layoutKey = permissions.user ? `cpmreview:project-columns:${permissions.user.email}` : null

  useEffect(() => {
    if (!layoutKey) return
    try {
      const saved = JSON.parse(localStorage.getItem(layoutKey) || 'null')
      setColumns(Array.isArray(saved) ? optionalColumns.filter(c => saved.includes(c)) : defaults)
    } catch { setColumns(defaults) }
  }, [layoutKey])
  useEffect(() => {
    if (focusProject) { setExpanded(ids => ids.includes(focusProject) ? ids : [...ids, focusProject]); setCollapsed(false) }
  }, [focusProject])

  function toggleColumn(column: Column) {
    const next = columns.includes(column) ? columns.filter(c => c !== column) : [...columns, column]
    setColumns(next)
    if (layoutKey) { try { localStorage.setItem(layoutKey, JSON.stringify(next)) } catch {} }
  }
  const activeProjects = projects.filter(p => (!focusProject || p.id === focusProject) && (scope === 'deleted' ? getProjectStatus(p) === 'Deleted' || p.versions.some(v=>v.deletedAt) : scope === 'archived' ? getProjectStatus(p) !== 'Deleted' && (getProjectStatus(p) === 'Archived' || p.versions.some(v=>v.archivedAt&&!v.deletedAt)) : !['Deleted','Archived'].includes(getProjectStatus(p))))
  function visible(p: Project) { return p.versions.filter(v=> scope === 'deleted' ? !!v.deletedAt || getProjectStatus(p)==='Deleted' : scope==='archived' ? !v.deletedAt && (!!v.archivedAt || getProjectStatus(p)==='Archived') : !v.deletedAt&&!v.archivedAt) }
  const term = query.trim().toLowerCase()
  const filtering = !!(term || from || to || type !== 'all')
  const rows = activeProjects.map(project => {
    const projectMatches = `${project.name} ${project.projectId || ''}`.toLowerCase().includes(term)
    const versions = visible(project).filter(v => {
      const date = scheduleDataDate(v)
      return (projectMatches || `${v.fileName} ${v.versionLabel || ''} ${date}`.toLowerCase().includes(term))
        && (type === 'all' || v.scheduleType === type)
        && (!from || (!!date && date >= from)) && (!to || (!!date && date <= to))
    }).sort((a, b) => {
      // Missing data dates stay last in both directions.
      if (!scheduleDataDate(a) || !scheduleDataDate(b)) return compareScheduleVersions(a, b)
      return newest ? compareScheduleVersions(a, b) : compareScheduleVersions(b, a)
    })
    return { project, versions }
  }).filter(({ project, versions }) => !filtering || versions.length > 0 || (!from && !to && type === 'all' && `${project.name} ${project.projectId || ''}`.toLowerCase().includes(term)))
  const selectedProject = activeProjects.find(p => p.id === selected?.projectId)
  const selectedVersion = selectedProject && getVisibleVersions(selectedProject).find(v => v.id === selected?.versionId)
  const selectionVisible = rows.some(r => r.project.id === selected?.projectId && r.versions.some(v => v.id === selected?.versionId))
  function openSelected() {
    if (selectedProject && selectedVersion && selectionVisible) navigation.request(selectedProject.id, selectedVersion.id)
  }
  function cell(v: ScheduleVersion, column: Column) {
    if (column === 'Type') return v.scheduleType || 'Unspecified'
    if (column === 'Original filename') return v.fileName || '—'
    if (column === 'Uploaded') return browserDate(v.uploadedAt)
    const count = v.analysis?.totalActivities ?? v.analysis?.activities?.length
    return typeof count === 'number' ? count.toLocaleString() : '—'
  }
  const columnCount = 3 + columns.length
  return <section className="p-5 space-y-4 bg-slate-50 flex-1 overflow-auto">
    <div className="text-sm text-slate-600"><Link href="/dashboard/enterprise" className="text-blue-600 hover:underline">Enterprise</Link> / <Link href="/dashboard/projects" onClick={()=>{setQuery('');setScope('active')}} className="text-blue-600">All projects</Link> / {focusProject ? activeProjects[0]?.name || 'Project not found' : 'Schedule versions'}</div>
    <div className="flex gap-4 items-center"><Link href="/dashboard/projects" onClick={()=>{setQuery('');setFrom('');setTo('');setType('all');setScope('active')}} className="text-blue-700 font-semibold">← All projects</Link>{(['active','archived','deleted'] as const).map(s=><button key={s} onClick={()=>{setScope(s);setSelected(null)}} aria-pressed={scope===s} className={scope===s?'font-bold text-blue-700':'text-slate-600'}>{s==='deleted'?'Deleted items':s==='archived'?'Archive':'Active'}</button>)}</div>
    <div className="flex flex-wrap gap-3 items-end">
      <label className="text-xs text-slate-600 flex-1 min-w-[200px]">Search projects, versions or filenames<input value={query} onChange={e => setQuery(e.target.value)} className="block mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="Search…" /></label>
      <label className="text-xs text-slate-600">Data date from<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="block mt-1 border rounded-lg p-2" /></label>
      <label className="text-xs text-slate-600">To<input type="date" value={to} onChange={e => setTo(e.target.value)} className="block mt-1 border rounded-lg p-2" /></label>
      <label className="text-xs text-slate-600">Schedule type<select value={type} onChange={e => setType(e.target.value)} className="block mt-1 border rounded-lg p-2"><option value="all">All types</option>{Array.from(new Set(activeProjects.flatMap(p => getVisibleVersions(p).map(v => v.scheduleType).filter(Boolean)))).sort().map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <button onClick={() => setShowColumns(!showColumns)} aria-expanded={showColumns} className="border rounded-lg px-3 py-2 text-sm bg-white">Columns</button>
      {permissions.can.createProject&&<Link href="/dashboard/upload?mode=new" className="border border-teal-200 rounded-lg px-3 py-2 text-sm text-teal-800 bg-teal-50">+ New project</Link>}
      <button disabled={!selectedVersion || !selectionVisible || navigation.opening} onClick={openSelected} className="rounded-lg bg-blue-600 disabled:bg-slate-300 text-white px-4 py-2 text-sm font-semibold">Open Version →</button>
    </div>
    {showColumns && <div className="flex flex-wrap gap-4 bg-white border p-3 rounded-lg text-sm">{optionalColumns.map(c => <label key={c} className="flex items-center gap-2"><input type="checkbox" checked={columns.includes(c)} onChange={() => toggleColumn(c)} />{c}</label>)}</div>}
    <p className="text-xs text-slate-500">Select a version, then Open Version. Double-click or press Enter on a version to open it. Data dates come from the schedule; missing dates are never replaced by upload dates.</p>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm text-left border-collapse">
        <thead className="bg-slate-100 text-xs text-slate-600"><tr><th className="p-3 min-w-[300px]">Project / Schedule version</th><th className="p-3 whitespace-nowrap" aria-sort={newest ? 'descending' : 'ascending'}><button onClick={() => setNewest(!newest)}>Data Date {newest ? '↓' : '↑'}</button></th>{columns.map(c => <th className="p-3 whitespace-nowrap" key={c}>{c}</th>)}<th className="p-3">Actions</th></tr></thead>
        <tbody>
          <tr className="bg-teal-50 text-teal-900"><td colSpan={columnCount} className="p-3"><button onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} className="font-semibold">{collapsed ? '▸' : '▾'} {permissions.user?.orgName || permissions.user?.company || 'Enterprise workspace'} · {activeProjects.length} projects</button></td></tr>
          {!collapsed && rows.map(({ project, versions }) => {
            const isExpanded = expanded.includes(project.id) || filtering || scope !== 'active'
            return <Fragment key={project.id}>
              <tr className="bg-blue-50 border-t border-blue-100"><td colSpan={columnCount - 1} className="p-3"><button aria-expanded={isExpanded} onClick={() => setExpanded(ids => ids.includes(project.id) ? ids.filter(id => id !== project.id) : [...ids, project.id])} className="font-semibold text-blue-950 text-left">{isExpanded ? '▾' : '▸'} {project.projectId || project.name}<span className="ml-3 font-normal text-slate-600">{project.name} · {versions.length} versions</span></button></td><td className="p-3 whitespace-nowrap">{scope === 'active' && permissions.can.uploadSchedule && <Link href={`/dashboard/upload?mode=existing&project=${encodeURIComponent(project.id)}`} className="text-blue-700 text-xs font-semibold">+ Upload Version</Link>}{actions(project)}</td></tr>
              {isExpanded && versions.map(v => {
                const isSelected = selected?.projectId === project.id && selected?.versionId === v.id
                return <tr key={v.id} tabIndex={0} aria-selected={isSelected} onClick={() => setSelected({ projectId: project.id, versionId: v.id })} onDoubleClick={() => navigation.request(project.id, v.id)} onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter') navigation.request(project.id, v.id); if (e.key === ' ') { e.preventDefault(); setSelected({ projectId: project.id, versionId: v.id }) } }} className={`border-t cursor-pointer outline-blue-500 ${isSelected ? 'bg-blue-100' : 'hover:bg-slate-50'}`}>
                  <td className="py-3 pl-9 pr-3"><div className="font-medium text-slate-900">{v.versionLabel || v.fileName}</div><div className="text-xs text-slate-500 break-all">{v.fileName}</div></td><td className="p-3 whitespace-nowrap font-semibold">{scheduleDataDate(v) ? browserDate(scheduleDataDate(v)) : <span className="text-amber-700">Not reported</span>}</td>{columns.map(c => <td className="p-3 text-slate-600" key={c}>{cell(v, c)}</td>)}<td className="p-3"><button className="text-blue-700 font-semibold text-xs" onClick={e => { e.stopPropagation(); navigation.request(project.id, v.id) }}>Open</button>{actions(project,v)}</td>
                </tr>
              })}
              {isExpanded && !versions.length && <tr><td colSpan={columnCount} className="p-4 pl-9 text-slate-500">No schedule versions. Upload a baseline or update for this project.</td></tr>}
            </Fragment>
          })}
          {!collapsed && !rows.length && <tr><td colSpan={columnCount} className="p-6 text-slate-500">No matching projects or versions.</td></tr>}
        </tbody>
      </table>
    </div>
    {pending && <div role="dialog" aria-modal="true" aria-label="Confirm project action" className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4">
      <h2 className="font-bold text-lg">{pending.action.toUpperCase()} {pending.versionId?'schedule version':'project'}?</h2>
      <p className="break-all">{projects.find(p=>p.id===pending.projectId)?.name} {pending.versionId && ' / '+(projects.find(p=>p.id===pending.projectId)?.versions.find(v=>v.id===pending.versionId)?.fileName||pending.versionId)}</p>
      <p className="text-sm text-slate-600">{pending.action==='delete'?'This is recoverable from the Deleted items tab. No source files are permanently removed.':pending.action==='move'?'The version retains its ID and source files. Project-level comments and criteria stay with the original project; review their applicability after moving.':'Archived items are retained and can be unarchived.'}</p>
      {pending.action==='rename' && <label>New project name<input aria-label="New project name" className="block w-full border p-2" value={target} onChange={e=>setTarget(e.target.value)} /></label>}
      {pending.action==='move' && <label>Destination project<select aria-label="Destination project" className="block w-full border p-2" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Select destination…</option>{projects.filter(p=>p.id!==pending.projectId&&!['Archived','Deleted'].includes(getProjectStatus(p))).map(p=><option key={p.id} value={p.id}>{p.projectId} — {p.name}</option>)}</select></label>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-4"><button disabled={busy||(['move','rename'].includes(pending.action)&&!target.trim())} onClick={commit} className="bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-40">{busy?'Saving…':'Confirm'}</button><button disabled={busy} onClick={()=>setPending(null)}>Cancel</button></div>
    </div></div>}
    {selectedVersion && selectionVisible && <div className="border rounded-lg bg-white p-4 text-sm"><span className="text-slate-500">Selected: </span><strong>{selectedProject?.name}</strong> / {browserDate(scheduleDataDate(selectedVersion))} / {selectedVersion.versionLabel || selectedVersion.fileName}<div className="text-xs text-slate-500 mt-1 break-all">Original file: {selectedVersion.fileName}. Selecting a row does not change the open schedule.</div></div>}
  </section>
}
