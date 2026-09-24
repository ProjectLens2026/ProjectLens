import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

// =============================================================================
// Server-side analyze route — engine only, no AI.
//
// PREVIOUSLY this route called Claude to generate the narrative on every
// upload. That made the entire upload flow depend on Anthropic being up,
// which was the wrong architecture — the schedule engine should stand
// on its own.
//
// NOW: this route just acknowledges the parsed analysis and echoes it
// back. All parsing happens client-side. Schedule narratives are assembled
// deterministically in the Review Schedule workspace from XER evidence,
// project basis and the formal comment register.
//
// The benefit: uploads stay fast and reliable regardless of the report
// service's status. PMs see their schedule analysis instantly.
// =============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const analysis = body.analysis
    const ctx = body.context || {}

    if (!analysis) {
      return NextResponse.json({ error: 'No analysis data provided' }, { status: 400 })
    }

    // Engine-only — no narrative call. The client parsed the XER already;
    // we just confirm receipt and echo the analysis back so the upload
    // page can save it as a version.
    return NextResponse.json({
      success: true,
      analysis,
      aiNarrative: '', // Legacy compatibility field; no paid narrative call is made.
      context: ctx,
    })
  } catch (error: any) {
    console.error('[ControlLens] /api/analyze error:', error)
    return NextResponse.json({ error: error.message || 'Analysis failed' }, { status: 500 })
  }
}
