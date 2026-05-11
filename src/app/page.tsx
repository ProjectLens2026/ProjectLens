'use client'
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="11" cy="11" r="4"/><circle cx="11" cy="11" r="8.5"/>
              <line x1="2.5" y1="11" x2="5" y2="11"/><line x1="17" y1="11" x2="19.5" y2="11"/>
              <line x1="11" y1="2.5" x2="11" y2="5"/><line x1="11" y1="17" x2="11" y2="19.5"/>
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-900">ProjectLens</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
          <a href="#how" className="hover:text-blue-600 transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a>
          <Link href="/login" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-8 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-blue-100">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"/>
          Built from real construction experience
        </div>
        <h1 className="text-5xl font-extrabold text-slate-900 leading-tight mb-6">
          See your project clearly.<br/>
          <span className="text-blue-600">Before problems become failures.</span>
        </h1>
        <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          Upload your schedule. ProjectLens reads it like an experienced project controls 
          advisor — surfacing what's critical, what's at risk, and what needs your attention. 
          Right now.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/login" className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">
            Start Free — Upload Your Schedule
          </Link>
          <a href="#how" className="text-slate-600 font-semibold px-6 py-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-colors">
            See how it works →
          </a>
        </div>
        <p className="text-xs text-slate-400 mt-4">No credit card. No commitment. Just upload and see.</p>
      </section>

      {/* Dashboard preview */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
        <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xl shadow-slate-200">
          <div className="bg-slate-800 px-4 py-3 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400"/><div className="w-3 h-3 rounded-full bg-yellow-400"/>
            <div className="w-3 h-3 rounded-full bg-green-400"/>
            <div className="ml-4 flex-1 bg-slate-700 rounded-md h-6 flex items-center px-3">
              <span className="text-slate-400 text-xs">projectlens.app/dashboard</span>
            </div>
          </div>
          <div className="bg-slate-900 p-6">
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Schedule Health', val: '-8%', color: 'text-red-400', sub: 'Float deteriorating' },
                { label: 'Site Manpower', val: '132', color: 'text-white', sub: '11 active trades' },
                { label: 'Work Complete', val: '68%', color: 'text-yellow-400', sub: '5% behind plan' },
                { label: 'Safety Incidents', val: '0', color: 'text-green-400', sub: '30 days clear' },
              ].map(m => (
                <div key={m.label} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="text-slate-400 text-xs mb-1">{m.label}</div>
                  <div className={`text-2xl font-bold ${m.color}`}>{m.val}</div>
                  <div className="text-slate-500 text-xs mt-1">{m.sub}</div>
                </div>
              ))}
            </div>
            <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <div className="text-yellow-300 font-semibold text-sm">Attention Needed</div>
                <div className="text-yellow-200/60 text-xs mt-0.5">Electrical procurement delay may affect commissioning readiness. Immediate vendor coordination required.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-slate-50 py-20">
        <div className="max-w-5xl mx-auto px-8">
          <h2 className="text-3xl font-extrabold text-slate-900 text-center mb-3">Upload. Analyze. Act.</h2>
          <p className="text-slate-500 text-center mb-12 max-w-xl mx-auto">No training required. No complicated setup. Just upload your schedule and ProjectLens does the hard work.</p>
          <div className="grid grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Upload your schedule', body: 'Drag and drop your Primavera P6 (.xer), MS Project (.mpp), or PDF schedule. ProjectLens reads it instantly.', icon: '📁' },
              { step: '02', title: 'Add project context', body: 'Tell us your project phase, key milestones, procurement items, and current constraints. Takes 3 minutes.', icon: '✏️' },
              { step: '03', title: 'Get your Lens report', body: 'Instantly see project condition, critical drivers, pressure areas, and a ready-to-send executive summary.', icon: '🔍' },
            ].map(s => (
              <div key={s.step} className="text-center">
                <div className="text-4xl mb-4">{s.icon}</div>
                <div className="text-xs font-bold text-blue-600 mb-2">STEP {s.step}</div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">{s.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 max-w-5xl mx-auto px-8">
        <h2 className="text-3xl font-extrabold text-slate-900 text-center mb-12">Everything a PM needs. Nothing they don't.</h2>
        <div className="grid grid-cols-2 gap-6">
          {[
            { title: 'Schedule Health Analysis', body: 'Upload P6, MSP, or PDF. Get float condition, critical path, compression risks, and realistic completion forecast — in plain language.', icon: '📊' },
            { title: 'Procurement Pressure Radar', body: 'Identify long-lead items that threaten milestones before it\'s too late. Know which vendor calls to make today.', icon: '🚚' },
            { title: 'Operational Interpretation', body: 'ProjectLens doesn\'t just show data — it explains what it means operationally. Like having an experienced project controls advisor beside you.', icon: '🧠' },
            { title: 'One-Click Executive Summary', body: 'Generate a professional owner update or weekly summary email in seconds. No more hour-long report writing sessions.', icon: '✉️' },
            { title: 'Project Health Score', body: 'Every project gets a live health score across schedule, procurement, manpower, safety, and decisions. Simple. Fast. Trustworthy.', icon: '❤️' },
            { title: 'Role-Based Visibility', body: 'Owners see what they need. PMs see more. Supers see their priorities. Everyone sees the right level — not everything.', icon: '👥' },
          ].map(f => (
            <div key={f.title} className="flex gap-4 p-5 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition-all">
              <div className="text-2xl flex-shrink-0">{f.icon}</div>
              <div>
                <h3 className="font-bold text-slate-900 mb-1">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-slate-50 py-20">
        <div className="max-w-4xl mx-auto px-8">
          <h2 className="text-3xl font-extrabold text-slate-900 text-center mb-3">Simple pricing</h2>
          <p className="text-slate-500 text-center mb-12">Start free. Scale when you need it.</p>
          <div className="grid grid-cols-3 gap-6">
            {[
              { name: 'Free', price: '$0', period: 'forever', features: ['1 active project', 'Schedule upload & analysis', 'Basic dashboard', 'PDF export'], cta: 'Start Free', highlight: false },
              { name: 'ProjectLens', price: '$49', period: '/month', features: ['5 active projects', 'Full Lens analysis', 'Procurement tracker', 'RFI & risk logs', 'Executive summaries', 'Team collaboration'], cta: 'Start 14-day Trial', highlight: true },
              { name: 'ProjectLens Plus', price: '$199', period: '/month', features: ['Unlimited projects', 'Advanced diagnostics', 'P6 deep integration', 'Multi-role access', 'API access', 'Priority support'], cta: 'Contact Sales', highlight: false },
            ].map(p => (
              <div key={p.name} className={`rounded-2xl p-6 border ${p.highlight ? 'border-blue-500 bg-white shadow-xl shadow-blue-100 relative' : 'border-slate-200 bg-white'}`}>
                {p.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-full">Most Popular</div>}
                <div className="text-sm font-semibold text-slate-500 mb-1">{p.name}</div>
                <div className="text-3xl font-extrabold text-slate-900 mb-0.5">{p.price}<span className="text-sm font-normal text-slate-400">{p.period}</span></div>
                <ul className="mt-5 mb-6 space-y-2">
                  {p.features.map(f => <li key={f} className="flex items-center gap-2 text-sm text-slate-600"><span className="text-green-500">✓</span>{f}</li>)}
                </ul>
                <Link href="/login" className={`block text-center py-2.5 rounded-lg font-semibold text-sm transition-colors ${p.highlight ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600'}`}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center">
        <h2 className="text-3xl font-extrabold text-slate-900 mb-4">Ready to see your project clearly?</h2>
        <p className="text-slate-500 mb-8 max-w-xl mx-auto">Upload your first schedule today. No setup. No training. Just upload and see what ProjectLens finds.</p>
        <Link href="/login" className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 inline-block">
          Get Started Free →
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-5 h-5 bg-blue-600 rounded flex items-center justify-center">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <circle cx="11" cy="11" r="4"/><circle cx="11" cy="11" r="8.5"/>
            </svg>
          </div>
          <span className="font-bold text-slate-600">ProjectLens</span>
        </div>
        <p>Visibility. Insight. Control. © 2024 ProjectLens. All rights reserved.</p>
      </footer>
    </div>
  )
}
