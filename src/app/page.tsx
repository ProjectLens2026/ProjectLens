'use client'
import Link from 'next/link'

// =============================================================================
// ControlLens marketing landing page — full version.
//
// Sections (top to bottom):
//   1. Top nav
//   2. Hero — "Read your schedule like a 20-year scheduler would."
//   3. Dashboard preview — the "wow" moment: a real-looking post-upload
//      analysis showing 550 activities, 133 days behind, 28/100 score
//   4. "Upload. Analyze. Act." — 3-step explainer (anchor: #how)
//   5. "Built for PMs and schedulers" — 6-feature grid
//   6. "Made for the people who carry the schedule" — 4 personas
//   7. Pricing — 3 tiers (Free / ControlLens / ControlLens Plus)
//   8. Final CTA — "See your schedule clearly."
//   9. Footer
//
// Route: /  (the home page — first thing visitors see at app.control-lens.com)
// =============================================================================

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">

      {/* ─────────────── 1. TOP NAV ─────────────── */}
      <nav className="border-b border-slate-100 sticky top-0 bg-white/95 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark />
            <span className="font-extrabold text-base tracking-tight">
              Control<span className="text-blue-600">Lens</span>
            </span>
          </Link>
          <div className="flex gap-6 items-center text-sm text-slate-600">
            <a href="#how" className="hover:text-slate-900 hidden md:inline">How it works</a>
            <a href="#features" className="hover:text-slate-900 hidden md:inline">Features</a>
            <a href="#pricing" className="hover:text-slate-900 hidden md:inline">Pricing</a>
            <Link href="/login" className="font-medium text-slate-900 hover:text-blue-600">
              Sign in
            </Link>
            <Link href="/login" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-semibold text-xs transition-colors hidden md:inline-block">
              Try Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ─────────────── 2. HERO ─────────────── */}
      <section className="max-w-4xl mx-auto text-center px-4 pt-16 pb-8">
        <div className="inline-block bg-blue-50 text-blue-900 text-xs px-3 py-1 rounded-full font-semibold mb-6">
          Built for federal, state, and local construction PMs
        </div>
        <h1 className="text-4xl md:text-6xl font-medium tracking-tight leading-tight mb-5">
          Read your schedule like a <br className="hidden md:block"/>
          <span className="text-blue-600">20-year scheduler</span> would.
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-2xl mx-auto">
          Upload your Primavera P6 XER file. ControlLens finds your critical path drivers, logic violations, long lead risks, and delay evidence — in 30 seconds. No training. No setup.
        </p>
        <div className="flex gap-3 justify-center flex-wrap mb-3">
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-700 text-white px-7 py-3.5 rounded-lg font-semibold text-base transition-colors shadow-lg shadow-blue-200"
          >
            Try It Free — Upload Your XER
          </Link>
          <a
            href="#how"
            className="border border-slate-300 hover:bg-slate-50 text-slate-900 px-7 py-3.5 rounded-lg font-semibold text-base transition-colors"
          >
            See how it works →
          </a>
        </div>
        <div className="text-sm text-slate-500 mt-2">
          No credit card. No commitment. Drop in a schedule and see for yourself.
        </div>
      </section>

      {/* ─────────────── 3. DASHBOARD PREVIEW (full Executive Dashboard with Sidebar) ─────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="bg-slate-900 rounded-2xl p-2 shadow-2xl">

          {/* Browser-frame top bar */}
          <div className="flex items-center gap-1.5 px-3 pt-2 pb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400"/>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"/>
            <div className="w-2.5 h-2.5 rounded-full bg-green-400"/>
            <div className="flex-1 ml-2 bg-white/10 text-white/50 text-xs px-3 py-1 rounded font-mono truncate">
              app.control-lens.com/dashboard
            </div>
          </div>

          {/* App shell: sidebar + main content */}
          <div className="grid md:grid-cols-[220px_1fr] bg-slate-900 rounded-lg overflow-hidden">

            {/* ─────── SIDEBAR ─────── */}
            <aside className="bg-slate-900 text-white text-xs border-r border-white/10 hidden md:block">

              {/* Brand */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
                <BrandMark/>
                <div className="leading-tight">
                  <div className="font-extrabold text-[11px]">Control<span className="text-blue-400">Lens</span></div>
                  <div className="text-[8px] text-white/40">Construction Intelligence</div>
                </div>
              </div>

              {/* Workspace */}
              <div className="px-3 py-2 border-b border-white/5">
                <div className="text-white/30 text-[7px] uppercase tracking-widest">Workspace</div>
                <div className="text-[10px] font-medium mt-0.5 leading-tight">Nobel Project Control Services, LLC</div>
              </div>

              {/* User */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">MA</div>
                <div className="leading-tight min-w-0">
                  <div className="text-[10px] font-semibold truncate">Mike Anderson</div>
                  <div className="text-[8px] text-white/40">Admin</div>
                </div>
              </div>

              {/* Search */}
              <div className="px-3 py-2 border-b border-white/5">
                <div className="bg-white/5 border border-white/10 px-2 py-1 rounded text-[9px] text-white/40 flex items-center gap-1">
                  <span>🔍</span><span>Search projects or versions</span>
                </div>
              </div>

              {/* Projects */}
              <div className="py-2 px-2 border-b border-white/5">
                {/* Active project expanded */}
                <div className="bg-white/5 rounded">
                  <div className="flex items-center gap-1 px-1.5 py-1.5">
                    <span className="text-[8px] text-white/40">▾</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[10px] truncate">Federal Building Renovation</div>
                      <div className="text-white/40 text-[7px] font-mono">CL-2024-FBR-127</div>
                    </div>
                    <span className="bg-emerald-500/25 text-emerald-300 text-[7px] font-semibold px-1 py-px rounded-full uppercase">ACTIVE</span>
                    <span className="text-white/50 text-[8px]">2</span>
                  </div>
                  <div className="ml-4 pl-2 border-l border-white/10 pb-1.5 space-y-0.5">
                    <div className="flex items-center gap-1 py-0.5 -ml-2 pl-1.5 bg-blue-600/20 border-l-2 border-blue-400 rounded-r">
                      <span className="text-blue-400 text-[8px]">✓</span>
                      <div className="leading-tight">
                        <div className="font-medium text-[9px]">CU-06</div>
                        <div className="text-white/40 text-[7px]">May 15</div>
                      </div>
                    </div>
                    <div className="py-0.5 px-1 text-[9px] text-white/50">Baseline · Mar 1</div>
                  </div>
                </div>
                {/* Other projects */}
                <div className="flex items-center gap-1 px-1.5 py-1.5 mt-0.5">
                  <span className="text-[8px] text-white/40">▸</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[10px] truncate">VA Hospital Mod.</div>
                    <div className="text-white/40 text-[7px] font-mono">CL-2024-VAH-088</div>
                  </div>
                  <span className="bg-emerald-500/25 text-emerald-300 text-[7px] font-semibold px-1 py-px rounded-full uppercase">ACTIVE</span>
                  <span className="text-white/50 text-[8px]">3</span>
                </div>
                <div className="flex items-center gap-1 px-1.5 py-1.5">
                  <span className="text-[8px] text-white/40">▸</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[10px] truncate">Federal Courthouse P2</div>
                    <div className="text-white/40 text-[7px] font-mono">CL-2025-FC-201</div>
                  </div>
                  <span className="bg-emerald-500/25 text-emerald-300 text-[7px] font-semibold px-1 py-px rounded-full uppercase">ACTIVE</span>
                  <span className="text-white/50 text-[8px]">1</span>
                </div>
                <div className="px-2 py-1.5 mt-1 text-blue-400 text-[10px] font-medium">+ New project</div>
              </div>

              {/* Views section */}
              <div className="py-2 border-b border-white/5">
                <div className="text-white/30 text-[7px] uppercase tracking-widest px-3 mb-1">Views · CL-2024-FBR-127</div>
                <SidebarView icon="⊞" name="Overview" active/>
                <SidebarView icon="🔍" name="Schedule Analysis"/>
                <SidebarView icon="⚠" name="Risks & Issues"/>
                <SidebarView icon="🚚" name="Procurement"/>
                <SidebarView icon="❓" name="RFIs"/>
                <SidebarView icon="📋" name="Submittals"/>
                <SidebarView icon="🔄" name="Change Orders"/>
                <SidebarView icon="⬆" name="Upload Version"/>
                <SidebarView icon="📈" name="Trend Analysis"/>
                <SidebarView icon="📑" name="TIA Comparison"/>
              </div>

              {/* Workspace items */}
              <div className="py-2 border-b border-white/5">
                <div className="text-white/30 text-[7px] uppercase tracking-widest px-3 mb-1">Workspace</div>
                <SidebarView icon="📁" name="Archive Projects"/>
                <SidebarView icon="🗑" name="Deleted Items"/>
                <SidebarView icon="⚙" name="Settings"/>
              </div>

              {/* Sign out */}
              <div className="py-2">
                <SidebarView icon="🚪" name="Sign Out"/>
              </div>
            </aside>

            {/* ─────── MAIN CONTENT ─────── */}
            <div className="bg-slate-50 p-3 md:p-4 space-y-3 overflow-hidden">

              {/* Header */}
              <div className="bg-white border-b border-slate-200 px-3 py-2 -mx-3 md:-mx-4 -mt-3 md:-mt-4 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 text-xs md:text-sm">Executive Dashboard</span>
                  <span className="text-slate-400 text-[10px] md:text-xs ml-2 hidden lg:inline">· Federal Building Renovation · CL-2024-FBR-127</span>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <span className="bg-blue-600 text-white text-[9px] font-semibold px-2 py-1 rounded">🔍 Full Analysis</span>
                </div>
              </div>

              {/* Health Banner */}
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-2.5 flex items-center gap-2">
                <div className="text-xl flex-shrink-0">⚠</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-red-900 text-xs">Recovery Required · Health 28/100</div>
                  <div className="text-[10px] text-red-800 mt-0.5 leading-snug">Critical path driven by MEP procurement: thermal expansion tank, insulation, and hydronic air control unit not yet ordered.</div>
                </div>
              </div>

              {/* Key Dates row */}
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <div className="text-[11px] font-semibold text-slate-800 mb-1.5">Key Dates &amp; Durations</div>
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                  <DateMini label="Data Date" value="05/15/2024" />
                  <DateMini label="Project Start" value="07/01/2024" sub="NTP" />
                  <DateMini label="Subst. Comp." value="11/15/2024" sub="MILE-195" />
                  <DateMini label="Final Comp." value="11/30/2024" sub="MILE-200" />
                  <DateMini label="Contract End" value="11/30/2024" valueColor="text-red-600" />
                  <DateMini label="Projected" value="04/10/2025" valueColor="text-amber-600" />
                </div>
              </div>

              {/* KPI tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <KPIMini label="Days Behind" value="+133" sub="↓ TIA territory" valueColor="text-red-600"/>
                <KPIMini label="Work Complete" value="40%" sub="222 of 550" valueColor="text-slate-900"/>
                <KPIMini label="Long Lead Risk" value="3" sub="of 6 long lead" valueColor="text-red-600"/>
                <KPIMini label="Risks" value="7" sub="4 critical" valueColor="text-red-600"/>
              </div>

              {/* Schedule Progress chart */}
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-800">Schedule Progress</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Contract <span className="text-red-600 font-semibold">11/30/2024</span> · Projected <span className="text-amber-600 font-semibold">04/10/2025 (+133d)</span></div>
                  </div>
                  <div className="hidden md:flex gap-2 text-[8px] text-slate-500 flex-shrink-0">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-600 rounded-sm inline-block"/>Planned</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-600 rounded-sm inline-block"/>Actual</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-sm inline-block"/>Forecast</span>
                  </div>
                </div>
                <ScheduleProgressMockChart/>
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-100">
                  <div>
                    <div className="text-[8px] text-slate-500">Behind plan by</div>
                    <div className="text-[10px] font-semibold text-red-600 mt-0.5">−60.0 pts</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-slate-500">Velocity</div>
                    <div className="text-[10px] font-semibold text-slate-900 mt-0.5">~5.2% / mo</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-slate-500">Required</div>
                    <div className="text-[10px] font-semibold text-red-600 mt-0.5">Past contract</div>
                  </div>
                </div>
              </div>

              {/* Attention Areas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <AttentionMini icon="📅" title="Compression" desc="75 activities behind." impact="medium"/>
                <AttentionMini icon="🔧" title="Out-of-Sequence" desc="57 logic violations." impact="high"/>
                <AttentionMini icon="⚖️" title="TIA Territory" desc="133 days behind." impact="high"/>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── 4. UPLOAD. ANALYZE. ACT. ─────────────── */}
      <section id="how" className="bg-slate-50 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-3">Upload. Analyze. Act.</h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              No training required. No complicated setup. Just upload your XER and ControlLens does the hard work.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StepCard
              icon="📁"
              step="STEP 01"
              title="Upload your XER"
              description="Drag and drop your Primavera P6 schedule. ControlLens parses 500+ activities and 800+ relationships in seconds."
            />
            <StepCard
              icon="🔍"
              step="STEP 02"
              title="See what matters"
              description="Critical path drivers, logic check, long lead items, no-tie activities, field reality — all in 7 organized tabs."
            />
            <StepCard
              icon="📄"
              step="STEP 03"
              title="Generate the report"
              description="Print, save as PDF, or for TIA work — compare two schedules and generate a full Word document."
            />
          </div>
        </div>
      </section>

      {/* ─────────────── 5. FEATURES ─────────────── */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-3">
              Built for PMs and schedulers who do real work.
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              Every feature designed from 18 years of construction PM experience on federal and commercial projects.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon="🎯"
              title="Critical Path Analysis"
              description="See exactly what is driving project completion. ControlLens identifies driving activities, float condition, and where the path can break."
            />
            <FeatureCard
              icon="🔧"
              title="Schedule Logic Check"
              description="Catches out-of-sequence work, fabricated-before-approval procurement, and review-before-submit violations. TIA evidence ready."
            />
            <FeatureCard
              icon="📦"
              title="Long Lead Item Tracker"
              description="Every 20+ day procurement item, sorted by float. Know which vendor calls to make today vs which can wait until next week."
            />
            <FeatureCard
              icon="⛓️"
              title="No Logic Ties Detection"
              description="Finds activities missing predecessors or successors — the schedule quality issues that hide real risk."
            />
            <FeatureCard
              icon="👷"
              title="Field Reality Check"
              description="Compares in-progress activities against expected sequencing. Flags drywall going up before inspections, painting before drywall is closed."
            />
            <FeatureCard
              icon="📑"
              title="TIA Comparison & Word Report"
              description="Upload two schedules — un-impacted and impacted. ControlLens detects fragnets, runs trend analysis, and generates a full TIA Word document ready for owner submission."
            />
          </div>
        </div>
      </section>

      {/* ─────────────── 6. PERSONAS ─────────────── */}
      <section className="bg-slate-50 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-3">
              Made for the people who carry the schedule.
            </h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              If you spend your day in P6, defending dates, or writing TIAs — this was built for you.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <PersonaCard
              icon="🏗️"
              title="Project Managers"
              description="PMP-level analysis without learning new tools"
            />
            <PersonaCard
              icon="📅"
              title="Schedulers"
              description="Logic check and fragnet detection in 30 seconds"
            />
            <PersonaCard
              icon="⚖️"
              title="Claims Consultants"
              description="TIA comparison + Word report drafting"
            />
            <PersonaCard
              icon="🏛️"
              title="Federal Contractors"
              description="USACE / DGS / GSA scheduling workflows"
            />
          </div>
        </div>
      </section>

      {/* ─────────────── 7. PRICING ─────────────── */}
      <section id="pricing" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-3">Simple pricing</h2>
            <p className="text-base text-slate-600 max-w-2xl mx-auto">
              Start free. Upgrade when you need TIA.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            <PriceCard
              tier="Free"
              price="$0"
              priceSub="forever"
              features={[
                '1 active project',
                'XER upload & analysis',
                '7-tab analysis',
                'Print / Save PDF',
              ]}
              ctaText="Start Free"
              ctaHref="/login"
            />
            <PriceCard
              tier="ControlLens"
              price="$49"
              priceSub="/month"
              features={[
                '5 active projects',
                'Full Analysis',
                'Operational narrative',
                'Project history & saves',
                'Email support',
              ]}
              ctaText="Start 14-day Trial"
              ctaHref="/login"
              featured
            />
            <PriceCard
              tier="ControlLens Plus"
              price="$199"
              priceSub="/month"
              features={[
                'Unlimited projects',
                'TIA Comparison Engine',
                'Fragnet detection & Word report',
                'Multi-user team access',
                'Priority support',
              ]}
              ctaText="Start Plus Trial"
              ctaHref="/login"
            />
          </div>
          <div className="text-center text-sm text-slate-500 mt-8 max-w-2xl mx-auto">
            All plans include unlimited XER uploads and full schedule analysis. TIA features and Word report generation only in Plus.
          </div>
        </div>
      </section>

      {/* ─────────────── 8. FINAL CTA ─────────────── */}
      <section className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 py-20 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-medium tracking-tight text-white mb-3">
            See your schedule clearly.
          </h2>
          <p className="text-base text-blue-100 mb-8">
            Upload your XER. Get the analysis. Make the call. All in 30 seconds.
          </p>
          <Link
            href="/login"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-semibold text-base transition-colors shadow-2xl"
          >
            Try ControlLens Free →
          </Link>
          <div className="text-xs text-blue-200/70 mt-4">No credit card required.</div>
        </div>
      </section>

      {/* ─────────────── 9. FOOTER ─────────────── */}
      <footer className="bg-slate-900 text-slate-300 py-12 px-4 border-t border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <div className="font-bold text-white">ControlLens</div>
              <div className="text-xs text-slate-400">Visibility. Insight. Control.</div>
            </div>
          </div>
          <div className="text-xs text-slate-400 text-center md:text-right">
            <div>© 2026 ControlLens. All rights reserved.</div>
            <div className="mt-1">Built by Nobel Project Management Services</div>
          </div>
        </div>
      </footer>

    </div>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

function BrandMark() {
  return (
    <svg width="28" height="20" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
      <rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/>
      <rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/>
      <rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/>
      <rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/>
    </svg>
  )
}

function SidebarView({ icon, name, active }: { icon: string; name: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 text-[10px] ${active ? 'bg-blue-600/20 text-blue-100 border-l-2 border-blue-400' : 'text-white/70 hover:bg-white/5'}`}>
      <span className="text-[10px] w-3 text-center">{icon}</span>
      <span className="truncate">{name}</span>
    </div>
  )
}

function DateMini({ label, value, sub, valueColor = 'text-slate-900' }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`text-xs font-semibold mt-0.5 ${valueColor}`}>{value}</div>
      {sub && <div className="text-[8px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function KPIMini({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${valueColor}`}>{value}</div>
      <div className="text-[9px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  )
}

function AttentionMini({ icon, title, desc, impact }: { icon: string; title: string; desc: string; impact: 'high' | 'medium' }) {
  const border = impact === 'high' ? 'border-red-200' : 'border-amber-200'
  const pill = impact === 'high' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
  return (
    <div className={`bg-white border rounded-xl p-2.5 ${border}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="font-semibold text-[11px] text-slate-900 flex-1">{title}</span>
        <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${pill}`}>{impact}</span>
      </div>
      <div className="text-[10px] text-slate-600 leading-snug">{desc}</div>
    </div>
  )
}

function ScheduleProgressMockChart() {
  // Static SVG chart mirroring the real dashboard's Schedule Progress visual:
  // 7 monthly buckets, planned (blue) vs actual (green / amber forecast),
  // with Today / Contract End / Forecast End vertical markers.
  const W = 700, H = 180
  const padL = 36, padR = 16, padT = 18, padB = 38
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  // 7 buckets: May, Jul, Sep, Nov (contract end), Jan'25, Mar (today), Apr (forecast end)
  // Heights: planned, actual (0-100)
  const buckets = [
    { label: 'May',  sub: "'24", planned: 14, actual: 5,  forecast: false, today: false },
    { label: 'Jul',  sub: '',     planned: 38, actual: 18, forecast: false, today: false },
    { label: 'Sep',  sub: '',     planned: 67, actual: 28, forecast: false, today: false },
    { label: 'Nov',  sub: '',     planned: 100, actual: 36, forecast: false, today: false }, // contract end
    { label: 'Jan',  sub: "'25",  planned: 100, actual: 40, forecast: false, today: true  }, // today
    { label: 'Mar',  sub: '',     planned: 100, actual: 70, forecast: true,  today: false },
    { label: 'Apr',  sub: '',     planned: 100, actual: 100, forecast: true, today: false }, // forecast end
  ]
  const todayIdx = 4
  const contractIdx = 3
  const forecastEndIdx = 6
  const stepX = innerW / (buckets.length - 1)
  const barW = 14
  const groupW = barW * 2 + 4
  const yFor = (p: number) => padT + innerH * (1 - p / 100)
  const xCenter = (i: number) => padL + i * stepX
  const xGroup = (i: number) => xCenter(i) - groupW / 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      {/* Gridlines */}
      {[0, 25, 50, 75, 100].map(p => (
        <g key={p}>
          <line x1={padL} y1={yFor(p)} x2={W - padR} y2={yFor(p)} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray={p === 0 ? '0' : '2'}/>
          <text x={padL - 6} y={yFor(p) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">{p}%</text>
        </g>
      ))}
      {/* Markers */}
      <g>
        <line x1={xCenter(todayIdx)} y1={padT} x2={xCenter(todayIdx)} y2={H - padB} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2,2"/>
        <text x={xCenter(todayIdx)} y={padT - 4} fontSize="8" fill="#94a3b8" textAnchor="middle">Today</text>
      </g>
      <g>
        <line x1={xCenter(contractIdx)} y1={padT} x2={xCenter(contractIdx)} y2={H - padB} stroke="#dc2626" strokeWidth="1" strokeDasharray="3,2"/>
        <text x={xCenter(contractIdx)} y={padT - 4} fontSize="9" fill="#dc2626" textAnchor="middle" fontWeight="600">Contract End</text>
      </g>
      <g>
        <line x1={xCenter(forecastEndIdx)} y1={padT} x2={xCenter(forecastEndIdx)} y2={H - padB} stroke="#d97706" strokeWidth="1" strokeDasharray="3,2"/>
        <text x={xCenter(forecastEndIdx)} y={padT - 4} fontSize="9" fill="#d97706" textAnchor="middle" fontWeight="600">Forecast End</text>
      </g>
      {/* Bars */}
      {buckets.map((b, i) => {
        const x = xGroup(i)
        const plannedColor = b.forecast ? 'rgba(37, 99, 235, 0.3)' : '#2563eb'
        const actualColor = b.forecast ? '#fbbf24' : '#16a34a'
        const plannedY = yFor(b.planned)
        const actualY = yFor(b.actual)
        const plannedH = (H - padB) - plannedY
        const actualH = (H - padB) - actualY
        return (
          <g key={i}>
            <rect x={x} y={plannedY} width={barW} height={plannedH} fill={plannedColor}/>
            <rect x={x + barW + 4} y={actualY} width={barW} height={actualH} fill={actualColor} opacity={b.forecast ? 0.85 : 1}/>
            <text x={xCenter(i)} y={H - padB + 14} fontSize="9" fill={b.today ? '#0f172a' : '#64748b'} textAnchor="middle" fontWeight={b.today ? '600' : '400'}>{b.label}</text>
            {b.sub && <text x={xCenter(i)} y={H - padB + 24} fontSize="8" fill="#94a3b8" textAnchor="middle">{b.sub}</text>}
          </g>
        )
      })}
    </svg>
  )
}

function StepCard({ icon, step, title, description }: { icon: string; step: string; title: string; description: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
      <div className="text-4xl mb-4">{icon}</div>
      <div className="text-[10px] uppercase tracking-widest text-blue-600 font-bold mb-2">{step}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 hover:border-blue-300 hover:shadow-md transition-all">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  )
}

function PersonaCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-sm font-semibold mb-1.5">{title}</h3>
      <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
    </div>
  )
}

function PriceCard({
  tier, price, priceSub, features, ctaText, ctaHref, featured,
}: {
  tier: string
  price: string
  priceSub: string
  features: string[]
  ctaText: string
  ctaHref: string
  featured?: boolean
}) {
  return (
    <div className={`relative bg-white border-2 rounded-xl p-6 flex flex-col ${featured ? 'border-blue-500 shadow-xl shadow-blue-100' : 'border-slate-200'}`}>
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
          Most Popular
        </div>
      )}
      <div className="text-lg font-semibold mb-2">{tier}</div>
      <div className="flex items-baseline gap-1 mb-5">
        <div className="text-4xl font-bold">{price}</div>
        <div className="text-sm text-slate-500">{priceSub}</div>
      </div>
      <ul className="space-y-2.5 mb-6 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <span className="text-emerald-600 font-bold flex-shrink-0">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className={`block text-center px-4 py-3 rounded-lg font-semibold text-sm transition-colors ${
          featured
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
        }`}
      >
        {ctaText}
      </Link>
    </div>
  )
}
