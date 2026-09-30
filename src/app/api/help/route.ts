import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { HELP_SYSTEM_PROMPT, findHelpAnswer } from '@/lib/helpKnowledge'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { messages, currentPage } = await req.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    if (messages.some((m: any) => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') || messages[messages.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
    }
    const answer = findHelpAnswer(messages[messages.length - 1].content)
    if (answer) return NextResponse.json({ success: true, reply: answer })

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Include current page context if provided
    let systemPrompt = HELP_SYSTEM_PROMPT
    if (typeof currentPage === 'string') {
      systemPrompt += `\n\nCURRENT USER CONTEXT: User is currently viewing the ${JSON.stringify(currentPage.slice(0, 200))} page. Tailor your answers accordingly when relevant.`
    }

    // Retry with exponential backoff for overloaded/rate-limit errors
    const maxRetries = 3
    let lastError: any = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages.map((m: any) => ({
            role: m.role,
            content: m.content,
          })),
        })

        const assistantText = response.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => (block as any).text)
          .join('\n')

        if (!assistantText) {
          return NextResponse.json({ success: true, reply: "I didn't get a response. Try rephrasing your question?" })
        }

        return NextResponse.json({ success: true, reply: assistantText })

      } catch (err: any) {
        lastError = err
        const status = err?.status || err?.statusCode
        // Retry on overloaded (529) or rate limited (429)
        if (status === 529 || status === 429) {
          if (attempt < maxRetries - 1) {
            // Wait progressively longer: 1s, 2s, 4s
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
            continue
          }
        }
        // Non-retryable error or out of retries
        throw err
      }
    }

    throw lastError

  } catch (error: any) {
    console.error('Help API error:', error)
    const status = error?.status || error?.statusCode
    let userMessage = 'Something went wrong. Please try again.'

    if (status === 529) {
      userMessage = "I'm getting more traffic than usual right now. Please try again in a few seconds."
    } else if (status === 429) {
      userMessage = "Too many requests. Please wait a moment before asking again."
    } else if (status === 401) {
      userMessage = 'Authentication issue with the AI service. Please contact support.'
    } else if (error?.message) {
      userMessage = error.message
    }

    return NextResponse.json({ error: userMessage }, { status: status || 500 })
  }
}
