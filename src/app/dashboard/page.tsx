'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const metrics = [
  { label: 'Schedule Performance', val: '-8%', sub: 'Float condition deteriorating', delta: '↓ vs 4-wk avg', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
  { label: 'Site Manpower', val: '132', sub: '11 active trades on site', delta: '↓ 8% below plan', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  { label: 'Work Complete', val: '68%', sub: 'Closeout phase active', delta: '↓ 5% behind plan', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  { label: 'Safety Incidents', val: '0', sub: '30 days incident-free', delta: '✓ Good standing', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
]

const attention = [
  { icon: '🛒', title: 'Procurement Exposure', desc: 'Electrical equipment delays impacting critical path. Vendor coordination required immediately.', badge: 'High Impact', badgeColor: 'bg-red-100 text-red-700', href: '/dashboard/procurement' },
  { icon: '📅', title: 'Schedule Compression', desc: 'Finish activities compressed during closeout. Trade stacking increasing near turnover.', badge: 'High Impact', badgeColor: 'bg-red-100 text-red-700', href: '/dashboard/schedule' },
  { icon: '🔑', title: 'Pending Owner Approvals', desc: '6 submittals awaiting sign-off affecting float condition and downstream activities.', badge: 'Medium Impact', badgeColor: 'bg-amber-100 text-amber-700', href: '/dashboard/risks' },
  { icon: '⚙️', title: 'Commissioning Now Driving Completion', desc: 'AHU startup & testing have shifted to the critical path. Coordination with owner required.', badge: 'High Impact', badgeColor: 'bg-red-100 text-red-700', href: '/dashboard/schedule' },
]

const milestones = [
  { name: 'Switchgear Delivery', date: 'May 24', status: 'Pending', statusColor: 'bg-amber-100 text-amber-700', risk: 'Med', riskColor: 'bg-amber-100 text-amber-700' },
  { name: 'Level 3 Inspection', date: 'May 28', status: 'Upcoming', statusColor: 'bg-blue-100 text-blue-700', risk: 'Low', riskColor: 'bg-green-100 text-green-700' },
  { name: 'Mechanical Startup', date: 'Jun 05', status: 'Delayed', statusColor: 'bg-red-100 text-red-700', risk: 'High', riskColor: 'bg-red-100 text-red-700' },
  { name: 'Commissioning', date: 'Jun 15', status: 'At Risk', statusColor: 'bg-amber-100 text-amber-700', risk: 'Med', riskColor: 'bg-amber-100 text-amber-700' },
  { name: 'Substantial Completion', date: 'Jul 01', status: 'On Track', statusColor: 'bg-green-100 text-green-700', risk: 'Low', riskColor: 'bg-green-100 text-green-700' },
]

const pressure = [
  { label: 'Procurement', pct: 90, color: 'bg-red-500', level: 'High', levelColor: 'text-red-600' },
  { label: 'Schedule Compression', pct: 85, color: 'bg-red-500', level: 'High', levelColor: 'text-red-600' },
  { label: 'Trade Coordination', pct: 62, color: 'bg-amber-500', level: 'Med', levelColor: 'text-amber-600' },
  { label: 'Manpower', pct: 28, color: 'bg-green-500', level: 'Low', levelColor: 'text-green-600' },
  { label: 'Pending Decisions', pct: 55, color: 'bg-amber-500', level: 'Med', levelColor: 'text-amber-600' },
]

const actions = [
  'Confirm electrical equipment delivery with Eaton Corp — escalate if needed',
  'Escalate pending owner approvals with client team immediately',
  'Review manpower allocation plan for closeout phase with super',
  'Coordinate ceiling and MEP sequencing on Level 3 to reduce stacking',
  'Prepare mechanical startup delay recovery plan with sub',
]

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const u = localStorage.getItem('pl_user')
    if (u) setUser(JSON.parse(u))
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Executive Dashboard</span>
          <span className="text-slate-400 text-sm ml-2">· ProjectLens Demo</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">Last updated: Today 8:30 AM</span>
          <Link href="/dashboard/lens" className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors">🔍 Project Lens</Link>
          <Link href="/dashboard/upload" className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-semibold">+ Upload Schedule</Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Condition banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4">
          <span className="text-2xl">⚠️</span>
          <div className="flex-1">
            <div className="font-bold text-amber-900 text-base">Attention Needed</div>
            <div className="text-amber-800/70 text-sm mt-0.5">Project is under pressure in key areas. Timely actions required to protect schedule and turnover readiness.</div>
          </div>
          <Link href="/dashboard/lens" className="text-xs border border-amber-300 text-amber-800 px-3 py-2 rounded-lg hover:bg-amber-100 transition-colors whitespace-nowrap font-medium">
            Full Lens Analysis →
          </Link>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-4 gap-3">
          {metrics.map(m => (
            <div key={m.label} className={`bg-white border ${m.border} rounded-xl p-4`}>
              <div className="text-xs text-slate-500 font-medium mb-1">{m.label}</div>
              <div className={`text-2xl font-extrabold ${m.color}`}>{m.val}</div>
              <div className="text-xs text-slate-400 mt-1">{m.sub}</div>
              <div className={`text-xs font-semibold mt-1 ${m.color}`}>{m.delta}</div>
            </div>
          ))}
        </div>

        {/* Attention + Milestones */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Immediate Attention Areas</div>
            <div className="space-y-2">
              {attention.map(a => (
                <Link key={a.title} href={a.href} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all block">
                  <span className="text-lg flex-shrink-0 mt-0.5">{a.icon}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-xs">{a.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{a.desc}</div>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1.5 ${a.badgeColor}`}>{a.badge}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Upcoming Milestones</div>
            <div className="grid grid-cols-4 text-[10px] text-slate-400 font-semibold uppercase mb-2 px-1">
              <span className="col-span-2">Milestone</span><span>Status</span><span>Risk</span>
            </div>
            {milestones.map(m => (
              <div key={m.name} className="grid grid-cols-4 items-center gap-1 py-2 border-b border-slate-50 last:border-0">
                <div className="col-span-2">
                  <div className="text-xs font-semibold text-slate-800 leading-tight">{m.name}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{m.date}</div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.statusColor} w-fit`}>{m.status}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.riskColor} w-fit`}>{m.risk}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pressure + Actions + Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Operational Pressure</div>
            <div className="space-y-2.5">
              {pressure.map(p => (
                <div key={p.label} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-32 flex-shrink-0">{p.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`${p.color} h-full rounded-full bar-animated`} style={{ width: `${p.pct}%` }} />
                  </div>
                  <span className={`text-[10px] font-bold w-8 text-right ${p.levelColor}`}>{p.level}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Recommended Follow-Up</div>
            <div className="space-y-2">
              {actions.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  </div>
                  <span className="text-xs text-slate-600 leading-relaxed">{a}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Communication Summary</div>
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r-lg text-xs text-blue-900 leading-relaxed mb-3">
              Project is experiencing increasing procurement and closeout pressure. Electrical procurement delays and compressed finish activities are the primary concerns impacting turnover readiness. Immediate coordination with vendors and owner is recommended.
            </div>
            <div className="space-y-2">
              <Link href="/dashboard/lens" className="w-full bg-blue-600 text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5">
                🔍 Full Lens Analysis
              </Link>
              <button className="w-full border border-slate-200 text-slate-600 text-xs font-semibold py-2 rounded-lg hover:border-blue-300 hover:text-blue-600 transition-colors">
                ✉ Generate Owner Email
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
