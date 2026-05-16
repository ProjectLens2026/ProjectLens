'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { loadProjects, Project, ScheduleVersion, setActiveProjectId } from '@/lib/projectStore'
import { analyzeProjectTrend, TrendAnalysisResult, VersionDataPoint } from '@/lib/trendAnalyzer'

type Step = 'select-project' | 'select-versions' | 'results'

// Simple SVG line chart
function MiniLineChart({ data, label, color, suffix = '', chartId }: {
  data: { x: string; y: number }[]
  label: string
  color: string
  suffix?: string
  // Optional DOM id placed on the inner <svg>. Used by the Word-report
  // download flow to find the chart and rasterize it to a PNG before
  // sending to the server.
  chartId?: string
}) {
  if (!data || data.length < 2) return null
  const values = data.map(d => d.y)
  const maxVal = Math.max(...values, 1)
  const minVal = Math.min(...values, 0)
  const range = maxVal - minVal || 1
  const width = 100
  const height = 50

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d.y - minVal) / range) * height
    return { x, y, val: d.y, label: d.x }
  })

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
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
      <svg id={chartId} viewBox={`0 0 ${width} ${height + 10}`} className="w-full" preserveAspectRatio="none" style={{ height: 80 }}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#e2e8f0" strokeDasharray="2,2" strokeWidth="0.3" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={1.5} fill={color} />
            <text x={p.x} y={p.y - 3} fontSize="3" fill="#475569" textAnchor="middle">{p.val}{suffix}</text>
          </g>
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {points.map((p, i) => (
          <div key={i} className="text-[9px] text-slate-400" style={{ width: `${100 / points.length}%`, textAlign: 'center' }}>{p.label}</div>
        ))}
      </div>
    </div>
  )
}

function conditionColor(c?: string) {
  if (c === 'Recovery Required') return 'bg-red-100 text-red-700'
  if (c === 'Attention Needed') return 'bg-amber-100 text-amber-700'
  if (c === 'Monitor Closely') return 'bg-yellow-100 text-yellow-700'
  return 'bg-green-100 text-green-700'
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Resolve a version's effective date for display and sorting.
// Prefers the schedule's actual data date (from inside the XER's
// PROJECT.last_recalc_date), falling back to upload time for legacy versions
// stored before the dataDate field was introduced.
function versionEffectiveDate(v: ScheduleVersion): string {
  return v.dataDate || v.analysis?.dataDate || v.uploadedAt
}

// True if this version has a real data date from inside the XER.
// Used by the UI to distinguish "real schedule date" from "fallback to upload time".
function hasRealDataDate(v: ScheduleVersion): boolean {
  return !!(v.dataDate || v.analysis?.dataDate)
}

export default function TrendAnalysisPage() {
  const [step, setStep] = useState<Step>('select-project')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedVersionIds, setSelectedVersionIds] = useState<Set<string>>(new Set())
  const [trend, setTrend] = useState<TrendAnalysisResult | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    setProjects(loadProjects())
  }, [])

  function pickProject(p: Project) {
    setSelectedProject(p)
    setSelectedVersionIds(new Set())  // empty by default — user picks
    setStep('select-versions')
  }

  function toggleVersion(id: string) {
    const next = new Set(selectedVersionIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedVersionIds(next)
  }

  function runAnalysis() {
    if (!selectedProject) return
    if (selectedVersionIds.size < 2) return

    // Build a filtered project with only the selected versions
    const filteredProject: Project = {
      ...selectedProject,
      versions: selectedProject.versions.filter(v => selectedVersionIds.has(v.id))
    }

    const result = analyzeProjectTrend(filteredProject)
    setTrend(result)
    setActiveProjectId(selectedProject.id)
    setStep('results')
  }

  function backToProjects() {
    setSelectedProject(null)
    setSelectedVersionIds(new Set())
    setTrend(null)
    setStep('select-project')
    setProjects(loadProjects())  // Refresh
  }

  function backToVersions() {
    setTrend(null)
    setStep('select-versions')
  }

  // ============================================================================
  // CHART CAPTURE FOR WORD REPORT
  // ============================================================================
  // The trend page renders inline SVG charts via MiniLineChart. The Word doc
  // can't consume SVG directly, so we rasterize each chart to a PNG (drawn
  // onto a canvas with version labels added at the bottom), then send the
  // base64 PNGs to the server-side route which embeds them as images.
  // ============================================================================

  /**
   * Rasterize one chart SVG to a base64 PNG.
   * Returns null if the SVG isn't in the DOM or rendering fails.
   */
  async function captureChartAsPng(
    svgId: string,
    versionLabels: string[],
  ): Promise<string | null> {
    if (typeof document === 'undefined') return null
    const svg = document.getElementById(svgId) as SVGSVGElement | null
    if (!svg) return null

    // Target output dimensions — wide enough for a clean Word doc embed.
    // Aspect roughly matches the on-screen chart's viewBox.
    const chartWidth = 720
    const chartHeight = 360
    const labelStripHeight = 36  // space below for version labels
    const totalHeight = chartHeight + labelStripHeight

    // Clone the SVG so our changes don't affect the live DOM
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(chartWidth))
    clone.setAttribute('height', String(chartHeight))
    // Force a font on all text so canvas rendering is consistent.
    // Inline a <style> block — safer than relying on document CSS.
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = 'text { font-family: Arial, Helvetica, sans-serif; }'
    clone.insertBefore(style, clone.firstChild)

    const svgString = new XMLSerializer().serializeToString(clone)
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image()
        i.onload = () => resolve(i)
        i.onerror = () => reject(new Error('SVG image load failed'))
        i.src = url
      })

      const canvas = document.createElement('canvas')
      canvas.width = chartWidth
      canvas.height = totalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      // White background — embedded images on transparent look bad in Word
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, chartWidth, totalHeight)
      ctx.drawImage(img, 0, 0, chartWidth, chartHeight)

      // Draw version labels along the bottom strip
      ctx.fillStyle = '#475569'
      ctx.font = '14px Arial, Helvetica, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const labelY = chartHeight + labelStripHeight / 2
      versionLabels.forEach((label, i) => {
        const rawX = versionLabels.length === 1
          ? chartWidth / 2
          : (i / (versionLabels.length - 1)) * chartWidth
        // Keep edge labels visible (don't push half off-canvas)
        const x = Math.max(20, Math.min(chartWidth - 20, rawX))
        ctx.fillText(label, x, labelY)
      })

      // canvas.toDataURL throws SecurityError if tainted, but our SVG is
      // same-origin so it should always work.
      const dataUrl = canvas.toDataURL('image/png')
      return dataUrl.split(',')[1] || null
    } catch {
      return null
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  /**
   * Capture all 4 trend charts in parallel. Returns an object mapping each
   * metric key to its base64 PNG (or undefined if capture failed).
   */
  async function captureAllCharts(): Promise<{
    delayDays?: string
    negativeFloat?: string
    healthScore?: string
    completePct?: string
  }> {
    if (!trend) return {}
    const labels = trend.dataPoints.map(d => d.versionLabel)
    const [delayDays, negativeFloat, healthScore, completePct] = await Promise.all([
      captureChartAsPng('chart-delayDays', labels),
      captureChartAsPng('chart-negativeFloat', labels),
      captureChartAsPng('chart-healthScore', labels),
      captureChartAsPng('chart-completePct', labels),
    ])
    return {
      delayDays: delayDays || undefined,
      negativeFloat: negativeFloat || undefined,
      healthScore: healthScore || undefined,
      completePct: completePct || undefined,
    }
  }

  async function downloadWordReport() {
    if (!trend) return
    setDownloading(true)
    try {
      // Rasterize the 4 trend charts to PNGs before calling the API.
      // The route uses these to embed real images in the Word doc.
      const charts = await captureAllCharts()

      const res = await fetch('/api/trend-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trend, charts }),
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

  // ============================================
  // STEP 1: PROJECT SELECTION
  // ============================================
  if (step === 'select-project') {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <div>
            <span className="font-bold text-slate-900 text-base">Trend Analysis</span>
            <span className="text-slate-400 text-sm ml-2">· Choose a project to analyze</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          <div className="max-w-6xl mx-auto">
            {/* Intro */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 flex items-start gap-3">
              <span className="text-2xl">📈</span>
              <div>
                <div className="font-bold text-blue-900 text-sm">Pick a project to analyze trends</div>
                <div className="text-xs text-blue-800 mt-0.5">
                  Trend Analysis uses the schedule versions already saved in NobelPM — no new uploads needed.
                  Choose a project below to see how it has performed across all its updates.
                </div>
              </div>
            </div>

            {projects.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 bg-slate-200 rounded-2xl flex items-center justify-center">
                  <span className="text-3xl">📊</span>
                </div>
                <div className="text-lg font-bold text-slate-700 mb-2">No projects yet</div>
                <div className="text-sm text-slate-500 mb-6">Upload schedule versions first to enable trend analysis.</div>
                <Link href="/dashboard/projects" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700">
                  Go to Projects →
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {projects.map(p => {
                  const eligible = p.versions.length >= 2
                  const latest = [...p.versions].sort((a, b) =>
                    new Date(versionEffectiveDate(b)).getTime() -
                    new Date(versionEffectiveDate(a)).getTime()
                  )[0]
                  const analysis = latest?.analysis

                  return (
                    <button
                      key={p.id}
                      onClick={() => eligible && pickProject(p)}
                      disabled={!eligible}
                      className={`text-left bg-white border-2 rounded-2xl p-5 transition-all ${
                        eligible
                          ? 'border-slate-200 hover:border-blue-400 hover:shadow-lg cursor-pointer'
                          : 'border-slate-100 opacity-60 cursor-not-allowed'
                      }`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-900 text-base truncate">{p.name}</div>
                          {p.projectId && <div className="text-[10px] font-mono text-blue-600 mt-0.5">{p.projectId}</div>}
                        </div>
                        {eligible ? (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            {p.versions.length} versions
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                            Need another version
                          </span>
                        )}
                      </div>

                      {analysis ? (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${conditionColor(analysis.condition)}`}>
                              {analysis.condition}
                            </span>
                            <span className="text-[10px] text-slate-500">Health {analysis.healthScore}/100</span>
                          </div>
                          <div className="text-xs text-slate-500 mb-3">
                            Latest data date: {shortDate(versionEffectiveDate(latest))}
                            {!hasRealDataDate(latest) && (
                              <span className="text-slate-400 italic"> (from upload)</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-400 mb-3">No analysis on latest version</div>
                      )}

                      {eligible && (
                        <div className="text-xs font-bold text-blue-600">
                          Analyze trends →
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // STEP 2: VERSION SELECTION
  // ============================================
  if (step === 'select-versions' && selectedProject) {
    const sortedVersions = [...selectedProject.versions].sort((a, b) =>
      new Date(versionEffectiveDate(b)).getTime() -
      new Date(versionEffectiveDate(a)).getTime()
    )

    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0">
          <button onClick={backToProjects} className="text-xs text-slate-500 hover:text-blue-600 font-semibold">
            ← Back to projects
          </button>
          <div>
            <span className="font-bold text-slate-900 text-base">Trend Analysis</span>
            <span className="text-slate-400 text-sm ml-2">· {selectedProject.name}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {selectedVersionIds.size} of {sortedVersions.length} selected
            </span>
            <button
              onClick={runAnalysis}
              disabled={selectedVersionIds.size < 2}
              className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              Run Trend Analysis →
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          <div className="max-w-4xl mx-auto">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-start gap-3">
              <span className="text-2xl">📋</span>
              <div>
                <div className="font-bold text-amber-900 text-sm">Select at least 2 versions to analyze</div>
                <div className="text-xs text-amber-800 mt-0.5">
                  Check the versions you want to include in the trend. Typically include all recent updates to see the full pattern.
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
                <button
                  onClick={() => {
                    if (selectedVersionIds.size === sortedVersions.length) {
                      setSelectedVersionIds(new Set())
                    } else {
                      setSelectedVersionIds(new Set(sortedVersions.map(v => v.id)))
                    }
                  }}
                  className="text-xs text-blue-600 font-semibold hover:underline">
                  {selectedVersionIds.size === sortedVersions.length ? 'Deselect all' : 'Select all'}
                </button>
                <div className="text-xs text-slate-500 ml-auto">{sortedVersions.length} total versions</div>
              </div>

              {sortedVersions.map((v, i) => {
                const isSelected = selectedVersionIds.has(v.id)
                const analysis = v.analysis
                return (
                  <button
                    key={v.id}
                    onClick={() => toggleVersion(v.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-100 text-left transition-colors ${
                      isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                    }`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                    }`}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    <div className="font-mono text-xs font-bold text-slate-500 w-12">v{sortedVersions.length - i}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        {shortDate(versionEffectiveDate(v))}
                        {!hasRealDataDate(v) && (
                          <span className="text-[9px] font-normal text-amber-600 italic">(upload date)</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {v.fileName}
                        {hasRealDataDate(v) && (
                          <span className="text-slate-400"> · uploaded {shortDate(v.uploadedAt)}</span>
                        )}
                      </div>
                    </div>
                    {analysis && (
                      <>
                        <div className="text-xs text-slate-600 w-20 text-right">
                          {analysis.totalActivities} acts
                        </div>
                        <div className={`text-xs font-bold w-20 text-right ${
                          analysis.delayDays > 30 ? 'text-red-600' :
                          analysis.delayDays > 0 ? 'text-amber-600' : 'text-green-600'
                        }`}>
                          {analysis.delayDays > 0 ? '+' : ''}{analysis.delayDays}d
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${conditionColor(analysis.condition)}`}>
                          {analysis.healthScore}/100
                        </span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>

            {selectedVersionIds.size < 2 && (
              <div className="mt-4 text-center text-xs text-amber-600 font-semibold">
                Select at least 2 versions to run the analysis
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // STEP 3: RESULTS
  // ============================================
  if (step === 'results' && trend) {
    const recStyle = (() => {
      if (trend.recommendation.type === 'HEALTHY') return { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-900', icon: '✅' }
      if (trend.recommendation.type === 'SCHEDULE_UPDATE_REQUIRED') return { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-900', icon: '🔄' }
      if (trend.recommendation.type === 'REBASELINE_RECOMMENDED') return { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900', icon: '⚠️' }
      return { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-900', icon: '🚨' }
    })()

    const trendLabel = (() => {
      if (trend.summary.trendDirection === 'IMPROVING') return { text: 'Improving', color: 'text-green-600', icon: '↗' }
      if (trend.summary.trendDirection === 'STABLE') return { text: 'Stable', color: 'text-slate-600', icon: '→' }
      if (trend.summary.trendDirection === 'DETERIORATING') return { text: 'Deteriorating', color: 'text-amber-600', icon: '↘' }
      return { text: 'Severely Deteriorating', color: 'text-red-600', icon: '↓↓' }
    })()

    const chartData = (key: keyof VersionDataPoint) => trend.dataPoints.map(d => ({
      x: d.versionLabel,
      y: typeof d[key] === 'number' ? (d[key] as number) : 0,
    }))

    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0 no-print">
          <button onClick={backToProjects} className="text-xs text-slate-500 hover:text-blue-600 font-semibold">
            ← Switch Project
          </button>
          <button onClick={backToVersions} className="text-xs text-slate-500 hover:text-blue-600 font-semibold">
            ⚙ Change Versions
          </button>
          <div>
            <span className="font-bold text-slate-900 text-base">Trend Analysis</span>
            <span className="text-slate-400 text-sm ml-2">· {trend.projectName}</span>
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => window.print()} className="text-xs border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-400 font-semibold">
              🖨 Print
            </button>
            <button onClick={downloadWordReport} disabled={downloading} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50">
              {downloading ? 'Generating...' : '📄 Download Word Report'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          <div className="max-w-6xl mx-auto space-y-4">

            <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-2xl font-extrabold text-slate-900">{trend.projectName}</div>
                {trend.projectId && <div className="text-[10px] font-mono text-blue-600 mt-0.5">{trend.projectId}</div>}
                <div className="text-xs text-slate-500 mt-1">
                  Analyzing {trend.versionsAnalyzed} versions · {trend.timeSpanDays} days of project history
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Overall Trend</div>
                <div className={`text-xl font-extrabold ${trendLabel.color}`}>{trendLabel.icon} {trendLabel.text}</div>
              </div>
            </div>

            <div className={`${recStyle.bg} ${recStyle.border} border-2 rounded-2xl p-6`}>
              <div className="flex items-start gap-4 mb-3">
                <div className="text-4xl flex-shrink-0">{recStyle.icon}</div>
                <div className="flex-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">NobelPM Recommendation</div>
                  <div className={`text-2xl font-extrabold ${recStyle.text}`}>{trend.recommendation.title}</div>
                </div>
              </div>
              <p className={`text-sm leading-relaxed ${recStyle.text} mb-4`}>{trend.recommendation.summary}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <div className={`text-xs font-bold mb-2 ${recStyle.text}`}>WHY:</div>
                  <ul className="space-y-1">
                    {trend.recommendation.reasoning.map((r, i) => (
                      <li key={i} className={`text-xs ${recStyle.text} flex gap-2`}><span>•</span><span>{r}</span></li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className={`text-xs font-bold mb-2 ${recStyle.text}`}>WHAT TO DO:</div>
                  <ul className="space-y-1">
                    {trend.recommendation.actions.map((a, i) => (
                      <li key={i} className={`text-xs ${recStyle.text} flex gap-2`}><span className="font-bold">{i + 1}.</span><span>{a}</span></li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

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

            <div className="grid grid-cols-2 gap-3">
              <MiniLineChart data={chartData('delayDays')} label="Days Behind Contract" color="#dc2626" suffix="d" chartId="chart-delayDays" />
              <MiniLineChart data={chartData('negativeFloat')} label="Negative Float Activities" color="#dc2626" chartId="chart-negativeFloat" />
              <MiniLineChart data={chartData('healthScore')} label="Health Score" color="#2563eb" chartId="chart-healthScore" />
              <MiniLineChart data={chartData('completePct')} label="Work Complete %" color="#16a34a" suffix="%" chartId="chart-completePct" />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Version Data</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-2 px-2 font-bold text-slate-600">Version</th>
                      <th className="text-left py-2 px-2 font-bold text-slate-600">Data Date</th>
                      <th className="text-left py-2 px-2 font-bold text-slate-600">Uploaded</th>
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
                        <td className="py-2 px-2 text-slate-700">
                          {d.dataDate ? (
                            shortDate(d.dataDate)
                          ) : (
                            <span className="text-amber-600 italic">{shortDate(d.uploadedAt)} <span className="text-[10px]">(from upload)</span></span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-slate-500">{shortDate(d.uploadedAt)}</td>
                        <td className="py-2 px-2 text-right text-slate-700">{d.totalActivities}</td>
                        <td className="py-2 px-2 text-right text-slate-700">{d.completePct}%</td>
                        <td className={`py-2 px-2 text-right font-bold ${d.negativeFloat > 50 ? 'text-red-600' : d.negativeFloat > 0 ? 'text-amber-600' : 'text-green-600'}`}>{d.negativeFloat}</td>
                        <td className={`py-2 px-2 text-right font-bold ${d.delayDays > 30 ? 'text-red-600' : d.delayDays > 0 ? 'text-amber-600' : 'text-green-600'}`}>{d.delayDays > 0 ? '+' : ''}{d.delayDays}d</td>
                        <td className="py-2 px-2 text-right text-slate-700">{d.healthScore}/100</td>
                        <td className="py-2 px-2 text-slate-700">{d.condition}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

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
                        {c.majorChanges.map((m, j) => <li key={j} className="flex gap-2"><span>•</span><span>{m}</span></li>)}
                      </ul>
                    ) : (
                      <div className="text-xs text-slate-500 italic">No major changes detected — schedule remained stable</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center text-xs text-slate-400 py-4">
              All metrics derived from your saved XER files · NobelPM does not replace your judgment
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
