'use client'

// =============================================================================
// src/components/WordButton.tsx
// =============================================================================
// Word document download. Wired to /api/reports/word?type=...&projectId=...
//
// Word export is not yet implemented in ControlLens. Until the endpoint
// ships, this button renders disabled with a "coming soon" tooltip — keeps
// the report layout consistent with EstimateLens but doesn't promise a
// broken feature.
//
// To enable later: build /api/reports/word route + pass `enabled` prop.
// =============================================================================

interface WordButtonProps {
  /** URL of the Word generation endpoint, e.g. /api/reports/word?type=executive */
  href?: string
  /** When false, button shows as disabled with "coming soon" tooltip */
  enabled?: boolean
  label?: string
}

export default function WordButton({ href, enabled = false, label = 'Word' }: WordButtonProps) {
  const className =
    'inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg transition-colors print:hidden border border-slate-200'

  if (enabled && href) {
    return (
      <a
        href={href}
        download
        className={className + ' bg-white text-slate-700 hover:bg-slate-50'}
      >
        <DocIcon />
        <span>{label}</span>
      </a>
    )
  }

  return (
    <button
      type="button"
      disabled
      title="Word export coming soon"
      className={className + ' bg-slate-50 text-slate-400 cursor-not-allowed'}
    >
      <DocIcon />
      <span>{label}</span>
      <span className="text-[9px] font-bold uppercase tracking-wide ml-1 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
        Soon
      </span>
    </button>
  )
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  )
}
