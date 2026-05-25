'use client'
// =============================================================================
// ControlLens — Landing page (Day 10 rebuild)
//
// What changed:
//   - Removed Free tier (founder requirement)
//   - 3 tiers: Professional / Business / Enterprise
//   - Pricing starts at $49/mo or $490/yr (save $98)
//   - 14-day Pro trial, no credit card to start
//   - Added new sections: Team collaboration, AI-powered RFI/TIA,
//     Multi-tenant workspaces, Platform Portfolio (for staff)
//   - Repositioned as "schedule intelligence anyone can read" — not just
//     for schedulers
//   - Tagline: "Schedule analysis without the scheduler jargon"
//   - Logo: 4 horizontal bars + ControlLens wordmark (locked brand)
//
// Hosted at https://app.control-lens.com/
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
              Start 14-day trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ====================== Hero ====================== */}
      <section className="bg-gradient-to-b from-white to-slate-50 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-28 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 mb-6 text-xs font-bold text-blue-700 uppercase tracking-wider">
            <span>★</span> Schedule intelligence built for teams, not just schedulers
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight mb-6">
            Your schedule, <span className="text-blue-600">explained</span>.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto mb-8 leading-relaxed">
            Upload your Primavera P6 schedule. ControlLens analyzes critical paths, logic violations,
            delays, and RFIs — and explains everything in <strong>plain language</strong> anyone on
            your team can read. PMs, owners, executives. Not just schedulers.
          </p>
          <div className="flex flex-col md:flex-row items-center justify-center gap-3 mb-6">
            <Link href="/login"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-7 py-3.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:shadow-xl hover:shadow-blue-600/30">
              Start 14-day Pro Trial →
            </Link>
            <a href="#how"
              className="text-slate-700 hover:text-slate-900 font-semibold px-5 py-3 rounded-xl transition-colors">
              See how it works
            </a>
          </div>
          <div className="text-xs text-slate-500 italic">
            No credit card required · 14 days, full access · Cancel anytime
          </div>

          {/* Trust strip */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            <TrustItem value="<30s" label="Schedule analyzed" />
            <TrustItem value="500+" label="Activities parsed" />
            <TrustItem value="7" label="Analysis dimensions" />
            <TrustItem value="AI" label="Plain-language explanations" />
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
            <StepCard step="02" icon="🧠" title="AI explains everything"
              body="Critical path drivers, logic violations, long lead risks, RFIs — all analyzed with plain-language summaries your whole team can read." />
            <StepCard step="03" icon="📄" title="Generate the report"
              body="One-click PDF or full TIA Word document ready to send to owners. AI-drafted narratives, no scheduler jargon required." />
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
            <FeatureCard icon="🎯" title="Critical Path Analysis"
              body="See exactly what's driving project completion. Driving activities, float condition, where the path can break." />
            <FeatureCard icon="🔧" title="Schedule Logic Check"
              body="Catches out-of-sequence work, fabrication-before-approval, review-before-submit. TIA evidence ready." />
            <FeatureCard icon="📦" title="Long Lead Item Tracker"
              body="Every 20+ day procurement item sorted by float. Know which vendor calls to make today vs next week." />
            <FeatureCard icon="🤖" title="AI-Powered RFI Evaluation" badge="NEW"
              body="Upload an RFI PDF. ControlLens classifies it as informational, potentially impacting, or schedule impacting — with fragnet recommendations." />
            <FeatureCard icon="📊" title="EVM + Trend Analysis"
              body="Earned value, BEI, schedule performance over time. Watch your project drift before it becomes a claim." />
            <FeatureCard icon="📑" title="TIA Comparison + Word Report"
              body="Upload un-impacted and impacted schedules. ControlLens detects fragnets, runs trend analysis, generates the full Word document." />
            <FeatureCard icon="👥" title="Team Collaboration" badge="NEW"
              body="Invite your PMs, schedulers, and executives. Role-based access (Owner / Admin / PM / Viewer). Each person sees what they need." />
            <FeatureCard icon="🗂️" title="Multi-Project Workspace" badge="NEW"
              body="Manage all your projects in one place. Per-project teams, version history, soft-delete trash with restore." />
            <FeatureCard icon="💬" title="Plain-Language Summaries" badge="MOAT"
              body="AI explains every analysis in language anyone can read. No more 'BEI 0.78' — ControlLens tells you exactly what's happening and what to do." />
          </div>
        </div>
      </section>

      {/* ====================== Who it's for ====================== */}
      <section id="who" className="py-20 md:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">Who it's for</div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
              Built for the whole project team — not just the scheduler.
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Other tools are built for schedulers, by schedulers. ControlLens makes schedule intelligence
              readable for everyone on the project.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            <PersonaCard icon="🏗️" title="Project Managers" body="PMP-level analysis without learning P6. Read your schedule like a 20-year scheduler would." />
            <PersonaCard icon="🏛️" title="Owners & Federal Agencies" body="Executive summaries in plain language. Know project health without digging through bar charts." />
            <PersonaCard icon="📅" title="Schedulers" body="Logic check, fragnet detection, and full TIA reports in 30 seconds. Free up your week for real work." />
            <PersonaCard icon="⚖️" title="Claims Consultants" body="TIA comparison + Word report drafting. Get a defensible first draft in minutes, not days." />
          </div>
        </div>
      </section>

      {/* ====================== Pricing ====================== */}
      <section id="pricing" className="py-20 md:py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">Pricing</div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
              Simple pricing. Real value.
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Start with a 14-day free trial of Professional. No credit card required.
              Upgrade or cancel anytime.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            {/* Professional */}
            <PricingCard
              tier="Professional"
              priceMonthly="$49"
              priceAnnual="$490"
              annualSaveLabel="Save $98"
              tagline="For solo PMs and small consultancies"
              cta="Start 14-day trial"
              ctaHref="/login"
              ctaStyle="primary"
              features={[
                { label: 'Up to 3 active projects', included: true },
                { label: 'Schedule validation + CPM diagnostics', included: true },
                { label: 'EVM, Trend, and TIA analysis', included: true },
                { label: 'AI-powered RFI evaluation', included: true },
                { label: 'PDF + Word reports', included: true },
                { label: 'Plain-language AI summaries', included: true },
                { label: 'Up to 3 users (Owner + 2)', included: true },
                { label: 'Email support', included: true },
              ]}
              note="14-day free trial · No credit card to start"
            />

            {/* Business — most popular */}
            <PricingCard
              tier="Business"
              priceMonthly="$99"
              priceAnnual="$990"
              annualSaveLabel="Save $198"
              tagline="For growing teams managing portfolios"
              cta="Start 14-day trial"
              ctaHref="/login"
              ctaStyle="featured"
              badge="Most Popular"
              features={[
                { label: 'Everything in Professional', included: true, strong: true },
                { label: 'Unlimited active projects', included: true },
                { label: 'Up to 10 users with role-based access', included: true },
                { label: 'Per-project team management', included: true },
                { label: 'Custom logo on reports', included: true },
                { label: 'Audit log (who did what)', included: true },
                { label: 'Cross-project portfolio dashboard', included: true },
                { label: 'Priority email support', included: true },
              ]}
              note="14-day free trial · For teams of 4-10"
            />

            {/* Enterprise */}
            <PricingCard
              tier="Enterprise"
              priceMonthly="Contact"
              priceAnnual="Custom pricing"
              tagline="For federal, GCs, and 10+ user teams"
              cta="Talk to sales"
              ctaHref="mailto:sales@control-lens.com?subject=ControlLens%20Enterprise%20Inquiry"
              ctaStyle="outline"
              features={[
                { label: 'Everything in Business', included: true, strong: true },
                { label: 'Unlimited users', included: true },
                { label: 'Single Sign-On (SSO)', included: true },
                { label: 'Full white-label branding', included: true },
                { label: 'API access', included: true },
                { label: 'Dedicated customer success manager', included: true },
                { label: 'SOC 2 documentation + MSA', included: true },
                { label: 'Multi-year discount', included: true },
              ]}
              note="Custom contract · Volume discounts available"
            />
          </div>

          <p className="text-center text-xs text-slate-500 mt-8 max-w-3xl mx-auto leading-relaxed">
            All plans include unlimited XER uploads, all 7 analysis dimensions, and Word report generation.
            Annual pricing saves you 17%. Trial converts to paid only if you choose to continue.
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
            Try ControlLens Free →
          </Link>
          <div className="text-xs text-slate-400 mt-4 italic">
            14-day free trial · No credit card required
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
// Components
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
      <div className="text-2xl md:text-3xl font-extrabold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
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
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                badge === 'MOAT' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
              }`}>{badge}</span>
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
  tier: string
  priceMonthly: string
  priceAnnual: string
  annualSaveLabel?: string
  tagline: string
  cta: string
  ctaHref: string
  ctaStyle: 'primary' | 'featured' | 'outline'
  features: PricingFeature[]
  note: string
  badge?: string
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
