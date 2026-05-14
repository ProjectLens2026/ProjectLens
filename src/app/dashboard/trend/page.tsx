'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getActiveProject, Project } from '@/lib/projectStore'
import { analyzeProjectTrend, TrendAnalysisResult, VersionDataPoint } from '@/lib/trendAnalyzer'

// Simple SVG line chart component
function MiniLineChart({ data, label, color, suffix = '' }: {
  data: { x: string; y: number }[]
  label: string
  color: string
  suffix?: string
}) {
  if (!data || data.length < 2) return null

  const values = data.map(d => d.y)
  const maxVal = Math.max(...values, 1)
  const minVal = Math.min(...values, 0)
  const range = maxVal - minVal || 1
  const width = 100
  const height = 50

  // Generate path
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d.y - minVal) / range) * height
    return { x, y, val: d.y, label: d.x }
  })

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  // Determine trend
  const first = points[0].val
  const last = points[points.length - 1].val
  const trend = last > first ? 'up' : last < first ? 'down' : 'flat'

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">{label}</div>
        <div className={`text-xs font-bold ${trend === 'up' ? 'text-red-600' : trend === 'down' ? 'text-green-600' : 'text-slate-400'}`}>
          {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'} {first}{suffix} → {last}{suffix}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height + 10}`} className="w-full" preserveAspectRatio="none" style={{ height: 80 }}>
        {/* Background gridlines */}
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#e2e8f0" strokeDasharray="2,2" strokeWidth="0.3" />

        {/* Trend line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" />

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={1.5} fill={color} />
            <text x={p.x} y={p.y - 3} fontSize="3" fill="#475569" textAnchor="middle">{p.val}{suffix}</text>
          </g>
        ))}
      </svg>
      {/* X-axis labels */}
      <div className="flex justify-between mt-1">
        {points.map((p, i) => (
          <div key={i} className="text-[9px] text-slate-400" style={{ width: `${100 / points.length}%`, textAlign: 'center' }}>
            {p.label}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TrendAnalysisPage() {
  const [project, setProject] = useState<Project | null>(null)
  const [trend, setTrend] = useState<TrendAnalysisResult | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 1500)
    return () => clearInterval(interval)
  }, [])

  function refresh() {
    const p = getActiveProject()
    setProject(p)
    if (p) {
      setTrend(analyzeProjectTrend(p))
    } else {
      setTrend(null)
    }
  }

  async function downloadWordReport() {
    if (!trend) return
    setDownloading(true)
    try {
      const res = await fetch('/api/trend-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trend }),
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Trend_Analysis_${trend.projectName.replace(/[^a-z0-9]/gi, '_')}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('Failed to generate report: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  // No project
  if (!project) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <span className="font-bold text-slate-900 text-base">Trend Analysis</span>
          <span className="text-slate-400 text-sm ml-2">· No active project</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">📈</span>
            </div>
            <div className="text-lg font-bold text-slate-700 mb-2">Select a project first</div>
            <div className="text-sm text-slate-500 mb-6">Trend Analysis requires an active project with 2+ versions.</div>
            <Link href="/dashboard/projects" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
              Go to Projects →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Only 1 version
  if (!trend) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <span className="font-bold text-slate-900 text-base">Trend Analysis</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name}</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">📈</span>
            </div>
            <div className="text-lg font-bold text-slate-700 mb-2">Need 2+ versions for trend analysis</div>
            <div className="text-sm text-slate-500 mb-6">
              This project currently has {project.versions.length} version. Upload another schedule version to see how the project is trending over time.
            </div>
            <Link href="/dashboard/upload" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
              Upload New Version →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Recommendation styling
  const recStyle = (() => {
    if (trend.recommendation.type === 'HEALTHY') return { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-900', icon: '✅' }
    if (trend.recommendation.type === 'SCHEDULE_UPDATE_REQUIRED') return { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-900', icon: '🔄' }
    if (trend.recommendation.type === 'REBASELINE_RECOMMENDED') return { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900', icon: '⚠️' }
    return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-900', icon: '🚨' }
  })()

  // Trend direction
  const trendLabel = (() => {
    if (trend.summary.trendDirection === 'IMPROVING') return { text: 'Improving', color: 'text-green-600', icon: '↗' }
    if (trend.summary.trendDirection === 'STABLE') return { text: 'Stable', color: 'text-slate-600', icon: '→' }
    if (trend.summary.trendDirection === 'DETERIORATING') return { text: 'Deteriorating', color: 'text-amber-600', icon: '↘' }
    return { text: 'Severely Deteriorating', color: 'text-red-600', icon: '↓↓' }
  })()

  // Chart data
  const chartData = (key: keyof VersionDataPoint) => trend.dataPoints.map(d => ({
    x: d.versionLabel,
    y: typeof d[key] === 'number' ? (d[key] as number) : 0,
  }))

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0 no-print">
        <div>
          <span className="font-bold text-slate-900 text-base">Trend Analysis</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name}</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.print()} className="text-xs border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-400 font-semibold">
            🖨 Print / Save PDF
          </button>
          <button onClick={downloadWordReport} disabled={downloading} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50">
            {downloading ? 'Generating...' : '📄 Download Word Report'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="max-w-6xl mx-auto space-y-4">

          {/* Project Header */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
            <div>
              <div className="text-2xl font-extrabold text-slate-900">{project.name}</div>
              {project.projectId && <div className="text-[10px] font-mono text-blue-600 mt-0.5">{project.projectId}</div>}
              <div className="text-xs text-slate-500 mt-1">
                Analyzing {trend.versionsAnalyzed} versions · {trend.timeSpanDays} days of project history
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Overall Trend</div>
              <div className={`text-xl font-extrabold ${trendLabel.color}`}>{trendLabel.icon} {trendLabel.text}</div>
            </div>
          </div>

          {/* ProjectLens Recommendation — LEADS the page */}
          <div className={`${recStyle.bg} ${recStyle.border} border-2 rounded-2xl p-6`}>
            <div className="flex items-start gap-4 mb-3">
              <div className="text-4xl flex-shrink-0">{recStyle.icon}</div>
              <div className="flex-1">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">ProjectLens Recommendation</div>
                <div className={`text-2xl font-extrabold ${recStyle.text}`}>{trend.recommendation.title}</div>
              </div>
            </div>
            <p className={`text-sm leading-relaxed ${recStyle.text} mb-4`}>
              {trend.recommendation.summary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <div className={`text-xs font-bold mb-2 ${recStyle.text}`}>WHY:</div>
                <ul className="space-y-1">
                  {trend.recommendation.reasoning.map((r, i) => (
                    <li key={i} className={`text-xs ${recStyle.text} flex gap-2`}>
                      <span>•</span><span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className={`text-xs font-bold mb-2 ${recStyle.text}`}>WHAT TO DO:</div>
                <ul className="space-y-1">
                  {trend.recommendation.actions.map((a, i) => (
                    <li key={i} className={`text-xs ${recStyle.text} flex gap-2`}>
                      <span className="font-bold">{i + 1}.</span><span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Trend Summary KPIs */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Delay Change</div>
              <div className={`text-2xl font-extrabold ${trend.summary.overallDelayChange > 0 ? 'text-red-600' : trend.summary.overallDelayChange < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                {trend.summary.overallDelayChange > 0 ? '+' : ''}{trend.summary.overallDelayChange}d
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">vs. first version</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Neg Float Change</div>
              <div className={`text-2xl font-extrabold ${trend.summary.overallNegFloatChange > 0 ? 'text-red-600' : trend.summary.overallNegFloatChange < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                {trend.summary.overallNegFloatChange > 0 ? '+' : ''}{trend.summary.overallNegFloatChange}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">activities</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Health Change</div>
              <div className={`text-2xl font-extrabold ${trend.summary.overallHealthChange < 0 ? 'text-red-600' : trend.summary.overallHealthChange > 0 ? 'text-green-600' : 'text-slate-600'}`}>
                {trend.summary.overallHealthChange > 0 ? '+' : ''}{trend.summary.overallHealthChange}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">points</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Monthly Slip Rate</div>
              <div className={`text-2xl font-extrabold ${trend.summary.averageMonthlyDelayGrowth > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {trend.summary.averageMonthlyDelayGrowth > 0 ? '+' : ''}{trend.summary.averageMonthlyDelayGrowth}d
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">days/month</div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-3">
            <MiniLineChart data={chartData('delayDays')} label="Days Behind Contract" color="#dc2626" suffix="d" />
            <MiniLineChart data={chartData('negativeFloat')} label="Negative Float Activities" color="#dc2626" />
            <MiniLineChart data={chartData('healthScore')} label="Health Score" color="#2563eb" />
            <MiniLineChart data={chartData('completePct')} label="Work Complete %" color="#16a34a" suffix="%" />
          </div>

          {/* Version-by-version data */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Version Data</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-2 px-2 font-bold text-slate-600">Version</th>
                    <th className="text-left py-2 px-2 font-bold text-slate-600">Date</th>
                    <th className="text-right py-2 px-2 font-bold text-slate-600">Activities</th>
                    <th className="text-right py-2 px-2 font-bold text-slate-600">Complete</th>
                    <th className="text-right py-2 px-2 font-bold text-slate-600">Neg Float</th>
                    <th className="text-right py-2 px-2 font-bold text-slate-600">Days Behind</th>
                    <th className="text-right py-2 px-2 font-bold text-slate-600">Health</th>
                    <th className="text-left py-2 px-2 font-bold text-slate-600">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.dataPoints.map((d, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-2 font-bold text-blue-600">{d.versionLabel}</td>
                      <td className="py-2 px-2 text-slate-700">{new Date(d.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{d.totalActivities}</td>
                      <td className="py-2 px-2 text-right text-slate-700">{d.completePct}%</td>
                      <td className={`py-2 px-2 text-right font-bold ${d.negativeFloat > 50 ? 'text-red-600' : d.negativeFloat > 0 ? 'text-amber-600' : 'text-green-600'}`}>{d.negativeFloat}</td>
                      <td className={`py-2 px-2 text-right font-bold ${d.delayDays > 30 ? 'text-red-600' : d.delayDays > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {d.delayDays > 0 ? '+' : ''}{d.delayDays}d
                      </td>
                      <td className="py-2 px-2 text-right text-slate-700">{d.healthScore}/100</td>
                      <td className="py-2 px-2 text-slate-700">{d.condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Major Changes */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Major Changes Between Versions</div>
            <div className="space-y-3">
              {trend.changes.map((c, i) => (
                <div key={i} className="border-l-4 border-blue-500 bg-blue-50/30 pl-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-blue-600">{c.fromVersion} → {c.toVersion}</span>
                    <span className="text-[10px] text-slate-500">{c.daysBetween} days apart</span>
                  </div>
                  {c.majorChanges.length > 0 ? (
                    <ul className="text-xs text-slate-700 space-y-0.5">
                      {c.majorChanges.map((m, j) => (
                        <li key={j} className="flex gap-2"><span>•</span><span>{m}</span></li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-slate-500 italic">No major changes detected — schedule remained stable</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="text-center text-xs text-slate-400 py-4">
            All metrics derived from your uploaded XER files · ProjectLens does not replace your judgment
          </div>
        </div>
      </div>
    </div>
  )
}
