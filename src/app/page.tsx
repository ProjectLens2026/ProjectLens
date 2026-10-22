'use client'
// =============================================================================
// CPMreview — Landing page (Day 10 rebuild, v2)
//
// v2 changes (per founder):
//   - NO "AI" mentions anywhere — say what it does, not how
//   - Hero dashboard visual restored (SVG mockup: sidebar + Enterprise Dashboard)
//   - Company pilot messaging; public checkout and enrollment are paused
// =============================================================================
import Link from 'next/link'
import { PILOT_CONTACT_HREF } from '@/lib/launchPolicy'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ====================== Nav ====================== */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 min-h-16 py-3 flex flex-wrap gap-3 items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3 md:gap-6">
            <a href="#features" className="hidden md:inline text-sm text-slate-600 hover:text-slate-900 font-medium">Features</a>
            <a href="#who" className="hidden md:inline text-sm text-slate-600 hover:text-slate-900 font-medium">Who it's for</a>
            <a href="#pilot" className="hidden md:inline text-sm text-slate-600 hover:text-slate-900 font-medium">Company pilot</a>
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 font-semibold">Sign in</Link>
            <a href={PILOT_CONTACT_HREF}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg">
              Request access
            </a>
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
                <span>★</span> Company pilot · Construction schedule review
              </div>
              <h1 className="text-4xl md:text-5xl xl:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight mb-6">
                Check before you submit.<br /><span className="text-blue-600">Verify before you approve.</span>
              </h1>
              <p className="text-lg text-slate-600 mb-7 leading-relaxed">
                Bring your P6 XER or Microsoft Project XML schedule into one review workspace.
                Understand the contract position, inspect CPM evidence, and track the comments
                that need a response — from one submission to the next.
              </p>
              <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-5">
                <a href={PILOT_CONTACT_HREF}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-7 py-3.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:shadow-xl hover:shadow-blue-600/30">
                  Request pilot access →
                </a>
                <a href="#how"
                  className="text-slate-700 hover:text-slate-900 font-semibold px-5 py-3 rounded-xl transition-colors">
                  See how it works
                </a>
              </div>
              <div className="text-xs text-slate-500 italic">
                We are onboarding selected companies for a guided pilot. Public self-service enrollment is paused.
              </div>

              {/* Trust strip */}
              <div className="mt-10 grid grid-cols-4 gap-4 max-w-md">
                <TrustItem value="CPM" label="Detailed evidence" />
                <TrustItem value="Review" label="Numbered comments" />
                <TrustItem value="Versions" label="Track changes" />
                <TrustItem value="Teams" label="Company workspace" />
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
              Set the project control basis, review the submitted schedule, and keep decisions connected to their evidence.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <StepCard step="01" icon="📁" title="Establish the project basis"
              body="Record contract dates, milestones and schedule requirements once at project level. Upload each schedule as a separate version." />
            <StepCard step="02" icon="🔍" title="Review the evidence"
              body="Inspect CPM logic, paths, procurement risks and changes. Separate detected concerns from formal review comments." />
            <StepCard step="03" icon="📄" title="Respond and report"
              body="Track numbered comments across submissions. Review the schedule narrative and print an action report with selected evidence." />
          </div>
        </div>
      </section>

      {/* ====================== Features grid ====================== */}
      <section id="features" className="py-20 md:py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">What you get</div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">
              Project controls with the schedule at the center.
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Built around the work of contractors, schedulers and owners — with detailed analysis behind each review.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard icon="✅" title="Submission & Approval Review"
              body="Review from the contractor or owner perspective. Keep open formal comments visible alongside technical findings." />
            <FeatureCard icon="🛤️" title="Full CPM Analysis"
              body="Inspect critical and longest paths, float, constraints and schedule filters. Trace the activities behind a concern." />
            <FeatureCard icon="🔧" title="Schedule Logic Checks"
              body="Find missing ties and recorded progress that conflicts with submitted logic. Inspect the affected activities and relationships." />
            <FeatureCard icon="📦" title="Procurement & Long-Lead Items"
              body="Review procurement exposure, available float and site-delivery evidence in the selected schedule." />
            <FeatureCard icon="📑" title="Time Impact Comparison"
              body="Select the unimpacted and impacted schedule versions to compare completion and path changes. Keep assumptions available for review." />
            <FeatureCard icon="📊" title="Physical Progress by Phase"
              body="See reported physical progress by phase, with missing values and coverage disclosed. Avoid an unexplained overall percentage." />
            <FeatureCard icon="📈" title="Version-to-Version Review"
              body="Compare submissions and follow persistent comment numbers. Check what changed and which concerns still need a response." />
            <FeatureCard icon="👥" title="Company Workspaces"
              body="Organize projects and schedule versions in your company workspace, with roles for owners, administrators and project teams." />
            <FeatureCard icon="📄" title="Narratives & Action Reports"
              body="Start with detected schedule evidence, add reviewer context and print a concise action report. Final decisions remain with the authorized reviewer." />
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
              CPMreview is <strong className="text-slate-900">construction project scheduling for PMs, superintendents, and owners</strong>.
              It doesn't just flag errors — it tells your team where to focus today, and why.
              Keep the project basis, selected version and supporting evidence visible so each concern can be reviewed in context.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            <PersonaCard icon="🏗️" title="Project Managers" body="Know what to focus on this week, even when the schedule isn't perfect. Plain-language answers, no P6 expertise required." />
            <PersonaCard icon="👷" title="Superintendents" body="Get the field's view of the schedule — what's at risk, what's blocking what, and which calls to make today." />
            <PersonaCard icon="🏛️" title="Owners & Federal Agencies" body="Executive summaries in plain language. Know project health without digging through bar charts." />
            <PersonaCard icon="📅" title="Schedulers & Claims Consultants" body="Detailed CPM evidence, version comparisons, time-impact comparisons and review comments in one workflow." />
          </div>
        </div>
      </section>

      <section id="pilot" className="py-20 md:py-24 bg-slate-50 border-y border-slate-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">Company pilot</div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-4">Let's prove it on your real review workflow.</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">We are working with selected companies before opening public enrollment. Pilot scope, onboarding and commercial terms are discussed directly with each team.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <StepCard step="01" icon="👥" title="Tell us about your team" body="Share your company, project types, schedule formats and the review challenges you want to address." />
            <StepCard step="02" icon="🔍" title="Review the fit together" body="Walk through the product and agree which projects and workflows belong in the pilot." />
            <StepCard step="03" icon="📋" title="Agree scope and evaluate" body="Define access and success criteria before onboarding. Evaluate findings, repeat use and the usefulness of the reports." />
          </div>
          <div className="mt-10 text-center"><a href={PILOT_CONTACT_HREF} className="inline-block rounded-xl bg-blue-600 px-7 py-3.5 font-bold text-white hover:bg-blue-700">Request pilot access</a><p className="mt-3 text-xs text-slate-500">Opens an email to sales@control-lens.com. An inquiry does not create an account or start a subscription.</p></div>
        </div>
      </section>

      {/* ====================== Final CTA ====================== */}
      <section className="py-20 md:py-24 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-5 leading-tight">
            See your schedule clearly.
          </h2>
          <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
            Bring your team, a real schedule and the questions you need answered.
            <br />Built by a federal construction PM, for the people who carry the schedule.
          </p>
          <a href={PILOT_CONTACT_HREF}
            className="inline-block bg-white hover:bg-slate-100 text-blue-700 font-bold px-8 py-4 rounded-xl shadow-2xl text-lg transition-transform hover:scale-[1.02]">
            Request pilot access
          </a>
          <div className="text-xs text-slate-400 mt-4 italic">
            Company onboarding by arrangement · Existing users can sign in above
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
                  <span className="text-white">CPM</span><span className="text-blue-400">review</span>
                </span>
              </div>
              <div className="text-sm text-slate-500">Visibility. Insight. Control.</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-10 gap-y-2 text-sm">
              <a href="#features" className="hover:text-white">Features</a>
              <a href="#pilot" className="hover:text-white">Company pilot</a>
              <a href="mailto:support@control-lens.com" className="hover:text-white">Support</a>
              <Link href="/login" className="hover:text-white">Sign in</Link>
              <a href="mailto:sales@control-lens.com" className="hover:text-white">Sales</a>
              <a href="https://app.cpmreview.com" className="hover:text-white">app.cpmreview.com</a>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-slate-800 text-xs text-slate-500 flex flex-col md:flex-row justify-between gap-2">
            <div>© 2026 CPMreview. All rights reserved.</div>
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
  return <div className="relative">
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/60">
      <div className="flex min-h-[440px]">
        <div className="hidden sm:block w-36 shrink-0 bg-slate-950 px-2 py-4 text-white">
          <div className="px-2 mb-6 text-sm font-extrabold">CPM<span className="text-blue-400">review</span></div>
          <div className="px-2 mb-2 text-[9px] uppercase tracking-wide text-slate-400">Example project</div>
          <SidebarItem icon="⚙" label="Project Setup" />
          <SidebarItem icon="▦" label="Overview" />
          <SidebarItem icon="✓" label="Review Schedule" active />
          <SidebarItem icon="⌕" label="Full CPM Analysis" />
          <SidebarItem icon="▤" label="Project Controls" />
          <SidebarItem icon="▧" label="Reports" />
        </div>
        <div className="min-w-0 flex-1 bg-slate-50">
          <div className="border-b border-slate-200 bg-white p-3 text-xs font-bold">Review Schedule <span className="font-normal text-slate-500">· Update 03</span></div>
          <div className="space-y-3 p-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3"><div className="text-[9px] font-bold uppercase text-red-700">Review decision</div><div className="mt-1 text-sm font-extrabold text-red-800">Open comments need a response</div><p className="mt-1 text-[10px] text-red-700">1 required comment remains unresolved.</p></div>
            <div className="grid grid-cols-3 gap-2"><MetricCard label="Open comments" value="3" tone="amber" sub="numbered and tracked" /><MetricCard label="Required" value="1" tone="red" sub="approval blocker" /><MetricCard label="Closed" value="4" tone="emerald" sub="reviewer verified" /></div>
            <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="mb-2 text-xs font-bold">Comment register</div>{[['C-001','Confirm completion logic','Required'],['C-004','Explain progress conflicts','Advisory'],['C-007','Confirm delivery readiness','Advisory']].map(([id,title,status])=><div key={id} className="border-t border-slate-100 py-2 text-[10px]"><span className="mr-2 font-bold text-blue-600">{id}</span><span>{title}</span><div className={`mt-1 font-semibold ${status === 'Required' ? 'text-red-700' : 'text-amber-700'}`}>{status}</div></div>)}</div>
            <div className="text-[10px] text-slate-500">CPM evidence → Review comments → Contractor response</div>
          </div>
        </div>
      </div>
    </div>
    <p className="mt-3 text-center text-xs text-slate-500">Illustrative review — sample data, not a customer project.</p>
  </div>
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
        <span className="text-slate-800">CPM</span><span className="text-blue-600">review</span>
      </span>
    </Link>
  )
}

function LogoSvg({ light }: { light?: boolean }) {
  return (
    <svg width="36" height="30" viewBox="0 0 44 36" xmlns="http://www.w3.org/2000/svg" aria-label="CPMreview mark">
      <rect x="2"  y="6"  width="28" height="4" rx="1" fill="#2563eb"/>
      <rect x="2"  y="13" width="40" height="4" rx="1" fill="#dc2626"/>
      <rect x="2"  y="20" width="22" height="4" rx="1" fill="#16a34a"/>
      <rect x="2"  y="27" width="34" height="4" rx="1" fill="#1f2937"/>
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
