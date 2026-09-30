'use client'
import Link from 'next/link'
import { HELP_FAQS } from '@/lib/helpKnowledge'

const FEATURES = [
  ['Project Setup', '/dashboard/project-setup', 'Record contract dates, requirements, settings and approved modifications once for the project.'],
  ['Overview', '/dashboard', 'See the selected version’s schedule position, key dates and management concerns.'],
  ['Review Schedule', '/dashboard/approval', 'Review numbered comments, narrative, changes since the prior version and supporting evidence.'],
  ['Full CPM Analysis', '/dashboard/lens', 'Inspect filters, logic trace, sequence problems, missing ties, long-lead items and field reality.'],
  ['Project Controls', '/dashboard/controls', 'Access project control tools, including Time Impact Analysis.'],
  ['Reports', '/dashboard/reports', 'Choose a concise action report or detailed evidence for review and printing.'],
]

export default function HelpPage() {
  return <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
    <header className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0 font-bold text-slate-900">Help & Contact</header>
    <main className="p-6 max-w-4xl mx-auto w-full space-y-6">
      <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl p-6">
        <h1 className="text-2xl font-extrabold mb-2">Need help with CPMreview?</h1>
        <p className="text-blue-100 text-sm leading-relaxed">Find the right workflow below, or ask a question using Ask CPMreview. The help chat explains the app; it does not automatically inspect your schedule.</p>
      </section>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ContactCard icon="✉" title="Support" value="support@cpmreview.com" link="mailto:support@cpmreview.com" detail="Product questions, account help and issue reports." />
        <ContactCard icon="💼" title="Sales" value="sales@cpmreview.com" link="mailto:sales@cpmreview.com" detail="Company access and enterprise inquiries." />
        <ContactCard icon="📨" title="General information" value="info@cpmreview.com" link="mailto:info@cpmreview.com" detail="General inquiries and demonstrations." />
        <ContactCard icon="📞" title="Phone" value="+1 571 778 7028" link="tel:+15717787028" detail="Include the page name and a description when reporting an issue." />
      </section>
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Start with your project, then review a version</h2>
        <Step n={1} title="Set the project basis">Record the contract dates and applicable requirements in Project Setup.</Step>
        <Step n={2} title="Upload and select a schedule version">Use XER or Microsoft Project XML. Confirm the project, version type and data date.</Step>
        <Step n={3} title="Review the findings">Choose the review purpose and contractor or owner perspective in Review Schedule. Inspect the numbered comments and CPM evidence.</Step>
        <Step n={4} title="Check and print the report">Verify the narrative, responses and selected supporting evidence before printing the executive or complete review.</Step>
      </section>
      <section>
        <h2 className="text-base font-bold text-slate-900 mb-3">Where to go</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{FEATURES.map(([title, href, text]) => <FeatureCard key={href} icon="→" title={title} href={href} text={text} />)}</div>
      </section>
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-base font-bold text-slate-900 mb-4">Frequently asked questions</h2>
        {HELP_FAQS.map(item => <Faq key={item.question} q={item.question}>{item.answer}</Faq>)}
      </section>
      <section className="bg-slate-100 border border-slate-200 rounded-xl p-5 text-center">
        <h2 className="font-bold text-slate-900 mb-2">Still need help?</h2>
        <p className="text-xs text-slate-600 mb-4">Send the page name, steps and a screenshot. Keep passwords and credentials out of your message.</p>
        <a href="mailto:support@cpmreview.com" className="inline-block bg-blue-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg">Email Support</a>
      </section>
    </main>
  </div>
}

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
