// =============================================================================
// /api/compare — TIA comparison endpoint (Day 10 rewrite for large files)
//
// Day 10: rewritten to accept signed URLs from Supabase Storage instead of
// File bodies in formData. This bypasses Vercel's ~4.5MB request body limit
// and works for any size XER file (50 MB+ each, 120 MB combined is fine).
//
// Input options (formData):
//   - fileAUrl + fileBUrl  → preferred path (signed URLs to Storage)
//   - fileA   + fileB      → legacy path (File bodies, small files only)
//
// Other params:
//   - mode: 'compare' (returns JSON) or 'tia' (returns docx attachment)
//   - context: JSON-stringified project info
//   - fragnetCategorizations: JSON-stringified categorizations
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { parseXER } from '@/lib/xerParser'
import { compareXER } from '@/lib/xerComparator'
import { buildTIAReport } from '@/lib/tiaReportBuilder'

export const runtime = 'nodejs'
export const maxDuration = 120  // 2-minute timeout (Vercel Pro allows up to 300s)

// Auto-detect encoding (UTF-8 or UTF-16LE/BE) — P6 often exports as UTF-16
function decodeBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return buffer.toString('utf16le', 2)
  } else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    const swapped = Buffer.alloc(buffer.length - 2)
    for (let i = 2; i < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1]
      swapped[i - 1] = buffer[i]
    }
    return swapped.toString('utf16le')
  } else {
    let zeroByteCount = 0
    const sampleSize = Math.min(200, buffer.length)
    for (let i = 1; i < sampleSize; i += 2) {
      if (buffer[i] === 0x00) zeroByteCount++
    }
    if (zeroByteCount > sampleSize / 4) {
      return buffer.toString('utf16le')
    }
    return buffer.toString('utf-8')
  }
}

// Fetch a signed URL into memory and decode to XER text.
// Throws on HTTP errors so the caller can return a 400 to the client.
async function fetchAndDecode(url: string, label: string): Promise<string> {
  console.log(`[api/compare] fetching ${label} from storage...`)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download ${label}: HTTP ${res.status} ${res.statusText}`)
  }
  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  console.log(`[api/compare] ${label} downloaded: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`)
  return decodeBuffer(buffer)
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    // ---- Read inputs ----
    const fileAUrl = formData.get('fileAUrl') as string | null
    const fileBUrl = formData.get('fileBUrl') as string | null
    const fileA = formData.get('fileA') as File | null   // legacy fallback
    const fileB = formData.get('fileB') as File | null   // legacy fallback

    const mode = formData.get('mode') as string | null  // 'compare' | 'tia'
    const contextStr = formData.get('context') as string | null
    const fragnetCategorizationsStr = formData.get('fragnetCategorizations') as string | null

    // ---- Resolve XER text from URL OR File ----
    let textA: string
    let textB: string

    if (fileAUrl && fileBUrl) {
      // Day 10 preferred path — both files in Supabase Storage
      try {
        ;[textA, textB] = await Promise.all([
          fetchAndDecode(fileAUrl, 'baseline'),
          fetchAndDecode(fileBUrl, 'impacted'),
        ])
      } catch (e: any) {
        console.error('[api/compare] storage download failed:', e)
        return NextResponse.json(
          { error: e.message || 'Failed to download files from storage' },
          { status: 400 },
        )
      }
    } else if (fileA && fileB) {
      // Legacy path — File bodies (kept for backward compat, small files only)
      textA = decodeBuffer(Buffer.from(await fileA.arrayBuffer()))
      textB = decodeBuffer(Buffer.from(await fileB.arrayBuffer()))
    } else {
      return NextResponse.json(
        { error: 'Both schedules required (provide fileAUrl+fileBUrl OR fileA+fileB)' },
        { status: 400 },
      )
    }

    // ---- Parse + compare ----
    console.log('[api/compare] parsing baseline...')
    const parsedA = parseXER(textA)
    console.log('[api/compare] parsing impacted...')
    const parsedB = parseXER(textB)
    console.log('[api/compare] running comparison...')
    const comparison = compareXER(parsedA, parsedB)

    if (mode === 'tia') {
      // Generate Word document
      const ctx = contextStr ? JSON.parse(contextStr) : {}
      const fragnetCategorizations = fragnetCategorizationsStr ? JSON.parse(fragnetCategorizationsStr) : {}
      console.log('[api/compare] building TIA report...')
      const buffer = await buildTIAReport({
        projectName: ctx.projectName || parsedB.projectName || 'Untitled Project',
        projectNumber: ctx.projectNumber || '',
        owner: ctx.owner || '',
        preparedBy: ctx.preparedBy || '',
        contractCompletionDate: ctx.contractCompletionDate || parsedA.contractEnd || '',
        comparison,
        fragnetCategorizations,
      })
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="TIA_Report_${(ctx.projectNumber || 'Schedule').replace(/[^a-zA-Z0-9-_]/g, '_')}.docx"`,
        },
      })
    }

    console.log('[api/compare] returning comparison JSON')
    return NextResponse.json({ success: true, comparison })
  } catch (error: any) {
    console.error('[api/compare] error:', error)
    return NextResponse.json({ error: error.message || 'Comparison failed' }, { status: 500 })
  }
}
