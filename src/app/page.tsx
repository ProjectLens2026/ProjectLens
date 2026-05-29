'use client'
// =============================================================================
// ControlLens — Landing page (Day 10 rebuild, v2)
//
// v2 changes (per founder):
//   - NO "AI" mentions anywhere — say what it does, not how
//   - Hero dashboard visual restored (SVG mockup: sidebar + Enterprise Dashboard)
//   - All other Day 10 changes kept (3-tier pricing, no free, team features)
// =============================================================================
import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ====================== Nav ====================== */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-6">
            <a href="#features" className="hidden md:inline text-sm text-slate-600 hover:text-slate-900 font-medium">Features</a>
            <a href="#who" className="hidden md:inline text-sm text-slate-600 hover:text-slate-900 font-medium">Who it's for</a>
            <a href="#pricing" className="hidden md:inline text-sm text-slate-600 hover:text-slate-900 font-medium">Pricing</a>
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 font-semibold">Sign in</Link>
            <Link href="/login"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg">
              Start 15-day trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ====================== Hero ====================== */}
      <section className="bg-gradient-to-b from-white to-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 mb-6 text-xs font-bold text-blue-700 uppercase tracking-wider">
                <span>★</span> Construction project scheduling for the whole jobsite team
              </div>
              <h1 className="text-4xl md:text-5xl xl:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight mb-6">
                Your schedule, <span className="text-blue-600">explained</span>.
              </h1>
              <p className="text-lg text-slate-600 mb-7 leading-relaxed">
                Upload your Primavera P6 schedule. ControlLens shows your critical path, near-critical paths,
                logic gaps, and long-lead risks — all in <strong>plain language</strong> the whole jobsite team
                can read. PMs, superintendents, owners. Not just schedulers.
              </p>
              <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-5">
                <Link href="/login"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-7 py-3.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:shadow-xl hover:shadow-blue-600/30">
                  Start 15-day free trial →
                </Link>
                <a href="#how"
                  className="text-slate-700 hover:text-slate-900 font-semibold px-5 py-3 rounded-xl transition-colors">
                  See how it works
                </a>
              </div>
              <div className="text-xs text-slate-500 italic">
                15 days free · Then 50% off for 2 months · Card required at signup, no charge for 15 days
              </div>

              {/* Trust strip */}
              <div className="mt-10 grid grid-cols-4 gap-4 max-w-md">
                <TrustItem value="15 days" label="Free trial" />
                <TrustItem value="5" label="Projects on Pro" />
                <TrustItem value="$49.50" label="First 2 months" />
                <TrustItem value="56" label="Users on Pro" />
              </div>
            </div>

            {/* Right: dashboard mockup */}
            <div className="relative">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ====================== How it works ====================== */}
      <section id="how" className="py-20 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">How it works</div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">Upload. Analyze. Act.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              No training required. No complicated setup. Just upload your XER and ControlLens does the hard work.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <StepCard step="01" icon="📁" title="Upload your XER"
              body="Drag and drop your Primavera P6 schedule. ControlLens parses 500+ activities and 800+ relationships in seconds." />
            <StepCard step="02" icon="🔍" title="See what's happening"
              body="Critical path drivers, logic violations, long lead risks, RFIs — all analyzed with plain-language summaries your whole team can read." />
            <StepCard step="03" icon="📄" title="Generate the report"
              body="One-click PDF or full TIA Word document ready to send to owners. Auto-drafted narratives, no scheduler jargon required." />
          </div>
        </div>
      </section>

      {/* ====================== Features grid ====================== */}
      <section id="features" className="py-20 md:py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">What you get</div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
              The whole project, on one platform.
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Every feature designed from 18 years of construction PM experience on federal and commercial projects.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard icon="🛤️" title="Multiple Float Paths" badge="NEW"
              body="Beyond the single critical path. ControlLens ranks the top 5 driving chains by total float — Path 1 critical, Paths 2-5 near-critical. Today's near-critical is tomorrow's critical after one slip." />
            <FeatureCard icon="🎯" title="Critical & Longest Path"
              body="The full Primavera filter set: critical path, longest path, 2-week lookahead, activities not started, finished activities. Read directly from your XER." />
            <FeatureCard icon="🔧" title="Schedule Logic Check"
              body="Catches out-of-sequence work, fabrication-before-approval, review-before-submit. Every violation listed with evidence — ready for TIA." />
            <FeatureCard icon="📦" title="Long Lead Item Tracker"
              body="Every 20+ day procurement item sorted by float. Know which vendor calls to make today vs next week." />
            <FeatureCard icon="📑" title="Time Impact Analysis" badge="PRO"
              body="Upload un-impacted and impacted (fragnet) schedules. ControlLens computes the time impact, ranks affected paths, and generates the full Word TIA report." />
            <FeatureCard icon="📊" title="Earned Value Management" badge="PRO"
              body="Full EVM with BCWP, BCWS, ACWP, SPI, CPI. Watch your project drift before it becomes a claim." />
            <FeatureCard icon="📈" title="Trend Analysis" badge="PRO"
              body="Compare versions side-by-side. See what changed, what slipped, and what's pacing. Monthly schedule reviews in one screen." />
            <FeatureCard icon="👥" title="Team Collaboration"
              body="Invite your PMs, schedulers, supers, and execs. Role-based access (Owner / Admin / PM / Viewer). Unlimited members on every plan." />
            <FeatureCard icon="💬" title="Plain-Language Summaries"
              body="Every analysis comes with a clear explanation anyone can read. No more 'BEI 0.78' — ControlLens tells you what's happening, what's driving it, and what to do this week." />
          </div>
        </div>
      </section>

      {/* ====================== Who it's for ====================== */}
      <section id="who" className="py-20 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">Who it's for</div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
              Built for the people on the jobsite — not just the scheduler.
            </h2>
            <p className="text-slate-600 max-w-3xl mx-auto leading-relaxed">
              ControlLens is <strong className="text-slate-900">construction project scheduling for PMs, superintendents, and owners</strong>.
              It doesn't just flag errors — it tells your team where to focus today, and why.
              One project or one thousand, even when the XER has missing logic ties or wrong relationships,
              ControlLens reads through the noise and points to what actually matters this week.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            <PersonaCard icon="🏗️" title="Project Managers" body="Know what to focus on this week, even when the schedule isn't perfect. Plain-language answers, no P6 expertise required." />
            <PersonaCard icon="👷" title="Superintendents" body="Get the field's view of the schedule — what's at risk, what's blocking what, and which calls to make today." />
            <PersonaCard icon="🏛️" title="Owners & Federal Agencies" body="Executive summaries in plain language. Know project health without digging through bar charts." />
            <PersonaCard icon="📅" title="Schedulers & Claims Consultants" body="Logic check, fragnet detection, full TIA reports, and defensible Word drafts in 30 seconds." />
          </div>
        </div>
      </section>

      {/* ====================== Pricing ====================== */}
      <section id="pricing" className="py-20 md:py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">Pricing</div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
              $99 a month. 5 projects. The whole jobsite team.
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              One plan. One price. 15 days free to start.
              Running more than 5 projects? Talk to us.
            </p>
          </div>

          {/* Three-step trial ramp visualization */}
          <div className="max-w-3xl mx-auto mb-10 grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">Days 1-15</div>
              <div className="text-2xl font-extrabold text-emerald-600">FREE</div>
              <div className="text-[11px] text-slate-500 mt-1">Card required, no charge</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">Next 60 days</div>
              <div className="text-2xl font-extrabold text-slate-900">$49.50</div>
              <div className="text-[11px] text-slate-500 mt-1">/month · 50% off</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Day 76 onwards</div>
              <div className="text-2xl font-extrabold text-slate-900">$99</div>
              <div className="text-[11px] text-slate-500 mt-1">/month · Standard</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
            <PricingCard
              tier="Pro"
              priceMonthly="$99"
              priceAnnual="per month"
              tagline="For firms running real jobs. One price for the whole team."
              cta="Start 15-day free trial"
              ctaHref="/login"
              ctaStyle="featured"
              badge="Most Popular"
              features={[
                { label: '15 days free trial · No charge', included: true, strong: true },
                { label: 'Then $49.50/month for 2 months (50% off)', included: true },
                { label: 'Then $99/month standard', included: true },
                { label: '5 active projects', included: true, strong: true },
                { label: 'Unlimited XERs per project', included: true },
                { label: '1 Admin + 5 PMs + 10 Viewers per project', included: true },
                { label: 'Up to 56 users total on your team', included: true },
                { label: 'Time Impact Analysis + Word report', included: true },
                { label: 'Trend Analysis (version-over-version)', included: true },
                { label: 'Earned Value Management', included: true },
                { label: 'Portfolio dashboard', included: true },
                { label: 'White-label reports', included: true },
                { label: 'Priority email support', included: true },
              ]}
              note="Card required at signup · No charge for 15 days · Cancel anytime"
            />

            <PricingCard
              tier="Business"
              priceMonthly="Custom"
              priceAnnual="Talk to sales"
              tagline="More than 5 projects? Federal? GC? Consulting firm?"
              cta="Talk to sales"
              ctaHref="mailto:sales@control-lens.com?subject=ControlLens%20Business%20Inquiry"
              ctaStyle="outline"
              features={[
                { label: 'Everything in Pro', included: true, strong: true },
                { label: 'Unlimited projects + users', included: true },
                { label: 'Single Sign-On (SSO / SAML)', included: true },
                { label: 'Audit log (who did what, when)', included: true },
                { label: 'Custom company logo on reports', included: true },
                { label: 'Consultant mode (multiple client orgs)', included: true },
                { label: 'Dedicated onboarding + SLA', included: true },
                { label: 'SOC 2 documentation + MSA', included: true },
                { label: 'Volume / multi-year discounts', included: true },
              ]}
              note="Custom contract · Federal and GC procurement-friendly"
            />
          </div>

          <p className="text-center text-xs text-slate-500 mt-8 max-w-3xl mx-auto leading-relaxed">
            All plans include all schedule analysis features and unlimited XER uploads.
            <br />
            Your card is charged on day 16 ($49.50), and on the same day each following month. Billing window is the 1st–5th of each month. See <Link href="/terms" className="text-blue-600 hover:underline">Terms</Link> for late-payment policy.
          </p>
        </div>
      </section>

      {/* ====================== Final CTA ====================== */}
      <section className="py-20 md:py-24 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-5 leading-tight">
            See your schedule clearly.
          </h2>
          <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
            Upload your XER. Get the analysis. Make the call. All in 30 seconds.
            <br />Built by a federal construction PM, for the people who carry the schedule.
          </p>
          <Link href="/login"
            className="inline-block bg-white hover:bg-slate-100 text-blue-700 font-bold px-8 py-4 rounded-xl shadow-2xl text-lg transition-transform hover:scale-[1.02]">
            Start 15-day free trial
          </Link>
          <div className="text-xs text-slate-400 mt-4 italic">
            Card required at signup · No charge for 15 days · 50% off for 2 months after
          </div>
        </div>
      </section>

      {/* ====================== Footer ====================== */}
      <footer className="bg-slate-950 text-slate-400 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <LogoSvg light />
                <span className="text-lg font-extrabold tracking-tight">
                  <span className="text-white">Control</span><span className="text-blue-400">Lens</span>
                </span>
              </div>
              <div className="text-sm text-slate-500">Visibility. Insight. Control.</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-10 gap-y-2 text-sm">
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#pricing" className="hover:text-white">Pricing</a>
              <a href="mailto:support@control-lens.com" className="hover:text-white">Support</a>
              <Link href="/login" className="hover:text-white">Sign in</Link>
              <a href="mailto:sales@control-lens.com" className="hover:text-white">Sales</a>
              <a href="https://app.control-lens.com" className="hover:text-white">app.control-lens.com</a>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-slate-800 text-xs text-slate-500 flex flex-col md:flex-row justify-between gap-2">
            <div>© 2026 ControlLens. All rights reserved.</div>
            <div>Built by Nobel Project Management Services</div>
          </div>
        </div>
      </footer>
    </div>
  )
}

// =============================================================================
// Dashboard mockup — static SVG-style HTML that mimics the real app UI
// (dark sidebar + light Enterprise Dashboard with key metrics)
// =============================================================================
function DashboardMockup() {
  return (
    <div className="relative">
      <div className="rounded-2xl shadow-2xl shadow-slate-300/60 overflow-hidden border border-slate-200 bg-white">
        <div className="flex h-[480px]">
          {/* Sidebar */}
          <div className="w-44 bg-slate-950 text-white flex flex-col flex-shrink-0">
            <div className="px-3 py-3 border-b border-white/10 flex items-center gap-2">
              <svg width="22" height="18" viewBox="0 0 44 36" xmlns="http://www.w3.org/2000/svg">
                <rect x="2"  y="6"  width="28" height="4" rx="1" fill="#2563eb"/>
                <rect x="2"  y="13" width="40" height="4" rx="1" fill="#dc2626"/>
                <rect x="2"  y="20" width="22" height="4" rx="1" fill="#16a34a"/>
                <rect x="2"  y="27" width="34" height="4" rx="1" fill="#e2e8f0"/>
              </svg>
              <span className="text-xs font-extrabold tracking-tight">
                <span className="text-white">Control</span><span className="text-blue-400">Lens</span>
              </span>
            </div>
            <div className="flex-1 px-2 py-3 space-y-0.5 text-[10px]">
              <div className="px-2 py-1 text-white/40 uppercase font-bold tracking-widest text-[8px]">Workspace</div>
              <SidebarItem icon="📊" label="Dashboard" active />
              <SidebarItem icon="📁" label="Upload" />
              <SidebarItem icon="📈" label="Trend" />
              <SidebarItem icon="📑" label="TIA" />
              <SidebarItem icon="💰" label="EVM" />
              <SidebarItem icon="📋" label="RFIs" />

              <div className="px-2 pt-3 pb-1 text-white/40 uppercase font-bold tracking-widest text-[8px]">Projects</div>
              <SidebarItem icon="▾" label="NT01 · Nobel Test" active />
              <div className="pl-4 space-y-0.5">
                <SidebarItem dot label="BL-NT01" sub small />
                <SidebarItem dot label="CU-NT01-01" sub small active />
              </div>
              <SidebarItem icon="▸" label="KENNEL" />

              <div className="px-2 pt-3 pb-1 text-white/40 uppercase font-bold tracking-widest text-[8px]">Account</div>
              <SidebarItem icon="⚙" label="Settings" />
              <SidebarItem icon="🌐" label="Portfolio" staff />
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 bg-slate-50 overflow-hidden">
            {/* Topbar */}
            <div className="bg-white border-b border-slate-200 h-9 flex items-center px-4">
              <span className="text-[11px] font-bold text-slate-900">Executive Dashboard</span>
              <span className="text-[10px] text-slate-400 ml-2">· NT01 · Nobel Test 1</span>
              <div className="ml-auto flex items-center gap-2">
                <div className="text-[9px] text-slate-400">Health</div>
                <div className="bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded">
                  28/100 ⚠ Recovery Required
                </div>
              </div>
            </div>

            <div className="p-3 space-y-2.5">
              {/* Top metrics row */}
              <div className="grid grid-cols-4 gap-2">
                <MetricCard label="Days behind" value="+133" tone="red" sub="↓ TIA territory" />
                <MetricCard label="Work complete" value="40%" tone="amber" sub="222 of 550" />
                <MetricCard label="Long lead risk" value="3 of 6" tone="amber" sub="critical procurement" />
                <MetricCard label="Risks" value="7" tone="red" sub="4 critical" />
              </div>

              {/* Schedule progress bar */}
              <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] font-bold text-slate-700">Schedule Progress</div>
                  <div className="text-[9px] text-slate-500">Contract 11/30/2024 · Projected 04/10/2025 (+133d)</div>
                </div>
                <div className="relative h-6 bg-slate-100 rounded overflow-hidden">
                  <div className="absolute top-0 left-0 h-full bg-blue-400" style={{ width: '40%' }} />
                  <div className="absolute top-0 left-0 h-full bg-blue-600/70" style={{ width: '32%' }} />
                  <div className="absolute top-0 h-full border-l-2 border-emerald-500" style={{ left: '74%' }} />
                  <div className="absolute top-0 h-full border-l-2 border-red-500" style={{ left: '92%' }} />
                </div>
                <div className="flex justify-between text-[8px] text-slate-400 mt-1">
                  <span>May'24</span><span>Jul</span><span>Sep</span><span>Nov</span><span>Jan'25</span><span>Apr</span>
                </div>
              </div>

              {/* Status + risks */}
              <div className="grid grid-cols-2 gap-2">
                {/* Plain-language status */}
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-1">What's happening</div>
                  <div className="text-[10px] text-slate-700 leading-relaxed">
                    Critical path driven by <strong>MEP procurement</strong>: thermal expansion tank, insulation, and hydronic air control unit not yet ordered. <strong>Recommend immediate vendor escalation.</strong>
                  </div>
                </div>

                {/* Risk tiles */}
                <div className="space-y-1.5">
                  <RiskTile icon="📅" label="Compression" severity="medium" detail="75 activities behind." />
                  <RiskTile icon="🔧" label="Out-of-sequence" severity="high" detail="57 logic violations." />
                  <RiskTile icon="⚖️" label="TIA territory" severity="high" detail="133 days behind." />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Glow effect behind the mockup */}
      <div className="absolute -inset-4 bg-gradient-to-br from-blue-200/40 via-transparent to-emerald-200/30 rounded-3xl blur-3xl -z-10"></div>
    </div>
  )
}

function SidebarItem({ icon, label, active, sub, small, staff, dot }: {
  icon?: string; label: string; active?: boolean; sub?: boolean; small?: boolean; staff?: boolean; dot?: boolean
}) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded font-medium ${
      active ? 'bg-blue-600/20 text-white' : sub ? 'text-white/50' : 'text-white/70'
    } ${small ? 'text-[9px]' : ''}`}>
      {dot ? <span className="w-1 h-1 rounded-full bg-white/30 ml-1"></span> : icon && <span className="text-[10px] flex-shrink-0">{icon}</span>}
      <span className={`truncate ${small ? 'font-mono' : ''}`}>{label}</span>
      {staff && <span className="ml-auto text-[7px] bg-purple-500/30 text-purple-200 px-1 rounded font-bold">STAFF</span>}
    </div>
  )
}

function MetricCard({ label, value, tone, sub }: { label: string; value: string; tone: 'red' | 'amber' | 'emerald'; sub: string }) {
  const toneClass = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-emerald-700'
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-2">
      <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-extrabold leading-tight ${toneClass}`}>{value}</div>
      <div className="text-[8px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  )
}

function RiskTile({ icon, label, severity, detail }: { icon: string; label: string; severity: 'high' | 'medium'; detail: string }) {
  const sevClass = severity === 'high' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-1.5 flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-bold text-slate-800 flex items-center gap-1.5">
          {label}
          <span className={`text-[7px] uppercase px-1 py-0.5 rounded border ${sevClass}`}>{severity}</span>
        </div>
        <div className="text-[8px] text-slate-500 truncate">{detail}</div>
      </div>
    </div>
  )
}

// =============================================================================
// Common components
// =============================================================================
function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <LogoSvg />
      <span className="text-xl font-extrabold tracking-tight">
        <span className="text-slate-800">Control</span><span className="text-blue-600">Lens</span>
      </span>
    </Link>
  )
}

function LogoSvg({ light }: { light?: boolean }) {
  return (
    <svg width="36" height="30" viewBox="0 0 44 36" xmlns="http://www.w3.org/2000/svg" aria-label="ControlLens mark">
      <rect x="2"  y="6"  width="28" height="4" rx="1" fill="#2563eb"/>
      <rect x="2"  y="13" width="40" height="4" rx="1" fill="#dc2626"/>
      <rect x="2"  y="20" width="22" height="4" rx="1" fill="#16a34a"/>
      <rect x="2"  y="27" width="34" height="4" rx="1" fill={light ? '#e2e8f0' : '#1f2937'}/>
    </svg>
  )
}

function TrustItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-xl md:text-2xl font-extrabold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}

function StepCard({ step, icon, title, body }: { step: string; icon: string; title: string; body: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-7 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-100/50 transition-all">
      <div className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">STEP {step}</div>
      <div className="text-4xl mb-3">{icon}</div>
      <div className="text-lg font-bold text-slate-900 mb-2">{title}</div>
      <div className="text-sm text-slate-600 leading-relaxed">{body}</div>
    </div>
  )
}

function FeatureCard({ icon, title, body, badge }: { icon: string; title: string; body: string; badge?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="text-2xl flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="text-sm font-bold text-slate-900">{title}</div>
            {badge && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{badge}</span>
            )}
          </div>
          <div className="text-xs text-slate-600 leading-relaxed">{body}</div>
        </div>
      </div>
    </div>
  )
}

function PersonaCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 hover:bg-white hover:border-blue-200 transition-colors">
      <div className="text-3xl mb-3">{icon}</div>
      <div className="text-base font-bold text-slate-900 mb-2">{title}</div>
      <div className="text-xs text-slate-600 leading-relaxed">{body}</div>
    </div>
  )
}

interface PricingFeature {
  label: string
  included: boolean
  strong?: boolean
}

function PricingCard({
  tier, priceMonthly, priceAnnual, annualSaveLabel, tagline, cta, ctaHref, ctaStyle,
  features, note, badge,
}: {
  tier: string; priceMonthly: string; priceAnnual: string; annualSaveLabel?: string
  tagline: string; cta: string; ctaHref: string
  ctaStyle: 'primary' | 'featured' | 'outline'
  features: PricingFeature[]; note: string; badge?: string
}) {
  const isFeatured = ctaStyle === 'featured'
  return (
    <div className={`relative rounded-2xl p-7 flex flex-col ${
      isFeatured
        ? 'bg-gradient-to-b from-blue-50 to-white border-2 border-blue-500 shadow-xl shadow-blue-200/60 md:scale-[1.03]'
        : 'bg-white border border-slate-200'
    }`}>
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow">
            {badge}
          </span>
        </div>
      )}

      <div className="text-center mb-5">
        <div className="text-lg font-extrabold text-slate-900 mb-1">{tier}</div>
        <div className="text-xs text-slate-500 mb-4">{tagline}</div>
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-4xl font-extrabold text-slate-900">{priceMonthly}</span>
          {priceMonthly !== 'Contact' && (
            <span className="text-sm text-slate-500 font-medium">/month</span>
          )}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {priceMonthly === 'Contact' ? priceAnnual : (
            <>or <strong>{priceAnnual}/year</strong>{annualSaveLabel && <span className="text-emerald-600 font-bold ml-1">({annualSaveLabel})</span>}</>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200 pt-5 mb-5 flex-1">
        <ul className="space-y-2.5">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span className={`flex-shrink-0 mt-0.5 ${f.included ? 'text-emerald-600' : 'text-slate-300'}`}>
                {f.included ? '✓' : '×'}
              </span>
              <span className={`text-slate-700 leading-relaxed ${f.strong ? 'font-bold text-slate-900' : ''}`}>
                {f.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <a href={ctaHref}
        className={`block w-full text-center font-bold py-3 rounded-xl transition-colors ${
          ctaStyle === 'featured'
            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30'
            : ctaStyle === 'primary'
              ? 'bg-slate-900 hover:bg-slate-800 text-white'
              : 'bg-white border-2 border-slate-300 hover:border-blue-500 hover:text-blue-700 text-slate-900'
        }`}>
        {cta}
      </a>

      <div className="text-[10px] text-slate-400 text-center mt-3 italic">{note}</div>
    </div>
  )
}

