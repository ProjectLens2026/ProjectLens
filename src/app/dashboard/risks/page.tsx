'use client'
import { useState } from 'react'

const initialRisks = [
  { id: 1, title: 'Switchgear delivery — 2-week vendor slip', desc: 'Confirmed delay from Eaton Corp. Controls electrical startup and commissioning readiness.', category: 'Schedule', severity: 'High', responsible: 'Ahmed S.', status: 'Open' },
  { id: 2, title: 'Owner approval backlog — 6 submittals over 10 days', desc: 'Unresolved submittals preventing downstream procurement and installation.', category: 'Admin', severity: 'High', responsible: 'Owner Team', status: 'Open' },
  { id: 3, title: 'MEP coordination gap — Level 4 mechanical shaft clash', desc: 'Clash detected during coordination. Resolution required before rough-in proceeds.', category: 'Design', severity: 'Medium', responsible: 'Architect', status: 'In Progress' },
  { id: 4, title: 'AHU testing blocked by electrical certificate', desc: 'Cannot proceed with commissioning until temporary power approval received from AHJ.', category: 'Technical', severity: 'High', responsible: 'PM', status: 'Open' },
  { id: 5, title: 'Specialty subs reducing crew early', desc: 'Drywall and painting subs pulling manpower before substantial completion.', category: 'Labor', severity: 'Medium', responsible: 'Superintendent', status: 'Open' },
]

const severityColors: Record<string, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low: 'bg-green-100 text-green-700',
}
const statusColors: Record<string, string> = {
  Open: 'bg-slate-100 text-slate-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Resolved: 'bg-green-100 text-green-700',
}

export default function RisksPage() {
  const [risks, setRisks] = useState(initialRisks)
  const [showForm, setShowForm] = useState(false)
  const [newRisk, setNewRisk] = useState({ title: '', desc: '', category: 'Schedule', severity: 'High', responsible: '' })

  function addRisk() {
    if (!newRisk.title) return
    setRisks([...risks, { ...newRisk, id: Date.now(), status: 'Open' }])
    setNewRisk({ title: '', desc: '', category: 'Schedule', severity: 'High', responsible: '' })
    setShowForm(false)
  }

  const high = risks.filter(r => r.severity === 'High' && r.status !== 'Resolved').length
  const med = risks.filter(r => r.severity === 'Medium' && r.status !== 'Resolved').length
  const open = risks.filter(r => r.status === 'Open').length

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Risks & Issues</span>
          <span className="text-slate-400 text-sm ml-2">· ProjectLens Demo</span>
        </div>
        <div className="ml-auto">
          <button onClick={() => setShowForm(!showForm)}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-semibold">
            + Log New Risk
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-red-100 rounded-xl p-4"><div className="text-xs text-slate-500 mb-1">High Severity</div><div className="text-2xl font-extrabold text-red-600">{high}</div></div>
          <div className="bg-white border border-amber-100 rounded-xl p-4"><div className="text-xs text-slate-500 mb-1">Medium Severity</div><div className="text-2xl font-extrabold text-amber-600">{med}</div></div>
          <div className="bg-white border border-slate-200 rounded-xl p-4"><div className="text-xs text-slate-500 mb-1">Open Issues</div><div className="text-2xl font-extrabold text-slate-800">{open}</div></div>
        </div>

        {showForm && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
            <div className="text-sm font-bold text-slate-800">Log New Risk or Issue</div>
            <input className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              placeholder="Risk description *" value={newRisk.title} onChange={e => setNewRisk({...newRisk, title: e.target.value})} />
            <textarea rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 resize-none"
              placeholder="Additional details..." value={newRisk.desc} onChange={e => setNewRisk({...newRisk, desc: e.target.value})} />
            <div className="grid grid-cols-3 gap-2">
              <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" value={newRisk.category} onChange={e => setNewRisk({...newRisk, category: e.target.value})}>
                {['Schedule','Procurement','Design','Technical','Labor','Admin','Safety'].map(c => <option key={c}>{c}</option>)}
              </select>
              <select className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" value={newRisk.severity} onChange={e => setNewRisk({...newRisk, severity: e.target.value})}>
                {['High','Medium','Low'].map(s => <option key={s}>{s}</option>)}
              </select>
              <input className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                placeholder="Responsible party" value={newRisk.responsible} onChange={e => setNewRisk({...newRisk, responsible: e.target.value})} />
            </div>
            <div className="flex gap-2">
              <button onClick={addRisk} className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-blue-700">Save Risk</button>
              <button onClick={() => setShowForm(false)} className="border border-slate-200 text-slate-600 text-xs px-4 py-2 rounded-lg">Cancel</button>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 grid grid-cols-12 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span className="col-span-5">Description</span><span className="col-span-2">Category</span>
            <span className="col-span-2">Severity</span><span className="col-span-2">Responsible</span><span>Status</span>
          </div>
          {risks.map(r => (
            <div key={r.id} className="px-4 py-3 border-b border-slate-50 last:border-0 grid grid-cols-12 items-start gap-2 hover:bg-slate-50 transition-colors">
              <div className="col-span-5">
                <div className="text-xs font-semibold text-slate-800">{r.title}</div>
                {r.desc && <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{r.desc}</div>}
              </div>
              <span className="col-span-2 text-xs text-slate-500">{r.category}</span>
              <span className="col-span-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severityColors[r.severity]}`}>{r.severity}</span></span>
              <span className="col-span-2 text-xs text-slate-500">{r.responsible}</span>
              <span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColors[r.status]}`}>{r.status}</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
