'use client'

// =============================================================================
// Deleted page (recycle bin) — placeholder.
// Shows hardcoded soft-deleted projects/versions.
// Restore / Delete Forever are non-functional. Real soft-delete logic ships with D3.
// =============================================================================

const DEMO_DELETED = [
  {
    name: 'Test Schedule Demo',
    type: 'Project',
    meta: '1 version · 0 RFIs',
    identifier: 'TEST-2026-001',
    deletedDate: 'May 17, 2026',
    deletedBy: 'Mike Anderson',
    daysLeft: 28,
  },
  {
    name: 'Old Baseline.xer',
    type: 'Version',
    meta: 'Version from USACE Renovation',
    identifier: 'USACE-CT-2024-001 · BL-old',
    deletedDate: 'May 14, 2026',
    deletedBy: 'Mike Anderson',
    daysLeft: 25,
  },
  {
    name: 'Cancelled Project Alpha',
    type: 'Project',
    meta: '2 versions · 3 RFIs',
    identifier: 'DEMO-2024-099',
    deletedDate: 'Apr 20, 2026',
    deletedBy: 'Bob Carter',
    daysLeft: 1,
  },
]

export default function DeletedPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center gap-3 flex-shrink-0">
        <span className="text-xl">🗑️</span>
        <span className="font-bold text-slate-900 text-base">Deleted</span>
        <span className="text-slate-400 text-sm">· {DEMO_DELETED.length} items · auto-purges after 30 days</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">

          {/* Warning banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start gap-3">
            <span className="text-base">⚠️</span>
            <div className="text-xs text-amber-900 leading-relaxed">
              Soft-deleted projects and versions live here for 30 days. <strong>Restore</strong> brings them back. <strong>Delete Forever</strong> removes them permanently — ControlLens does <strong>not maintain backups after permanent delete</strong>.
            </div>
          </div>

          {/* Deleted list */}
          <div className="space-y-3">
            {DEMO_DELETED.map(item => {
              const urgentCountdown = item.daysLeft <= 3
              return (
                <div key={item.identifier} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-4 min-w-0">
                      <div className="text-base font-bold text-slate-900 truncate">{item.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        <span className="bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider mr-1.5">{item.type}</span>
                        {item.meta}
                      </div>
                    </div>
                    <div className="col-span-3">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Identifier</div>
                      <div className="text-xs font-mono text-slate-700 mt-0.5 truncate">{item.identifier}</div>
                    </div>
                    <div className="col-span-3">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Deleted</div>
                      <div className="text-xs text-slate-700 mt-0.5">{item.deletedDate}</div>
                      <div className="text-[10px] text-slate-400">by {item.deletedBy}</div>
                    </div>
                    <div className="col-span-2 flex items-center justify-end">
                      <span className={
                        'px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap ' +
                        (urgentCountdown ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')
                      }>
                        {item.daysLeft} day{item.daysLeft !== 1 ? 's' : ''} left
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
                    <button
                      className="text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-md text-xs font-semibold"
                      title="Coming soon"
                    >
                      ↶ Restore
                    </button>
                    <button
                      className="text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-md text-xs font-semibold"
                      title="Coming soon"
                    >
                      Delete Forever
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer note */}
          <div className="text-center text-[10px] text-slate-400 mt-6">
            Restore and Delete Forever actions are visual-only in this preview. Soft-delete + 30-day auto-purge ship with the next release.
          </div>

        </div>
      </div>
    </div>
  )
}
