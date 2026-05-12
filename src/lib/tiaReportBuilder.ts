import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageBreak, PageOrientation, LevelFormat,
} from 'docx'
import type { XERComparison, FragnetActivity } from './xerComparator'

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const headerBorder = { style: BorderStyle.SINGLE, size: 1, color: '999999' }
const cellBorders = { top: border, bottom: border, left: border, right: border }
const headerCellBorders = { top: headerBorder, bottom: headerBorder, left: headerBorder, right: headerBorder }

function cell(text: string, width: number, bold = false, fill?: string, fontSize = 18) {
  return new TableCell({
    borders: bold ? headerCellBorders : cellBorders,
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      children: [new TextRun({ text: text || '—', bold, size: fontSize, font: 'Arial' })]
    })]
  })
}

function p(text: string, opts: any = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120 },
    alignment: opts.align,
    children: [new TextRun({
      text,
      bold: opts.bold,
      italics: opts.italic,
      size: opts.size || 22,
      color: opts.color,
      font: 'Arial',
    })]
  })
}

function h1(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 180 },
    children: [new TextRun({ text, bold: true, size: 32, font: 'Arial', color: '1F4E79' })]
  })
}

function h2(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, font: 'Arial', color: '2E75B6' })]
  })
}

function shortDate(d?: string) {
  if (!d) return '—'
  return d.slice(0, 10)
}

export interface TIAReportInput {
  projectName: string
  projectNumber: string
  owner: string
  preparedBy: string
  contractCompletionDate: string
  comparison: XERComparison
  fragnetCategorizations?: Record<string, { category: string; description: string }>
}

export async function buildTIAReport(input: TIAReportInput): Promise<Buffer> {
  const { comparison, fragnetCategorizations = {} } = input
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const tableWidth = 9360 // US Letter content width with 1" margins

  // ============ COVER PAGE ============
  const coverChildren = [
    new Paragraph({ spacing: { before: 2400 }, children: [new TextRun({ text: '', size: 22, font: 'Arial' })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: 'TIME IMPACT ANALYSIS', bold: true, size: 56, font: 'Arial', color: '1F4E79' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
      children: [new TextRun({ text: 'Schedule Impact Report', size: 32, font: 'Arial', color: '666666' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: input.projectName, bold: true, size: 36, font: 'Arial' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 1600 },
      children: [new TextRun({ text: input.projectNumber, size: 24, font: 'Arial', color: '666666' })]
    }),

    // Project Info Table
    new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [3120, 6240],
      rows: [
        new TableRow({ children: [cell('Owner / Client', 3120, true, 'E7EEF7'), cell(input.owner || '—', 6240)] }),
        new TableRow({ children: [cell('Project Number', 3120, true, 'E7EEF7'), cell(input.projectNumber || '—', 6240)] }),
        new TableRow({ children: [cell('Contract Completion Date', 3120, true, 'E7EEF7'), cell(shortDate(input.contractCompletionDate), 6240)] }),
        new TableRow({ children: [cell('Un-Impacted Projected End', 3120, true, 'E7EEF7'), cell(shortDate(comparison.projectA.end), 6240)] }),
        new TableRow({ children: [cell('Impacted Projected End', 3120, true, 'E7EEF7'), cell(shortDate(comparison.projectB.end), 6240)] }),
        new TableRow({ children: [cell('Total Time Impact', 3120, true, 'E7EEF7'), cell(`${comparison.totalDelayDays} calendar days`, 6240)] }),
        new TableRow({ children: [cell('Prepared By', 3120, true, 'E7EEF7'), cell(input.preparedBy || '—', 6240)] }),
        new TableRow({ children: [cell('Report Date', 3120, true, 'E7EEF7'), cell(today, 6240)] }),
      ]
    }),

    new Paragraph({ children: [new PageBreak()] }),
  ]

  // ============ EXECUTIVE SUMMARY ============
  const fragnetCount = comparison.fragnetActivities.length
  const execChildren = [
    h1('1. Executive Summary'),
    p(`This Time Impact Analysis (TIA) evaluates the schedule impact of identified delay events on the construction of ${input.projectName}. The analysis compares two schedules — an un-impacted current schedule and an impacted current schedule that includes a fragnet representing the delay events.`),
    p('Key Findings:', { bold: true, after: 80 }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: `Total time impact: ${comparison.totalDelayDays} calendar days`, size: 22, font: 'Arial' })] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: `Fragnet activities identified: ${fragnetCount}`, size: 22, font: 'Arial' })] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: `Activities changed between schedules: ${comparison.changed.length}`, size: 22, font: 'Arial' })] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: `Milestones affected: ${comparison.milestoneMovements.length}`, size: 22, font: 'Arial' })] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: `Un-impacted projected completion: ${shortDate(comparison.projectA.end)}`, size: 22, font: 'Arial' })] }),
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: `Impacted projected completion: ${shortDate(comparison.projectB.end)}`, size: 22, font: 'Arial' })] }),
    p(''),
    p('Time Extension Request', { bold: true, size: 24, after: 80 }),
    p(`Based on the analysis presented in this report, the Contractor requests a time extension of ${comparison.totalDelayDays} calendar days to the contract completion date. The basis for this request is detailed in the Fragnet Analysis and Trend Analysis sections that follow.`),
    new Paragraph({ children: [new PageBreak()] }),
  ]

  // ============ METHODOLOGY ============
  const methodChildren = [
    h1('2. Methodology'),
    p('This Time Impact Analysis follows accepted industry methodology consistent with AACE International Recommended Practice 52R-06 and standard USACE / DGS / federal contracting TIA practices.'),
    h2('2.1 Schedule Files Analyzed'),
    new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [2340, 3510, 3510],
      rows: [
        new TableRow({ children: [cell('Reference', 2340, true, 'E7EEF7'), cell('Schedule Name', 3510, true, 'E7EEF7'), cell('Data Date', 3510, true, 'E7EEF7')] }),
        new TableRow({ children: [cell('Schedule A (Un-Impacted)', 2340), cell(comparison.projectA.name, 3510), cell(shortDate(comparison.projectA.dataDate), 3510)] }),
        new TableRow({ children: [cell('Schedule B (Impacted)', 2340), cell(comparison.projectB.name, 3510), cell(shortDate(comparison.projectB.dataDate), 3510)] }),
      ]
    }),
    p('', { after: 240 }),
    h2('2.2 Analysis Approach'),
    p('1. The current schedule (un-impacted) was analyzed to establish the projected completion date prior to the insertion of the fragnet.'),
    p('2. The fragnet WBS containing the delay event activities was inserted into the current schedule with appropriate logic ties to the affected activities on the critical or longest path.'),
    p('3. Both schedules were calculated using Primavera P6 default scheduling logic. Finish dates reflect P6-calculated values; actual start dates were used where they exist, otherwise scheduled start dates were applied.'),
    p('4. The impacted schedule was compared to the un-impacted schedule to identify activity movements, float deterioration, and critical path changes.'),
    p('5. The total time impact was calculated as the difference between the un-impacted and impacted projected completion dates.'),
    new Paragraph({ children: [new PageBreak()] }),
  ]

  // ============ UN-IMPACTED CP ============
  const unimpactedCP = comparison.criticalPath.unimpactedPath.slice(0, 30)
  const unimpactedChildren = [
    h1('3. Un-Impacted Critical Path'),
    p(`The following activities form the driving (critical / longest) path in the un-impacted current schedule. Projected completion: ${shortDate(comparison.projectA.end)}.`),
    new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [1560, 4160, 1300, 1170, 1170],
      rows: [
        new TableRow({ children: [
          cell('Activity ID', 1560, true, 'E7EEF7'),
          cell('Activity Name', 4160, true, 'E7EEF7'),
          cell('Start', 1300, true, 'E7EEF7'),
          cell('Finish', 1170, true, 'E7EEF7'),
          cell('Float', 1170, true, 'E7EEF7'),
        ]}),
        ...unimpactedCP.map(t => new TableRow({ children: [
          cell(t.task_code, 1560),
          cell(t.task_name, 4160),
          cell(shortDate(t.act_start_date || t.early_start_date), 1300),
          cell(shortDate(t.act_end_date || t.early_end_date), 1170),
          cell(`${Math.round((parseFloat(t.total_float_hr_cnt || '0')) / 8)}d`, 1170),
        ]})),
      ]
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ]

  // ============ IMPACTED CP ============
  const impactedCP = comparison.criticalPath.impactedPath.slice(0, 30)
  const impactedChildren = [
    h1('4. Impacted Critical Path'),
    p(`The following activities form the driving (critical / longest) path in the impacted current schedule (after fragnet insertion). Projected completion: ${shortDate(comparison.projectB.end)}.`),
    comparison.criticalPath.divergesAt ?
      p(`The impacted critical path diverges from the un-impacted critical path beginning at activity ${comparison.criticalPath.divergesAt}.`, { italic: true })
      : p('The impacted critical path follows the same activity sequence as the un-impacted path; impact is reflected through float and date movements.', { italic: true }),
    new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [1560, 4160, 1300, 1170, 1170],
      rows: [
        new TableRow({ children: [
          cell('Activity ID', 1560, true, 'E7EEF7'),
          cell('Activity Name', 4160, true, 'E7EEF7'),
          cell('Start', 1300, true, 'E7EEF7'),
          cell('Finish', 1170, true, 'E7EEF7'),
          cell('Float', 1170, true, 'E7EEF7'),
        ]}),
        ...impactedCP.map(t => new TableRow({ children: [
          cell(t.task_code, 1560),
          cell(t.task_name, 4160),
          cell(shortDate(t.act_start_date || t.early_start_date), 1300),
          cell(shortDate(t.act_end_date || t.early_end_date), 1170),
          cell(`${Math.round((parseFloat(t.total_float_hr_cnt || '0')) / 8)}d`, 1170),
        ]})),
      ]
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ]

  // ============ SCHEDULE COMPARISON SUMMARY ============
  const topChanged = comparison.changed.slice(0, 25)
  const comparisonChildren = [
    h1('5. Schedule Comparison Summary'),
    p(`Of ${comparison.activities.length} activities compared, ${comparison.changed.length} changed, ${comparison.added.length} were added, and ${comparison.removed.length} were removed between the two schedules.`),
    h2('5.1 Activities With Largest Date Movements'),
    new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [1560, 3640, 1040, 1040, 1040, 1040],
      rows: [
        new TableRow({ children: [
          cell('Activity ID', 1560, true, 'E7EEF7'),
          cell('Activity Name', 3640, true, 'E7EEF7'),
          cell('Old Start', 1040, true, 'E7EEF7'),
          cell('New Start', 1040, true, 'E7EEF7'),
          cell('Old Finish', 1040, true, 'E7EEF7'),
          cell('New Finish', 1040, true, 'E7EEF7'),
        ]}),
        ...topChanged.sort((a,b) => Math.abs(b.finish_delta_days||0) - Math.abs(a.finish_delta_days||0)).slice(0, 25).map(c => new TableRow({ children: [
          cell(c.task_code, 1560),
          cell(c.task_name, 3640),
          cell(shortDate(c.a_start), 1040),
          cell(shortDate(c.b_start), 1040),
          cell(shortDate(c.a_finish), 1040),
          cell(shortDate(c.b_finish), 1040),
        ]})),
      ]
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ]

  // ============ MILESTONE MOVEMENTS ============
  const milestoneChildren = [
    h1('6. Milestone Movements'),
    comparison.milestoneMovements.length === 0
      ? p('No milestone date movements were detected between the two schedules.')
      : null,
    comparison.milestoneMovements.length > 0 ? new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [1560, 4680, 1560, 1560],
      rows: [
        new TableRow({ children: [
          cell('Milestone ID', 1560, true, 'E7EEF7'),
          cell('Milestone Name', 4680, true, 'E7EEF7'),
          cell('Original Finish', 1560, true, 'E7EEF7'),
          cell('New Finish', 1560, true, 'E7EEF7'),
        ]}),
        ...comparison.milestoneMovements.slice(0, 30).map(m => new TableRow({ children: [
          cell(m.task_code, 1560),
          cell(m.task_name, 4680),
          cell(shortDate(m.a_finish), 1560),
          cell(shortDate(m.b_finish), 1560),
        ]})),
      ]
    }) : null,
    new Paragraph({ children: [new PageBreak()] }),
  ].filter(Boolean) as any[]

  // ============ FRAGNET ANALYSIS ============
  const fragnetSection: any[] = [h1('7. Fragnet Analysis')]
  if (comparison.fragnetActivities.length === 0) {
    fragnetSection.push(p('No fragnet activities were detected in the impacted schedule. To use the TIA workflow, ensure a WBS named "Schedule Issues" or "Fragnet" exists containing activities prefixed with "Frag" or similar identifiers.'))
  } else {
    fragnetSection.push(p(`The impacted schedule contains ${comparison.fragnetActivities.length} fragnet activities representing the delay events analyzed in this TIA. Each fragnet activity is detailed below with its categorization, description, and impact on successor activities.`))

    comparison.fragnetActivities.forEach((frag, idx) => {
      const cat = fragnetCategorizations[frag.task_id] || { category: 'owner', description: '' }
      const catLabel = ({
        owner: 'Owner-Caused',
        force_majeure: 'Force Majeure',
        third_party: 'Third-Party',
        subcontractor: 'Subcontractor / Vendor',
        contractor: 'Contractor-Caused',
        excusable: 'Excusable / Non-Compensable',
      } as any)[cat.category] || cat.category

      fragnetSection.push(h2(`7.${idx + 1} ${frag.task_code} — ${frag.task_name}`))
      fragnetSection.push(new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        columnWidths: [2340, 7020],
        rows: [
          new TableRow({ children: [cell('Fragnet Activity ID', 2340, true, 'E7EEF7'), cell(frag.task_code, 7020)] }),
          new TableRow({ children: [cell('Fragnet Description', 2340, true, 'E7EEF7'), cell(frag.task_name, 7020)] }),
          new TableRow({ children: [cell('Start', 2340, true, 'E7EEF7'), cell(shortDate(frag.start), 7020)] }),
          new TableRow({ children: [cell('Finish', 2340, true, 'E7EEF7'), cell(shortDate(frag.finish), 7020)] }),
          new TableRow({ children: [cell('Duration', 2340, true, 'E7EEF7'), cell(`${frag.duration_days || 0} days`, 7020)] }),
          new TableRow({ children: [cell('Responsibility', 2340, true, 'E7EEF7'), cell(catLabel, 7020)] }),
          new TableRow({ children: [cell('Cause / Narrative', 2340, true, 'E7EEF7'), cell(cat.description || '[To be completed by scheduler]', 7020)] }),
        ]
      }))
      fragnetSection.push(p(''))
    })
  }
  fragnetSection.push(new Paragraph({ children: [new PageBreak()] }))

  // ============ TREND ANALYSIS ============
  const trendChildren: any[] = [h1('8. Trend Analysis per Affected Activity')]
  if (comparison.fragnetActivities.length === 0) {
    trendChildren.push(p('No fragnet activities were detected; trend analysis cannot be generated.'))
  } else {
    trendChildren.push(p('The following table presents the trend analysis for each activity affected by a fragnet. The "Original" date columns reflect the un-impacted current schedule; the "New" date columns reflect the impacted current schedule after fragnet insertion.'))
    comparison.fragnetActivities.forEach((frag, idx) => {
      if (frag.affected_successors.length === 0) return
      trendChildren.push(h2(`8.${idx + 1} Impact of ${frag.task_code}`))
      trendChildren.push(new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        columnWidths: [1560, 3640, 1170, 1170, 910, 910],
        rows: [
          new TableRow({ children: [
            cell('Activity ID', 1560, true, 'E7EEF7'),
            cell('Activity Name', 3640, true, 'E7EEF7'),
            cell('Original Start', 1170, true, 'E7EEF7'),
            cell('New Start', 1170, true, 'E7EEF7'),
            cell('Delay', 910, true, 'E7EEF7'),
            cell('Cause', 910, true, 'E7EEF7'),
          ]}),
          ...frag.affected_successors.map(s => new TableRow({ children: [
            cell(s.task_code, 1560),
            cell(s.task_name, 3640),
            cell(shortDate(s.original_start), 1170),
            cell(shortDate(s.new_start), 1170),
            cell(`${s.delay_days}d`, 910),
            cell(frag.task_code, 910),
          ]})),
        ]
      }))
      trendChildren.push(p(''))
    })
  }
  trendChildren.push(new Paragraph({ children: [new PageBreak()] }))

  // ============ TIME EXTENSION REQUEST ============
  const requestChildren = [
    h1('9. Time Extension Request'),
    p('Based on the analysis presented in the preceding sections, the Contractor formally requests a time extension to the contract completion date as follows:'),
    new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [4680, 4680],
      rows: [
        new TableRow({ children: [cell('Time Extension Requested', 4680, true, 'E7EEF7'), cell(`${comparison.totalDelayDays} calendar days`, 4680)] }),
        new TableRow({ children: [cell('Current Contract Completion', 4680, true, 'E7EEF7'), cell(shortDate(input.contractCompletionDate), 4680)] }),
        new TableRow({ children: [cell('Requested New Contract Completion', 4680, true, 'E7EEF7'), cell(shortDate(comparison.projectB.end), 4680)] }),
      ]
    }),
    p('', { after: 240 }),
    p('Responsibility Summary', { bold: true, size: 24 }),
    p('Each fragnet activity has been categorized by responsibility in Section 7 of this report. Compensable time extension determinations are subject to contract terms and applicable provisions for excusable and compensable delays.'),
    new Paragraph({ children: [new PageBreak()] }),
  ]

  // ============ CONCLUSION & SIGNATURE ============
  const conclusionChildren = [
    h1('10. Conclusion and Certification'),
    p(`This Time Impact Analysis demonstrates that the delay events identified in the fragnet WBS have a cumulative impact of ${comparison.totalDelayDays} calendar days on the contract completion date for ${input.projectName}.`),
    p('The analysis was prepared using accepted industry methodology and is based on the un-impacted and impacted current schedules as identified in Section 2.'),
    p('The Contractor reserves the right to update this analysis as additional information becomes available or as delay events evolve.'),
    p('', { after: 600 }),
    new Table({
      width: { size: tableWidth, type: WidthType.DXA },
      columnWidths: [4680, 4680],
      rows: [
        new TableRow({ children: [
          cell('Prepared By', 4680, true, 'E7EEF7'),
          cell('Signature / Date', 4680, true, 'E7EEF7'),
        ]}),
        new TableRow({ children: [
          new TableCell({
            borders: cellBorders,
            width: { size: 4680, type: WidthType.DXA },
            margins: { top: 200, bottom: 600, left: 120, right: 120 },
            children: [
              new Paragraph({ children: [new TextRun({ text: input.preparedBy || '_______________________', size: 22, font: 'Arial' })] }),
              new Paragraph({ children: [new TextRun({ text: 'Project Manager', size: 20, font: 'Arial', italics: true })] }),
            ]
          }),
          new TableCell({
            borders: cellBorders,
            width: { size: 4680, type: WidthType.DXA },
            margins: { top: 200, bottom: 600, left: 120, right: 120 },
            children: [
              new Paragraph({ children: [new TextRun({ text: '_______________________', size: 22, font: 'Arial' })] }),
              new Paragraph({ children: [new TextRun({ text: `Date: ${today}`, size: 20, font: 'Arial', italics: true })] }),
            ]
          }),
        ]}),
      ]
    }),
  ]

  // ============ BUILD DOCUMENT ============
  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, font: 'Arial', color: '1F4E79' },
          paragraph: { spacing: { before: 240, after: 180 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: '2E75B6' },
          paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } },
      ]
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ]
    },
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      children: [
        ...coverChildren,
        ...execChildren,
        ...methodChildren,
        ...unimpactedChildren,
        ...impactedChildren,
        ...comparisonChildren,
        ...milestoneChildren,
        ...fragnetSection,
        ...trendChildren,
        ...requestChildren,
        ...conclusionChildren,
      ]
    }]
  })

  return await Packer.toBuffer(doc)
}
