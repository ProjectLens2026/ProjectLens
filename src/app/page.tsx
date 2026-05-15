'use client'
import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    // If already logged in, go straight to dashboard
    const user = localStorage.getItem('pl_user')
    if (user) router.replace('/dashboard')
  }, [])

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-sm z-50">
        <div className="flex items-center gap-2">
          <svg width="28" height="20" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-label="NobelPM mark">
            <rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/>
            <rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/>
            <rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/>
            <rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/>
          </svg>
          <span className="text-lg font-bold text-slate-900">NobelPM</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <a href="#features" className="hover:text-blue-600 transition-colors hidden md:inline">Features</a>
          <a href="#how" className="hover:text-blue-600 transition-colors hidden md:inline">How it works</a>
          <a href="#pricing" className="hover:text-blue-600 transition-colors hidden md:inline">Pricing</a>
          <Link href="/login" className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-8 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-blue-100">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"/>
          Built by a PMP-certified PM with 18 years in federal construction
        </div>
        <h1 className="text-5xl font-extrabold text-slate-900 leading-tight mb-6">
          Read your schedule like<br/>
          <span className="text-blue-600">a 20-year scheduler would.</span>
        </h1>
        <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          Upload your Primavera P6 XER file. NobelPM finds your critical path drivers,
          logic violations, long lead risks, and delay evidence — in 30 seconds. No training. No setup.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/login" className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">
            Try It Free — Upload Your XER
          </Link>
          <a href="#how" className="text-slate-600 font-semibold px-6 py-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition-colors">
            See how it works →
          </a>
        </div>
        <p className="text-xs text-slate-400 mt-4">No credit card. No commitment. Drop in a schedule and see for yourself.</p>
      </section>

      {/* Dashboard preview */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
        <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xl shadow-slate-200">
          <div className="bg-slate-800 px-4 py-3 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400"/><div className="w-3 h-3 rounded-full bg-yellow-400"/>
            <div className="w-3 h-3 rounded-full bg-green-400"/>
            <div className="ml-4 flex-1 bg-slate-700 rounded-md h-6 flex items-center px-3">
              <span className="text-slate-400 text-xs">app.nobelpm.org/dashboard/upload</span>
            </div>
          </div>
          <div className="bg-slate-900 p-6">
            <div className="grid grid-cols-5 gap-3 mb-4">
              {[
                { label: 'Total Activities', val: '550', color: 'text-white', sub: '799 relationships' },
                { label: 'Complete', val: '222', color: 'text-green-400', sub: '40% of schedule' },
                { label: 'In Progress', val: '63', color: 'text-amber-400', sub: '11% active' },
                { label: 'Negative Float', val: '319', color: 'text-red-400', sub: '58% of all' },
                { label: 'Out-of-Sequence', val: '57', color: 'text-red-400', sub: 'Logic violations' },
              ].map(m => (
                <div key={m.label} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                  <div className="text-slate-400 text-[10px] mb-1">{m.label}</div>
                  <div className={`text-2xl font-bold ${m.color}`}>{m.val}</div>
                  <div className="text-slate-500 text-[10px] mt-1">{m.sub}</div>
                </div>
              ))}
            </div>
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4 flex items-center gap-3">
              <span className="text-2xl">🔴</span>
              <div className="flex-1">
                <div className="text-red-300 font-semibold text-sm">Recovery Required — 133 days behind contract completion</div>
                <div className="text-red-200/60 text-xs mt-0.5">Critical path driven by MEP procurement: thermal expansion tank, insulation, and hydronic air control unit not yet ordered. Switchgear fabrication at -5 days float.</div>
              </div>
              <div className="text-3xl font-extrabold text-red-400">28<span className="text-base font-normal text-red-300/60">/100</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-slate-50 py-20">
        <div className="max-w-5xl mx-auto px-8">
          <h2 className="text-3xl font-extrabold text-slate-900 text-center mb-3">Upload. Analyze. Act.</h2>
          <p className="text-slate-500 text-center mb-12 max-w-xl mx-auto">No training required. No complicated setup. Just upload your XER and NobelPM does the hard work.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Upload your XER', body: 'Drag and drop your Primavera P6 schedule. NobelPM parses 500+ activities and 800+ relationships in seconds.', icon: '📁' },
              { step: '02', title: 'See what matters', body: 'Critical path drivers, logic check, long lead items, no-tie activities, field reality — all in 7 organized tabs.', icon: '🔍' },
              { step: '03', title: 'Generate the report', body: 'Print, save as PDF, or for TIA work — compare two schedules and generate a full Word document.', icon: '📄' },
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
        <h2 className="text-3xl font-extrabold text-slate-900 text-center mb-3">Built for PMs and schedulers who do real work.</h2>
        <p className="text-slate-500 text-center mb-12">Every feature designed from 18 years of construction PM experience on federal and commercial projects.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { title: 'Critical Path Analysis', body: 'See exactly what is driving project completion. NobelPM identifies driving activities, float condition, and where the path can break.', icon: '🎯' },
            { title: 'Schedule Logic Check', body: 'Catches out-of-sequence work, fabricated-before-approval procurement, and review-before-submit violations. TIA evidence ready.', icon: '🔧' },
            { title: 'Long Lead Item Tracker', body: 'Every 20+ day procurement item, sorted by float. Know which vendor calls to make today vs which can wait until next week.', icon: '📦' },
            { title: 'No Logic Ties Detection', body: 'Finds activities missing predecessors or successors — the schedule quality issues that hide real risk.', icon: '⛓️' },
            { title: 'Field Reality Check', body: 'Compares in-progress activities against expected sequencing. Flags drywall going up before inspections, painting before drywall is closed.', icon: '👷' },
            { title: 'TIA Comparison & Word Report', body: 'Upload two schedules — un-impacted and impacted. NobelPM detects fragnets, runs trend analysis, and generates a full TIA Word document ready for owner submission.', icon: '📑' },
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

      {/* Who it's for */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-4xl mx-auto px-8 text-center">
          <h2 className="text-3xl font-extrabold text-slate-900 mb-3">Made for the people who carry the schedule.</h2>
          <p className="text-slate-500 mb-12">If you spend your day in P6, defending dates, or writing TIAs — this was built for you.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
            <div className="bg-white p-5 rounded-xl border border-slate-200">
              <div className="text-2xl mb-2">🏗️</div>
              <div className="font-bold text-slate-900">Project Managers</div>
              <div className="text-slate-500 mt-1 text-xs">PMP-level analysis without learning new tools</div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200">
              <div className="text-2xl mb-2">📅</div>
              <div className="font-bold text-slate-900">Schedulers</div>
              <div className="text-slate-500 mt-1 text-xs">Logic check and fragnet detection in 30 seconds</div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200">
              <div className="text-2xl mb-2">⚖️</div>
              <div className="font-bold text-slate-900">Claims Consultants</div>
              <div className="text-slate-500 mt-1 text-xs">TIA comparison + Word report drafting</div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200">
              <div className="text-2xl mb-2">🏛️</div>
              <div className="font-bold text-slate-900">Federal Contractors</div>
              <div className="text-slate-500 mt-1 text-xs">USACE / DGS / GSA scheduling workflows</div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="max-w-4xl mx-auto px-8">
          <h2 className="text-3xl font-extrabold text-slate-900 text-center mb-3">Simple pricing</h2>
          <p className="text-slate-500 text-center mb-12">Start free. Upgrade when you need TIA.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: 'Free', price: '$0', period: 'forever', features: ['1 active project', 'XER upload & analysis', '7-tab analysis', 'Print / Save PDF'], cta: 'Start Free', highlight: false },
              { name: 'ProjectLens', price: '$49', period: '/month', features: ['5 active projects', 'Full Lens analysis', 'Operational narrative', 'Project history & saves', 'Email support'], cta: 'Start 14-day Trial', highlight: true },
              { name: 'ProjectLens Plus', price: '$199', period: '/month', features: ['Unlimited projects', 'TIA Comparison Engine', 'Fragnet detection & Word report', 'Multi-user team access', 'Priority support'], cta: 'Start Plus Trial', highlight: false },
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
          <p className="text-center text-xs text-slate-400 mt-6">All plans include unlimited XER uploads and full schedule analysis. TIA features and Word report generation only in Plus.</p>
        </div>
      </section>

      {/* Founder note */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-3xl mx-auto px-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-8">
            <div className="text-xs font-bold text-blue-600 mb-2 uppercase tracking-wider">A note from the founder</div>
            <h3 className="text-2xl font-extrabold text-slate-900 mb-4">Why I built NobelPM</h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              I've spent 18 years managing federal and commercial construction projects — USACE, DGS, GSA, healthcare, K-12.
              I'm PMP-certified, a daily Primavera P6 user, and I've prepared more TIAs than I can count.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed mb-3">
              The same thing kept happening on every project: the schedule had the answers, but nobody read it.
              Critical paths were misunderstood. Logic violations went unnoticed. Long lead items slipped because
              nobody flagged them in time. And when delays hit, the TIA work took weeks of manual P6 effort.
            </p>
            <p className="text-slate-600 text-sm leading-relaxed">
              NobelPM is what I always wished I had — a tool that reads the schedule the way an experienced
              scheduler would, and tells you what matters in plain language. It's not another PM tool. It's the
              visibility layer that helps you see what your schedule is really trying to say.
            </p>
            <p className="text-slate-700 font-bold text-sm mt-5">— Jawid Noorzai, PMP</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center">
        <h2 className="text-3xl font-extrabold text-slate-900 mb-4">See your schedule clearly.</h2>
        <p className="text-slate-500 mb-8 max-w-xl mx-auto">Upload your XER. Get the analysis. Make the call. All in 30 seconds.</p>
        <Link href="/login" className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 inline-block">
          Try NobelPM Free →
        </Link>
        <p className="text-xs text-slate-400 mt-4">No credit card required.</p>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        <div className="flex items-center justify-center gap-2 mb-2">
          <svg width="18" height="13" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-label="NobelPM mark">
            <rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/>
            <rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/>
            <rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/>
            <rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/>
          </svg>
          <span className="font-bold text-slate-600">NobelPM</span>
        </div>
        <p>Visibility. Insight. Control. © 2026 NobelPM. All rights reserved.</p>
        <p className="mt-1 text-slate-400">Built by Nobel Project Management Services, LLC</p>
      </footer>
    </div>
  )
}
