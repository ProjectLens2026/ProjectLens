'use client'
// =============================================================================
// Help & Contact — /dashboard/help
//
// Day 8, Phase 2 build.
//
// Sections:
//   1. Hero — "Need help?"
//   2. Contact card (phone + emails + response time)
//   3. Quick start — for new users
//   4. Feature reference — what every section of ControlLens does
//   5. FAQ — common questions
//   6. Footer — bigger "Email support" + "Open chat" buttons
// =============================================================================

import Link from 'next/link'

export default function HelpPage() {
  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
        <span className="font-bold text-slate-900 text-base">Help & Contact</span>
        <span className="text-slate-400 text-sm ml-2">· We're here when you need us</span>
      </div>

      <div className="p-6 max-w-4xl mx-auto w-full space-y-6">

        {/* ============================================ HERO ============================================ */}
        <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6">
          <h1 className="text-2xl font-extrabold mb-2">Need help with ControlLens?</h1>
          <p className="text-blue-100 text-sm leading-relaxed max-w-2xl">
            Built by a federal construction PM, for PMs. Reach us by phone, WhatsApp, or email — or
            just ask the chat bubble in the bottom-right corner of any page. We answer support emails
            within 24 hours.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <a
              href="tel:+15717787028"
              className="bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-3 py-2 rounded-lg backdrop-blur transition-colors">
              📞 Call +001-571-778-7028
            </a>
            <a
              href="https://wa.me/15717787028"
              target="_blank" rel="noreferrer"
              className="bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-3 py-2 rounded-lg backdrop-blur transition-colors">
              💬 WhatsApp
            </a>
            <a
              href="mailto:support@control-lens.com"
              className="bg-white text-blue-700 hover:bg-blue-50 text-sm font-bold px-3 py-2 rounded-lg transition-colors">
              ✉ Email Support
            </a>
          </div>
        </section>

        {/* ============================================ CONTACT GRID ============================================ */}
        <section>
          <h2 className="text-base font-bold text-slate-900 mb-3">Contact ControlLens</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ContactCard
              icon="📞"
              title="Phone & WhatsApp"
              value="+001-571-778-7028"
              link="tel:+15717787028"
              detail="Call for urgent issues. WhatsApp text works too — drop a screenshot and a description."
            />
            <ContactCard
              icon="✉"
              title="Support"
              value="support@control-lens.com"
              link="mailto:support@control-lens.com"
              detail="Bugs, how-to questions, account help. We reply within 24 hours, usually faster."
            />
            <ContactCard
              icon="💼"
              title="Sales"
              value="sales@control-lens.com"
              link="mailto:sales@control-lens.com"
              detail="Pricing for teams, custom plans, enterprise rollouts, federal procurement."
            />
            <ContactCard
              icon="📨"
              title="General Information"
              value="info@control-lens.com"
              link="mailto:info@control-lens.com"
              detail="Partnership inquiries, press, demos, or anything that doesn't fit support or sales."
            />
          </div>

          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <span className="font-bold">Business:</span> ControlLens · <span className="font-bold">Response time:</span> within 24 hours on business days · <span className="font-bold">Hours:</span> US Eastern, but WhatsApp watched outside hours
          </div>
        </section>

        {/* ============================================ QUICK START ============================================ */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-base font-bold text-slate-900 mb-1">New to ControlLens? Start here</h2>
          <p className="text-xs text-slate-500 mb-4">First-time setup in under 5 minutes.</p>

          <div className="space-y-3">
            <Step n={1} title="Upload a Primavera P6 XER file">
              From the sidebar, click <b>Upload Schedule</b> (the project's “⬆” icon under Views). Drag your .xer file in,
              pick the schedule type (Baseline / Rebaseline / Update), enter your contract dates, and submit.
              ControlLens reads the file in your browser — even 100 MB files work cleanly now.
            </Step>
            <Step n={2} title="Review the Executive Dashboard">
              Once analysis finishes, you land on the dashboard. Key dates, durations,
              days behind contract, work % complete, long lead at risk, and risks detected are all there.
              Every KPI tile is clickable and drills into the underlying activities.
            </Step>
            <Step n={3} title="Dig deeper in Schedule Analysis">
              The <b>🔍 Schedule Analysis</b> page has 7 tabs: Critical Path, Logic Check, Construction Sequence,
              Long Lead, Submittals, Two-Week Lookahead, and Activity Filters. This is where you find evidence
              for the issues the dashboard surfaces.
            </Step>
            <Step n={4} title="Generate a Complete Report PDF">
              Click <b>📄 Complete Report</b> in the sidebar. The page renders every section into one printable
              document. Hit “Print / Save as PDF” at the top and send it to the owner — TIA-ready and citation-grade.
            </Step>
            <Step n={5} title="Upload monthly updates as new versions">
              Every month, re-upload your updated XER. ControlLens auto-generates the version label
              (e.g., <code className="text-xs bg-slate-100 px-1 rounded">CU-2025-10-15-03</code> for an update),
              and lets you compare baseline vs latest in the Trend Analysis and TIA pages.
            </Step>
          </div>
        </section>

        {/* ============================================ FEATURE REFERENCE ============================================ */}
        <section>
          <h2 className="text-base font-bold text-slate-900 mb-3">Feature Reference</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureCard
              icon="⊞"
              title="Overview Dashboard"
              href="/dashboard"
              text="Project-level command center. Contract dates, durations, KPIs, schedule progress chart, and 2-week lookahead." />
            <FeatureCard
              icon="📊"
              title="Enterprise Dashboard"
              href="/dashboard/enterprise"
              text="Portfolio view across every active project. Sort by health, days behind, owner, or GC." />
            <FeatureCard
              icon="📄"
              title="Complete Report"
              href="/dashboard/report"
              text="One-page PDF report covering every dashboard, ready to send to owners and clients." />
            <FeatureCard
              icon="🔍"
              title="Schedule Analysis (Lens)"
              href="/dashboard/lens"
              text="Critical path, logic violations, long lead, submittals, lookahead, and activity filters." />
            <FeatureCard
              icon="💰"
              title="Earned Value"
              href="/dashboard/evm"
              text="EVM analysis: planned %, earned %, optional actual cost. CPI, SPI, EAC, S-curve charts." />
            <FeatureCard
              icon="⚠"
              title="Risks & Issues"
              href="/dashboard/risks"
              text="Risk register driven by the schedule itself. Critical / High / Medium, with affected activities." />
            <FeatureCard
              icon="🚚"
              title="Procurement"
              href="/dashboard/procurement"
              text="Long lead and short lead items ranked by float exposure. Critical / Near Critical / Healthy tiers." />
            <FeatureCard
              icon="📋"
              title="Submittals"
              href="/dashboard/submittals"
              text="Submit + Review activity pairs auto-detected from activity names. Same 3-tier ranking." />
            <FeatureCard
              icon="❓"
              title="RFIs"
              href="/dashboard/rfis"
              text="Upload RFI PDFs. Classified as Informational / Potentially Impacting / Schedule Impacting." />
            <FeatureCard
              icon="🔄"
              title="Change Orders"
              href="/dashboard/changes"
              text="Auto-detected change-order activities from your XER. Read-only register." />
            <FeatureCard
              icon="📈"
              title="Trend Analysis"
              href="/dashboard/trend"
              text="Compare multiple versions. Direction: Improving / Stable / Deteriorating. Auto-recommendation." />
            <FeatureCard
              icon="📑"
              title="TIA Comparison"
              href="/dashboard/tia"
              text="Method 4 Time Impact Analysis. Pick an un-impacted baseline and a fragnet, get a Word report." />
          </div>
        </section>

        {/* ============================================ FAQ ============================================ */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-base font-bold text-slate-900 mb-4">Frequently Asked Questions</h2>
          <div className="space-y-1">
            <Faq q="What file formats does ControlLens read?">
              Primavera P6 <b>.xer</b> files — that's where the deep analysis happens. We also accept .xml, .mpp,
              .pdf, .xlsx, .xls, and .csv at upload, but full analysis is currently P6-XER only.
            </Faq>
            <Faq q="How large a schedule can I upload?">
              100 MB+ XER files work. Parsing runs in your browser, so the tab may freeze for ~15-20 seconds
              on very large files — that's normal. We're moving parsing server-side in a future update.
            </Faq>
            <Faq q="What's the difference between Baseline, Rebaseline, and Update?">
              <b>Baseline</b> = the approved schedule of record (only one per project).{' '}
              <b>Rebaseline</b> = a new approved baseline replacing the prior plan.{' '}
              <b>Update</b> = a monthly progress version against the current baseline.{' '}
              ControlLens auto-labels each version with a code like
              <code className="text-xs bg-slate-100 px-1 mx-1 rounded">BL-2024-03-15-00</code> or
              <code className="text-xs bg-slate-100 px-1 mx-1 rounded">CU-2024-03-15-04</code>.
            </Faq>
            <Faq q="Do my projects sync across devices?">
              Yes. Sign in on any browser — Chrome at the office, Firefox at home — and your projects are there.
              Uploads, deletes, renames, and version moves all propagate within seconds.
            </Faq>
            <Faq q="Can I undo a delete?">
              Yes. Deleting a project moves it to the <b>Deleted Items</b> folder (sidebar bottom).
              From there you can restore it or permanently delete. Permanent delete is unrecoverable.
            </Faq>
            <Faq q="How is 'Work Complete %' calculated?">
              Across construction activities only (we exclude milestones, submittals, procurement, design,
              and closeout). Activities ≥80% complete count as 100%. The remaining activities count at their
              actual physical % complete. Not-started activities contribute 0%. The result is averaged across
              the construction set.
            </Faq>
            <Faq q="What counts as 'Long Lead'?">
              Procurement-type activities (PROCURE, MANUFACTURE, FAB, DELIVER, SHIP keywords, or matching activity codes)
              with duration ≥ 35 calendar days. We classify them as <b>At Risk</b> if float is ≤ 14 days.
            </Faq>
            <Faq q="How does ControlLens detect critical path?">
              We first use P6's <code className="text-xs bg-slate-100 px-1 rounded">driving_path_flag = 'Y'</code> when present.
              For schedules where that flag isn't set, we fall back to total float ≤ 0 days as the critical-path filter.
              Both match how Primavera P6 displays it.
            </Faq>
            <Faq q="Can I hide the chat bubble?">
              Yes — go to <Link href="/dashboard/profile" className="text-blue-700 underline font-semibold">My Profile</Link>{' '}
              → Preferences → toggle off <b>Show "Ask ControlLens" chat widget</b>. Setting is per-browser.
            </Faq>
            <Faq q="What does ControlLens NOT do?">
              We don't replace P6 or your scheduler — we analyze the output. We don't write schedules,
              we don't connect to your accounting system, and we don't auto-run your monthly updates.
              We help you read what's in front of you and explain it to people who don't speak schedule.
            </Faq>
          </div>
        </section>

        {/* ============================================ FOOTER CTA ============================================ */}
        <section className="bg-slate-100 border border-slate-200 rounded-xl p-5 text-center">
          <h3 className="text-base font-bold text-slate-900 mb-2">Still stuck?</h3>
          <p className="text-xs text-slate-600 mb-4 max-w-md mx-auto">
            Email us with a screenshot and a sentence about what you're trying to do. We get it,
            schedules are stressful — we'll help you through it.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <a
              href="mailto:support@control-lens.com?subject=Help%20with%20ControlLens"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
              ✉ Email Support
            </a>
            <a
              href="https://wa.me/15717787028"
              target="_blank" rel="noreferrer"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
              💬 WhatsApp +001-571-778-7028
            </a>
          </div>
        </section>

      </div>
    </div>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

function ContactCard({ icon, title, value, link, detail }: { icon: string; title: string; value: string; link: string; detail: string }) {
  return (
    <a href={link} target={link.startsWith('mailto:') || link.startsWith('tel:') ? undefined : '_blank'} rel="noreferrer"
      className="bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm rounded-xl p-4 transition-all block group">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</span>
      </div>
      <div className="text-sm font-bold text-blue-700 group-hover:text-blue-800 break-all">{value}</div>
      <div className="text-xs text-slate-500 mt-1 leading-relaxed">{detail}</div>
    </a>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">{n}</div>
      <div className="flex-1 pt-0.5">
        <div className="text-sm font-bold text-slate-900 mb-0.5">{title}</div>
        <div className="text-xs text-slate-600 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, href, text }: { icon: string; title: string; href: string; text: string }) {
  return (
    <Link href={href} className="bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm rounded-xl p-3 transition-all block">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="font-bold text-sm text-slate-900">{title}</span>
      </div>
      <div className="text-xs text-slate-600 leading-relaxed">{text}</div>
    </Link>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-slate-100 last:border-0">
      <summary className="cursor-pointer py-3 text-sm font-semibold text-slate-800 hover:text-blue-700 flex items-center gap-2 list-none">
        <span className="text-blue-600 group-open:rotate-90 transition-transform">▶</span>
        <span className="flex-1">{q}</span>
      </summary>
      <div className="pb-3 pl-5 text-xs text-slate-600 leading-relaxed">{children}</div>
    </details>
  )
}
