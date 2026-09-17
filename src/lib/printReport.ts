// =============================================================================
// src/lib/printReport.ts
// =============================================================================
// One shared print path for every ControlLens report. Instead of window.print()
// (which inherits the app shell, the tangled global @media print rules, and the
// browser's own header/URL banner), this renders ONLY the report node into a
// clean isolated document and prints that.
//
// Result, identical for every report that uses it:
//   • no browser "ControlLens — …/URL" header banner
//   • no app sidebar / toolbar / shell interference
//   • no blank first page
//   • our own footer with page numbers (kept), no URL/date browser line
//
// Usage from any report:
//   import { printReport } from '@/lib/printReport'
//   <button onClick={() => printReport('my-print-area', { title: 'X Report' })}>
//   ...and give the printable container  id="my-print-area".
// =============================================================================

interface PrintOptions {
  /** Document title (used as the PDF's default filename in most browsers). */
  title?: string
  /** Show a page-number footer ("Page X of Y"). Default true. */
  pageNumbers?: boolean
  /** Optional small left-footer label (e.g. a report number). No URL/date. */
  footerLabel?: string
}

export function printReport(areaId: string, opts: PrintOptions = {}): void {
  if (typeof window === 'undefined') return
  const source = document.getElementById(areaId)
  if (!source) {
    // fall back to normal print rather than doing nothing
    window.print()
    return
  }

  const { title = 'Schedule Review Report', pageNumbers = true, footerLabel = '' } = opts

  // Collect the page's own styles so Tailwind classes render identically in
  // the isolated document (link tags + inline <style>).
  let headStyles = ''
  document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => {
    headStyles += node.outerHTML
  })

  // Lock every exported report to US Letter portrait.  The previous print path
  // left page size to the browser, which could produce different scaling / margins
  // between pages and printers.  Keep all printable geometry owned here.
  const footerCss = pageNumbers
    ? `@page { size: Letter portrait; margin: 0.48in 0.52in 0.58in 0.52in; }
       @page { @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #9ca3af; } }
       ${footerLabel ? `@page { @bottom-left { content: ${JSON.stringify(footerLabel)}; font-size: 8pt; color: #9ca3af; } }` : ''}`
    : `@page { size: Letter portrait; margin: 0.5in; }`

  const printCss = `
    * { box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { width: 100% !important; height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: #fff !important; color: #111827 !important; }
    #__print_root { max-width: none !important; width: 100% !important; min-width: 0 !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: #fff !important; }
    #__print_root .print\\:hidden, #__print_root .no-print { display: none !important; }
    [class*="rounded"] { border-radius: 0 !important; }
    [class*="shadow"] { box-shadow: none !important; }
    .print-break-inside-avoid, [class*="break-inside-avoid"] { break-inside: avoid; page-break-inside: avoid; }
    .report-section-bar { break-after: avoid-page !important; page-break-after: avoid !important; }
    .report-section-bar + * { break-before: avoid-page !important; page-break-before: avoid !important; }
    table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; }
    td, th, div, span { overflow-wrap: anywhere; word-break: normal; }
    img, svg { max-width: 100% !important; }
    ${footerCss}
  `

  // Build the isolated document.
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<base href="${escapeHtml(window.location.origin + '/')}" />
${headStyles}
<style>${printCss}</style>
</head>
<body>
<div id="__print_root">${source.innerHTML}</div>
</body>
</html>`

  // Use srcdoc so the printable document has a neutral about:srcdoc address
  // instead of inheriting the application's /dashboard/... URL. Browsers may
  // still show their own header/footer when that print option is enabled, but
  // the application route is no longer exposed there.
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 500)
  }

  iframe.onload = () => {
    const win = iframe.contentWindow
    const doc = win?.document
    if (!win || !doc) {
      cleanup()
      return
    }

    const doPrint = () => {
      try {
        win.focus()
        win.print()
      } finally {
        cleanup()
      }
    }

    if ((doc as any).fonts && (doc as any).fonts.ready) {
      ;(doc as any).fonts.ready.then(() => setTimeout(doPrint, 150)).catch(() => setTimeout(doPrint, 400))
    } else {
      setTimeout(doPrint, 400)
    }
  }

  iframe.srcdoc = html
  document.body.appendChild(iframe)

}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
