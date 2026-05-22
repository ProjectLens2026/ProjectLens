'use client'
// =============================================================================
// Earned Value Management — standalone page (Day 5, v13)
//
// Reachable from the sidebar at /dashboard/evm. Replaces the Project
// Production tab that previously lived in the Lens page.
//
// Start date = project.contractDates.ntp (manual).
// End date   = analysis.projectedEnd  (from latest XER) — falls back to
//              project.contractDates.originalContractCompletion if no XER.
// The "money left to spread" runs to the projected end, not the original
// contract date, so the S-curve stretches to where the project actually
// finishes.
//
// Chart: cumulative S-curves (Planned vs Earned, plus Actual Cost when any
// AC has been entered). Replaces the v12 bar chart which read as tiny slivers.
// =============================================================================

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getActiveProject, getActiveVersion, updateProjectEvm } from '@/lib/projectStore'
import type { EvmData, EvmMonth, DistributionMode } from '@/lib/evm'
import {
  buildEvmMonths, evmCumulative,
  monthPlanned, monthEarned, monthCPI, monthSPI,
  fmtDollars, fmtDollarsShort, fmtRatio, fmtPct,
  spiMeaning, cpiMeaning,
  migrateEvmData, buildCumulativeArray,
} from '@/lib/evm'

export default function EvmPage() {
  const [project, setProject] = useState<any>(null)
  const [version, setVersion] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [])

  function refresh() {
    const p = getActiveProject()
    setProject(p)
    const v = getActiveVersion(p)
    setVersion(v)
    setAnalysis(v?.analysis || null)
  }

  if (!project) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
          <span className="font-bold text-slate-900 text-base">Earned Value Management</span>
          <span className="text-slate-400 text-sm ml-2">· No active project</span>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
              <span className="text-3xl">📈</span>
            </div>
            <div className="text-lg font-bold text-slate-700 mb-2">Select a project first</div>
            <div className="text-sm text-slate-500 mb-6">EVM tracking is scoped to a specific project.</div>
            <Link href="/dashboard/projects" className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-blue-700">
              Go to Projects →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-4 flex-shrink-0 no-print">
        <div>
          <span className="font-bold text-slate-900 text-base">Earned Value Management</span>
          <span className="text-slate-400 text-sm ml-2">· {project.name}</span>
          {version?.versionLabel && (
            <span className="text-[10px] text-blue-600 font-mono ml-2 px-1.5 py-0.5 bg-blue-50 rounded">
              {version.versionLabel}
            </span>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => window.print()} className="text-xs border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-400 transition-colors font-semibold">
            🖨 Print / Save PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Page intro card */}
          <div className="bg-gradient-to-br from-blue-50 to-emerald-50 border border-blue-200 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="text-4xl">📈</div>
              <div className="flex-1">
                <div className="text-lg font-bold text-slate-900">Project Production Index</div>
                <div className="text-xs text-slate-500 mt-0.5">Earned Value Management · schedule + cost performance against budget</div>
                <div className="text-xs text-slate-600 mt-2 leading-relaxed">
                  Enter <strong>Total Budget</strong> once. Pick a distribution (S-curve, Linear, or Manual).
                  Each month, type <strong>Earned %</strong> as physical work is completed and verified.
                  ControlLens calculates SPI live. Enter Actual Cost monthly if you also want CPI.
                </div>
              </div>
            </div>
          </div>

          <EvmContent project={project} analysis={analysis} />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// EvmContent — setup, KPIs, S-curve chart, table, explainers
// =============================================================================
function EvmContent({ project, analysis }: { project: any; analysis: any }) {
  // ---- date range ----
  const ntp = project.contractDates?.ntp
  // v13: prefer the LATEST XER's projected end so the budget spreads to where
  // the project actually finishes. Fallback to manual contract end when no XER
  // has been analyzed yet.
  const projectedEndIso = (() => {
    const fromXer = analysis?.projectedEnd
    if (fromXer) {
      // analysis.projectedEnd is ISO-with-time; trim to YYYY-MM-DD.
      const d = new Date(fromXer)
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    }
    return project.contractDates?.originalContractCompletion || ''
  })()

  // ---- state ----
  const migrated = migrateEvmData(project.evm)
  const [budget, setBudget] = useState<string>(migrated?.totalBudget ? String(migrated.totalBudget) : '')
  const [distMode, setDistMode] = useState<DistributionMode>(migrated?.distributionMode || 'scurve')
  const [months, setMonths] = useState<EvmMonth[]>(migrated?.months || [])

  // Sync on project change
  useEffect(() => {
    const m = migrateEvmData(project.evm)
    if (m) {
      setBudget(m.totalBudget ? String(m.totalBudget) : '')
      setDistMode(m.distributionMode || 'scurve')
      setMonths(m.months || [])
    } else {
      setBudget('')
      setDistMode('scurve')
      setMonths([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  // When the projected end shifts (new XER uploaded), offer to regenerate
  // the month range. We auto-extend on first detection so the chart never
  // looks "truncated" — extra months get appended with 0/0 values and the
  // PM's existing earned/actuals are preserved by isoMonth.
  useEffect(() => {
    if (!ntp || !projectedEndIso || months.length === 0) return
    const expectedLast = monthsEndIso(months)
    const desiredLast = projectedEndIso.slice(0, 7)  // YYYY-MM
    if (expectedLast && desiredLast && desiredLast > expectedLast) {
      const newMonths = buildEvmMonths(ntp, projectedEndIso, distMode, months)
      setMonths(newMonths)
      persistInline(newMonths, undefined, undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectedEndIso])

  // ---- persistence ----
  function persistInline(
    nextMonths?: EvmMonth[],
    nextBudget?: number,
    nextDist?: DistributionMode,
  ) {
    const data: EvmData = {
      totalBudget: nextBudget ?? (parseFloat(budget) || 0),
      currency: 'USD',
      distributionMode: nextDist ?? distMode,
      months: nextMonths ?? months,
    }
    updateProjectEvm(project.id, data)
  }

  function setupEvm() {
    if (!ntp || !projectedEndIso) return
    const newMonths = buildEvmMonths(ntp, projectedEndIso, distMode, months)
    setMonths(newMonths)
    persistInline(newMonths)
  }
  function handleBudgetChange(value: string) {
    setBudget(value)
    persistInline(undefined, parseFloat(value) || 0)
  }
  function handleDistChange(mode: DistributionMode) {
    setDistMode(mode)
    if (mode === 'scurve' || mode === 'linear') {
      const newMonths = buildEvmMonths(ntp, projectedEndIso, mode, months)
      setMonths(newMonths)
      persistInline(newMonths, undefined, mode)
    } else {
      persistInline(undefined, undefined, mode)
    }
  }
  function updateMonth(idx: number, field: keyof EvmMonth, value: number | undefined) {
    const newMonths = months.map((m, i) => i === idx ? { ...m, [field]: value } : m)
    setMonths(newMonths)
    persistInline(newMonths)
  }
  function regenerateFromDates() {
    if (!ntp || !projectedEndIso) return
    const newMonths = buildEvmMonths(ntp, projectedEndIso, distMode, months)
    setMonths(newMonths)
    persistInline(newMonths)
  }

  // Excel-like clear-all buttons per column
  function clearEarnedColumn() {
    if (months.length === 0) return
    if (!confirm('Clear all Earned % values? You can re-enter them anytime.')) return
    const newMonths = months.map(m => ({ ...m, earnedPct: 0 }))
    setMonths(newMonths)
    persistInline(newMonths)
  }
  function clearActualCostColumn() {
    if (months.length === 0) return
    if (!confirm('Clear all Actual Cost values? CPI will reset to "—" until you re-enter.')) return
    const newMonths = months.map(m => ({ ...m, actualCost: undefined }))
    setMonths(newMonths)
    persistInline(newMonths)
  }
  function clearPlannedColumn() {
    if (months.length === 0 || distMode !== 'manual') return
    if (!confirm('Clear all Planned % values? You can re-enter or regenerate from the distribution.')) return
    const newMonths = months.map(m => ({ ...m, plannedPct: 0 }))
    setMonths(newMonths)
    persistInline(newMonths)
  }

  // ---- guards ----
  if (!ntp || !projectedEndIso) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex gap-3 items-start">
          <div className="text-2xl">⚠️</div>
          <div>
            <div className="font-bold text-amber-900 mb-1">Set up contract dates first</div>
            <div className="text-sm text-amber-800 leading-relaxed mb-3">
              EVM needs your manual NTP and an end date (Original Contract Completion or projected end from XER) so we can spread the budget across project months.
              Open <Link href="/dashboard/upload" className="font-bold underline">Upload</Link> and fill in the Contract Dates section,
              then come back here.
            </div>
            <div className="text-xs text-amber-700">
              NTP: <span className="font-mono font-bold">{ntp || '(not set)'}</span>
              {' · '}
              Projected end / Original Contract Completion: <span className="font-mono font-bold">{projectedEndIso || '(not set)'}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const totalBudgetNum = parseFloat(budget) || 0
  const hasMonths = months.length > 0

  // Cutoff month for cumulative (data date)
  const cutoff = (() => {
    const d = analysis?.dataDate ? new Date(analysis.dataDate) : new Date()
    if (isNaN(d.getTime())) return undefined
    const yy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${yy}-${mm}`
  })()

  const cumulative = evmCumulative(totalBudgetNum, months, cutoff)
  const sCurveData = useMemo(
    () => buildCumulativeArray(months, totalBudgetNum, cutoff),
    [months, totalBudgetNum, cutoff],
  )

  // ---- render ----
  return (
    <>
      {/* Setup card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Total Budget (USD)</label>
            <input type="number" value={budget}
              onChange={e => handleBudgetChange(e.target.value)}
              placeholder="e.g. 3000000"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            <div className="text-[10px] text-slate-500 mt-1">{totalBudgetNum > 0 ? fmtDollars(totalBudgetNum) : 'Enter total contract value'}</div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Distribution</label>
            <div className="flex gap-1">
              {(['scurve', 'linear', 'manual'] as DistributionMode[]).map(m => (
                <button key={m} onClick={() => handleDistChange(m)}
                  className={`flex-1 text-xs font-semibold px-2 py-2 rounded-lg transition-colors ${
                    distMode === m ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}>
                  {m === 'scurve' ? 'S-curve' : m === 'linear' ? 'Linear' : 'Manual'}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {distMode === 'scurve' ? 'Construction-standard S' :
               distMode === 'linear' ? 'Equal % every month' :
               'You enter each month'}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Date Range (auto from XER)</label>
            <div className="text-xs text-slate-700 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="font-semibold">{ntp} → {projectedEndIso}</div>
              <div className="text-[10px] text-slate-500">{months.length} months · end = projected from latest XER</div>
            </div>
            <button onClick={hasMonths ? regenerateFromDates : setupEvm}
              className="mt-1 w-full text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline">
              {hasMonths ? '⟳ Regenerate from dates' : '⟳ Generate monthly grid'}
            </button>
          </div>
        </div>
      </div>

      {!hasMonths ? (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">💰</div>
          <div className="text-sm font-bold text-slate-700 mb-1">Generate the monthly grid to start</div>
          <div className="text-xs text-slate-500 mb-4">Enter Total Budget above, then click "Generate monthly grid".</div>
          <button onClick={setupEvm}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg">
            Generate monthly grid →
          </button>
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <KpiCell label="Total Budget" value={fmtDollars(totalBudgetNum)} subtle />
            <KpiCell label={`Planned (${fmtPct(cumulative.plannedPct)})`} value={fmtDollars(cumulative.pv)} subtitle="PV cumulative through data date" />
            <KpiCell label={`Earned (${fmtPct(cumulative.earnedPct)})`} value={fmtDollars(cumulative.ev)} valueColor="text-emerald-700" subtitle="EV cumulative through data date" />
            <KpiCell label="Schedule Variance" value={cumulative.sv >= 0 ? '+' + fmtDollars(cumulative.sv) : '−' + fmtDollars(Math.abs(cumulative.sv))}
              valueColor={cumulative.sv < 0 ? 'text-red-600' : cumulative.sv > 0 ? 'text-emerald-600' : 'text-slate-700'}
              subtitle="EV − PV" />
            <KpiCell label="SPI" value={fmtRatio(cumulative.spi)}
              valueColor={cumulative.spi === null ? 'text-slate-400' : cumulative.spi < 0.995 ? 'text-red-600' : cumulative.spi > 1.005 ? 'text-emerald-600' : 'text-slate-700'}
              subtitle={spiMeaning(cumulative.spi)} prominent />
            <KpiCell label="CPI" value={fmtRatio(cumulative.cpi)}
              valueColor={cumulative.cpi === null ? 'text-slate-400' : cumulative.cpi < 0.995 ? 'text-red-600' : cumulative.cpi > 1.005 ? 'text-emerald-600' : 'text-slate-700'}
              subtitle={cpiMeaning(cumulative.cpi)} />
          </div>

          {/* S-Curve chart */}
          <SCurveChart
            data={sCurveData.rows}
            maxValue={Math.max(sCurveData.maxValue, totalBudgetNum)}
            hasActual={sCurveData.hasAnyActualCost}
            cutoff={cutoff}
            totalBudget={totalBudgetNum}
          />

          {/* Editable monthly table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 grid gap-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider items-center"
              style={{ gridTemplateColumns: '1.2fr 1fr 1.1fr 1fr 1.1fr 1.2fr 0.8fr 0.8fr 0.7fr' }}>
              <div>Month</div>
              <div className="text-right flex items-center justify-end gap-1">
                <span>Planned %</span>
                {distMode === 'manual' && (
                  <button onClick={clearPlannedColumn}
                    title="Clear all Planned % values"
                    className="text-[9px] font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 px-1 rounded">× Clear</button>
                )}
              </div>
              <div className="text-right">Planned $</div>
              <div className="text-right flex items-center justify-end gap-1">
                <span>Earned %</span>
                <button onClick={clearEarnedColumn}
                  title="Clear all Earned % values"
                  className="text-[9px] font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 px-1 rounded">× Clear</button>
              </div>
              <div className="text-right">Earned $</div>
              <div className="text-right flex items-center justify-end gap-1">
                <span>Actual Cost</span>
                <span className="text-[8px] text-slate-400 font-normal normal-case">(optional)</span>
                <button onClick={clearActualCostColumn}
                  title="Clear all Actual Cost values"
                  className="text-[9px] font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 px-1 rounded">× Clear</button>
              </div>
              <div className="text-right">SPI</div>
              <div className="text-right">CPI</div>
              <div className="text-center">When</div>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {months.map((m, i) => {
                const pv = monthPlanned(m.plannedPct, totalBudgetNum)
                const ev = monthEarned(m.earnedPct, totalBudgetNum)
                const cpi = monthCPI(m.earnedPct, totalBudgetNum, m.actualCost)
                const spi = monthSPI(m.earnedPct, m.plannedPct)
                const isCurrent = cutoff && m.isoMonth === cutoff
                const isPast = cutoff && m.isoMonth < cutoff
                const rowBg = isCurrent ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                return (
                  <div key={m.isoMonth} className={`grid gap-2 px-3 py-1.5 text-xs border-b border-slate-100 last:border-0 ${rowBg} items-center`}
                    style={{ gridTemplateColumns: '1.2fr 1fr 1.1fr 1fr 1.1fr 1.2fr 0.8fr 0.8fr 0.7fr' }}>
                    <div className="font-mono font-semibold text-slate-900">{m.label}</div>
                    <div className="text-right">
                      <input type="number" step="0.1"
                        value={m.plannedPct ? m.plannedPct.toFixed(2) : ''}
                        onChange={e => updateMonth(i, 'plannedPct', parseFloat(e.target.value) || 0)}
                        disabled={distMode !== 'manual'}
                        placeholder="0"
                        className={`w-full text-right px-1.5 py-0.5 text-xs border rounded ${distMode === 'manual' ? 'border-slate-200 bg-white' : 'border-transparent bg-transparent text-slate-500'}`} />
                    </div>
                    <div className="text-right text-slate-700 font-mono">{fmtDollars(pv)}</div>
                    <div className="text-right">
                      <input type="number" step="0.1"
                        value={m.earnedPct ? m.earnedPct.toFixed(2) : ''}
                        onChange={e => updateMonth(i, 'earnedPct', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full text-right px-1.5 py-0.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-400" />
                    </div>
                    <div className="text-right text-emerald-700 font-mono">{ev > 0 ? fmtDollars(ev) : '—'}</div>
                    <div className="text-right">
                      <input type="number"
                        value={m.actualCost && m.actualCost > 0 ? m.actualCost : ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value)
                          updateMonth(i, 'actualCost', isNaN(v) || v <= 0 ? undefined : v)
                        }}
                        placeholder="—"
                        className="w-full text-right px-1.5 py-0.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-400" />
                    </div>
                    <div className={`text-right font-bold ${spi === null ? 'text-slate-300' : spi < 0.995 ? 'text-red-600' : spi > 1.005 ? 'text-emerald-600' : 'text-slate-700'}`}>
                      {fmtRatio(spi)}
                    </div>
                    <div className={`text-right font-bold ${cpi === null ? 'text-slate-300' : cpi < 0.995 ? 'text-red-600' : cpi > 1.005 ? 'text-emerald-600' : 'text-slate-700'}`}>
                      {fmtRatio(cpi)}
                    </div>
                    <div className="text-center">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isCurrent ? 'bg-blue-100 text-blue-800' : isPast ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                        {isCurrent ? 'NOW' : isPast ? 'PAST' : 'NEXT'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Educational explainers — three callouts.
              We lead with AC vs EV because the difference between those two
              underpins both CPI and the project margin story. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* AC vs EV — fundamentals (NEW in v13) */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[11px] leading-relaxed">
              <div className="font-bold text-blue-900 mb-1.5">💡 Earned Value vs Actual Cost</div>
              <div className="text-slate-700 space-y-1.5">
                <div>
                  <span className="font-bold text-amber-700">Actual Cost (AC)</span> is what the project pays out — materials, labor, equipment, site overhead. It's the cash leaving the contractor's account to get the work done.
                </div>
                <div>
                  <span className="font-bold text-emerald-700">Earned Value (EV)</span> is what the project earns from the client for that work — your direct cost <em>plus</em> overhead and profit margin built into the contract price.
                </div>
                <div className="pt-1 border-t border-blue-200 text-[10px] text-slate-600 italic">
                  EV greater than AC = positive margin (your numbers are working).
                  AC greater than EV = costs running ahead of the value earned.
                </div>
              </div>
            </div>

            {/* SPI — primary metric */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-[11px] leading-relaxed">
              <div className="font-bold text-emerald-900 mb-1">📊 Schedule Performance Index (SPI)</div>
              <div className="font-mono text-[10px] text-emerald-700 mb-2">SPI = Earned % ÷ Planned %</div>
              <div className="space-y-1 text-slate-700">
                <div><span className="font-bold text-slate-900">SPI = 1.00</span> → Project is on schedule</div>
                <div><span className="font-bold text-emerald-700">SPI &gt; 1.00</span> → Ahead of schedule (production faster than planned)</div>
                <div><span className="font-bold text-red-700">SPI &lt; 1.00</span> → Behind schedule (production slower than planned)</div>
              </div>
            </div>

            {/* CPI — optional */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] leading-relaxed">
              <div className="font-bold text-slate-900 mb-1">💵 Cost Performance Index (CPI) — optional</div>
              <div className="font-mono text-[10px] text-slate-600 mb-2">CPI = Earned $ ÷ Actual Cost</div>
              <div className="space-y-1 text-slate-700">
                <div><span className="font-bold text-slate-900">CPI = 1.00</span> → On budget</div>
                <div><span className="font-bold text-emerald-700">CPI &gt; 1.00</span> → Under budget (earned more than spent)</div>
                <div><span className="font-bold text-red-700">CPI &lt; 1.00</span> → Over budget (spent more than earned)</div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200 text-[10px] text-slate-500">
                ControlLens does not pull expenditures from XER. Enter Actual Cost monthly if you want CPI computed.
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// =============================================================================
// SCurveChart — cumulative S-curves (Planned, Earned, optional Actual).
//
// Replaces the v12 bar chart which was unreadable at narrow bar widths. The
// cumulative view also makes "where we should be vs where we are" obvious at
// a glance — exactly what construction PMs read S-curves for.
//
// Past portion of each line is drawn solid; future portion of the PLANNED
// line continues solid (we know the plan); future portion of the EARNED /
// ACTUAL lines isn't drawn (no data yet).
// =============================================================================
function SCurveChart({
  data, maxValue, hasActual, cutoff, totalBudget,
}: {
  data: ReturnType<typeof buildCumulativeArray>['rows']
  maxValue: number
  hasActual: boolean
  cutoff: string | undefined
  totalBudget: number
}) {
  if (data.length === 0 || totalBudget === 0) return null

  const W = 920
  const H = 420
  const padL = 72, padR = 24, padT = 28, padB = 56
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  // Y-axis tops at total budget (or higher if any line exceeds it, e.g. AC > budget).
  const yMax = Math.max(maxValue, totalBudget)
  const yFor = (v: number) => padT + innerH * (1 - v / yMax)
  const stepX = innerW / Math.max(data.length - 1, 1)
  const xFor = (i: number) => padL + i * stepX

  // X-axis label thinning — show every Nth month label if too many.
  const labelEvery = data.length <= 14 ? 1 : data.length <= 30 ? 2 : data.length <= 60 ? 4 : 6

  // Build polyline points for each line. Earned and Actual stop at the last
  // month that has data; Planned spans the full range.
  const plannedPts = data.map((r, i) => `${xFor(i)},${yFor(r.plannedCum)}`).join(' ')
  const lastEarnedIdx = (() => {
    let idx = -1
    for (let i = 0; i < data.length; i++) {
      if (data[i].earnedCum > 0) idx = i
    }
    return idx
  })()
  const earnedPts = lastEarnedIdx < 0 ? '' : data.slice(0, lastEarnedIdx + 1).map((r, i) => `${xFor(i)},${yFor(r.earnedCum)}`).join(' ')
  const lastActualIdx = (() => {
    let idx = -1
    for (let i = 0; i < data.length; i++) {
      if (data[i].actualCum > 0) idx = i
    }
    return idx
  })()
  const actualPts = lastActualIdx < 0 ? '' : data.slice(0, lastActualIdx + 1).map((r, i) => `${xFor(i)},${yFor(r.actualCum)}`).join(' ')

  // Data-date marker x position. Find the index of the cutoff month if present.
  const cutoffIdx = cutoff ? data.findIndex(r => r.isoMonth === cutoff) : -1
  const cutoffX = cutoffIdx >= 0 ? xFor(cutoffIdx) : -1

  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(t => t * yMax)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-sm font-bold text-slate-900">S-Curve · Cumulative Planned vs Earned</div>
          <div className="text-[11px] text-slate-500">Running totals through project end · vertical line = data date</div>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-600">
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-blue-600"/>Planned (PV)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-emerald-600"/>Earned (EV)</span>
          {hasActual && <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 bg-amber-600" style={{borderTop:'2px dashed #d97706', background:'none'}}/>Actual Cost (AC)</span>}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* Y-axis gridlines + labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={yFor(v)} x2={W - padR} y2={yFor(v)} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray={v === 0 ? '0' : '2'} />
            <text x={padL - 8} y={yFor(v) + 4} fontSize="10" fill="#94a3b8" textAnchor="end">{fmtDollarsShort(v)}</text>
          </g>
        ))}

        {/* X-axis labels */}
        {data.map((r, i) => {
          if (i % labelEvery !== 0 && i !== data.length - 1) return null
          return (
            <g key={r.isoMonth}>
              <line x1={xFor(i)} y1={padT + innerH} x2={xFor(i)} y2={padT + innerH + 4} stroke="#cbd5e1" strokeWidth="0.5" />
              <text x={xFor(i)} y={padT + innerH + 16} fontSize="9" fill="#64748b" textAnchor="middle">{r.label}</text>
            </g>
          )
        })}

        {/* Data date vertical line */}
        {cutoffX > 0 && (
          <g>
            <line x1={cutoffX} y1={padT} x2={cutoffX} y2={padT + innerH} stroke="#dc2626" strokeWidth="1" strokeDasharray="4,3" opacity="0.7" />
            <rect x={cutoffX - 36} y={padT - 18} width="72" height="14" rx="2" fill="#fef2f2" stroke="#dc2626" strokeWidth="0.5"/>
            <text x={cutoffX} y={padT - 8} fontSize="9" fontWeight="700" fill="#dc2626" textAnchor="middle" letterSpacing="0.05em">DATA DATE</text>
          </g>
        )}

        {/* Lines — drawn after gridlines so they sit on top */}
        <polyline points={plannedPts} stroke="#2563eb" strokeWidth="2.5" fill="none" />
        {earnedPts && <polyline points={earnedPts} stroke="#16a34a" strokeWidth="2.5" fill="none" />}
        {actualPts && hasActual && <polyline points={actualPts} stroke="#d97706" strokeWidth="2.5" fill="none" strokeDasharray="5,4" />}

        {/* Dots at each data point */}
        {data.map((r, i) => (
          <g key={r.isoMonth + '-dots'}>
            <circle cx={xFor(i)} cy={yFor(r.plannedCum)} r="2.5" fill="#2563eb" />
            {r.earnedCum > 0 && <circle cx={xFor(i)} cy={yFor(r.earnedCum)} r="2.5" fill="#16a34a" />}
            {r.actualCum > 0 && hasActual && <circle cx={xFor(i)} cy={yFor(r.actualCum)} r="2.5" fill="#d97706" />}
          </g>
        ))}
      </svg>
    </div>
  )
}

// =============================================================================
// KpiCell — small KPI tile, reused across the EVM page.
// `prominent` adds an emerald border to highlight SPI as the primary metric.
// =============================================================================
function KpiCell({ label, value, subtle, valueColor, subtitle, prominent }: {
  label: string; value: string; subtle?: boolean; valueColor?: string; subtitle?: string; prominent?: boolean
}) {
  return (
    <div className={`rounded-lg p-2.5 ${
      prominent ? 'bg-emerald-50 border-2 border-emerald-300' :
      subtle ? 'bg-slate-50' : 'bg-white border border-slate-200'
    }`}>
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider truncate" title={label}>{label}</div>
      <div className={`text-base font-bold ${valueColor || 'text-slate-900'} tabular-nums mt-0.5`}>{value}</div>
      {subtitle && <div className="text-[9px] text-slate-500 mt-0.5">{subtitle}</div>}
    </div>
  )
}

// Helper — last isoMonth in a months array, or undefined if empty
function monthsEndIso(months: EvmMonth[]): string | undefined {
  if (!months.length) return undefined
  return months[months.length - 1].isoMonth
}
