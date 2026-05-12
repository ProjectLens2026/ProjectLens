import { NextRequest, NextResponse } from 'next/server'
import { parseXER } from '@/lib/xerParser'
import { compareXER } from '@/lib/xerComparator'
import { buildTIAReport } from '@/lib/tiaReportBuilder'

export const runtime = 'nodejs'
export const maxDuration = 90

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const fileA = formData.get('fileA') as File | null
    const fileB = formData.get('fileB') as File | null
    const mode = formData.get('mode') as string | null  // 'compare' | 'tia'
    const contextStr = formData.get('context') as string | null
    const fragnetCategorizationsStr = formData.get('fragnetCategorizations') as string | null

    if (!fileA || !fileB) {
      return NextResponse.json({ error: 'Both schedules required' }, { status: 400 })
    }

    const textA = Buffer.from(await fileA.arrayBuffer()).toString('utf-8')
    const textB = Buffer.from(await fileB.arrayBuffer()).toString('utf-8')

    const parsedA = parseXER(textA)
    const parsedB = parseXER(textB)
    const comparison = compareXER(parsedA, parsedB)

    if (mode === 'tia') {
      // Generate Word document
      const ctx = contextStr ? JSON.parse(contextStr) : {}
      const fragnetCategorizations = fragnetCategorizationsStr ? JSON.parse(fragnetCategorizationsStr) : {}

      const buffer = await buildTIAReport({
        projectName: ctx.projectName || parsedB.projectName || 'Untitled Project',
        projectNumber: ctx.projectNumber || '',
        owner: ctx.owner || '',
        preparedBy: ctx.preparedBy || '',
        contractCompletionDate: ctx.contractCompletionDate || parsedA.contractEnd || '',
        comparison,
        fragnetCategorizations,
      })

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="TIA_Report_${(ctx.projectNumber || 'Schedule').replace(/[^a-zA-Z0-9-_]/g, '_')}.docx"`,
        },
      })
    }

    // Default: return comparison data as JSON
    return NextResponse.json({ success: true, comparison })

  } catch (error: any) {
    console.error('Compare error:', error)
    return NextResponse.json({ error: error.message || 'Comparison failed' }, { status: 500 })
  }
}
