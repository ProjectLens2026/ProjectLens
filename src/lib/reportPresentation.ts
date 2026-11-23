import {tidyRichPaste,plainRich,type RichText} from './reportRichText'
import {sectionBlocks,type ReportDraft,type ReportBlock} from './schedulerReport'
import type {ReportCheck} from './reportChecks'
// Presentation only: retain saved draft content and deliberate paragraph boundaries.
export function reportParagraphs(doc:RichText):RichText{
 return tidyRichPaste(doc).filter(p=>p.runs.some(r=>r.text.trim())).map(p=>{
  const runs=p.runs.map(r=>({...r}));let first=runs.findIndex(r=>r.text.trim());if(first<0)return {...p,runs};
  const match=!p.list&&runs[first].text.match(/^\s*(?:[•●▪]|o(?=\s)|[-–](?=\s))\s+/);
  if(match){runs[first].text=runs[first].text.slice(match[0].length);return {...p,list:'bullet' as const,runs}}return {...p,runs};
 })
}
export function blockHasContent(b:ReportBlock){return !!(b.comments.trim()||b.richComments?.some(p=>p.runs.some(r=>r.text.trim()))||(b.summaryIncluded&&b.summary.trim())||(b.imageIncluded&&b.images.length))}
export function reportSections(d:ReportDraft,checks:ReportCheck[]){return d.sections.filter(s=>s.include).map(s=>({...s,blocks:sectionBlocks(s).filter(b=>b.include&&blockHasContent(b))})).filter(s=>s.blocks.length||(s.checks&&checks.some(c=>c.rule.include)))}
