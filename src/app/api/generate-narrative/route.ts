import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

// =============================================================================
// Operational Analysis generation — on-demand only.
//
// Called when the PM clicks "Generate Operational Analysis" on the
// Schedule Analysis page. NEVER called during upload. The schedule engine
// is fully independent of this route — if this service is down, only the
// generate button stops working; uploads, parsing, dashboards keep running.
//
// Input: parsed analysis + optional project context (phase, owner,
// procurement issues, etc.). Output: a 400-500 word operational analysis
// written in the voice of a senior schedule controls advisor.
//
// The PM can edit, regenerate, or clear the analysis. ControlLens
// treats narrative generation as a tool the PM controls — not something
// that runs automatically in the background.
// =============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const analysis = body.analysis
    const ctx = body.context || {}

    if (!analysis) {
      return NextResponse.json({ error: 'No analysis data provided' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Analysis generation service is not configured on this deployment.' },
        { status: 503 }
      )
    }

    // ControlLens identity + senior federal scheduling SME tone.
    // Structured 5-part output the lens page knows how to render.
    const prompt = `You are ControlLens — an experienced construction project controls advisor with 20+ years of P6 scheduling, USACE/DGS workflow, and TIA preparation experience. Speak like a senior PM giving honest analysis to a colleague.

Project: ${analysis.projectName}
File type: ${analysis.fileType}
Current phase: ${ctx.phase || 'Not specified'}
Owner: ${ctx.owner || 'Not specified'}
Contract: ${ctx.contractValue || 'Not specified'}

Concerns raised by PM: ${ctx.criticalConcerns || 'None'}
Known procurement issues: ${ctx.procurementIssues || 'None'}
Known constraints: ${ctx.keyConstraints || 'None'}

Schedule analysis findings:
- Total activities: ${analysis.totalActivities}
- Complete: ${analysis.complete} | In Progress: ${analysis.inProgress} | Not Started: ${analysis.notStarted}
- Activities with negative float: ${analysis.negativeFloat}
- Out-of-sequence violations: ${analysis.outOfSequence?.length || 0}
- Activities with no logic ties: ${analysis.noTies?.length || 0}
- Long lead items: ${analysis.longLeadItems?.length || 0}
- Days behind contract: ${analysis.delayDays}
- Health score: ${analysis.healthScore}/100 (${analysis.condition})

Top critical drivers: ${(analysis.criticalDrivers || []).slice(0, 5).map((t: any) => `${t.task_code} ${t.task_name}`).join(', ')}

Write a 400-500 word operational analysis focused on HOW TO FIX THIS. The PM needs concrete next steps, not generic commentary. Structure exactly like this:

1. PROJECT CONDITION
One sentence verdict on where this project stands.

2. WHAT THE SCHEDULE IS REALLY TELLING YOU
Operational interpretation of the findings — what is actually happening in the field, in plain language.

3. HOW TO FIX THIS — TOP THREE ACTIONS
Three specific actions the PM should take this week to recover the schedule. Be concrete: name activities, name trades, name decisions. No generic advice.

4. CONVERSATIONS TO HAVE THIS WEEK
Specific people to call (the architect, the mechanical sub, the owner's PM, the GC scheduler) and specific questions to ask each one. No vague phrases like "communicate with stakeholders".

5. TIA EVIDENCE
If delayDays > 30, list exactly what to document right now to protect the time extension request. If under 30, write "TIA not yet warranted — continue tracking delay events."

Be direct. No fluff. No hedging. Speak like a senior scheduler who has done this on 100 federal projects.`

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    })

    const narrative = message.content[0].type === 'text' ? message.content[0].text : ''

    if (!narrative) {
      return NextResponse.json(
        { error: 'Analysis was empty. Try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      narrative,
    })
  } catch (error: any) {
    console.error('[ControlLens] /api/generate-narrative error:', error)
    return NextResponse.json(
      { error: error.message || 'Analysis generation failed. Try again.' },
      { status: 500 }
    )
  }
}
