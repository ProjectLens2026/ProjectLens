'use client'

// =============================================================================
// Archive page — placeholder.
// Shows hardcoded archived projects (Final Complete status).
// View / Restore actions are non-functional. Real archive logic ships with D3.
// =============================================================================

const DEMO_ARCHIVED = [
  {
    name: 'VA Hospital Wing 4',
    contractId: 'VA-CA-2022-007',
    versionCount: 7,
    rfiCount: 14,
    owner: 'Mike Anderson',
    completedDate: 'Apr 15, 2026',
    archivedAgo: '1 month ago',
  },
  {
    name: 'Pentagon Renovation Phase 3',
    contractId: 'USACE-DC-2023-001',
    versionCount: 12,
    rfiCount: 28,
    owner: 'Mike Anderson',
    completedDate: 'Mar 1, 2026',
    archivedAgo: '2 months ago',
  },
  {
    name: 'GSA Federal Building Lobby',
    contractId: 'GSA-VA-2023-012',
    versionCount: 4,
    rfiCount: 9,
    owner: 'Bob Carter',
    completedDate: 'Feb 20, 2026',
    archivedAgo: '3 months ago',
  },
]

export default function ArchivePage() {
  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-3 flex-shrink-0">
        <span className="text-xl">📦</span>
        <span className="font-bold text-slate-900 text-base">Archive</span>
        <span className="text-slate-400 text-sm">· {DEMO_ARCHIVED.length} archived projects · Nobel PCS</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">

          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-start gap-3">
            <span className="text-base">ℹ️</span>
            <div className="text-xs text-blue-900 leading-relaxed">
              Projects automatically land here when their status is set to <strong>Final Complete</strong>. All versions, RFIs, and analyses are preserved. Read-only by default — click <strong>Restore</strong> to bring back as active.
            </div>
          </div>

          {/* Archived list */}
          <div className="space-y-3">
            {DEMO_ARCHIVED.map(p => (
              <div key={p.contractId} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-slate-300 transition-all">
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-4 min-w-0">
                    <div className="text-base font-bold text-slate-900 truncate">{p.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {p.versionCount} versions · {p.rfiCount} RFIs · {p.owner}
                    </div>
                  </div>
                  <div className="col-span-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contract #</div>
                    <div className="text-xs font-mono text-slate-700 mt-0.5 truncate">{p.contractId}</div>
                  </div>
                  <div className="col-span-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Completed</div>
                    <div className="text-xs text-slate-700 mt-0.5">{p.completedDate}</div>
                    <div className="text-[10px] text-slate-400">archived {p.archivedAgo}</div>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-white whitespace-nowrap">
                      ✓ Final Complete
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
                  <button
                    className="text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md text-xs font-semibold"
                    title="Coming soon"
                  >
                    👁 View
                  </button>
                  <button
                    className="text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-md text-xs font-semibold"
                    title="Coming soon"
                  >
                    ↶ Restore
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div className="text-center text-[10px] text-slate-400 mt-6">
            View and Restore actions are visual-only in this preview. Auto-archive on "Final Complete" status ships with the next release.
          </div>

        </div>
      </div>
    </div>
  )
}
