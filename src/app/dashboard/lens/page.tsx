'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LensPage() {
  const router = useRouter()
  const [analysis, setAnalysis] = useState<any>(null)
  const [generating, setGenerating] = useState(false)
  const [emailDraft, setEmailDraft] = useState('')
  const [showEmail, setShowEmail] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('pl_analysis')
    if (stored) setAnalysis(JSON.parse(stored))
  }, [])

  const scores = [
    { label: 'Schedule Health', score: 52, color: 'text-red-600', bar: 'bg-red-500' },
    { label: 'Procurement Health', score: 48, color: 'text-red-600', bar: 'bg-red-500' },
    { label: 'Manpower Health', score: 70, color: 'text-amber-600', bar: 'bg-amber-500' },
    { label: 'Decision Health', score: 65, color: 'text-amber-600', bar: 'bg-amber-500' },
    { label: 'Safety Health', score: 100, color: 'text-green-600', bar: 'bg-green-500' },
  ]

  const indicators = [
    { title: 'Schedule realism', desc: 'High compression during closeout phase', status: 'Review', color: 'bg-red-100 text-red-700' },
    { title: 'Procurement readiness', desc: 'Long lead items may affect critical path', status: 'Review', color: 'bg-red-100 text-red-700' },
    { title: 'Manpower loading', desc: 'Adequate but concentrated near turnover', status: 'Monitor', color: 'bg-amber-100 text-amber-700' },
    { title: 'Owner engagement', desc: 'Approval backlog creating downstream exposure', status: 'Monitor', color: 'bg-amber-100 text-amber-700' },
    { title: 'Safety condition', desc: 'Zero incidents — strong site safety culture', status: 'Stable', color: 'bg-green-100 text-green-700' },
    { title: 'Cash flow pressure', desc: 'Extended duration risk may affect indirect costs', status: 'Monitor', color: 'bg-amber-100 text-amber-700' },
  ]

  async function generateEmail() {
    setGenerating(true)
    setShowEmail(true)
    const draft = `Subject: Project Status Update — ${analysis?.projectName || 'ProjectLens Demo'}

Dear Owner Team,

I wanted to provide you with a current status update on the project.

CURRENT CONDITION: Attention Needed
We are at approximately 68% completion and entering the commissioning and closeout phase. While overall progress has been maintained, there are several areas requiring your awareness and action.

KEY ATTENTION AREAS:

1. Procurement — Electrical switchgear delivery has experienced a delay. We are in active communication with the vendor and will confirm a revised delivery date by end of week. This item directly affects our energization and commissioning sequence.

2. Pending Approvals — We have 6 submittals currently awaiting your team's review and approval. Several of these are on the critical path. We respectfully request prioritization of these approvals to prevent schedule impact.

3. Commissioning Sequence — With mechanical startup scheduled for June 5th, we are preparing to mobilize the commissioning team. Owner's commissioning agent coordination will be needed starting May 28th.

SCHEDULE OUTLOOK:
Current substantial completion remains targeted for July 1, 2024. This date is achievable provided procurement deliveries are confirmed and pending approvals are resolved within the next two weeks.

REQUESTED ACTIONS FROM OWNER:
• Approve 6 outstanding submittals by May 22nd
• Confirm commissioning agent availability for week of June 3rd
• Schedule pre-commissioning walkthrough for May 28th

We remain committed to delivering a high-quality project on time. Please feel free to contact me directly with any questions.

Best regards,
[Project Manager Name]
[Company]
[Phone]`

    let i = 0
    const interval = setInterval(() => {
      setEmailDraft(draft.slice(0, i))
      i += 8
      if (i > draft.length) { setEmailDraft(draft); clearInterval(interval); setGenerating(false) }
    }, 15)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
        <div>
          <span className="font-bold text-slate-900 text-base">Project Lens</span>
          <span className="text-slate-400 text-sm ml-2">· Operational Intelligence</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => router.push('/dashboard/upload')}
            className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors">
            ⬆ Upload New Schedule
          </button>
          <button onClick={generateEmail}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-semibold">
            ✉ Generate Owner Email
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!analysis ? (
          <div className="max-w-2xl mx-auto text-center py-20">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-xl font-extrabold text-slate-900 mb-2">No analysis yet</h2>
            <p className="text-slate-500 text-sm mb-6">Upload a schedule to get your first ProjectLens operational analysis.</p>
            <button onClick={() => router.push('/dashboard/upload')}
              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors">
              Upload Schedule →
            </button>
          </div>
        ) : (
          <div className="space-y-4 max-w-5xl">
            {/* Header card */}
            <div className="bg-white border border-amber-200 rounded-xl p-5 flex items-center gap-4">
              <div className="text-5xl font-extrabold text-amber-600">{analysis.healthScore || 62}</div>
              <div className="flex-1">
                <div className="font-bold text-slate-900 text-base">{analysis.condition || 'Attention Needed'} — {analysis.projectName}</div>
                <div className="text-sm text-slate-500 mt-0.5">ProjectLens Health Score · Analyzed {analysis.timestamp ? new Date(analysis.timestamp).toLocaleDateString() : 'today'}</div>
                <div className="text-xs text-slate-400 mt-1 italic">This score supports your visibility — it does not replace your judgment.</div>
              </div>
              <div className="text-xs bg-amber-100 text-amber-800 px-3 py-2 rounded-lg font-semibold">⚠️ Attention Needed</div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* Analysis output */}
              <div className="col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-800 px-4 py-2.5 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400"/><div className="w-2.5 h-2.5 rounded-full bg-yellow-400"/>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400"/>
                  <span className="text-slate-400 text-xs ml-2">ProjectLens Operational Analysis</span>
                </div>
                <div className="p-5 font-mono text-xs leading-relaxed text-slate-700 whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {analysis.analysis}
                </div>
              </div>

              {/* Health scores */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Health Breakdown</div>
                <div className="space-y-3">
                  {scores.map(s => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600">{s.label}</span>
                        <span className={`font-bold ${s.color}`}>{s.score}/100</span>
                      </div>
                      <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className={`${s.bar} h-full rounded-full bar-animated`} style={{ width: `${s.score}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Indicators */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Operational Indicators — Visibility Support</div>
              <div className="text-xs text-slate-400 mb-3 italic">These indicators help you see where to focus. They do not make decisions for you.</div>
              <div className="grid grid-cols-3 gap-3">
                {indicators.map(ind => (
                  <div key={ind.title} className="p-3 border border-slate-100 rounded-lg bg-slate-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700">{ind.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ind.color}`}>{ind.status}</span>
                    </div>
                    <div className="text-xs text-slate-500 leading-relaxed">{ind.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Email draft */}
            {showEmail && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">✉️ Generated Owner Email</span>
                  <div className="flex gap-2">
                    <button onClick={() => { navigator.clipboard.writeText(emailDraft) }} className="text-xs text-blue-600 hover:underline">Copy</button>
                    <button onClick={() => setShowEmail(false)} className="text-xs text-slate-400 hover:text-slate-600">Dismiss</button>
                  </div>
                </div>
                <div className="p-4 text-xs text-slate-700 font-mono leading-relaxed whitespace-pre-wrap">
                  {emailDraft}
                  {generating && <span className="typing-cursor" />}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
