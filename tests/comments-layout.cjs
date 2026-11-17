const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm'),assert=require('node:assert/strict')
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const filename='src/app/dashboard/approval/page.tsx', source=fs.readFileSync(filename,'utf8'), ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
const names=['buildActionGroups','legacyFindingSignature','canonicalFindingSignature','existingFindingSignatures','CommentRegisterPanel','ApprovalReport','reviewStatusLabel','reviewStatusClasses','groupAlreadyIssued','conciseActivityRefs','PhasePathOverview','planningIssuedComments','planningGroupRecords','IssuedPlanningSummary']
const extracted=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n')
const code=ts.transpileModule(extracted+'\nexports.Panel=CommentRegisterPanel; exports.Report=ApprovalReport',{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const api={};vm.runInNewContext(code,{exports:api,require,React,useState:React.useState,CLOSED_REVIEW_STATUSES:['CLOSED','WITHDRAWN','VOID'],reviewFindingSourceKey:f=>f.id,summarizeReviewComments:c=>({open:c.length,drafts:0,issued:c.length,closed:0,blocking:0}),shortDate:x=>x,Shell:({children})=>React.createElement('div',null,children),printReport:()=>{}})
const finding={id:'CX-PH5-L5',title:'PH5 — Clarify IST',kind:'FINDING',whatFound:'The schedule references L5 closeout; IST is unclear.',reviewerCheck:'Identify IST and its links to PFHO.',affectedActivities:[{id:'a',code:'I174-PH5-5690',name:'L4/L5 Closeout'}],commentDisposition:'CLARIFICATION',scoreDeduction:0,criticalGate:false}
const props={comments:[],loading:false,disabled:false,result:{findings:[finding]},mode:'REVIEWER',onAdd:()=>{},onImport:()=>{},onStatusChange:()=>{},onResponse:()=>{}}
let html=renderToStaticMarkup(React.createElement(api.Panel,props))
for(const text of [finding.whatFound,finding.reviewerCheck,'I174-PH5-5690','Clarification required','Proposed · Not issued'])assert.ok(html.includes(text),'Visible without opening a separate tab: '+text)
assert.ok(!html.includes('<details'),'Observations and actions should be visible without opening a disclosure')
const comment={id:'c',sequence:1,commentNumber:'C-001',title:'Existing IST comment',concern:'Existing observation',requiredCorrection:'Existing action',sourceFindingIds:[finding.id,'another-source'],affectedActivities:[],responses:[],status:'OPEN',classification:'ADVISORY'}
html=renderToStaticMarkup(React.createElement(api.Panel,{...props,comments:[comment]}))
assert.ok(html.includes('Existing observation')&&html.includes('Existing action'))
assert.ok(!html.includes('1. PH5'),'Previously grouped issued findings should not be proposed again')
const report=renderToStaticMarkup(React.createElement(api.Report,{...props,reviewComments:[],project:{name:'IAD174'},sourceFileName:'review.xer',analysis:{dataDate:'2026-11-09'},onBack:()=>{}}))
assert.ok(report.includes(finding.whatFound)&&report.includes(finding.reviewerCheck)&&report.includes('I174-PH5-5690'))
assert.ok(!report.includes('Schedule Narrative'))
const page=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ApprovalReadinessPage').getText(ast)
assert.ok(!page.includes('role="tablist"'),'Review screen should have no nested tabs')
console.log('PASS: plain comments visible, references retained, grouped-issue deduplication, print parity, no review tabs')

const raw=Array.from({length:1000},(_,i)=>({...finding,id:'raw-'+i,title:'Power concern '+i,whatFound:'Individual detail '+i}))
const grouped={...finding,id:'PLAN-POWER',title:'Phases 1–12 — confirm energization',whatFound:'Shared power readiness needs confirmation.',sourceFindingIds:raw.map(f=>f.id)}
const result={findings:raw,planningReview:{comments:[grouped],phases:[],note:'Planning review'}}
let groupedHtml=renderToStaticMarkup(React.createElement(api.Panel,{...props,result}))
assert.equal((groupedHtml.match(/<article/g)||[]).length,1,'A thousand source findings should render as one topic')
const oldComments=raw.map((f,i)=>({...comment,id:'old-'+i,source:'CONVERTED_FROM_CL_FINDING',sourceFindingIds:[f.id],concern:'Individual old concern '+i}))
const before=JSON.stringify(oldComments)
groupedHtml=renderToStaticMarkup(React.createElement(api.Panel,{...props,result,comments:oldComments}))
assert.equal((groupedHtml.match(/<article/g)||[]).length,1,'A thousand issued records should have one default summary')
assert.ok(!groupedHtml.includes('Individual old concern'))
assert.equal(JSON.stringify(oldComments),before,'Summarizing must not change issued records')
const groupedPrint=renderToStaticMarkup(React.createElement(api.Report,{...props,result,reviewComments:oldComments,project:{name:'IAD174'},analysis:{},onBack:()=>{}}))
assert.equal((groupedPrint.match(/<article/g)||[]).length,1,'Print must consolidate existing issued records too')
console.log('PASS: grouped drafts and issued records stay compact on screen and print without changing history')
