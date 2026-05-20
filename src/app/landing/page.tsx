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
// Route: /landing  (move into /src/app/page.tsx if you want it as the home page)
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

      {/* ─────────────── 3. DASHBOARD PREVIEW ─────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="bg-slate-900 rounded-2xl p-2 shadow-2xl">

          {/* Browser-frame top bar */}
          <div className="flex items-center gap-1.5 px-3 pt-2 pb-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400"/>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"/>
            <div className="w-2.5 h-2.5 rounded-full bg-green-400"/>
            <div className="flex-1 ml-2 bg-white/10 text-white/50 text-xs px-3 py-1 rounded font-mono truncate">
              app.control-lens.com/dashboard/upload
            </div>
          </div>

          {/* Dashboard content */}
          <div className="bg-slate-50 rounded-lg p-5 md:p-7">

            {/* 5-stat row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              <StatTile label="Total Activities" value="550" sub="799 relationships" />
              <StatTile label="Complete" value="222" sub="40% of schedule" tone="emerald" />
              <StatTile label="In Progress" value="63" sub="11% active" tone="blue" />
              <StatTile label="Negative Float" value="319" sub="58% of all" tone="red" />
              <StatTile label="Out-of-Sequence" value="57" sub="Logic violations" tone="red" />
            </div>

            {/* Recovery Required banner */}
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 flex items-start gap-4">
              <div className="text-3xl flex-shrink-0">🔴</div>
              <div className="flex-1">
                <div className="font-bold text-red-900 text-base md:text-lg mb-1.5">
                  Recovery Required — 133 days behind contract completion
                </div>
                <div className="text-sm text-red-800 leading-relaxed">
                  Critical path driven by MEP procurement: thermal expansion tank, insulation, and hydronic air control unit not yet ordered. Switchgear fabrication at <span className="font-mono font-semibold">−5 days float</span>.
                </div>
              </div>
              <div className="flex-shrink-0 text-center">
                <div className="text-4xl md:text-5xl font-bold text-red-700 leading-none">28<span className="text-2xl text-red-500">/100</span></div>
                <div className="text-[10px] uppercase tracking-widest text-red-600 mt-1 font-semibold">Health Score</div>
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

function StatTile({
  label, value, sub, tone = 'slate',
}: {
  label: string; value: string; sub: string; tone?: 'slate' | 'emerald' | 'blue' | 'red'
}) {
  const valueColor =
    tone === 'red' ? 'text-red-600' :
    tone === 'emerald' ? 'text-emerald-600' :
    tone === 'blue' ? 'text-blue-600' :
    'text-slate-900'
  const borderColor =
    tone === 'red' ? 'border-red-200' :
    'border-slate-200'
  return (
    <div className={`bg-white border ${borderColor} rounded-lg p-3 shadow-sm`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${valueColor}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-1">{sub}</div>
    </div>
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
