import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const projectName = formData.get('projectName') as string || 'Unknown Project'

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            }
          },
          {
            type: 'text',
            text: `You are ProjectLens — an experienced construction project controls advisor with 20+ years of federal construction experience (USACE, GSA, DGS). You specialize in TIA preparation and schedule impact analysis.

Analyze this RFI document for project: ${projectName}

Extract and evaluate the following. Respond ONLY in valid JSON with no markdown, no backticks, no preamble:

{
  "rfi_number": "extracted RFI number or null",
  "subject": "RFI subject/title",
  "date_submitted": "YYYY-MM-DD or null",
  "date_response_required": "YYYY-MM-DD or null",
  "contractor_request": "summary of what contractor is asking in plain language",
  "ae_response": "summary of AE/Owner response if present, or 'No response yet'",
  "classification": "INFORMATIONAL" or "POTENTIALLY_IMPACTING" or "SCHEDULE_IMPACTING",
  "classification_reason": "plain language explanation of why this classification was given",
  "schedule_impact_signals": ["list of specific words/phrases in the RFI that indicate schedule impact"],
  "time_extension_requested": true or false,
  "days_requested": number or null,
  "impact_type": "OWNER_CAUSED" or "DESIGN_DEFICIENCY" or "DIFFERING_SITE_CONDITION" or "FORCE_MAJEURE" or "INFORMATIONAL" or "UNKNOWN",
  "impact_type_reason": "why this impact type was assigned",
  "fragnet_required": true or false,
  "fragnet_instructions": {
    "wbs_name": "Schedule Issues",
    "activity_name": "Frag XX - [descriptive name based on RFI]",
    "recommended_duration_days": number or null,
    "duration_basis": "how the duration was estimated from the RFI",
    "p6_steps": [
      "Step 1: Open your impacted current schedule in Primavera P6",
      "Step 2: ...",
      "Step 3: ..."
    ],
    "activities_likely_affected": "description of what type of activities this RFI would likely affect based on the subject matter"
  },
  "tia_narrative": "2-3 sentence professional TIA narrative for this RFI, written as it would appear in a formal TIA submission to a federal owner",
  "pm_action_summary": "plain language summary of exactly what the PM needs to do next, written for someone who is not a scheduling expert"
}

Classification rules:
- INFORMATIONAL: RFI asking for drawing clarification, spec interpretation, material substitution approval with no mention of time, delay, schedule, or compensation
- POTENTIALLY_IMPACTING: RFI that may affect work sequence, procurement, or timing but does not explicitly request time extension or compensation
- SCHEDULE_IMPACTING: RFI that mentions delay, time extension, critical path, substantial completion, recovery schedule, mitigation, compensation, or additional time`
          }
        ] as any
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    
    const clean = text.replace(/```json|```/g, '').trim()
    let evaluation: any
    try {
      evaluation = JSON.parse(clean)
    } catch {
      const match = clean.match(/\{[\s\S]*\}/)
      if (match) {
        evaluation = JSON.parse(match[0])
      } else {
        throw new Error('Could not parse AI response as JSON')
      }
    }

    return NextResponse.json({ success: true, evaluation, filename: file.name })

  } catch (error: any) {
    console.error('RFI analysis error:', error)
    return NextResponse.json({ error: error.message || 'RFI analysis failed' }, { status: 500 })
  }
}
