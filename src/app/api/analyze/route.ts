import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const contextStr = formData.get('context') as string
    const ctx = contextStr ? JSON.parse(contextStr) : {}

    let scheduleContent = ''

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)

      if (ext === 'pdf') {
        // For PDF: extract basic text info
        scheduleContent = `Schedule file: ${file.name} (PDF, ${(file.size/1024).toFixed(0)}KB)`
        // In production you'd use pdf-parse here
      } else if (ext === 'xer') {
        // P6 XER is text-based
        const text = buffer.toString('utf-8').slice(0, 8000)
        scheduleContent = `Primavera P6 XER Schedule:\n${text}`
      } else if (ext === 'xml') {
        const text = buffer.toString('utf-8').slice(0, 8000)
        scheduleContent = `P6 XML Schedule:\n${text}`
      } else {
        scheduleContent = `Schedule file: ${file.name} (${ext?.toUpperCase()}, ${(file.size/1024).toFixed(0)}KB)`
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const prompt = `You are ProjectLens — an experienced construction project controls advisor with 20+ years of experience in scheduling, procurement, risk management, and construction operations. You think like a senior PM who has seen hundreds of projects succeed and fail.

A construction professional has uploaded their project schedule and provided context. Your job is to analyze this information and produce a clear, operational, human-centered analysis — not a software report.

PROJECT CONTEXT PROVIDED:
- Project Name: ${ctx.projectName || 'Not specified'}
- Current Phase: ${ctx.phase || 'Not specified'}
- Owner/Client: ${ctx.owner || 'Not specified'}
- General Contractor: ${ctx.gc || 'Not specified'}
- Contract Value: ${ctx.contractValue || 'Not specified'}
- Planned Completion: ${ctx.completionDate || 'Not specified'}
- Procurement Issues: ${ctx.procurementIssues || 'None specified'}
- Key Constraints: ${ctx.keyConstraints || 'None specified'}
- Biggest Concerns: ${ctx.criticalConcerns || 'Not specified'}

SCHEDULE FILE CONTENT:
${scheduleContent || 'No schedule file content extracted — analyze based on context provided.'}

INSTRUCTIONS:
Write a ProjectLens Operational Analysis. Be direct, operational, and conversational — like you are sitting beside the PM giving your honest assessment. Use plain English. Do NOT use bullet points or headers with ### markdown. Use simple section headers with em-dashes or uppercase labels followed by colons.

Structure your analysis as follows:

1. PROJECT CONDITION (one sentence verdict + health score out of 100)
2. SCHEDULE HEALTH (what the schedule tells you operationally — not mathematically)
3. PROCUREMENT PRESSURE (what could stop the project from finishing on time)
4. OPERATIONAL INTERPRETATION (what is REALLY happening vs what the schedule shows — like a doctor interpreting symptoms)
5. WHAT TO WATCH (the 2-3 things that will determine whether this project succeeds or struggles)
6. CONVERSATIONS TO HAVE THIS WEEK (specific, practical conversations the PM should initiate)
7. PROJECTLENS NOTE (remind them this is visibility support, not a guarantee — keep it brief and human)

Keep total length to 500-700 words. Write like a trusted advisor, not a software tool.`

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })

    const analysis = message.content[0].type === 'text' ? message.content[0].text : 'Analysis unavailable'

    // Determine health score from analysis
    const scoreMatch = analysis.match(/(\d{1,3})\s*\/\s*100/)
    const healthScore = scoreMatch ? parseInt(scoreMatch[1]) : 65

    let condition = 'Stable'
    if (healthScore < 50) condition = 'Recovery Required'
    else if (healthScore < 65) condition = 'Attention Needed'
    else if (healthScore < 80) condition = 'Monitor Closely'

    return NextResponse.json({ analysis, healthScore, condition, projectName: ctx.projectName })

  } catch (error: any) {
    console.error('Analysis error:', error)
    return NextResponse.json({ error: error.message || 'Analysis failed' }, { status: 500 })
  }
}
