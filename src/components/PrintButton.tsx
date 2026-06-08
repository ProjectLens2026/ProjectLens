'use client'

// =============================================================================
// src/components/PrintButton.tsx
// =============================================================================
// Triggers the browser's print dialog. The print stylesheet (Tailwind print:
// modifiers + class="print:hidden" on chrome) handles the visual transform.
//
// Customers use this to "Save as PDF" via the browser's print → destination
// PDF flow — no server-side PDF rendering required.
// =============================================================================

export default function PrintButton({ label = 'Print / Save as PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg transition-colors print:hidden"
      style={{ background: '#13202e', color: '#ffffff' }}
      title="Print or save as PDF"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      <span>{label}</span>
    </button>
  )
}
