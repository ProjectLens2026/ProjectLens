import { NextRequest, NextResponse } from 'next/server'
import { parseXER, analyzeXER } from '@/lib/xerParser'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const contextStr = formData.get('context') as string
    const ctx = contextStr ? JSON.parse(contextStr) : {}

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    let analysis: any = null
    let fileType = ext?.toUpperCase() || 'UNKNOWN'

    if (ext === 'xer') {
      const text = buffer.toString('utf-8')
      const parsed = parseXER(text)
      const result = analyzeXER(parsed)
      analysis = {
        ...result,
        projectName: parsed.projectName || ctx.projectName || file.name,
        dataDate: parsed.dataDate,
        contractEnd: parsed.contractEnd,
        projectedEnd: parsed.projectedEnd,
        fileType: 'Primavera P6 XER',
      }
    } else {
      analysis = {
        fileType: fileType,
        projectName: ctx.projectName || file.name,
        message: 'File received. Detailed parsing is currently optimized for Primavera P6 XER files. AI analysis will use the project context you provided.',
        healthScore: 65,
        condition: 'Monitor Closely',
        totalActivities: 0,
        complete: 0,
        inProgress: 0,
        notStarted: 0,
        negativeFloat: 0,
        outOfSequence: [],
        noTies: [],
        longLeadItems: [],
        criticalDrivers: [],
        inProgressActivities: [],
        delayDays: 0,
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    let aiNarrative = ''

    if (apiKey && analysis) {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const client = new Anthropic({ apiKey })

        const prompt = `You are ProjectLens — an experienced construction project controls advisor with 20+ years of P6 scheduling, USACE/DGS workflow, and TIA preparation experience. Speak like a senior PM giving honest analysis to a colleague.

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

Be direct. No fluff. No "AI-style" hedging. Speak like a senior scheduler who has done this on 100 federal projects.`

        const message = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }]
        })

        aiNarrative = message.content[0].type === 'text' ? message.content[0].text : ''
      } catch (err: any) {
        console.error('AI narrative error:', err)
        aiNarrative = `AI narrative unavailable. The schedule analysis above is based on direct file parsing. (Error: ${err.message || 'unknown'})`
      }
    }

    return NextResponse.json({
      success: true,
      analysis,
      aiNarrative,
      context: ctx,
    })

  } catch (error: any) {
    console.error('Analysis error:', error)
    return NextResponse.json({ error: error.message || 'Analysis failed' }, { status: 500 })
  }
}
