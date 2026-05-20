'use client'
import Link from 'next/link'

// =============================================================================
// ControlLens marketing landing page.
//
// Layout (matches the approved mockup):
//   1. Top nav bar — brand mark + nav links + Sign in
//   2. Centered hero — badge, headline, subheadline, CTAs, "no credit card" line
//   3. Dashboard preview — realistic-looking screenshot of the actual product:
//      browser frame on top, sidebar with Mike Anderson + projects on left,
//      Schedule Analysis main pane with KPI tiles + Float Trend chart +
//      Key Findings panel on right
//   4. Social proof strip — agency abbreviations (no real client names)
//
// Lives at /landing. To make it the home page, either:
//   (a) replace /src/app/page.tsx with a redirect to /landing for unauthenticated
//       users, or
//   (b) move this file's contents into /src/app/page.tsx and update the auth
//       check accordingly.
//
// Vercel-level password protection covers all pages currently; for this to be
// a true public marketing surface, that protection needs to be removed.
// =============================================================================

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">

      {/* ─────────────── TOP NAV ─────────────── */}
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="font-extrabold text-base tracking-tight">
            Control<span className="text-blue-600">Lens</span>
          </span>
        </Link>
        <div className="flex gap-6 items-center text-sm text-slate-600">
          <a href="#features" className="hover:text-slate-900 hidden md:inline">Features</a>
          <a href="#pricing" className="hover:text-slate-900 hidden md:inline">Pricing</a>
          <a href="#customers" className="hover:text-slate-900 hidden md:inline">Customers</a>
          <Link href="/login" className="font-medium text-slate-900 hover:text-blue-600">
            Sign in
          </Link>
        </div>
      </nav>

      {/* ─────────────── HERO ─────────────── */}
      <section className="max-w-3xl mx-auto text-center px-4 pt-8 pb-10">
        <div className="inline-block bg-blue-50 text-blue-900 text-xs px-3 py-1 rounded-full font-semibold mb-5">
          Built for federal, state, and local construction PMs
        </div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight leading-tight mb-4">
          Construction schedule intelligence — instantly.
        </h1>
        <p className="text-base text-slate-600 leading-relaxed mb-7 max-w-xl mx-auto">
          Upload your P6 XER files. Get instant schedule analysis, risk detection, and TIA-ready insights. The 3-day workflow done in 30 seconds.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/signup"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold text-sm transition-colors"
          >
            Try it free
          </Link>
          <a
            href="#preview"
            className="border border-slate-300 hover:bg-slate-50 text-slate-900 px-6 py-3 rounded-lg font-semibold text-sm transition-colors"
          >
            See how it works
          </a>
        </div>
        <div className="text-xs text-slate-400 mt-4">
          No credit card · Full features for 14 days · Cancel anytime
        </div>
      </section>

      {/* ─────────────── DASHBOARD PREVIEW ─────────────── */}
      <section id="preview" className="max-w-7xl mx-auto px-4 pb-16">
        <div className="bg-slate-900 rounded-2xl p-2 shadow-2xl">

          {/* Browser-frame top bar */}
          <div className="flex items-center gap-1.5 px-3 pt-2 pb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400"/>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"/>
            <div className="w-2.5 h-2.5 rounded-full bg-green-400"/>
            <div className="flex-1 ml-2 bg-white/10 text-white/50 text-xs px-3 py-1 rounded font-mono">
              app.control-lens.com/dashboard
            </div>
          </div>

          {/* App shell: sidebar + main */}
          <div className="grid grid-cols-[180px_1fr] md:grid-cols-[210px_1fr] bg-slate-900 rounded-lg overflow-hidden min-h-[460px]">

            {/* Sidebar */}
            <aside className="bg-slate-900 p-2 text-white text-xs border-r border-white/10">
              {/* Brand */}
              <div className="flex items-center gap-1.5 px-1.5 py-2 border-b border-white/5">
                <BrandMark size="sm" />
                <span className="font-semibold text-xs">
                  Control<span className="text-blue-400">Lens</span>
                </span>
              </div>
              {/* Workspace */}
              <div className="px-2 py-2 border-b border-white/5">
                <div className="text-white/30 text-[8px] uppercase tracking-widest">Workspace</div>
                <div className="font-medium text-[10px] mt-0.5 leading-tight">Eastline Construction Group</div>
              </div>
              {/* User */}
              <div className="flex items-center gap-2 px-2 py-2 border-b border-white/5">
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[8px] font-semibold">MA</div>
                <div className="leading-tight">
                  <div className="font-semibold text-[10px]">Mike Anderson</div>
                  <div className="text-white/40 text-[8px]">Admin</div>
                </div>
              </div>
              {/* Search */}
              <div className="px-2 py-2 border-b border-white/5">
                <div className="bg-white/5 border border-white/10 px-2 py-1 rounded text-[9px] text-white/40 flex items-center gap-1">
                  <span>🔍</span><span>Search projects</span>
                </div>
              </div>
              {/* Projects */}
              <div className="py-2 space-y-0.5">
                <SidebarProject name="Fairfax HS Renovation" code="FCPS-2024-127" condition="green" badge="ACTIVE" badgeColor="green" versions={3} active expanded />
                <div className="ml-4 pl-2 border-l border-white/10 py-0.5 space-y-0.5">
                  <div className="flex gap-1 py-0.5 text-[9px] bg-blue-600/20 border-l-2 border-blue-400 -ml-2 pl-1.5 rounded-r">
                    <span className="text-blue-400">✓</span>
                    <div>
                      <div className="font-medium">CU-06</div>
                      <div className="text-white/40 text-[7px]">Apr 28</div>
                    </div>
                  </div>
                  <div className="py-0.5 text-[9px] text-white/50">CU-05 · Mar 31</div>
                  <div className="py-0.5 text-[9px] text-white/50">Baseline · Feb 14</div>
                </div>
                <SidebarProject name="NYC Parks Restoration" code="NYCDDC-24-087" condition="amber" badge="ON HOLD" badgeColor="amber" versions={2} />
                <SidebarProject name="Federal Courthouse P2" code="GSA-FC-2026" condition="red" badge="ACTIVE" badgeColor="green" versions={5} />
                <SidebarProject name="State Highway Bridge" code="VDOT-BR-1184" condition="green" badge="ACTIVE" badgeColor="green" versions={4} />
                <div className="px-2 py-1.5 mt-1.5 text-blue-400 text-[10px] font-medium">+ New project</div>
              </div>
            </aside>

            {/* Main pane: Schedule Analysis */}
            <div className="bg-slate-50 p-3 md:p-4">
              {/* Title row */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-sm text-slate-900">Schedule Analysis · Fairfax HS Renovation</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">CU-06 · Data date Apr 28, 2026 · Fairfax County Public Schools</div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <span className="bg-emerald-100 text-emerald-800 text-[9px] font-semibold px-2 py-1 rounded">● Stable</span>
                  <span className="bg-white border border-slate-200 text-slate-700 text-[9px] font-semibold px-2 py-1 rounded">⬇ Export</span>
                </div>
              </div>

              {/* KPI tiles */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <KPI label="Completion" value="67.3%" sub="▲ +4.2 vs CU-05" subColor="text-emerald-600"/>
                <KPI label="Critical Path" value="142 d" sub="▼ −8 days lost" subColor="text-red-600"/>
                <KPI label="Float Erosion" value="−18 d" sub="Monitor closely" subColor="text-amber-600"/>
                <KPI label="Open RFIs" value="3" sub="2 high priority" subColor="text-slate-500"/>
              </div>

              {/* Float Trend chart */}
              <div className="bg-white border border-slate-200 rounded-md p-2.5 mb-2.5">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <div className="font-semibold text-[11px] text-slate-900">Float Trend by Version</div>
                  </div>
                  <div className="flex gap-2 text-[9px] text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-600 rounded-sm inline-block"/>Total Float</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-600 rounded-sm inline-block"/>Critical Float</span>
                  </div>
                </div>
                <svg viewBox="0 0 480 110" className="w-full h-24">
                  <line x1="20" y1="100" x2="475" y2="100" stroke="#cbd5e1" strokeWidth="0.5"/>
                  <line x1="20" y1="70" x2="475" y2="70" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2"/>
                  <line x1="20" y1="40" x2="475" y2="40" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2"/>
                  <line x1="20" y1="15" x2="475" y2="15" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2"/>
                  <text x="14" y="103" fontSize="7" fill="#94a3b8" textAnchor="end">0</text>
                  <text x="14" y="73" fontSize="7" fill="#94a3b8" textAnchor="end">15</text>
                  <text x="14" y="43" fontSize="7" fill="#94a3b8" textAnchor="end">30</text>
                  <text x="14" y="18" fontSize="7" fill="#94a3b8" textAnchor="end">45</text>
                  <polyline points="40,25 110,32 180,38 250,50 320,58 390,68" fill="none" stroke="#2563eb" strokeWidth="2"/>
                  {[[40,25],[110,32],[180,38],[250,50],[320,58],[390,68]].map(([x,y],i)=>
                    <circle key={i} cx={x} cy={y} r="3" fill="#2563eb"/>
                  )}
                  <polyline points="40,75 110,72 180,80 250,85 320,82 390,90" fill="none" stroke="#dc2626" strokeWidth="2"/>
                  {[[40,75],[110,72],[180,80],[250,85],[320,82],[390,90]].map(([x,y],i)=>
                    <circle key={i} cx={x} cy={y} r="3" fill="#dc2626"/>
                  )}
                  {['Baseline','CU-01','CU-02','CU-03','CU-04','CU-06'].map((label, i) =>
                    <text key={label} x={40 + i * 70} y="108" fontSize="7" fill="#64748b" textAnchor="middle">{label}</text>
                  )}
                </svg>
              </div>

              {/* Key Findings */}
              <div className="bg-sky-50 border border-sky-200 rounded-md p-2.5 flex gap-2">
                <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px]">📊</span>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-[10px] text-sky-900 mb-0.5">Key Findings · CU-06 vs Baseline</div>
                  <div className="text-[10px] text-sky-800 leading-relaxed">
                    Schedule remains <strong>stable</strong> with 18 days of float erosion since baseline. Activity A1240 (Site Concrete Pour Phase 3) is on critical path with weather sensitivity — recommend monitoring 3-day forecast window. No recovery action required at this time.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── SOCIAL PROOF ─────────────── */}
      <section id="customers" className="text-center pb-16 px-4">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">
          Built for the workflow used by construction PMs across federal, state, and local government
        </div>
        <div className="text-sm text-slate-600 font-semibold tracking-wide">
          USACE · NAVFAC · GSA · VA · State DOTs · County Governments
        </div>
      </section>

    </div>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 16 : 28
  const h = size === 'sm' ? 11 : 20
  return (
    <svg width={w} height={h} viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
      <rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/>
      <rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/>
      <rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/>
      <rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/>
    </svg>
  )
}

function KPI({ label, value, sub, subColor }: { label: string; value: string; sub: string; subColor: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md p-2">
      <div className="text-[8px] text-slate-500 uppercase tracking-wider font-semibold">{label}</div>
      <div className="text-lg font-bold text-slate-900 mt-0.5">{value}</div>
      <div className={`text-[8px] mt-0.5 ${subColor}`}>{sub}</div>
    </div>
  )
}

function SidebarProject({
  name, code, condition, badge, badgeColor, versions, active, expanded,
}: {
  name: string
  code: string
  condition: 'green' | 'amber' | 'red'
  badge: string
  badgeColor: 'green' | 'amber'
  versions: number
  active?: boolean
  expanded?: boolean
}) {
  const dotColor = condition === 'green' ? 'bg-emerald-400'
    : condition === 'amber' ? 'bg-amber-400'
    : 'bg-red-400'
  const badgeBg = badgeColor === 'green' ? 'bg-emerald-500/25 text-emerald-300'
    : 'bg-amber-500/25 text-amber-300'
  return (
    <div className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded ${active ? 'bg-white/5' : ''}`}>
      <span className="text-[8px] text-white/40 w-2">{expanded ? '▾' : '▸'}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
      <div className="flex-1 min-w-0 leading-tight">
        <div className="font-medium text-[10px] truncate">{name}</div>
        <div className="text-white/40 text-[7px] font-mono">{code}</div>
      </div>
      <span className={`${badgeBg} text-[7px] font-semibold px-1.5 py-px rounded-full uppercase tracking-wide`}>{badge}</span>
      <span className="text-white/50 text-[8px]">{versions}</span>
    </div>
  )
}
